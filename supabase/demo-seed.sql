-- ============================================================================
-- Demo recipe seed — populates the feed with 6 cooks + 6 recipes whose videos
-- are the AI-generated vertical clips committed to apps/web/public/recipes/.
-- Idempotent (fixed UUIDs + ON CONFLICT DO NOTHING), so it's safe to re-run and
-- to apply to both local and hosted. Video URLs are RELATIVE (/recipes/<slug>.mp4)
-- so the same value works on web (local + prod) and inside the native shell.
--
-- Demo cooks are created as real auth.users (the handle_new_user trigger makes
-- the profile), then promoted to cooks. Their emails use the @sizzle.demo domain.
-- To remove all demo data later:  delete from auth.users where email like '%@sizzle.demo';
-- ============================================================================

-- 1) Demo cook auth users (trigger auto-creates a public.profiles row).
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
values
  ('c0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','minapark@sizzle.demo','{"display_name":"Mina Park"}'::jsonb, now(), now(), now()),
  ('c0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','diegoeats@sizzle.demo','{"display_name":"Diego Marín"}'::jsonb, now(), now(), now()),
  ('c0000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','lenacooks@sizzle.demo','{"display_name":"Lena Rossi"}'::jsonb, now(), now(), now()),
  ('c0000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','avabowls@sizzle.demo','{"display_name":"Ava Chen"}'::jsonb, now(), now(), now()),
  ('c0000000-0000-4000-8000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','smashlab@sizzle.demo','{"display_name":"Sam Carter"}'::jsonb, now(), now(), now()),
  ('c0000000-0000-4000-8000-000000000006','00000000-0000-0000-0000-000000000000','authenticated','authenticated','noorspice@sizzle.demo','{"display_name":"Noor Haddad"}'::jsonb, now(), now(), now())
on conflict (id) do nothing;

-- 2) Promote to cooks with clean handles + realistic counters.
update public.profiles set handle='minapark',  is_cook=true, bio='Weeknight Japanese, big flavor.',        follower_count=18400, total_likes=240000, avatar_color='linear-gradient(135deg,#6a3df4,#c11f6b)' where id='c0000000-0000-4000-8000-000000000001';
update public.profiles set handle='diegoeats', is_cook=true, bio='Tacos, salsas, and a lot of lime.',        follower_count=32100, total_likes=512000, avatar_color='linear-gradient(135deg,#f4a52c,#e2371f)' where id='c0000000-0000-4000-8000-000000000002';
update public.profiles set handle='lenacooks', is_cook=true, bio='Roman classics, three ingredients.',        follower_count=12700, total_likes=158000, avatar_color='linear-gradient(135deg,#2c8a4a,#0e5a2e)' where id='c0000000-0000-4000-8000-000000000003';
update public.profiles set handle='avabowls',  is_cook=true, bio='Fresh bowls, 15 minutes, no stress.',       follower_count=9800,  total_likes=99000  where id='c0000000-0000-4000-8000-000000000004';
update public.profiles set handle='smashlab',  is_cook=true, bio='The science of a perfect smash burger.',    follower_count=44500, total_likes=803000, avatar_color='linear-gradient(135deg,#b5471f,#2a160e)' where id='c0000000-0000-4000-8000-000000000005';
update public.profiles set handle='noorspice', is_cook=true, bio='Garlic, butter, herbs. Repeat.',            follower_count=15300, total_likes=187000, avatar_color='linear-gradient(135deg,#3a7bd5,#1b3a6b)' where id='c0000000-0000-4000-8000-000000000006';

-- 3) Video assets — point at the committed clips (relative URLs).
insert into public.video_assets (id, owner_id, provider, provider_uid, status, mp4_url, poster_url, duration_seconds)
values
  ('a0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','mock','demo_miso',   'ready','/recipes/miso-eggplant.mp4','/recipes/miso-eggplant.jpg',6),
  ('a0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000002','mock','demo_birria', 'ready','/recipes/birria-tacos.mp4','/recipes/birria-tacos.jpg',6),
  ('a0000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000003','mock','demo_cacio',  'ready','/recipes/cacio-e-pepe.mp4','/recipes/cacio-e-pepe.jpg',6),
  ('a0000000-0000-4000-8000-000000000004','c0000000-0000-4000-8000-000000000004','mock','demo_poke',   'ready','/recipes/poke-bowl.mp4','/recipes/poke-bowl.jpg',6),
  ('a0000000-0000-4000-8000-000000000005','c0000000-0000-4000-8000-000000000005','mock','demo_smash',  'ready','/recipes/smash-burger.mp4','/recipes/smash-burger.jpg',6),
  ('a0000000-0000-4000-8000-000000000006','c0000000-0000-4000-8000-000000000006','mock','demo_shrimp', 'ready','/recipes/garlic-shrimp.mp4','/recipes/garlic-shrimp.jpg',6)
