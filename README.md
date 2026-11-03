# Josiah's Digital Services

Portfolio and business website (services, portfolio, service agreement, policies, PayPal payment portal) plus an invoice-email API, all running as one Cloudflare Worker on **josiahsdigitalservices.com**. No build step, no database.

## Structure

| Path | What |
|------|------|
| `public/` | The website, served as static assets |
| `public/_headers` | Security headers for every page (CSP, HSTS, anti-framing) |
| `public/js/payment-core.js` | Payment input validation (pure, tested) |
| `public/js/pay.js` | PayPal checkout, duplicate-payment guard, invoice email request |
| `src/index.js` | Worker: `www` → apex redirect, `/api/receipt`, everything else from `public/` |
| `src/email.js` | Invoice/receipt email (your email template) |
| `wrangler.toml` | Cloudflare config: domain routes, assets, non-secret settings |
| `tests/` | `npm test` |

## Commands

```bash
npm install        # once
npm test           # unit tests
npm run dev        # local site + API at http://localhost:8787
npm run deploy     # publish to josiahsdigitalservices.com
```

## Going live checklist

1. **Cloudflare:** `npx wrangler login`, then `npm run deploy`. The `routes` in `wrangler.toml` attach `josiahsdigitalservices.com` and `www.`, and Cloudflare creates the DNS records and certificates. If deploy says a DNS record already exists, delete the old A/AAAA/CNAME for that name in Cloudflare → DNS, then deploy again.
2. **Resend (no-reply sender):** at resend.com → Domains → Add `josiahsdigitalservices.com` and use **Auto configure with Cloudflare** (or copy the DKIM/SPF/MX records into Cloudflare DNS). Wait for *Verified*. Then API Keys → create a key with **Sending access** for this domain only. Emails go from `noreply@josiahsdigitalservices.com`; replies go to `OWNER_EMAIL`.
3. **PayPal:** developer.paypal.com → Apps & Credentials. Use one app (Sandbox first, then Live):
   - client ID → `PAYPAL_CLIENT_ID` in **both** `public/js/pay.js` and `wrangler.toml`
   - `PAYPAL_API` in `wrangler.toml`: `https://api-m.sandbox.paypal.com`, or `https://api-m.paypal.com` for Live
4. **Secrets** (stored encrypted in Cloudflare, never in this repo):
   ```bash
   npx wrangler secret put PAYPAL_SECRET
   npx wrangler secret put RESEND_API_KEY
   ```
5. `npm run deploy`, make a small real payment, check that the PayPal receipt and your invoice email arrive, then refund it from PayPal.
6. **Policies:** confirm every `[bracketed]` value in `privacy.html` and `terms.html`.
7. **Auto-deploy (optional):** Cloudflare dashboard → Workers & Pages → `josiahsdigitalservices` → Settings → Build → connect the GitHub repo, so every push to `main` deploys.

## Invoice emails

After a completed payment, `pay.js` sends **only the PayPal order ID** to `/api/receipt`. The Worker looks the order up in PayPal with your secret key. Only if it's `COMPLETED` and under 24h old does it email the invoice to the payer (BCC you) through Resend. The amount, name, email and reference all come from PayPal, never from the browser, so nobody can use the endpoint to send their own emails.

## Security

- **Headers** (`public/_headers`): Content-Security-Policy (scripts only from this site and PayPal, no inline scripts except PayPal's one hashed loader, no plugins, no form posts, no framing), HSTS, `X-Frame-Options: DENY`, `nosniff`, strict referrer, no camera/mic/location.
- **No PII in URLs:** the payment form never submits; data goes only to PayPal.
- **Input validation:** `payment-core.js` accepts only plain decimal amounts from US$1 to US$10,000, a valid email and a reference of safe characters.
- **API:** same-origin only (Origin must match), 1 KB request limit, order ID format checked, 10s timeouts on PayPal/Resend, email content from PayPal and HTML-escaped. Errors log only status codes; request logs are off.
- **Known limit:** the order is created in the browser, so the payer chooses the amount. Reconcile every payment against its invoice in PayPal (the reference is in *Custom ID*).

## Idempotency (no double charges, no double emails)

- PayPal captures each order at most once; a repeat capture fails instead of charging again.
- The form is locked while a checkout is open, and the order uses a snapshot of the validated details.
- After a successful payment, the reference + amount + transaction ID are kept in the browser's `sessionStorage`. Paying the same reference and amount again in that tab requires an explicit "pay again" tick.
- If the result is unknown, the page tells the payer **not** to pay again and shows the PayPal order ID to quote.
- Invoice emails use Resend's `Idempotency-Key: receipt-<capture id>`, and the Worker refuses captures older than 24h (Resend's idempotency window). So retries and replays send each invoice once.

## Data handling & retention

- The site and Worker store nothing. The only browser storage is the duplicate guard (no name/email, erased when the tab closes).
- Payment records live in PayPal; invoice emails in your mailbox. Keep them for the period in `privacy.html` (default [7] years).
- Run through this checklist at least yearly:
  - [ ] 2FA on Gmail, PayPal, Cloudflare, Resend and GitHub
  - [ ] Resend API key is sending-only; rotate it if anyone else had access
  - [ ] Client logins kept in a password manager, removed after handover
  - [ ] Delete enquiries older than [12] months that didn't become projects
  - [ ] Delete project files/records past their retention period
  - [ ] Policies still match what you actually do
