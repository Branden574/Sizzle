# Reply to App Review — Submission ID 17104496-1085-44f5-892b-6168ef0a7960

> Paste the section below into **App Store Connect → Resolution Center → Reply**.
> Before sending: (1) confirm the **Paid Applications Agreement** is **Active** in Business,
> (2) confirm the app + 4 IAPs are re-submitted together, (3) the demo password is already
> in the App Review Information field — no need to repeat it here.

---

Hello, and thank you for the detailed feedback.

You are right that the In-App Purchases were difficult to locate in build 33, and we apologize for the time this cost your team. We have corrected this. Below is (1) how our In-App Purchases work, (2) exact steps to find and complete a purchase, and (3) what we changed.

**1. How purchases work in Sizzle**

Sizzle is a recipe-video community. There is no central "store" screen. Instead, an individual creator can mark one of their recipes as **Premium** and set a price. Any viewer can then unlock that specific recipe with a consumable In-App Purchase, which reveals that recipe's full video, ingredients, and step-by-step instructions.

The four consumable products correspond to the four price points a creator may choose:

- `premium_unlock_599` — Premium Recipe Unlock $5.99
- `premium_unlock_999` — Premium Recipe Unlock $9.99
- `premium_unlock_1499` — Premium Recipe Unlock $14.99
- `premium_unlock_1999` — Premium Recipe Unlock $19.99

Because the purchase unlocks one creator's specific recipe, the buy button appears on the premium recipe itself rather than in a separate purchase screen. That is what made it hard to find, and it is what we have now fixed.

**2. Steps to locate and complete an In-App Purchase**

The fastest path (no sign-in required to see it, sign-in required to buy):

1. Launch Sizzle and sign in with the demo account provided in App Review Information (`review@getsizzle.app`, email tab).
2. On the **Home** tab (the main video feed), scroll. Premium recipes now appear directly in the feed as a locked card showing a lock icon, the text **"Premium recipe"**, and a button reading **"Unlock · $5.99"**.
3. Tap **"Unlock · $5.99"**. The recipe opens with the paywall.
4. Tap the **"Unlock · $5.99"** button on the recipe. Apple's standard purchase sheet appears.
5. Complete the purchase. The recipe's video, ingredients, and steps unlock immediately.

Alternate path (finding it from the creator's profile):

1. Tap the **Discover** tab (magnifying glass).
2. Search for **Branden** and open the creator profile **@Branden**.
3. Open the post titled **"Hi Sizzle Peeps"** — it is marked with a lock badge and is priced at $5.99.
4. Tap **"Unlock · $5.99"** to bring up Apple's purchase sheet.

**3. What we changed**

Previously, premium recipes were shown only on a creator's own profile page and were excluded from the main feed and search results. A new account that did not yet follow anyone would therefore not encounter a purchasable item. We have changed this: premium recipes now appear in the main **Home** feed and in hashtag/topic results as locked preview cards with a visible **"Unlock · $X.XX"** button, so the In-App Purchase is reachable from the first screen after sign-in.

This change is server-side and is already live, so it applies to the build currently under review — no new binary is required.

**4. Sandbox and configuration**

- All four products are consumables, are attached to this submission, and are configured for the Apple-provided sandbox environment. Our server accepts sandbox receipts during review.
- We do **not** restrict In-App Purchases by storefront, region, or device configuration. They are available on all storefronts and on both iPhone and iPad.
- We have confirmed the Paid Applications Agreement is active in the Business section.

Please let us know if anything is still unclear — we are happy to provide a screen recording of the purchase flow if that would help.

Thank you again for your time.

---

## Checklist before you send

- [ ] **Business → Agreements: Paid Applications Agreement shows "Active"** (banking + tax complete). If not active, purchases cannot work and this will be rejected again.
- [ ] The discoverability fix is deployed (API + OTA) and verified on-device.
- [ ] The app **and all 4 IAPs** are re-submitted together for review.
- [ ] Demo account `review@getsizzle.app` works and the password in App Review Information is current.
- [ ] "Hi Sizzle Peeps" is still published, priced $5.99, and the account is public.
