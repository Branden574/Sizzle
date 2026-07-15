-- The app-icon badge reads "how many unread notifications does this user have"
-- on every push send, on every app foreground, and on every mark-read. The
-- existing notifications_user_idx is (user_id, created_at desc), which can't
-- serve that predicate — it would scan every notification the user has ever
-- received just to count the unread ones.
--
-- Partial index: only unread rows are indexed, and unread is by nature a small,
-- self-limiting set (marking read removes the row from the index), so this stays
-- tiny even for a user with a huge notification history.
create index if not exists notifications_unread_idx
  on public.notifications (user_id)
  where read = false;
