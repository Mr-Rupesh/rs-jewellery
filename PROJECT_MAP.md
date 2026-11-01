# RS Jewellers: Project Map

**Read this first.** It tells you what each file does and which files to check when something breaks.
Stack: Next.js 15 (App Router) + TypeScript + Tailwind, Firebase (Auth, Firestore, Storage), Razorpay payments. Customer WhatsApp updates are sent by hand by the shop owner (no automation).

---

## 1. Run it locally (5 commands)

```
npm install
npm run emulators      # terminal A: Firebase emulators (needs Java 21+). UI: http://localhost:4000
npm run seed           # terminal B: sample products, gold rates, PIN codes (re-run after every emulator restart)
npm run dev            # terminal B: the website at http://localhost:3000
npm test               # unit tests for the business logic (no emulator needed)
```
Copy `.env.example` to `.env.local` first. Restart `npm run dev` after changing any env value.

---

## 2. Four rules that hold the system together
1. **Prices are computed only on the server** (`src/lib/pricing.ts`, called from `src/app/api/checkout/route.ts`). The browser never sends a price.
2. **An order becomes PAID only when Razorpay confirms the payment to our server**, either by the server asking Razorpay (`src/app/api/payment/confirm/route.ts`, runs automatically from the order page) or by Razorpay's webhook (`src/app/api/webhooks/razorpay/route.ts`, backup path). Both end in `src/server/orders.ts` `markOrderPaid`, which reduces stock and assigns the invoice number once. Repeats do nothing. The browser can never mark an order paid.
3. **Customers can never create or edit orders from the browser.** `firestore.rules` blocks it; only server code (Firebase Admin SDK) writes orders.
4. **Admin = a Firebase login with the `admin` claim.** It is checked in the browser (`src/app/admin/layout.tsx`), on the server (`src/server/admin-auth.ts`) and in `firestore.rules`. All three must agree.

Money is stored as whole **paise**, weights as whole **milligrams**. Never use decimals in code.

---

## 3. If something breaks, check here

