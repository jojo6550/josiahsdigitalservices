const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function splitHero(node) {
  if (!node || reducedMotion) return;
  const text = node.textContent;
  node.textContent = '';
  const words = text.trim().split(/\s+/);
  let i = 0;
  words.forEach((w, wi) => {
    const word = document.createElement('span');
    word.className = 'word';
    [...w].forEach((ch) => {
      const span = document.createElement('span');
      span.textContent = ch;
      span.style.setProperty('--i', i++);
      word.appendChild(span);
    });
    node.append(word);
    if (wi < words.length - 1) node.append(' ');
  });
}

export function initReveals() {
  if (reducedMotion) {
    document.querySelectorAll('.reveal').forEach((n) => n.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
  );
  document.querySelectorAll('.reveal').forEach((n) => io.observe(n));
}

export function initMagnetic() {
  if (reducedMotion) return;
  document.querySelectorAll('.magnetic').forEach((node) => {
    const radius = 80;
    node.addEventListener('pointermove', (e) => {
      const r = node.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > radius) {
        node.style.transform = '';
        return;
      }
      const f = (1 - dist / radius) * 12;
      node.style.transform = `translate(${(dx / radius) * f}px, ${(dy / radius) * f}px)`;
    });
    node.addEventListener('pointerleave', () => {
      node.style.transform = '';
    });
  });
}

export function initNavScroll() {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  const onScroll = () => {
    nav.classList.toggle('scrolled', window.scrollY > 12);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}
