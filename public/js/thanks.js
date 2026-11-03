import { paymentKey } from './payment-core.js';
import { remember } from './paid-store.js';

const title = document.getElementById('pay-title');
const status = document.getElementById('pay-status');
const set = (heading, text, kind) => { title.textContent = heading; status.className = 'msg ' + kind; status.textContent = text; };

async function check(id) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('/api/session?id=' + encodeURIComponent(id), { signal: AbortSignal.timeout(15000) });
      if (res.ok) return res.json();
      if (res.status < 500) return null;
    } catch { /* network error or timeout: retry */ }
    await new Promise(r => setTimeout(r, 1500 * attempt));
  }
  return undefined; // unknown
}

const id = new URLSearchParams(location.search).get('session_id');
const s = id ? await check(id) : null;

if (s?.paid) {
  remember(paymentKey(s), s.id);
  set('Payment received – thank you!', `US$${s.amount} for "${s.ref}". Your invoice and receipt are on their way to your email.`, 'ok');
} else if (s?.status === 'complete') {
  set('Payment processing', "Your bank is still confirming this payment. You'll get an email when it clears; there's no need to pay again.", 'ok');
} else if (s) {
  set('Payment not completed', "This checkout wasn't finished, so you haven't been charged. You can go back and try again.", 'err');
} else if (s === null) {
  set('Payment not found', "We couldn't find this payment. If you were charged, please email us.", 'err');
} else {
  set("We couldn't confirm your payment yet", "Please don't pay again: check your email for a receipt, or email us and we'll confirm it for you.", 'err');
}