| Symptom | Look at first | Then |
|---|---|---|
| Wrong price / total | `src/lib/pricing.ts` (the formula), `src/lib/pricing.test.ts` | Gold rates doc `settings/pricing` (Admin → Gold rates); product fields in Admin → Products |
| "Gold rates are not set" | Run `npm run seed` (local) or save rates in Admin → Gold rates | `src/server/catalog.ts` `getSettings` |
| Catalogue / product page empty | `src/app/catalog/page.tsx`, `src/server/catalog.ts` | Is the product Active? Did the emulators restart without a re-seed? |
| Cannot log in | `src/components/login-form.tsx` (screen), `src/app/api/otp/send/route.ts` + `verify/route.ts` (email code), Google button | Real project: enable the Google provider and add your domain under Authorized domains. Phone OTP (`phone-login.tsx`) is off unless `NEXT_PUBLIC_ENABLE_PHONE_LOGIN=true` |
| Login code email does not arrive | `src/server/email.ts`, `src/app/api/otp/send/route.ts` | While developing (no `RESEND_API_KEY`) the code is **printed in the `npm run dev` terminal**. In production check `RESEND_API_KEY`, `EMAIL_FROM` (a verified domain), the Resend dashboard (free plan: 100 emails a day) and spam folders |
| "Too many wrong attempts" / "wait N seconds" at login | `src/lib/otp.ts` (limits: 5 wrong guesses per code, 30 s between codes, 5 codes an hour per email, 10 minute expiry) | Codes live in the `email_otps` collection (server only) |
| Checkout says "Could not start payment" | `src/app/api/checkout/route.ts` (read the terminal where `npm run dev` runs) | Razorpay keys in `.env.local` |
| Checkout blocks a PIN code | `src/app/api/checkout/route.ts` (PIN check), Admin → Store pages | `src/lib/admin-logic.ts` `isServiceable` |
| Paid, but order stays PENDING | `src/app/api/payment/confirm/route.ts` (read the `npm run dev` terminal), `src/app/orders/[id]/page.tsx` (checks every 5s for ~2 min, then shows "Check again"; while developing it shows a **Developer note** saying why it is still pending) | `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`; payment matching in `src/lib/webhook.ts` `pickPayment`; `src/server/orders.ts` `markOrderPaid`. Backup path: `src/app/api/webhooks/razorpay/route.ts` (`RAZORPAY_WEBHOOK_SECRET`; local test `npm run webhook:test -- <orderId>`) |
| Stock wrong | `src/server/orders.ts` (reduces on PAID, restores on cancel) | Orders flagged `needsReview` in the admin Orders page |
| Order flagged "needs review" | `reviewReason` field: PAYMENT_MISMATCH, PAID_AFTER_CANCEL or STOCK_SHORTFALL | Decision logic in `src/lib/webhook.ts` `decidePaid` |
| Invoice number missing / wrong | `src/server/orders.ts`, `src/lib/invoice.ts` | `counters/invoice-<year>` doc in Firestore |
| Invoice tax lines wrong | `src/app/orders/[id]/invoice/page.tsx`, `src/lib/invoice.ts` `gstSplit` | `NEXT_PUBLIC_SHOP_STATE` / `NEXT_PUBLIC_SHOP_GSTIN` |
| Admin page says "not an admin" | **Live site:** the email must be in the `ADMIN_EMAILS` secret, verified (Google, or a code login), then reload `/admin` (`src/app/api/auth/sync-admin/route.ts`). **Local:** `ADMIN_EMAILS` in `.env.local`, or `npm run set-admin -- <email>` after logging in once | `src/app/admin/layout.tsx` |
| Admin action fails with 401/403 | `src/server/admin-auth.ts` | Log out and in again (the claim is read from the login token) |
| "Missing or insufficient permissions" | `firestore.rules` / `storage.rules` | Restart emulators after editing a rules file. Run `npm run test:rules` |
| Gold-rate bar at the top is wrong | `src/components/gold-ticker.tsx` | Admin → Gold rates saved? |
| Order chime / alerts silent | `src/lib/chime.ts`, `src/app/admin/dashboard/page.tsx` | Click "Enable sound and alerts" once per visit (browser rule) |
| Image upload fails | `src/app/admin/products/page.tsx` (products), `src/app/custom-design/page.tsx` (sketches), `storage.rules` | Limits: JPG/PNG/WebP, under 5 MB, max 5 per product, max 3 per inquiry (`src/lib/inquiry.ts`) |
| Customer did not get a WhatsApp update | There is no automation: the shop owner sends it from the admin "Send WhatsApp update" button (Orders list or order page) | Message text is built by `orderUpdateMessage` in `src/lib/admin-logic.ts`. The owner must watch the admin Orders page (it chimes on a new paid order) |
| Wishlist / My account issues | `src/components/providers.tsx` (wishlist, login), `src/app/account/page.tsx` | `users/{uid}` doc rules |
| Support chat not updating | `src/components/chat.tsx` | `support_threads` rules in `firestore.rules` |
| Return request rejected | `src/app/account/page.tsx`, `firestore.rules` (`returns`) | Only your own DELIVERED order, one per order |
| CSV report odd | `src/lib/admin-logic.ts` `ordersToCsv` | Dashboard loads the latest 500 orders only |
| Policy page text wrong | Admin → Store pages | `src/lib/legal-defaults.ts` (original text), `src/app/policies/[slug]/page.tsx` |
| Footer / invoice shop details wrong | `.env.local` `NEXT_PUBLIC_SHOP_*` | `src/lib/shop.ts` |
| Colours / fonts | `tailwind.config.ts` (palette: warm black `ink`, cream `stone`, gold `gold`, readable text-gold `golddeep`), `src/app/globals.css` (buttons, cards), `src/app/layout.tsx` (fonts) | Use `text-golddeep` for gold text on light backgrounds and `text-gold` only on dark ones |
| Logo / cover photo wrong or missing | `public/brand/*`, `src/app/page.tsx` (hero), `src/components/header.tsx`, `src/components/footer.tsx` | |
| Recent orders not showing in the bag | `src/app/cart/page.tsx` (`RecentOrders`; shows only when logged in, hides cancelled and abandoned attempts) | |
| Too many requests (429) | `src/lib/rate-limit.ts` | Limits are set in `src/app/api/quote/route.ts` and `src/app/api/checkout/route.ts` |

