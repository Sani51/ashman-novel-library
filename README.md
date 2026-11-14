# ASHMAN ASHRAF: setup guide

Architecture: Android/iOS app (Expo) -> Supabase (Postgres + Auth + Edge Functions). Secret keys live ONLY in Edge Function secrets.
Wallet changes happen only inside database functions called by server code: the app cannot credit, debit or edit a balance.

## 1. Accounts you need
- Supabase (free tier to start), Paystack (paystack.com, complete business verification for live keys), VTpass (vtpass.com, API keys + fund the provider wallet).

## 2. Database
Supabase SQL Editor: paste and run `supabase/schema.sql`. Auth -> Providers -> Email enabled (turn on "Confirm email" for live use).

## 3. Edge Functions
```
npm i -g supabase && supabase login && supabase link --project-ref YOUR_REF
supabase secrets set PAYSTACK_SECRET_KEY=sk_test_xxx VTPASS_API_KEY=xxx VTPASS_SECRET_KEY=xxx VTPASS_PUBLIC_KEY=xxx CRON_SECRET=$(openssl rand -hex 24)
supabase secrets set VTPASS_BASE_URL=https://sandbox.vtpass.com/api      # SANDBOX. Switch to https://vtpass.com/api only after testing
supabase functions deploy paystack buy-data admin-tools
supabase functions deploy paystack-webhook reconcile-pending --no-verify-jwt
```
Paystack dashboard -> Settings -> API & Webhooks: set webhook URL to `https://YOUR_REF.supabase.co/functions/v1/paystack-webhook`.

Schedule automatic pending-order checks (SQL editor; enable pg_cron and pg_net extensions first):
```sql
select cron.schedule('reconcile-pending','*/5 * * * *',$$ select net.http_post(
  url:='https://YOUR_REF.supabase.co/functions/v1/reconcile-pending',
  headers:=jsonb_build_object('x-cron-secret','YOUR_CRON_SECRET','Content-Type','application/json')) $$);
```

## 4. App
Put your Supabase URL and anon key in `config.js`, then `npm install && npx expo start` (Expo Go on Android).
Register with your own email, then in SQL: `update profiles set is_admin=true where email='YOUR_EMAIL';` and reopen the app: the Admin tab appears.
Admin -> Overview -> Sync plans from VTpass (sets prices = provider cost + markup; you can then edit any price in Plans).

## 5. Test in sandbox BEFORE real money (mandatory)
Fund wallet with Paystack TEST keys/cards. VTpass sandbox: phone 08011111111 simulates success, other numbers simulate failure (check the VTpass docs for the current list).
Confirm: success deducts once; failure refunds once; a pending order resolves via Reconcile; killing the app mid-purchase never double-charges.

## 6. Going live
Swap in Paystack live key + VTPASS_BASE_URL=https://vtpass.com/api + live VTpass keys, redeploy functions. Build the APK/AAB: `npm i -g eas-cli && eas build -p android` (Google Play account: $25 one-time).

## How money is protected
- Price is read from the database at purchase time, never from the app.
- Debit + order creation are one atomic, row-locked database transaction; refunds are idempotent (one refund per order).
- Funding is credited only after server-to-server Paystack verification of status, currency AND exact amount; webhook signature (HMAC-SHA512) is checked; each reference credits once.
- Unclear provider responses (timeout, "processing") stay PENDING: no refund and no resend, so the customer can't be double-charged or double-refunded. The cron job requeries them. Only a clear failure refunds.
- Customers cannot read your cost prices or raw provider responses; admin actions are checked server-side.

## Things to verify with VTpass yourself
Response-code handling is in `_shared/util.ts` (`interpretPay`, `interpretRequery`). I confirmed the endpoints, auth headers, request_id format and `delivered` status from VTpass docs; confirm the full response-code list for your account and adjust if needed. Stuck orders can be settled manually in Admin -> Orders after checking your VTpass dashboard.
Also: you are responsible for any VTU/fintech licensing, KYC and consumer-protection obligations in Nigeria.
