-- Allow the 'comment_like' notification type (someone liked your comment). The
-- comment-like route now writes a notification + push for the comment's author;
-- widen the CHECK constraint so those inserts are accepted.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow','like','comment','comment_like','verified','repost','removed','restored','banned','message','tip','follow_request'));
