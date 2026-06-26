-- 1:1 direct messages. A conversation is a canonical pair (user_a < user_b) so a
-- pair maps to exactly one row. Per-participant last_read drives unread state;
-- last_message_* are denormalized so the inbox renders without scanning messages.
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  a_last_read_at timestamptz not null default now(),
  b_last_read_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_message_text text,
  last_message_sender_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);
create index if not exists conversations_a_idx on public.conversations (user_a, last_message_at desc nulls last);
create index if not exists conversations_b_idx on public.conversations (user_b, last_message_at desc nulls last);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists messages_conv_idx on public.messages (conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
-- Access is service-role only (through the API); no client policies = deny by default.
