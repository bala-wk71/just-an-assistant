-- Enable pgvector extension
create extension if not exists vector with schema extensions;

-- Profiles table
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  display_name text,
  created_at timestamptz default now() not null
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Conversations table
create table public.conversations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.conversations enable row level security;

create policy "Users can view own conversations"
  on public.conversations for select
  using (auth.uid() = user_id);

create policy "Users can create own conversations"
  on public.conversations for insert
  with check (auth.uid() = user_id);

create policy "Users can update own conversations"
  on public.conversations for update
  using (auth.uid() = user_id);

create policy "Users can delete own conversations"
  on public.conversations for delete
  using (auth.uid() = user_id);

create index idx_conversations_user_id on public.conversations(user_id);

-- Messages table
create table public.messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  embedding extensions.vector(3072),
  created_at timestamptz default now() not null
);

alter table public.messages enable row level security;

create policy "Users can view own messages"
  on public.messages for select
  using (auth.uid() = user_id);

create policy "Users can create own messages"
  on public.messages for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own messages"
  on public.messages for delete
  using (auth.uid() = user_id);

create index idx_messages_conversation_id on public.messages(conversation_id);

-- Vector similarity search function
create or replace function public.search_similar_messages(
  query_embedding extensions.vector(3072),
  match_user_id uuid,
  exclude_conversation_id uuid,
  match_count int default 5,
  similarity_threshold float default 0.7
)
returns table (
  id uuid,
  content text,
  conversation_id uuid,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    m.id,
    m.content,
    m.conversation_id,
    1 - (m.embedding <=> query_embedding) as similarity
  from public.messages m
  where m.user_id = match_user_id
    and m.conversation_id != exclude_conversation_id
    and m.embedding is not null
    and 1 - (m.embedding <=> query_embedding) > similarity_threshold
  order by m.embedding <=> query_embedding
  limit match_count;
end;
$$;
