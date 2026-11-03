import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';

const env = {
  ALLOWED_ORIGIN: 'https://site.example',
  PAYPAL_API: 'https://paypal.test',
  PAYPAL_CLIENT_ID: 'id',
  PAYPAL_SECRET: 'secret',
  RESEND_API_KEY: 're_key',
  FROM_EMAIL: 'JDS <invoices@jds.example>',
  OWNER_EMAIL: 'owner@jds.example',
  SITE_URL: 'https://jds.example'
};

const order = (over = {}) => ({
  status: 'COMPLETED',
  payer: { email_address: 'jane@example.com', name: { given_name: 'Jane<b>', surname: 'Doe' } },
  payment_source: { card: { brand: 'VISA', last_digits: '1111' } },
  purchase_units: [{
    custom_id: 'INV-1',
    payments: { captures: [{ id: 'CAP123', status: 'COMPLETED', create_time: new Date().toISOString(), amount: { value: '12.34', currency_code: 'USD' } }] }
  }],
  ...over
});

let calls, paypalOrder;
beforeEach(() => {
  calls = [];
  paypalOrder = order();
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/v1/oauth2/token')) return Response.json({ access_token: 'tok', expires_in: 3600 });
    if (String(url).includes('/v2/checkout/orders/')) return paypalOrder ? Response.json(paypalOrder) : new Response('{}', { status: 404 });
    if (String(url) === 'https://api.resend.com/emails') return Response.json({ id: 'email_1' });
    throw new Error('unexpected ' + url);
  };
});

const post = (body, origin = 'https://site.example') =>
  worker.fetch(new Request('https://worker.example/', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env);
const resendCall = () => calls.find(c => c.url === 'https://api.resend.com/emails');

test('rejects other origins and bad order IDs', async () => {
  assert.equal((await post({ orderID: 'ABCDEFGH12' }, 'https://evil.example')).status, 403);
  assert.equal((await post({ orderID: '../x' })).status, 400);
  assert.equal(resendCall(), undefined);
});

test('completed order: emails payer with PayPal data, escaped, idempotent', async () => {
  const res = await post({ orderID: 'ORDER12345', amount: '99999' });
  assert.equal(res.status, 200);
  const call = resendCall();
  assert.equal(call.init.headers['Idempotency-Key'], 'receipt-CAP123');
  const body = JSON.parse(call.init.body);
  assert.deepEqual(body.to, ['jane@example.com']);
  assert.deepEqual(body.bcc, ['owner@jds.example']);
  assert.match(body.html, /US\$12\.34/);           // amount from PayPal, not the request
  assert.doesNotMatch(body.html, /99999/);
  assert.match(body.html, /Jane&lt;b&gt;/);         // payer name is escaped
  assert.doesNotMatch(body.html, /Jane<b>/);
  assert.match(body.html, /INV-1/);
  assert.match(body.text, /Card \(VISA\) ending 1111/);
});

test('pending, missing or old captures send nothing', async () => {
  paypalOrder = order({ status: 'APPROVED' });
  assert.equal((await post({ orderID: 'ORDER12345' })).status, 409);
  paypalOrder.status = 'COMPLETED';
  paypalOrder.purchase_units[0].payments.captures[0].create_time = new Date(Date.now() - 25 * 3600e3).toISOString();
  assert.equal((await post({ orderID: 'ORDER12345' })).status, 410);
  paypalOrder = null;
  assert.equal((await post({ orderID: 'ORDER12345' })).status, 404);
  assert.equal(resendCall(), undefined);
});

test('no valid payer email: sends to owner only', async () => {
  delete paypalOrder.payer.email_address;
  assert.equal((await post({ orderID: 'ORDER12345' })).status, 200);
  const body = JSON.parse(resendCall().init.body);
  assert.deepEqual(body.to, ['owner@jds.example']);
  assert.equal(body.bcc, undefined);
});

test('Resend failure returns 502 so the browser retries', async () => {
  const base = globalThis.fetch;
  globalThis.fetch = async (url, init) => String(url) === 'https://api.resend.com/emails' ? new Response('', { status: 500 }) : base(url, init);
  assert.equal((await post({ orderID: 'ORDER12345' })).status, 502);
});
