-- Nutrition per serving, creator-entered (all optional).
alter table public.recipes
  add column if not exists calories  integer check (calories  >= 0 and calories  <= 30000),
  add column if not exists protein_g integer check (protein_g >= 0 and protein_g <= 2000),
  add column if not exists carbs_g   integer check (carbs_g   >= 0 and carbs_g   <= 2000),
  add column if not exists fat_g     integer check (fat_g     >= 0 and fat_g     <= 2000);
