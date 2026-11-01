**New here? Read [PROJECT_MAP.md](PROJECT_MAP.md) first: what every file does and where to look when something breaks. System design and API reference: [ARCHITECTURE.md](ARCHITECTURE.md).**

# RS Jewellers (Next.js 15 + Firebase)

Status: M0-M8 verified locally. M9 (automatic payment confirmation, manual WhatsApp) written. M7 (client feature set + new design) written, needs local verification. M5 (custom-design inquiries + WhatsApp) written, needs local verification.

## Run
1. Node >= 22.6. `npm install`
2. `cp .env.example .env.local`
3. Terminal A: `npm run emulators` (needs Java 21+ installed for the Firestore emulator; first run downloads emulator jars)
4. Terminal B: `npm run dev`
5. Tests: `npm test`

## Rules of the codebase
- Money = integer paise, weight = integer mg. Never floats.
- Prices computed only in server code via `src/lib/pricing.ts`.
- Orders written only by the server (Admin SDK). Rules block client writes.
- Payment confirmed only by verified Razorpay webhook.
- Fixed-price override (`fixedPricePaise`) is a pre-GST subtotal.

## Next: M2 phone OTP + cart + checkout, M3 webhook, M4 admin, M5 inquiries + WhatsApp, M6 hardening.

## M2 local test steps
1. `npm run emulators` (terminal A)
2. `npm run seed` (terminal B, once per emulator start; data is in-memory unless you use `emulators:persist`)
3. Put Razorpay TEST keys in `.env.local`: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
4. `npm run dev`, open http://localhost:3000/catalog
5. Log in with any 10-digit mobile; the OTP appears in the emulator UI at http://localhost:4000/auth (or in terminal A)
6. Add items, checkout, pay with Razorpay test UPI/card. Order stays PENDING until M3 (webhook).

## M3 webhook test (local, no tunnel)
1. Add `RAZORPAY_WEBHOOK_SECRET=localsecret123` to `.env.local`, restart `npm run dev`.
2. Place an order (it stays PENDING). Copy the order id from the URL `/orders/<id>` (the FULL id, not the 8-char title).
3. `npm run webhook:test -- <orderId>` -> prints `200 {"ok":true,"result":"PAID"}`; the order page flips to PAID live and stock drops.
4. Run it again: result `ALREADY_DONE`, stock unchanged.
For real Razorpay test webhooks later: expose localhost with a tunnel and add the URL + same secret in Razorpay Dashboard -> Webhooks (event: payment.captured).

## M4 admin
1. Log in on the site once with your mobile number.
2. `npm run set-admin -- <10-digit mobile>` then open http://localhost:3000/admin
3. Tabs: Orders (live, chime), Gold rates, Products.

## M5 custom design + WhatsApp
- Customers: /custom-design (login required). Up to 3 images (JPG/PNG/WebP, <5 MB). Stored in Firebase Storage (emulator port 9199).
- Admin: /admin/inquiries (images, quote, "Open WhatsApp chat"); the tab shows a live "(n new)" count and chimes.
- WhatsApp: automation was removed. The shop owner sends updates by hand from the admin screens ("Send WhatsApp update" opens a ready-written message).

## M6 hardening
- Rate limits: /api/quote 60/min per IP, /api/checkout 10/min per user (in memory, per server instance).
- Invoices: sequential `RS/<FY>/<n>` number assigned atomically on PAID; page at /orders/<id>/invoice (Print -> Save as PDF).
- Admin > Orders > "Awaiting payment" > "Clear abandoned orders" cancels unpaid orders older than 48h.
- Legal pages /terms /privacy /shipping-returns are DRAFTS: fill in the [brackets] and have them reviewed.
- Rules tests: stop the app emulators, then `npm install` and `npm run test:rules`.
- Before launch run `npm audit --omit=dev` and review (do NOT use --force).

## M7 client feature set + design
- Design: charcoal #10100C, gold #C6A45A, ivory #F7F0E1, Playfair Display + DM Sans (tokens in tailwind.config.ts).
- Storefront: search + category/purity filters, wishlist (heart), /account (My orders, Wishlist, Returns, Support, Profile), floating WhatsApp button.
- Admin: Orders (stats, search, date + status filters, bulk status, CSV), /admin/orders/<id> details + carrier/tracking,
  Products (create/edit/delete, image upload to Storage, low-stock threshold), Customers, Returns, Support inbox.
- IMPORTANT: Firestore rules changed (returns, support chat, carrier). Restart the emulators so the new firestore.rules load.
- Set NEXT_PUBLIC_WHATSAPP_NUMBER (digits only, with country code) for the floating button.

## M8 product details, delivery PIN check, editable policies
- Product page: price shown as one final amount; admin fills Highlights + Specifications (Products > Edit).
- Bag: "Delivery availability" PIN check. Checkout is also blocked server-side for PINs not on the list.
- Admin > Store pages: edit serviceable PIN codes (empty = deliver everywhere) and the 5 policy pages (/policies/<terms|privacy|shipping|returns|cancellation>).
- Restart emulators + `npm run seed` to load the sample PIN codes and product details.

## M9 automatic payment confirmation, manual WhatsApp
- After paying, the order page asks the server every 5s (about 2 min) to check with Razorpay: `/api/payment/confirm`. No terminal command, no public URL needed. The page then shows "Order placed successfully ... update on WhatsApp within 2 hours".
- The Razorpay webhook stays as a backup (it needs a public URL, so it is for the hosted site).
- No automated WhatsApp. Owner uses "Send WhatsApp update" in Admin > Orders. Removed: whatsapp server files and WHATSAPP_* env vars.

## M10 theme + brand
- New look matched to the cover photo (warm black, cream, gold). Logo + cover in `public/brand/`, favicon `src/app/icon.png`.
- Home page rebuilt: full-width cover hero, trust row, featured products, category tiles, manufacturing section.
- Bag shows "Your recent orders" for logged-in customers only.
- Cover photo is from Vecteezy: check its licence (the free licence normally requires credit) before launch.

## M11 Google + email login (the emailed link was replaced by a code in M12)
- Login is Google sign-in or an email address (see M12). Phone OTP is off (`NEXT_PUBLIC_ENABLE_PHONE_LOGIN=false`).
- Make yourself admin with `npm run set-admin -- you@example.com` (log in once first).
- Customers' phone numbers now come from checkout and the custom-design form (new required field).
- Real Firebase project: enable the Google provider under Authentication > Sign-in method, and add your domain to Authorized domains.

## M12 email login with a 6-digit code (replaces the email link)
- Login: Google, or a code emailed to the customer. While developing, the code is printed in the `npm run dev` terminal (no email account needed).
- For real emails: create a Resend account, verify your domain, then set `RESEND_API_KEY`, `EMAIL_FROM`, and `OTP_SECRET` in `.env.local`.
- Limits per email: 10 minute expiry, 5 wrong guesses per code, 30 s between codes, 5 codes an hour.

## M13 going live
- Production admins: set the `ADMIN_EMAILS` secret; those verified emails become admin when they log in (no key files, no script).
- `apphosting.yaml` + `npm run check:deploy` + `DEPLOYMENT.md` describe and check the Firebase App Hosting deployment (Singapore region: App Hosting is not available in Mumbai).
- A production build refuses to start if emulators are switched on.