on conflict (id) do nothing;

-- 4) Recipes.
insert into public.recipes (id, cook_id, title, cuisine, time_minutes, servings, level, video_asset_id, status, post_type, caption, tags, like_count, comment_count, share_count, save_count)
values
  ('50000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','Charred Miso Eggplant','Japanese',25,2,'Easy','a0000000-0000-4000-8000-000000000001','published','recipe','Sticky-sweet miso glaze, blistered edges. 🍆',ARRAY['japanese','vegetarian','quick'],48200,612,1840,9300),
  ('50000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000002','Crispy Birria Tacos','Mexican',45,4,'Medium','a0000000-0000-4000-8000-000000000002','published','recipe','That consommé dip is everything. 🌮',ARRAY['mexican','beef','tacos'],73100,1420,5200,21000),
  ('50000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000003','Cacio e Pepe','Italian',20,2,'Medium','a0000000-0000-4000-8000-000000000003','published','recipe','Three ingredients, zero shortcuts. 🧀',ARRAY['italian','pasta','quick'],39400,540,1620,8800),
  ('50000000-0000-4000-8000-000000000004','c0000000-0000-4000-8000-000000000004','Spicy Tuna Poke Bowl','Hawaiian',15,2,'Easy','a0000000-0000-4000-8000-000000000004','published','recipe','15-minute bowl, all the crunch. 🥢',ARRAY['hawaiian','seafood','healthy','quick'],28700,360,980,6400),
  ('50000000-0000-4000-8000-000000000005','c0000000-0000-4000-8000-000000000005','The Classic Smash Burger','American',20,2,'Easy','a0000000-0000-4000-8000-000000000005','published','recipe','Crispy lacy edges or it doesn''t count. 🍔',ARRAY['american','beef','burger'],91200,2310,7800,33000),
  ('50000000-0000-4000-8000-000000000006','c0000000-0000-4000-8000-000000000006','Garlic Butter Shrimp','Mediterranean',18,3,'Easy','a0000000-0000-4000-8000-000000000006','published','recipe','Done before the rice is. 🦐',ARRAY['mediterranean','seafood','quick'],33500,470,1240,7100)
on conflict (id) do nothing;

-- 5) Ingredients + steps (delete-then-insert so re-running doesn't duplicate;
--    these tables have no natural unique key on (recipe_id, position)).
delete from public.recipe_ingredients where recipe_id in (
  '50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000003',
  '50000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','50000000-0000-4000-8000-000000000006');
delete from public.recipe_steps where recipe_id in (
  '50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000003',
  '50000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','50000000-0000-4000-8000-000000000006');

insert into public.recipe_ingredients (recipe_id, position, text) values
  ('50000000-0000-4000-8000-000000000001',0,'2 Japanese eggplants, halved'),
  ('50000000-0000-4000-8000-000000000001',1,'2 tbsp white miso'),
  ('50000000-0000-4000-8000-000000000001',2,'1 tbsp mirin + 1 tsp sesame oil'),
  ('50000000-0000-4000-8000-000000000001',3,'Sesame seeds + sliced scallions'),
  ('50000000-0000-4000-8000-000000000002',0,'2 lb beef chuck, cubed'),
  ('50000000-0000-4000-8000-000000000002',1,'4 dried guajillo chiles'),
  ('50000000-0000-4000-8000-000000000002',2,'Corn tortillas + Oaxaca cheese'),
  ('50000000-0000-4000-8000-000000000002',3,'Onion, cilantro, lime to serve'),
  ('50000000-0000-4000-8000-000000000003',0,'200g tonnarelli or spaghetti'),
  ('50000000-0000-4000-8000-000000000003',1,'100g pecorino romano, grated'),
  ('50000000-0000-4000-8000-000000000003',2,'2 tsp black peppercorns, cracked'),
  ('50000000-0000-4000-8000-000000000004',0,'200g sushi-grade ahi tuna, cubed'),
  ('50000000-0000-4000-8000-000000000004',1,'1 cup warm sushi rice'),
  ('50000000-0000-4000-8000-000000000004',2,'Avocado, edamame, cucumber'),
  ('50000000-0000-4000-8000-000000000004',3,'Spicy mayo + sesame'),
  ('50000000-0000-4000-8000-000000000005',0,'250g 80/20 ground beef'),
  ('50000000-0000-4000-8000-000000000005',1,'2 potato buns, toasted'),
  ('50000000-0000-4000-8000-000000000005',2,'American cheese + pickles'),
  ('50000000-0000-4000-8000-000000000005',3,'Burger sauce'),
  ('50000000-0000-4000-8000-000000000006',0,'500g large shrimp, peeled'),
  ('50000000-0000-4000-8000-000000000006',1,'4 tbsp butter + 5 cloves garlic'),
  ('50000000-0000-4000-8000-000000000006',2,'Parsley + lemon'),
  ('50000000-0000-4000-8000-000000000006',3,'Pinch of chili flakes')
