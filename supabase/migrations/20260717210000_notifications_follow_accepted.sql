-- Add a 'follow_accepted' notification type.
--
-- When a PRIVATE account accepts a follow request, the requester (who now follows
-- the accepter) was previously sent a 'follow' notification — which renders as
-- "{accepter} started following you". That is backwards: the requester follows the
-- accepter, not the other way around. The new type renders "{accepter} accepted your
-- follow request", matching the real relationship.

ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (
  type = ANY (ARRAY[
    'follow', 'follow_request', 'follow_accepted',
    'like', 'comment', 'comment_like', 'verified', 'repost',
    'removed', 'restored', 'banned', 'message', 'tip',
    'creator_progress', 'creator_eligible', 'creator_activated',
    'creator_payout_incomplete', 'payout_first', 'payout_paid',
    'creator_monthly_summary'
  ]::text[])
);
