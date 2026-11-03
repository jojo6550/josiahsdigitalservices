// Pure payment validation, shared by pay.js and tests/payment-core.test.mjs. No DOM access.
export const MIN = 1;
export const MAX = 10000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const REF_RE = /^[\p{L}\p{N} #&'()._,/–-]{2,60}$/u;
// Plain decimal only: rejects "1e3", "0x10", negative numbers and more than 2 decimals.
const AMOUNT_RE = /^\d{1,5}(\.\d{1,2})?$/;

const fail = error => ({ ok: false, error });

export function parsePayment(raw) {
  const name = String(raw.name ?? '').trim().replace(/\s+/g, ' ');
  const email = String(raw.email ?? '').trim();
  const ref = String(raw.ref ?? '').trim().replace(/\s+/g, ' ');
  const amt = String(raw.amount ?? '').trim();

  if (name.length < 2 || name.length > 100) return fail('Please enter your full name or business name.');
  if (email.length > 120 || !EMAIL_RE.test(email)) return fail('Please enter a valid email address for your receipt.');
  if (!REF_RE.test(ref)) return fail('Please enter your invoice number or project reference (letters, numbers, spaces and - # / . only).');
  const n = Number(amt);
  if (!AMOUNT_RE.test(amt) || n < MIN || n > MAX) return fail(`Please enter an amount between US$${MIN} and US$${MAX.toLocaleString('en-US')}.`);

  return { ok: true, value: { name, email, ref, amount: n.toFixed(2) } };
}

// Identifies "the same payment" for duplicate detection: same reference (case-insensitive) and amount.
export const paymentKey = p => `${p.ref.toLowerCase()}|${p.amount}`;