---

## 4. Directory guide

### Root
| File | Purpose |
|---|---|
| `PROJECT_MAP.md` | This file: what every file does and where to look when something breaks |
| `ARCHITECTURE.md` | How the system fits together, the flows, and every API endpoint explained |
| `DEPLOYMENT.md` | Step-by-step guide to put the site live on Firebase App Hosting |
| `apphosting.yaml` | Live-site settings (server size, public values, secret names). Check it with `npm run check:deploy` |
| `README.md` | Short run notes per milestone |
| `package.json` | Scripts and dependencies (see section 7). `overrides` pins patched versions: do not remove |
| `.env.example` | Template for `.env.local` (secrets live only in `.env.local`, never commit it) |
| `firebase.json`, `.firebaserc` | Emulator ports and the local project id (`demo-rs-jewellers`) |
| `firestore.rules` | **Security rules for the database. Who may read/write what** |
| `storage.rules` | Security rules for uploaded files |
| `next.config.ts` | Security headers, old-URL redirects |
| `tailwind.config.ts`, `postcss.config.js`, `src/app/globals.css` | Styling (brand colours, fonts, button styles) |
| `tsconfig.json` | TypeScript settings. `@/` means `src/` |
| `public/brand/` | **Logo and cover photo.** `logo-light-96.png` / `logo-light-320.png` (bright gold, for dark areas), `logo-gold-160.png` (deep gold, for light areas), `cover-1920.jpg` + `cover-960.jpg` (home page hero). Replace a file (same name and size) to change branding |
| `src/app/icon.png` | Browser tab icon (favicon). Next.js picks it up automatically |

### `scripts/`: command-line helpers (run with `npm run ...`)
| File | Purpose |
|---|---|
| `seed.ts` | Fills the local emulator with sample products, rates, PIN codes. Includes a ₹1 **TEST ITEM**: remove before launch |
| `set-admin.ts` | Gives a logged-in user (by email, or phone if phone login is on) the admin claim |
| `fake-webhook.ts` | Sends a signed fake "payment captured" to the local webhook |
| `check-deploy.ts` | Refuses to continue if `apphosting.yaml` still has placeholders, emulators on, or a plain-text secret |

### `src/lib/`: pure logic, no database. All unit-tested (`*.test.ts`)
| File | Purpose |
|---|---|
| `pricing.ts` | **Price formula** (weight × rate + making + stone + GST), cart pricing, money formatting |
| `validate.ts` | Checks checkout input: items, delivery address |
| `webhook.ts` | Picks the matching payment, signature check, "what to do with this payment" decision, stock maths |
| `invoice.ts` | Financial-year and invoice-number format, CGST/SGST/IGST split |
| `admin-logic.ts` | Admin rules: rate/GST parsing, status transitions, product input checks, order search + CSV, PIN list, return statuses, policy-text parser |
| `inquiry.ts` | Limits for custom-design uploads |
| `rate-limit.ts` | Request limiter |
| `payment-hint.ts` | Plain-language reason shown on a pending order while developing |
| `deploy-check.ts` | Pre-deploy safety check of `apphosting.yaml` |
| `otp.ts` | **Email login codes**: generate, hash, send limits, check a guess (unit-tested) |
| `legal-defaults.ts` | Original text of the five policy pages |
| `shop.ts` | Shop name/address/GSTIN from env |
| `firebase.ts` | Browser-side Firebase setup (connects to emulators locally) |
| `admin-client.ts` | Helper for admin screens to call admin API routes |
| `use-quote.ts` | Hook that fetches live prices for the cart |
| `chime.ts` | Admin alert sound and desktop notification |

