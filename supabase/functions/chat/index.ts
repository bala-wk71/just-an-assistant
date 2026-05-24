import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { conversation_id, message } = await req.json();
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    // Save user message
    const { data: userMsg } = await supabase
      .from("messages")
      .insert({
        conversation_id,
        user_id: user.id,
        role: "user",
        content: message,
      })
      .select()
      .single();

    // Get embedding for user message
    const embeddingResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/gemini-embedding-001",
          content: { parts: [{ text: message }] },
        }),
      }
    );

    const embeddingData = await embeddingResponse.json();
    const embedding = embeddingData.embedding?.values;

    // Search for similar messages from other conversations
    let memories: { content: string; similarity: number }[] = [];
    if (embedding) {
      const { data: similarMessages } = await supabase.rpc(
        "search_similar_messages",
        {
          query_embedding: embedding,
          match_user_id: user.id,
          exclude_conversation_id: conversation_id,
          match_count: 5,
          similarity_threshold: 0.7,
        }
      );
      if (similarMessages) {
        memories = similarMessages;
      }
    }

    // Load recent messages from current conversation
    const { data: recentMessages } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: true })
      .limit(20);

    // Build prompt
    const systemPrompt = buildSystemPrompt(memories);
    const contents = buildContents(systemPrompt, recentMessages || []);

    // Call Gemini for response (with retry and model fallback)
    const models = ["gemini-2.5-flash", "gemini-2.0-flash"];
    let assistantText = "";

    for (const model of models) {
      let success = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        const chatResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents }),
          }
        );

        if (chatResponse.ok) {
          const chatData = await chatResponse.json();
          const text = chatData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            assistantText = text;
            success = true;
            break;
          }
        }

        if (chatResponse.status === 429 || chatResponse.status === 503) {
          const wait = Math.pow(2, attempt) * 1000;
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        break;
      }
      if (success) break;
    }

    if (!assistantText) {
      assistantText = "I'm sorry, I couldn't generate a response. The AI service may be temporarily unavailable — please try again in a moment.";
    }

    // Save assistant message
    await supabase.from("messages").insert({
      conversation_id,
      user_id: user.id,
      role: "assistant",
      content: assistantText,
    });

    // Update user message with embedding (async, don't block response)
    if (embedding && userMsg) {
      await supabase
        .from("messages")
        .update({ embedding: JSON.stringify(embedding) })
        .eq("id", userMsg.id);
    }

    return new Response(JSON.stringify({ response: assistantText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function buildSystemPrompt(
  memories: { content: string; similarity: number }[]
): string {
  let prompt =
    "You are a helpful, friendly AI assistant. Be concise and natural in your responses.";

  if (memories.length > 0) {
    prompt +=
      "\n\nYou have memories from previous conversations with this user. Use them naturally when relevant, but don't force them into the conversation:\n";
    for (const mem of memories) {
      prompt += `- ${mem.content}\n`;
    }
  }

  return prompt;
}

function buildContents(
  systemPrompt: string,
  messages: { role: string; content: string }[]
) {
  const contents = [];

  // System instruction as first user message
  contents.push({
    role: "user",
    parts: [{ text: systemPrompt }],
  });
  contents.push({
    role: "model",
    parts: [
      {
        text: "Understood. I'll be helpful and use any relevant memories naturally.",
      },
    ],
  });

  for (const msg of messages) {
    contents.push({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    });
  }

  return contents;
}
