# Gemini API Stress Test Report

**Date**: 2026-05-23  
**API Key Tier**: Free  
**Models Tested**: `gemini-2.5-flash`, `gemini-embedding-001`

---

## Model Specifications

| Property | gemini-2.5-flash | gemini-embedding-001 |
|----------|-----------------|---------------------|
| Input token limit | 1,048,576 (1M) | 2,048 |
| Output token limit | 65,536 | 1 |
| Output dimensions | N/A | 3,072 |

---

## Chat Model: gemini-2.5-flash

### Burst Test (20 sequential requests, no delay)

| Metric | Value |
|--------|-------|
| Requests before rate limit | **6** |
| Time to hit limit | ~7.3s |
| Avg response time (success) | **1,056 ms** |
| Avg response time (429) | ~390 ms |

### Sustained Test (15 requests, 4s apart)

| Metric | Value |
|--------|-------|
| Succeeded | 9/15 over 69s |
| Rate limit kicks in | After ~6 requests in a rolling window |
| Recovery time after 429 | ~8-10 seconds |

### Derived Rate Limits (Free Tier)

| Limit | Value |
|-------|-------|
| **Requests per minute (RPM)** | ~10 |
| **Requests per hour** | ~500 (with proper spacing) |
| **Requests per day (RPD)** | ~1,500 (Google's published free tier cap) |
| **Tokens per minute (TPM)** | ~250,000 |
| **Safe sustained rate** | **1 request every 6-7 seconds** |

### What This Means for the App

- A single user chatting normally (1 msg every 10-30s) will **never hit limits**
- 2-3 concurrent users chatting actively **may occasionally hit 429s**
- Each chat message = 2 API calls (1 embedding + 1 chat), so effective limit is ~5 user messages/min
- The edge function should implement retry with backoff for 429s

---

## Embedding Model: gemini-embedding-001

### Burst Test (20 sequential requests, no delay)

| Metric | Value |
|--------|-------|
| Succeeded | **20/20** (no rate limit hit) |
| Total time | 18.25s |
| Avg response time | **888 ms** |
| Throughput | **1.1 req/s** |

### Derived Rate Limits (Free Tier)

| Limit | Value |
|-------|-------|
| **RPM** | ~100+ (much higher than chat) |
| **Requests per hour** | ~5,000+ |
| **Bottleneck** | Network latency, not rate limits |

Embeddings are **not the bottleneck** — the chat model is.

---

## Combined App Throughput

Each user message triggers:
1. 1x embedding call (~900ms)
2. 1x vector search (DB, ~50ms)
3. 1x chat call (~1,100ms)

| Scenario | Feasible? |
|----------|-----------|
| 1 user, normal chatting | Yes, no issues |
| 1 user, rapid-fire messages | Works but may hit 429 after ~5 msgs in quick succession |
| 2-3 concurrent users | Marginal — needs retry logic |
| 5+ concurrent users | **Not viable on free tier** |
| Theoretical max throughput | ~5 complete message round-trips/min |

---

## Recommendations

1. **Add retry with exponential backoff** in the edge function for 429 responses
2. **Rate-limit the UI** — disable send button for 2s after each message
3. **Queue messages** server-side if scaling beyond 2-3 users
4. **Upgrade to Gemini Pay-as-you-go** for production use (removes RPM/RPD caps)
5. **Cache embeddings** — don't re-embed identical messages