### `src/server/`: runs only on the server
| File | Purpose |
|---|---|
| `firebase-admin.ts` | Server Firebase connection (uses emulator locally) |
| `admin-auth.ts` | Verifies the caller is an admin (used by every `/api/admin/*` route) |
| `catalog.ts` | Reads products, gold rates, PIN list, policy text; builds price quotes |
| `email.ts` | Sends one email through Resend (prints it in the terminal while developing) |
| `orders.ts` | **`markOrderPaid`** (the PAID transaction: stock + invoice number) and `changeOrderStatus` (ship/deliver/cancel) |

### `src/app/api/`: server endpoints
| Route | Purpose |
|---|---|
| `quote/route.ts` | Live prices for the cart/wishlist |
| `auth/sync-admin/route.ts` | Grants or withdraws admin permission from the private `ADMIN_EMAILS` list (called when the admin screens open) |
| `otp/send/route.ts`, `otp/verify/route.ts` | Email a 6-digit login code; check it and return a Firebase login token |
| `checkout/route.ts` | **Starts a purchase**: login, PIN, re-price, create PENDING order + Razorpay order |
| `webhooks/razorpay/route.ts` | Backup: receives payment confirmation pushed by Razorpay (needs a public URL) |
| `payment/confirm/route.ts` | **Confirms payment automatically**: asks Razorpay if the order was paid, then marks it PAID |
| `admin/rates/route.ts` | Save gold rates (with typo guard) |
| `admin/products/route.ts`, `admin/products/[id]/route.ts` | Create / edit / hide / delete products |
| `admin/orders/[id]/status/route.ts`, `admin/orders/bulk/route.ts` | Change order status (single / many) |
| `admin/orders/cleanup/route.ts` | Cancel unpaid orders older than 48h |

### `src/app/`: pages customers see
`page.tsx` home · `catalog/` shop with search · `product/[id]/` product page · `cart/` bag + PIN check · `checkout/` address + pay · `orders/[id]/` order status · `orders/[id]/invoice/` printable invoice · `account/` orders, wishlist, returns, support, profile · `login/` · `custom-design/` manufacturing enquiry · `policies/[slug]/` the five policy pages · `layout.tsx` page frame (fonts, header, footer, WhatsApp button) · `robots.ts` search-engine rules

### `src/app/admin/`: admin screens (all need the admin claim)
`dashboard/` orders, stats, filters, bulk, CSV · `orders/[id]/` order detail + shipping · `products/` product forms, images, low-stock · `customers/` · `inquiries/` · `returns/` · `support/` chat inbox · `settings/` gold rates · `store/` delivery PIN codes + policy text · `layout.tsx` admin gate, tabs, live badges

### `src/components/`: shared building blocks
`providers.tsx` (login state, cart, wishlist) · `header.tsx` · `footer.tsx` · `gold-ticker.tsx` · `product-card.tsx` · `add-to-cart.tsx` · `store-ui.tsx` (wishlist heart, WhatsApp button) · `phone-login.tsx` · `chat.tsx` (support chat, used by customer and admin)

### `src/types/index.ts`: shared data shapes (Product, Order status, prices)

### `tests/rules.test.mjs`: security-rules tests (`npm run test:rules`, stop the app emulators first)

---

## 5. Where data lives (Firestore + Storage)

