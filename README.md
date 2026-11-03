# Josiah's Digital Services

Portfolio and business website: services, portfolio, service agreement, policies and a PayPal payment portal. Plain static HTML/CSS/JS, hosted on GitHub Pages. No build step, no server, no database.

## Structure

| Path | What |
|------|------|
| `index.html` | Home: services, portfolio, process, payment form |
| `contract.html` | Service agreement (+ `.docx` download) |
| `privacy.html` / `terms.html` | Privacy policy, payment & refund terms |
| `js/payment-core.js` | Payment input validation (pure, tested) |
| `js/pay.js` | PayPal checkout, duplicate-payment guard |
| `js/site.js` | Footer year, print button |
| `tests/` | `node --test` |

## Go live

1. **PayPal:** in `js/pay.js`, replace `PAYPAL_CLIENT_ID = 'test'` with your **Live** client ID from developer.paypal.com → Apps & Credentials. The client ID is public by design; **never put the secret key in this repo.**
2. **GitHub Pages:** Settings → Pages → Source: `main` / `/ (root)`. Then tick **Enforce HTTPS**.
3. **Policies:** confirm every `[bracketed]` value in `privacy.html` and `terms.html` (retention years, refund days, jurisdiction).
4. Make a small real payment, refund it from PayPal, and confirm the receipt emails arrive.

Local preview: `python -m http.server 8765`, then open http://localhost:8765.

## Security

- **Content Security Policy** (meta tag on every page): scripts only from this site and PayPal, no inline scripts, no plugins, form submissions blocked. The payment page also allows PayPal frames and connections.
- **No PII in URLs:** the payment form never submits; data goes only to PayPal.
- **Anti-framing:** `pay.js` refuses to run inside another site's frame (GitHub Pages can't send `frame-ancestors` / `X-Frame-Options` headers).
- **Input validation:** `js/payment-core.js` accepts only plain decimal amounts from US$1 to US$10,000, a valid email and a reference of safe characters.
- **Known limit:** the order is created in the browser, so the payer chooses the amount. Reconcile every payment against its invoice in PayPal (the reference is in *Custom ID*). If you ever need fixed prices or webhooks, add a small server using the PayPal Orders v2 API.

## Idempotency (no double charges)

- PayPal captures each order at most once; a repeat capture fails instead of charging again.
- The form is locked while a checkout is open, and the order uses a snapshot of the validated details, so edits mid-checkout can't change it.
- After a successful payment, the reference + amount + transaction ID are kept in the browser's `sessionStorage`. Paying the same reference and amount again in that tab requires an explicit "pay again" tick.
- If the result is unknown (network error during capture), the page tells the payer **not** to pay again and shows the PayPal order ID to quote.
- Pending captures (PayPal review) are reported as submitted, not failed.

## Data handling & retention

- The website stores nothing. The only browser storage is the duplicate guard above (no name/email, erased when the tab closes).
- Payment records live in PayPal. Export them for your accounts and keep them for the period in `privacy.html` (default [7] years).
- Run through this checklist at least yearly:
  - [ ] 2FA on Gmail, PayPal and GitHub
  - [ ] Client logins kept in a password manager, removed after handover
  - [ ] Delete enquiries older than [12] months that didn't become projects
  - [ ] Delete project files/records past their retention period
  - [ ] Policies still match what you actually do

## Tests

```bash
node --test
```
