// Project data. Slugs drive the hash route: #/work/<slug>
export const projects = [
  {
    slug: 'je-fitness',
    title: 'JE Fitness',
    url: 'https://jefitnessja.com',
    screenshot: 'images/gallery/jefitness.jpg',
    tech: ['SaaS', 'Auth', 'Booking', 'Payments'],
    year: '2025',
    blurb: 'Personal training platform for a Jamaican fitness coach — sign-up, member dashboards, and program delivery in one place.',
    role: 'Design & Build',
  },
  {
    slug: 'newborn-initiatives',
    title: 'Newborn Baby Initiative',
    url: 'https://newborninitiatives.com',
    screenshot: 'images/gallery/newborn-initiatives.jpg',
    tech: ['Editorial', 'Donations', 'PayPal'],
    year: '2025',
    blurb: 'Nonprofit site for NBBI — telling the story of newborn care across Manchester, Clarendon, and St. Elizabeth, with PayPal donations wired in.',
    role: 'Design & Build',
  },
];

export function findProject(slug) {
  return projects.find((p) => p.slug === slug) || null;
}
