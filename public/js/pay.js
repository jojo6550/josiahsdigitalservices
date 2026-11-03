import { parsePayment, paymentKey } from './payment-core.js';
import { paidList } from './paid-store.js';

const form = document.getElementById('pay-form');
const fields = document.getElementById('pay-fields');
const again = document.getElementById('pay-again');
const againBox = document.getElementById('pay-again-box');
const msg = document.getElementById('pay-msg');

const show = (text, kind) => { msg.className = text ? 'msg ' + kind : ''; msg.textContent = text; };
const lock = on => { fields.disabled = on; };

// Editing the details clears any "pay again" confirmation; ticking the box itself must not.
form.addEventListener('input', e => { if (e.target !== again) { againBox.hidden = true; again.checked = false; } });

// Coming back from Stripe with the Back button restores the page as it was (locked); unlock it.
window.addEventListener('pageshow', e => { if (e.persisted) { lock(false); show('', ''); } });

form.addEventListener('submit', async e => {
  e.preventDefault(); // never let the browser submit: a GET submit would put name and email in the URL
  if (fields.disabled) return; // a checkout is already starting

  const r = parsePayment(Object.fromEntries(new FormData(form)));
  if (!r.ok) return show(r.error, 'err');

  const dup = paidList().find(p => p.key === paymentKey(r.value));
  if (dup && !again.checked) {
    againBox.hidden = false;
    return show(`You already paid US$${r.value.amount} for "${r.value.ref}" (payment ${dup.id}). Tick the box below only if you mean to pay it again.`, 'err');
  }

  lock(true);
  show('Opening secure checkout…', 'ok');
  // One key per checkout attempt: retries below reuse it, so Stripe returns the same checkout, never a second one.
  const body = JSON.stringify({ ...r.value, key: crypto.randomUUID() });

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(20000) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && /^https:\/\/checkout\.stripe\.com\//.test(data.url)) return location.assign(data.url);
      if (res.status < 500) { lock(false); return show(data.error || 'Please check your details and try again.', 'err'); }
    } catch { /* network error or timeout: retry */ }
    await new Promise(r => setTimeout(r, 1500 * attempt));
  }
  lock(false);
  show("Checkout is unavailable right now. You haven't been charged. Please try again shortly, or email us.", 'err');
});
