import { findProject } from './projects.js';
import { openPreview, closePreview } from './preview.js';

const sectionFor = {
  '': 'home',
  '/': 'home',
  '/about': 'about',
  '/services': 'services',
  '/work': 'work',
  '/contact': 'contact',
};

function scrollTo(id) {
  const node = document.getElementById(id);
  if (!node) return;
  node.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function parseHash() {
  const h = location.hash.replace(/^#/, '');
  return h || '/';
}

function handleRoute() {
  const path = parseHash();

  if (path.startsWith('/work/')) {
    const slug = path.slice('/work/'.length);
    const project = findProject(slug);
    if (project) {
      scrollTo('work');
      openPreview(project);
      return;
    }
  } else {
    closePreview();
  }

  const id = sectionFor[path];
  if (id) scrollTo(id);
}

export function initRouter() {
  window.addEventListener('hashchange', handleRoute);

  // Intercept nav anchor clicks
  document.querySelectorAll('[data-route]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const route = a.getAttribute('data-route');
      e.preventDefault();
      if (location.hash === '#' + route) handleRoute();
      else location.hash = '#' + route;
    });
  });

  // Run once on load
  handleRoute();
}

export function routeToProject(slug) {
  location.hash = '#/work/' + slug;
}
