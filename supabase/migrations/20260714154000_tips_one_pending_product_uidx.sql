-- Backstop the product double-charge guard (mirrors tips_one_pending_unlock):
-- at most one in-flight (pending) product checkout per (buyer, product).
create unique index if not exists tips_one_pending_product
  on public.tips (tipper_id, product_id)
  where kind = 'product' and status = 'pending';
