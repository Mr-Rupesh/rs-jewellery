# Deploying RS Jewellers to Firebase App Hosting

Do the steps in order. Anything marked **(you)** needs your accounts. `apphosting.yaml` already holds the settings. `npm run check:deploy` tells you what is still missing.

## Decisions already made
- **Hosting:** Firebase App Hosting. It is **not available in Mumbai**. The closest supported region is **Singapore (`asia-southeast1`)**, so use it for the backend, and also for Firestore and Storage (below) to keep the server and database close.
- **Login:** Google, or a 6-digit code by email. No SMS.
- **Admins:** a private email list on the server (`ADMIN_EMAILS`). No key files, no scripts.

## 1. Create the Firebase project **(you)**
1. Firebase console → Add project (any name, for example `rs-jewellers`). Note the **project ID**.
2. Upgrade to the **Blaze** plan (needed for App Hosting, Storage and Secret Manager). In Google Cloud → Billing → Budgets & alerts, add a **budget alert** (for example ₹500 a month).
3. **Firestore:** Build → Firestore Database → Create database → **Standard edition** → location **`asia-southeast1`** → production mode. *The location cannot be changed later.*
4. **Storage:** Build → Storage → Get started → same location. Copy the **bucket name** shown (it ends in `.firebasestorage.app`).
5. **Authentication:** Build → Authentication → Sign-in method → enable **Google** (set a support email).
6. **Web app:** Project settings → Your apps → add a **Web app**. Copy its config values (`apiKey`, `authDomain`, `projectId`, `storageBucket`).

## 2. Fill in `apphosting.yaml` **(you)**
Replace the five `REPLACE_WITH_...` values with what you copied, and set `EMAIL_FROM` (an address on a domain you verified in Resend, step 6). Then:
```
npm run check:deploy
```
It must say "looks ready to deploy". It also refuses if emulators are switched on or a secret is written as a plain value.

## 3. Store the secrets **(you)**
Run each command; it asks you to paste the value, then offers to give the backend access (say yes).
```
firebase login
firebase use --add            # choose the new project, alias it "production"
firebase apphosting:secrets:set razorpay-key-id
firebase apphosting:secrets:set razorpay-key-secret
firebase apphosting:secrets:set razorpay-webhook-secret
firebase apphosting:secrets:set otp-secret            # any long random text
firebase apphosting:secrets:set resend-api-key
firebase apphosting:secrets:set admin-emails          # e.g. owner@gmail.com (comma separated for several)
```
For `otp-secret`, one way to make a random value: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
Use Razorpay **test** keys first. Switch to live keys only after Razorpay approves the business.

## 4. Deploy the security rules **(you)**
```
firebase deploy --only firestore:rules,storage
```
Do this before the site goes public.

## 5. Create the backend and deploy **(you)**
1. Push the project to a GitHub repository (`.env.local` is ignored and must never be pushed).
2. ```
   firebase apphosting:backends:create --project YOUR_PROJECT_ID --location asia-southeast1
   ```
   Connect the GitHub repository, choose the `main` branch, and keep automatic rollouts on. (You can also do this in the console: Build → App Hosting.)
3. Watch the first rollout in the console. A later manual rollout: `firebase apphosting:rollouts:create BACKEND_ID --git-branch main`.
4. Add the site address to Authentication → Settings → **Authorized domains** (the `.hosted.app` address shown in the console, and later your own domain).

## 6. Let the login-code route sign users in
`/api/otp/verify` creates a sign-in token, which needs a permission on the app's Google service account. In Google Cloud → IAM, find the App Hosting service account (normally `firebase-app-hosting-compute@YOUR_PROJECT_ID.iam.gserviceaccount.com`, check the exact name in IAM) and give it the role **Service Account Token Creator** on itself:
```
gcloud iam service-accounts add-iam-policy-binding SERVICE_ACCOUNT_EMAIL \
  --member="serviceAccount:SERVICE_ACCOUNT_EMAIL" --role="roles/iam.serviceAccountTokenCreator"
```
If "Email me a code" works but logging in then fails with an error, this is the cause.

## 7. Domain, email and payments **(you)**
- **Domain:** App Hosting → Settings → Domains → add your domain and create the DNS records it shows. Then add the domain to Authorized domains.
- **Resend:** add and verify your domain (DNS records), create the API key (already stored in step 3). Send yourself a login code and check the inbox **and spam** in Gmail, Outlook and Yahoo.
- **Razorpay webhook (backup confirmation):** Dashboard → Settings → Webhooks → URL `https://YOUR-DOMAIN/api/webhooks/razorpay`, event **payment.captured**, secret = the value you stored as `razorpay-webhook-secret`.

## 8. First login and content **(you)**
1. Open the site and log in with an email that is on the `admin-emails` list (Google or code). Open `/admin`. You become admin automatically. Any other email is told it is not an admin.
2. Admin → **Gold rates**: set today's rates and the GST percentage agreed with your CA.
3. Admin → **Products**: add real products with photos. Make sure the ₹1 test item does **not** exist on the live project.
4. Admin → **Store pages**: set the delivery PIN codes and read all five policy pages.
5. To add or remove an admin later: edit the `admin-emails` secret (`firebase apphosting:secrets:set admin-emails`), then roll out again.

## 9. Smoke test before announcing
Log in with Google and by email code. Place a test order with Razorpay **test** keys and confirm it turns paid by itself, stock drops, an invoice number appears and the admin screen chimes. Try a PIN code that is not served. Ship and cancel one order. Check it all on a phone. Then switch to live keys, take one real ₹1 payment, and refund it.

## If something goes wrong
- **Roll back:** in the App Hosting console choose an earlier rollout and deploy it again.
- **Site won't start:** the error "NEXT_PUBLIC_USE_EMULATORS is true in a production build" means `apphosting.yaml` has emulators on.
- **Logs:** Google Cloud → Logging, or the backend's logs page in the console.
- Files to check for each symptom: `PROJECT_MAP.md`.
