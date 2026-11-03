# Josiah's Digital Services

Portfolio and business website (services, portfolio, service agreement, policies, Stripe payment portal) plus the payment and invoice-email API, all running as one Cloudflare Worker on **josiahsdigitalservices.com**. No build step, no database.

## Structure

| Path | What |
|------|------|
| `public/` | The website, served as static assets |
| `public/_headers` | Security headers for every page (CSP, HSTS, anti-framing) |
| `public/js/payment-core.js` | Payment input validation (pure, tested) |
| `public/js/pay.js` | Payment form → Stripe Checkout, duplicate-payment guard |
| `public/js/thanks.js` | Thank-you page: confirms the payment with the API |
| `public/js/paid-store.js` | Per-tab record of completed payments (duplicate guard) |
| `src/index.js` | Worker: `www` → apex redirect, `/api/checkout`, `/api/session`, `/api/stripe-webhook`, everything else from `public/` |
| `src/email.js` | Invoice/receipt email (your email template) |
| `wrangler.toml` | Cloudflare config: domain routes, assets, non-secret settings |
| `tests/` | `npm test` |

## Commands

```bash
npm install        # once
npm test           # unit tests
npm run dev        # local site + API at http://localhost:8787 (test secrets in .dev.vars, git-ignored)
npm run deploy     # publish to josiahsdigitalservices.com
```

## Going live checklist

1. **Cloudflare:** `npx wrangler login`, then `npm run deploy`. The `routes` in `wrangler.toml` attach `josiahsdigitalservices.com` and `www.`, and Cloudflare creates the DNS records and certificates. If deploy says a DNS record already exists, delete the old A/AAAA/CNAME for that name in Cloudflare → DNS, then deploy again.
2. **Resend (no-reply sender):** at resend.com → Domains → Add `josiahsdigitalservices.com` and use **Auto configure with Cloudflare** (or copy the DKIM/SPF/MX records into Cloudflare DNS). Wait for *Verified*. Then API Keys → create a key with **Sending access** for this domain only. Emails go from `noreply@josiahsdigitalservices.com`; replies go to `OWNER_EMAIL`.
3. **Stripe:** Dashboard → Developers:
   - **API keys:** create a **restricted key** with *Write* on Checkout Sessions and Payment Intents and *Read* on Charges (everything else *None*). Use the test-mode key first (`rk_test_…`), then live.
   - **Webhooks → Add endpoint:** `https://josiahsdigitalservices.com/api/stripe-webhook`, events `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Copy its **Signing secret** (`whsec_…`).
   - The publishable key (`pk_…`) isn't needed: the site redirects to Stripe's hosted page.
   - Optional: Settings → Customer emails → turn off *Successful payments* if you only want your branded invoice email, not Stripe's receipt too.
4. **Secrets** (stored encrypted in Cloudflare, never in this repo):
   ```bash
   npx wrangler secret put STRIPE_SECRET_KEY
   npx wrangler secret put STRIPE_WEBHOOK_SECRET
   npx wrangler secret put RESEND_API_KEY
   ```
5. `npm run deploy`. In test mode pay with card `4242 4242 4242 4242` (any future date, any CVC) and check the thank-you page and invoice email. Then switch both secrets to live keys, make a small real payment, and refund it from the Stripe Dashboard.
6. **Policies:** confirm every `[bracketed]` value in `privacy.html` and `terms.html`.
7. **Auto-deploy (optional):** Cloudflare dashboard → Workers & Pages → `josiahsdigitalservices` → Settings → Build → connect the GitHub repo, so every push to `main` deploys.

## How payments work

1. `pay.js` validates the form and sends it to `POST /api/checkout` with a random key per attempt.
2. The Worker validates it again (same rules, `payment-core.js`), converts the amount to exact cents, and creates a Stripe Checkout Session using that key as Stripe's `Idempotency-Key`. Retries and double clicks get the same session, never a second one.
3. The client pays on Stripe's hosted page (cards, Apple Pay, Google Pay). Card details never touch this site.
4. Stripe redirects to `thanks.html?session_id=…`, which asks `GET /api/session` for the confirmed status (no name or email returned).
5. Stripe calls `POST /api/stripe-webhook`. The Worker verifies the signature (HMAC-SHA256, 5-minute window), re-reads the session from Stripe, and if it's paid emails the branded invoice/receipt from `noreply@` via Resend (BCC you, replies to you). As Stripe recommends, the thank-you page's status check triggers the same idempotent fulfillment too, so the email goes out immediately even if the webhook is late.

Sessions pass `managed_payments[enabled]=false`: your account has Stripe Managed Payments on by default, and it only accepts eligible digital products, not custom services.

## Security

- **Headers** (`public/_headers`): Content-Security-Policy (scripts and API calls only to this site, no inline scripts, no plugins, no form posts, no framing), HSTS, `X-Frame-Options: DENY`, `nosniff`, strict referrer, no camera/mic/location/payment APIs.
- **No PII in URLs:** the payment form never submits; details go by POST to the API and on to Stripe.
- **Input validation** (browser and again in the Worker): only plain decimal amounts from US$1 to US$10,000, a valid email and a reference of safe characters.
- **API:** checkout is same-origin only and rate limited (10/min per IP); webhook requires a valid Stripe signature; request size limits; ID formats checked; 10s timeouts on Stripe/Resend; email content comes from Stripe and is HTML-escaped. Errors log only status codes; request logs are off.
- **Stripe key:** use a restricted key limited to Checkout Sessions, Payment Intents and reading Charges, so a leak can't issue refunds or read other data.
- **Known limit:** the payer types the amount (there's no invoice database). Reconcile each payment against its invoice in the Stripe Dashboard (the reference is in the payment's metadata and description).

## Idempotency (no double charges, no double emails)

- One checkout attempt = one idempotency key = one Stripe session, however many times the request is retried.
- The form locks while checkout starts; Stripe's page only charges a session once.
- After a confirmed payment, the reference + amount + payment ID are kept in the browser's `sessionStorage`. Paying the same reference and amount again in that tab requires an explicit "pay again" tick.
- If the outcome is unknown, the thank-you page tells the payer **not** to pay again.
- Invoice emails: Resend `Idempotency-Key: receipt-<payment id>` covers duplicate webhooks within 24h, and a `receipt_sent` marker on the PaymentIntent covers Stripe retries after that. If Resend fails, the webhook returns 502 and Stripe retries.

## Data handling & retention

- The site and Worker store nothing. The only browser storage is the duplicate guard (no name/email, erased when the tab closes).
- Payment records live in Stripe; invoice emails in your mailbox. Keep them for the period in `privacy.html` (default [7] years).
- Run through this checklist at least yearly:
  - [ ] 2FA on Gmail, Stripe, Cloudflare, Resend and GitHub
  - [ ] Stripe key is restricted and Resend key is sending-only; rotate them if anyone else had access
  - [ ] Client logins kept in a password manager, removed after handover
  - [ ] Delete enquiries older than [12] months that didn't become projects
  - [ ] Delete project files/records past their retention period
  - [ ] Policies still match what you actually do
