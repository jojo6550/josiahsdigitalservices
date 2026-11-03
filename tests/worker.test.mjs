import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const SITE = 'https://site.example';
const env = {
  STRIPE_SECRET_KEY: 'sk_test_x',
  STRIPE_WEBHOOK_SECRET: 'whsec_test',
  RESEND_API_KEY: 're_key',
  FROM_EMAIL: 'JDS <noreply@jds.example>',
  OWNER_EMAIL: 'owner@jds.example',
  SITE_URL: SITE
};
const KEY = '3f2b8a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const SID = 'cs_test_a1B2c3D4e5F6g7H8';

const session = (over = {}) => ({
  id: SID, status: 'complete', payment_status: 'paid', amount_total: 1234, currency: 'usd', created: 1790000000,
  url: 'https://checkout.stripe.com/c/pay/' + SID,
  metadata: { ref: 'INV-1', name: 'Jane<b> Doe' },
  customer_details: { email: 'jane@example.com', name: 'Jane Card' },
  payment_intent: {
    id: 'pi_123', metadata: {},
    latest_charge: { created: 1790000100, payment_method_details: { type: 'card', card: { brand: 'visa', last4: '4242' } } }
  },
  ...over
});

let calls, stripeSession;
beforeEach(() => {
  calls = [];
  stripeSession = session();
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u === 'https://api.stripe.com/v1/checkout/sessions') return Response.json({ id: SID, url: stripeSession.url });
    if (u.startsWith('https://api.stripe.com/v1/checkout/sessions/')) {
      if (!stripeSession) return new Response('{}', { status: 404 });
      // Retrieve without expand returns payment_intent as an ID, like Stripe does.
      return Response.json(u.includes('expand') ? stripeSession : { ...stripeSession, payment_intent: stripeSession.payment_intent.id });
    }
    if (u.startsWith('https://api.stripe.com/v1/payment_intents/')) return Response.json({ id: 'pi_123' });
    if (u === 'https://api.resend.com/emails') return Response.json({ id: 'email_1' });
    throw new Error('unexpected ' + u);
  };
});

const call = (path, init = {}) => worker.fetch(new Request(SITE + path, init), env);
const checkout = (body, origin = SITE) =>
  call('/api/checkout', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const good = { name: 'Jane Doe', email: 'jane@example.com', ref: 'INV-1', amount: '12.34', key: KEY };
const find = prefix => calls.filter(c => c.url.startsWith(prefix));

async function sign(payload, secret = env.STRIPE_WEBHOOK_SECRET, t = Math.floor(Date.now() / 1000)) {
  const enc = s => new TextEncoder().encode(s);
  const key = await crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc(`${t}.${payload}`)));
  return `t=${t},v1=${[...mac].map(b => b.toString(16).padStart(2, '0')).join('')}`;
}
const event = (type = 'checkout.session.completed') => JSON.stringify({ id: 'evt_1', type, data: { object: { id: SID } } });
const hook = async (payload, sig) =>
  call('/api/stripe-webhook', { method: 'POST', headers: { 'Stripe-Signature': sig ?? await sign(payload) }, body: payload });

test('checkout: validated amount in cents, idempotency key, returns Stripe URL', async () => {
  const res = await checkout(good);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).url, stripeSession.url);
  const [c] = find('https://api.stripe.com/v1/checkout/sessions');
  assert.equal(c.init.headers['Idempotency-Key'], 'checkout-' + KEY);
  const p = new URLSearchParams(String(c.init.body));
  assert.equal(p.get('line_items[0][price_data][unit_amount]'), '1234');
  assert.equal(p.get('line_items[0][price_data][currency]'), 'usd');
  assert.equal(p.get('managed_payments[enabled]'), 'false');
  assert.equal(p.get('customer_email'), 'jane@example.com');
  assert.equal(p.get('metadata[ref]'), 'INV-1');
  assert.equal(p.get('success_url'), SITE + '/thanks?session_id={CHECKOUT_SESSION_ID}');
});

test('checkout: rejects other origins, bad input and missing key without calling Stripe', async () => {
  assert.equal((await checkout(good, 'https://evil.example')).status, 403);
  assert.equal((await checkout({ ...good, amount: '1e3' })).status, 400);
  assert.equal((await checkout({ ...good, amount: '0.5' })).status, 400);
  assert.equal((await checkout({ ...good, key: 'nope' })).status, 400);
  assert.equal((await call('/api/checkout', { method: 'POST', headers: { Origin: SITE }, body: 'not json' })).status, 400);
  assert.equal(find('https://api.stripe.com').length, 0);
});

