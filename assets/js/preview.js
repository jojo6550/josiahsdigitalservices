// Iframe preview with screenshot fallback. Many sites send X-Frame-Options
// or CSP frame-ancestors that silently block embedding — onload still fires
// but the iframe stays blank, so we race onload against a timeout AND attempt
// a same-origin doc-access probe to detect blocked frames.

const FRAME_TIMEOUT = 3500;

let active = null;
let lastFocus = null;

function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

function buildModal() {
  const root = document.getElementById('preview-root');
  root.innerHTML = '';

  const overlay = el('div', 'preview');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'preview-title');

  const frame = el('div', 'preview__frame');

  const header = el('div', 'preview__header');
  const titleWrap = el('div');
  const title = el('div', 'preview__title');
  title.id = 'preview-title';
  const url = el('div', 'preview__url');
  titleWrap.append(title, url);

  const actions = el('div', 'preview__actions');
  const live = el('a', 'btn--ghost');
  live.target = '_blank';
  live.rel = 'noopener noreferrer';
  live.textContent = 'Open live ↗';
  const close = el('button', 'preview__close');
  close.setAttribute('aria-label', 'Close preview');
  close.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>';
  actions.append(live, close);

  header.append(titleWrap, actions);

  const body = el('div', 'preview__body');
  const banner = el('div', 'preview__banner');
  banner.innerHTML = '<span>Live preview blocked by site — showing screenshot.</span><a target="_blank" rel="noopener" href="#">Open live ↗</a>';
  const loading = el('div', 'preview__loading', 'Loading preview…');
  body.append(banner, loading);

  const footer = el('div', 'preview__footer');

  frame.append(header, body, footer);
  overlay.append(frame);
  root.append(overlay);

  return { overlay, frame, body, banner, loading, title, url, live, close, footer };
}

function setMeta(parts, project) {
  parts.title.textContent = project.title;
  parts.url.textContent = project.url;
  parts.live.href = project.url;
  parts.banner.querySelector('a').href = project.url;

  parts.footer.innerHTML = '';
  const meta = [project.year, project.role, ...(project.tech || [])];
  meta.filter(Boolean).forEach((m) => {
    const s = el('span');
    s.textContent = m;
    parts.footer.append(s);
  });
}

function showFallback(parts, project) {
  const existing = parts.body.querySelector('iframe, img');
  if (existing) existing.remove();
  const img = el('img');
  img.src = project.screenshot;
  img.alt = project.title;
  img.loading = 'lazy';
  img.onerror = () => {
    img.remove();
    const empty = el('div', 'preview__loading');
    empty.classList.remove('hidden');
    empty.textContent = 'Screenshot pending — open live site';
    parts.body.append(empty);
  };
  parts.body.append(img);
  parts.banner.classList.add('show');
  parts.loading.classList.add('hidden');
}

function loadIframe(parts, project) {
  const iframe = el('iframe');
  iframe.src = project.url;
  iframe.title = project.title;
  iframe.referrerPolicy = 'no-referrer';
  iframe.loading = 'eager';
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms');

  let done = false;
  const finish = (ok) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    if (ok) {
      parts.loading.classList.add('hidden');
      parts.banner.classList.remove('show');
    } else {
      iframe.remove();
      showFallback(parts, project);
    }
  };

  iframe.addEventListener('load', () => {
    // Onload fires even when X-Frame-Options blocks the page. Probe the doc
    // — cross-origin throws, blocked frames typically have an empty body.
    try {
      const doc = iframe.contentDocument;
      if (!doc || doc.body == null || doc.body.children.length === 0) {
        // Cross-origin (doc null) is fine when site allows framing — accept.
        if (doc === null) return finish(true);
        return finish(false);
      }
      finish(true);
    } catch {
      // SecurityError = cross-origin allowed framing. Treat as success.
      finish(true);
    }
  });
  iframe.addEventListener('error', () => finish(false));

  const timer = setTimeout(() => finish(false), FRAME_TIMEOUT);
  parts.body.append(iframe);
}

function trapFocus(e, container) {
  if (e.key !== 'Tab') return;
  const f = container.querySelectorAll('a, button, input, textarea, [tabindex]:not([tabindex="-1"])');
  if (!f.length) return;
  const first = f[0];
  const last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    last.focus();
    e.preventDefault();
  } else if (!e.shiftKey && document.activeElement === last) {
    first.focus();
    e.preventDefault();
  }
}

export function openPreview(project) {
  if (!project) return;
  const parts = active || buildModal();
  active = parts;

  // Reset body of prior preview
  parts.body.querySelectorAll('iframe, img').forEach((n) => n.remove());
  parts.banner.classList.remove('show');
  parts.loading.classList.remove('hidden');

  setMeta(parts, project);
  loadIframe(parts, project);

  lastFocus = document.activeElement;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => parts.overlay.setAttribute('data-open', 'true'));
  parts.close.focus({ preventScroll: true });

  const onKey = (e) => {
    if (e.key === 'Escape') closePreview();
    trapFocus(e, parts.frame);
  };
  parts.close.onclick = closePreview;
  parts.overlay.onclick = (e) => { if (e.target === parts.overlay) closePreview(); };
  document.addEventListener('keydown', onKey);
  parts._onKey = onKey;
}

export function closePreview() {
  if (!active) return;
  active.overlay.setAttribute('data-open', 'false');
  document.removeEventListener('keydown', active._onKey);
  document.body.style.overflow = '';
  setTimeout(() => {
    active.body.querySelectorAll('iframe, img').forEach((n) => n.remove());
  }, 300);
  if (lastFocus && lastFocus.focus) lastFocus.focus();

  // Reflect close in URL if we're on a project route
  if (location.hash.startsWith('#/work/')) {
    history.replaceState(null, '', '#/work');
  }
}
