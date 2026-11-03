import { parsePayment, paymentKey } from './payment-core.js';

// Replace with your LIVE client ID from developer.paypal.com > Apps & Credentials. "test" = sandbox demo.
const PAYPAL_CLIENT_ID = 'test';

// GitHub Pages can't send a frame-ancestors header, so refuse to run the payment page inside someone else's frame.
if (window.top !== window.self) {
  document.body.textContent = 'For your security, payments must be made at josiahsdigitalservices directly.';
  throw new Error('framed');
}

const form = document.getElementById('pay-form');
const fields = document.getElementById('pay-fields');
const again = document.getElementById('pay-again');
const againBox = document.getElementById('pay-again-box');
const msg = document.getElementById('pay-msg');

const show = (text, kind) => { msg.className = text ? 'msg ' + kind : ''; msg.textContent = text; };

// Never let the browser submit the form: a GET submit would put name and email in the URL.
form.addEventListener('submit', e => e.preventDefault());

// Payments completed in this tab, used to catch accidental double payments.
// Holds only reference, amount and PayPal transaction ID (no name/email); sessionStorage clears when the tab closes.
const PAID_KEY = 'jds-paid';
const paidList = () => { try { return JSON.parse(sessionStorage.getItem(PAID_KEY)) || []; } catch { return []; } };
const remember = (key, id) => { try { sessionStorage.setItem(PAID_KEY, JSON.stringify([...paidList(), { key, id }])); } catch { /* storage blocked: duplicate check just won't work */ } };

let pending = null; // validated snapshot for the order in progress, so edits mid-checkout can't change it
const lock = on => { fields.disabled = on; };

// Editing the details clears any "pay again" confirmation; ticking the box itself must not.
form.addEventListener('input', e => { if (e.target !== again) { againBox.hidden = true; again.checked = false; } });

function onClick(_, actions) {
  if (fields.disabled) return actions.reject(); // a payment is already in progress
  const r = parsePayment(Object.fromEntries(new FormData(form)));
  if (!r.ok) { show(r.error, 'err'); return actions.reject(); }

  const dup = paidList().find(p => p.key === paymentKey(r.value));
  if (dup && !again.checked) {
    againBox.hidden = false;
    show(`You already paid US$${r.value.amount} for "${r.value.ref}" (transaction ${dup.id}). Tick the box below only if you mean to pay it again.`, 'err');
    return actions.reject();
  }

  pending = r.value;
  lock(true);
  show('', '');
  return actions.resolve();
}

// shortcut: order is created/captured client-side, so the payer sets the amount; fine for paying invoices. Move to a server (Orders v2 API) if prices must be enforced.
function createOrder(_, actions) {
  if (!pending) throw new Error('No validated payment');
  return actions.order.create({
    purchase_units: [{
      description: `Josiah's Digital Services – ${pending.ref} – ${pending.name}`.slice(0, 127),
      custom_id: pending.ref.slice(0, 127),
      amount: { currency_code: 'USD', value: pending.amount }
    }],
    payer: { email_address: pending.email },
    application_context: { shipping_preference: 'NO_SHIPPING', brand_name: "Josiah's Digital Services" }
  });
}

async function onApprove(data, actions) {
  let order;
  try {
    // PayPal captures an order at most once; a repeat capture of the same order fails instead of charging twice.
    order = await actions.order.capture();
  } catch (err) {
    if (String(err?.message).includes('INSTRUMENT_DECLINED')) return actions.restart(); // card declined: let them pick another
    console.error(err);
    lock(false);
    show(`We couldn't confirm this payment. Please don't pay again yet: check your email for a PayPal receipt, or email us with order ID ${data.orderID}.`, 'err');
    return;
  }

  const cap = order?.purchase_units?.[0]?.payments?.captures?.[0];
  lock(false);
  if (!cap) {
    show(`Payment status unclear. Please don't pay again yet: email us with order ID ${data.orderID}.`, 'err');
    return;
  }
  remember(paymentKey(pending), cap.id);
  pending = null;
  form.reset();
  againBox.hidden = true;
  if (cap.status === 'COMPLETED') {
    show(`Payment received – thank you! US$${cap.amount.value}, transaction ${cap.id}. PayPal will email your receipt.`, 'ok');
  } else {
    show(`Payment submitted and ${cap.status.toLowerCase()} with PayPal (transaction ${cap.id}). You'll get an email when it clears; no need to pay again.`, 'ok');
  }
}

const sdk = document.createElement('script');
sdk.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(PAYPAL_CLIENT_ID) +
          '&currency=USD&intent=capture&components=buttons&enable-funding=card';
sdk.onerror = () => show('Payment system failed to load. Please refresh or email us.', 'err');
sdk.onload = () => window.paypal.Buttons({
  style: { layout: 'vertical', shape: 'pill', color: 'blue', label: 'pay' },
  onClick,
  createOrder,
  onApprove,
  onCancel() { lock(false); pending = null; show('Payment cancelled. You have not been charged.', 'err'); },
  onError(err) {
    console.error(err);
    lock(false);
    pending = null;
    show('Payment could not be completed. Please try again, or email us if you see a charge.', 'err');
  }
}).render('#paypal-buttons');
document.body.appendChild(sdk);