test('checkout: rate limited', async () => {
  const limited = { ...env, CHECKOUT_LIMITER: { limit: async () => ({ success: false }) } };
  const res = await worker.fetch(new Request(SITE + '/api/checkout', { method: 'POST', headers: { Origin: SITE }, body: JSON.stringify(good) }), limited);
  assert.equal(res.status, 429);
});

test('session: returns status for thank-you page, no PII, and fulfills in the background', async () => {
  const pending = [];
  const res = await worker.fetch(new Request(SITE + '/api/session?id=' + SID), env, { waitUntil: p => pending.push(p) });
  assert.deepEqual(await res.json(), { status: 'complete', paid: true, ref: 'INV-1', amount: '12.34', id: 'pi_123' });
  await Promise.all(pending);
  assert.equal(find('https://api.resend.com/emails').length, 1);
  assert.equal((await call('/api/session?id=../x')).status, 400);
  stripeSession = null;
  assert.equal((await call('/api/session?id=' + SID)).status, 404);
});

test('webhook: rejects missing, wrong, stale, malformed and tampered signatures', async () => {
  const payload = event();
  assert.equal((await hook(payload, '')).status, 400);
  assert.equal((await hook(payload, await sign(payload, 'whsec_wrong'))).status, 400);
  assert.equal((await hook(payload, await sign(payload, undefined, Math.floor(Date.now() / 1000) - 600))).status, 400);
  assert.equal((await hook(payload, 't=abc,v1=00')).status, 400);
  assert.equal((await hook(payload + ' ', await sign(payload))).status, 400);
  assert.equal(find('https://api.resend.com').length, 0);
});

test('webhook: paid session sends one escaped invoice and marks the PaymentIntent', async () => {
  assert.equal((await hook(event())).status, 200);
  const [mail] = find('https://api.resend.com/emails');
  assert.equal(mail.init.headers['Idempotency-Key'], 'receipt-pi_123');
  const body = JSON.parse(mail.init.body);
  assert.deepEqual(body.to, ['jane@example.com']);
  assert.deepEqual(body.bcc, ['owner@jds.example']);
  assert.equal(body.reply_to, 'owner@jds.example');
  assert.match(body.html, /US\$12\.34/);
  assert.match(body.html, /Jane&lt;b&gt; Doe/);
  assert.doesNotMatch(body.html, /Jane<b>/);
  assert.match(body.text, /Card \(VISA\) ending 4242/);
  const [mark] = find('https://api.stripe.com/v1/payment_intents/pi_123');
  assert.match(String(mark.init.body), /metadata%5Breceipt_sent%5D=/);
});

test('webhook: already-sent, unpaid and unrelated events send nothing', async () => {
  stripeSession.payment_intent.metadata.receipt_sent = '2026-11-03T00:00:00Z';
  assert.equal((await (await hook(event())).json()).reason, 'already_sent');
  stripeSession = session({ payment_status: 'unpaid' });
  assert.equal((await (await hook(event())).json()).reason, 'not_paid');
  assert.equal((await (await hook(event('charge.refunded'))).json()).ignored, true);
  assert.equal(find('https://api.resend.com').length, 0);
});

test('webhook: Resend failure returns 502 (Stripe retries) and does not mark as sent', async () => {
  const base = globalThis.fetch;
  globalThis.fetch = async (url, init) => String(url) === 'https://api.resend.com/emails' ? new Response('', { status: 500 }) : base(url, init);
  assert.equal((await hook(event())).status, 502);
  assert.equal(find('https://api.stripe.com/v1/payment_intents/').length, 0);
});

test('routing: www redirect, assets, unknown API', async () => {
  const assets = { fetch: async req => new Response('asset:' + new URL(req.url).pathname) };
  const www = await worker.fetch(new Request('https://www.site.example/terms.html?x=1'), { ...env, ASSETS: assets });
  assert.equal(www.status, 301);
  assert.equal(www.headers.get('Location'), 'https://site.example/terms.html?x=1');
  assert.equal(await (await worker.fetch(new Request(SITE + '/privacy'), { ...env, ASSETS: assets })).text(), 'asset:/privacy');
  assert.equal((await call('/api/receipt', { method: 'POST' })).status, 404);
});
