-- Per-user "delete conversation". Deleting is non-destructive to the other
-- person: it sets the deleter's *_cleared_at, which hides the thread (and every
-- message up to that moment) from THEIR inbox only. The conversation reappears
-- for them if the other person sends a new message (last_message_at moves past
-- cleared_at), but the old history stays hidden. Read receipts need no new
-- columns — a_last_read_at / b_last_read_at already track each side's read point.
alter table public.conversations
  add column if not exists a_cleared_at timestamptz,
  add column if not exists b_cleared_at timestamptz;
