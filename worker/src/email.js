// Branded invoice/receipt email, built on the Josiah's Digital Services email template.
// Every client-influenced value goes through esc(): names and references come from the payer.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const money = (amount, currency) => `${currency === 'USD' ? 'US$' : currency + ' '}${amount}`;

const row = (label, value) =>
  `<tr><td style="padding:6px 0;color:#486581;width:42%">${label}</td><td style="padding:6px 0;font-weight:bold">${value}</td></tr>`;

// r: { name, ref, amount, currency, captureId, paidAt (Date), method }
// biz: { email, phone, website }
export function receiptEmail(r, biz) {
  const total = money(r.amount, r.currency);
  const date = r.paidAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Jamaica' });
  const first = (r.name || '').split(' ')[0] || 'there';
  const receiptNo = `R-${r.captureId}`;
  const footer = [biz.email, biz.phone, biz.website].filter(Boolean).map(esc).join(' &nbsp; | &nbsp; ');

  const subject = `Invoice & receipt ${receiptNo} – ${total} paid`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(subject)}</title></head><body style="margin:0;background:#edf2f6;font-family:Arial,sans-serif;color:#102a43"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;padding:28px 12px"><tr><td align="center"><table role="presentation" style="width:100%;max-width:640px;background:#fff;border-collapse:collapse"><tr><td style="padding:25px 30px;background:#06233b;color:white;border-bottom:5px solid #128bd8"><div style="font-size:26px;font-weight:800;letter-spacing:1px">JOSIAH’S</div><div style="color:#55bfff;letter-spacing:3px;font-size:12px;font-weight:bold">DIGITAL SERVICES</div><div style="font-size:11px;letter-spacing:2px;margin-top:13px">WEBSITES | SOLUTIONS | YOUR VISION ONLINE</div></td></tr><tr><td style="padding:30px;line-height:1.65;font-size:15px">
<p>Hi ${esc(first)},</p>
<p>Thank you for your payment to Josiah’s Digital Services. This email is your invoice and receipt.</p>
<div style="padding:18px;background:#f1f6fa;border-left:4px solid #128bd8"><strong>PAYMENT RECEIPT</strong>
<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px">
${row('Receipt no.', esc(receiptNo))}
${row('Invoice / reference', esc(r.ref))}
${row('Date paid', esc(date))}
${row('Billed to', esc(r.name))}
${row('Payment method', esc(r.method))}
${row('Status', '<span style="color:#0f8a5f">PAID</span>')}
</table></div>
<table role="presentation" style="width:100%;border-collapse:collapse;margin-top:22px;font-size:14px">
<tr><th align="left" style="padding:10px 0;border-bottom:2px solid #06233b">Description</th><th align="right" style="padding:10px 0;border-bottom:2px solid #06233b">Amount</th></tr>
<tr><td style="padding:12px 0;border-bottom:1px solid #d9e2ec">Web services – ${esc(r.ref)}</td><td align="right" style="padding:12px 0;border-bottom:1px solid #d9e2ec">${esc(total)}</td></tr>
<tr><td style="padding:12px 0;font-weight:bold">Total paid</td><td align="right" style="padding:12px 0;font-weight:800;font-size:17px">${esc(total)}</td></tr>
</table>
<p>PayPal transaction ID: ${esc(r.captureId)}. Please keep this email for your records.</p>
<p>If you have any questions about this payment, just reply to this email.</p>
<p>Kind regards,<br><strong>Josiah</strong><br>Josiah’s Digital Services</p>
</td></tr><tr><td style="padding:18px 30px;background:#06233b;color:#d9eafa;font-size:12px">${footer}</td></tr></table></td></tr></table></body></html>`;

  const text = [
    `Hi ${first},`,
    '',
    "Thank you for your payment to Josiah's Digital Services. This email is your invoice and receipt.",
    '',
    `Receipt no.: ${receiptNo}`,
    `Invoice / reference: ${r.ref}`,
    `Date paid: ${date}`,
    `Billed to: ${r.name}`,
    `Payment method: ${r.method}`,
    'Status: PAID',
    '',
    `Web services – ${r.ref}: ${total}`,
    `Total paid: ${total}`,
    '',
    `PayPal transaction ID: ${r.captureId}`,
    '',
    "Kind regards,\nJosiah\nJosiah's Digital Services",
    [biz.email, biz.phone, biz.website].filter(Boolean).join(' | ')
  ].join('\n');

  return { subject, html, text };
}
