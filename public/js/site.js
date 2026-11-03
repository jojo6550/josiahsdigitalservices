// Shared page behaviour. Kept out of inline handlers so the CSP can forbid inline scripts.
document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
document.querySelector('[data-print]')?.addEventListener('click', () => window.print());