| Collection | Who writes | Who reads |
|---|---|---|
| `products` | Admin (via API) | Public (active only) |
| `settings/pricing` (+ `rateHistory`) | Admin (via `/api/admin/rates`) | Public |
| `settings/service` (PIN codes), `settings/legal` (policies), `settings/store` (low-stock level) | Admin (Store pages / Products screens) | Public |
| `orders` | **Server only** | Owner customer, admin |
| `counters/invoice-<year>` | Server only | Nobody in the browser |
| `users/{uid}` (profile, wishlist) | The customer | The customer, admin |
| `email_otps/{hash of email}` | Server only (hashed code, expiry, attempts) | Nobody in the browser |
| `custom_inquiries` | Customer creates, admin updates | Owner, admin |
| `returns/{orderId}` | Customer creates, admin updates | Owner, admin |
| `support_threads/{uid}` + `messages` | Customer / admin | Owner, admin |

Storage: `products/` (admin writes, public reads) · `custom_inquiries/{uid}/` (owner writes; owner + admin read).

**Order life cycle:** `PENDING` → (webhook) `PAID` → `SHIPPED` → `DELIVERED`. `PENDING`/`PAID` → `CANCELLED` (a paid cancel restores stock and flags a manual refund in Razorpay).

---

## 6. Environment variables (`.env.local`)

| Variable | Used by |
|---|---|
| `NEXT_PUBLIC_FIREBASE_*`, `NEXT_PUBLIC_USE_EMULATORS` | Browser Firebase (`src/lib/firebase.ts`) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Server Firebase in production only (`src/server/firebase-admin.ts`) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Checkout (`api/checkout`) and payment confirmation (`api/payment/confirm`) |
| `RAZORPAY_WEBHOOK_SECRET` | Backup webhook signature check |
| `NEXT_PUBLIC_SHOP_*` | Footer, invoice (`src/lib/shop.ts`) |
| `ADMIN_EMAILS` | Emails that become admin automatically after login (`api/auth/sync-admin`). A secret on the live site |
| `ALLOW_EMULATORS_IN_PRODUCTION` | Safety switch: a production build refuses to start with emulators on unless this is `true` (local tests only) |
| `OTP_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM` | Email login codes (`src/lib/otp.ts`, `src/server/email.ts`). Empty Resend values = print the code in the terminal (development only) |
| `NEXT_PUBLIC_ENABLE_PHONE_LOGIN` | Shows the phone OTP login box (off by default; SMS is paid per message) |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Floating WhatsApp button (customers message the shop) |

Variables starting with `NEXT_PUBLIC_` are visible in the browser. Never put a secret in one.

---

## 7. Commands

| Command | What it does |
|---|---|
| `npm run dev` / `build` | Run / build the website |
| `npm run emulators` (`emulators:persist` keeps data) | Local Firebase |
| `npm run seed` | Load sample data into the emulator |
| `npm run set-admin -- <email>` | Make that user an admin (local emulator only; on the live site use `ADMIN_EMAILS`) |
| `npm run check:deploy` | Check `apphosting.yaml` is ready for the live site |
| `npm run webhook:test -- <orderId>` | Simulate a successful payment locally |
| `npm test` | Business-logic tests |
| `npm run test:rules` | Security-rules tests |
| `npm run typecheck` | TypeScript check |

---

## 8. Change carefully (money and security)
`src/lib/pricing.ts` · `src/lib/webhook.ts` · `src/server/orders.ts` · `src/app/api/checkout/route.ts` · `src/app/api/webhooks/razorpay/route.ts` · `firestore.rules` · `storage.rules` · `src/server/admin-auth.ts`.
After touching any of them run `npm test`, `npm run test:rules`, then place a ₹1 test order and run `npm run webhook:test`.

## 9. Not built yet / open items
Hosting and production setup · real Firebase project · production way to grant admin · live Razorpay webhook URL (backup path; payment confirmation already works without it) · GST registration and the invoice format confirmed with a CA · `uuid` advisory inside Google libraries (fix needs a `firebase-admin` major upgrade).