on conflict do nothing;

-- 6) Steps.
insert into public.recipe_steps (recipe_id, position, text) values
  ('50000000-0000-4000-8000-000000000001',0,'Score the eggplant flesh and sear cut-side down until golden.'),
  ('50000000-0000-4000-8000-000000000001',1,'Brush with the miso–mirin glaze and broil until bubbling.'),
  ('50000000-0000-4000-8000-000000000001',2,'Finish with sesame and scallions.'),
  ('50000000-0000-4000-8000-000000000002',0,'Blend toasted chiles into a marinade and braise the beef until tender.'),
  ('50000000-0000-4000-8000-000000000002',1,'Dip tortillas in the fat, fill with beef + cheese, crisp on the griddle.'),
  ('50000000-0000-4000-8000-000000000002',2,'Serve with onion, cilantro, lime, and consommé for dipping.'),
  ('50000000-0000-4000-8000-000000000003',0,'Cook pasta; reserve a mug of starchy water.'),
  ('50000000-0000-4000-8000-000000000003',1,'Toast cracked pepper, add pasta water, then melt in pecorino off heat.'),
  ('50000000-0000-4000-8000-000000000003',2,'Toss hard until glossy and creamy.'),
  ('50000000-0000-4000-8000-000000000004',0,'Whisk soy, sesame oil, and a little sriracha; fold through the tuna.'),
  ('50000000-0000-4000-8000-000000000004',1,'Bowl the rice, arrange tuna, avocado, edamame, cucumber.'),
  ('50000000-0000-4000-8000-000000000004',2,'Drizzle spicy mayo and shower with sesame.'),
  ('50000000-0000-4000-8000-000000000005',0,'Roll beef into loose balls; smash hard on a screaming-hot pan.'),
  ('50000000-0000-4000-8000-000000000005',1,'Flip once at the crust, add cheese, melt.'),
  ('50000000-0000-4000-8000-000000000005',2,'Stack on toasted buns with sauce and pickles.'),
  ('50000000-0000-4000-8000-000000000006',0,'Sizzle garlic in butter until fragrant.'),
  ('50000000-0000-4000-8000-000000000006',1,'Add shrimp and cook 2 minutes a side, basting.'),
  ('50000000-0000-4000-8000-000000000006',2,'Finish with parsley, lemon, and chili flakes.')
on conflict do nothing;

-- 7) A PHOTO post (image carousel, no video) — exercises recipes.image_urls.
insert into public.recipes (id, cook_id, title, cuisine, time_minutes, servings, level, video_asset_id, image_urls, status, post_type, caption, tags, like_count, comment_count, share_count, save_count)
values ('50000000-0000-4000-8000-0000000000a1','c0000000-0000-4000-8000-000000000004','Fresh Plates, Three Ways','Healthy',15,2,'Easy', null,
  array['/recipes/poke-bowl.jpg','/recipes/garlic-shrimp.jpg','/recipes/cacio-e-pepe.jpg'],
  'published','recipe','Swipe through the plates 📸 no video, just vibes. #photo #plates #quick',
  array['photo','plates','quick','healthy'], 4200, 38, 110, 640)
on conflict (id) do nothing;
delete from public.recipe_ingredients where recipe_id='50000000-0000-4000-8000-0000000000a1';
delete from public.recipe_steps where recipe_id='50000000-0000-4000-8000-0000000000a1';
insert into public.recipe_ingredients (recipe_id, position, text) values
  ('50000000-0000-4000-8000-0000000000a1',0,'Whatever''s fresh in the fridge'),
  ('50000000-0000-4000-8000-0000000000a1',1,'A good drizzle of olive oil'),
  ('50000000-0000-4000-8000-0000000000a1',2,'Flaky salt + lemon');
insert into public.recipe_steps (recipe_id, position, text) values
  ('50000000-0000-4000-8000-0000000000a1',0,'Plate it pretty.'),
  ('50000000-0000-4000-8000-0000000000a1',1,'Snap a few photos.'),
  ('50000000-0000-4000-8000-0000000000a1',2,'Eat before it gets cold.');
