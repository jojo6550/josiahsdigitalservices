// Project data. Replace TODO entries with real URLs, blurbs, screenshots.
// Slugs are used in the hash route: #/work/<slug>
export const projects = [
  {
    slug: 'project-one',
    title: 'TODO — Project One',
    url: 'https://example.com',
    screenshot: 'images/gallery/project-1.png',
    tech: ['TODO', 'Stack', 'Tags'],
    year: '2025',
    blurb: 'TODO — one or two crisp sentences explaining what was built and the outcome it delivered.',
    role: 'Design & Build',
  },
  {
    slug: 'project-two',
    title: 'TODO — Project Two',
    url: 'https://example.org',
    screenshot: 'images/gallery/project-2.png',
    tech: ['TODO', 'Stack', 'Tags'],
    year: '2025',
    blurb: 'TODO — one or two crisp sentences explaining what was built and the outcome it delivered.',
    role: 'Full-stack',
  },
];

export function findProject(slug) {
  return projects.find((p) => p.slug === slug) || null;
}
