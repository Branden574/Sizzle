-- Self-views were being logged into recipe_views, inflating creator insights
-- (a creator's own 9 watches showed as 9 views, while the profile counter —
-- which already excluded them — showed 0). The API now skips logging self-views
-- entirely (routes/recipes.ts). This purges the historical rows. recipes.view_count
-- already excluded self-views (bump_view_count skips the creator), so no counter fixup.
DELETE FROM recipe_views rv
USING recipes r
WHERE r.id = rv.recipe_id AND rv.user_id = r.cook_id;
