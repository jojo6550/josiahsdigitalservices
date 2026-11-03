// Payments completed in this tab, used to catch accidental double payments.
// Holds only reference + amount key and the Stripe payment ID (no name/email); sessionStorage clears when the tab closes.
const PAID_KEY = 'jds-paid';

export const paidList = () => { try { return JSON.parse(sessionStorage.getItem(PAID_KEY)) || []; } catch { return []; } };

export function remember(key, id) {
  if (paidList().some(p => p.id === id)) return; // the thank-you page can be reloaded
  try { sessionStorage.setItem(PAID_KEY, JSON.stringify([...paidList(), { key, id }])); } catch { /* storage blocked: duplicate check just won't work */ }
}
