import { projects } from './projects.js';
import { initRouter, routeToProject } from './router.js';
import { splitHero, initReveals, initMagnetic, initNavScroll } from './motion.js';

function renderProjects() {
  const list = document.getElementById('project-list');
  if (!list) return;
  list.innerHTML = projects
    .map(
      (p, i) => `
    <article class="project reveal" data-slug="${p.slug}" tabindex="0" role="button" aria-label="View ${p.title}">
      <div class="project__media">
        <div class="placeholder">${String(i + 1).padStart(2, '0')}</div>
      </div>
      <div class="project__body">
        <div class="project__index">Project · ${String(i + 1).padStart(2, '0')} / ${String(projects.length).padStart(2, '0')}</div>
        <h3 class="project__title">${p.title}</h3>
        <p class="project__blurb">${p.blurb}</p>
        <div class="project__meta">
          <span>${p.year}</span>
          <span>${p.role}</span>
          ${p.tech.map((t) => `<span>${t}</span>`).join('')}
        </div>
      </div>
    </article>`
    )
    .join('');

  // Try to swap placeholder for screenshot if it exists
  list.querySelectorAll('.project').forEach((card, i) => {
    const p = projects[i];
    const probe = new Image();
    probe.onload = () => {
      const media = card.querySelector('.project__media');
      media.innerHTML = `<img src="${p.screenshot}" alt="${p.title} preview" loading="lazy">`;
    };
    probe.src = p.screenshot;

    const open = () => routeToProject(p.slug);
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
  });
}

function initContactForm() {
  const form = document.getElementById('contact-form');
  if (!form) return;
  const status = form.querySelector('.form__status');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const subject = encodeURIComponent('Project inquiry from ' + (data.get('name') || 'website'));
    const body = encodeURIComponent(`${data.get('message') || ''}\n\n— ${data.get('name') || ''}\n${data.get('email') || ''}`);
    window.location.href = `mailto:josiahsdigitalservices@gmail.com?subject=${subject}&body=${body}`;
    status.dataset.state = 'ok';
    status.textContent = 'Opening your email client…';
  });
}

function setYear() {
  const y = new Date().getFullYear();
  document.querySelectorAll('[data-year]').forEach((n) => (n.textContent = y));
}

document.addEventListener('DOMContentLoaded', () => {
  setYear();
  splitHero(document.querySelector('[data-split]'));
  renderProjects();
  initReveals();
  initMagnetic();
  initNavScroll();
  initRouter();
  initContactForm();
});
