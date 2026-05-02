# Josiah's Digital Services

Portfolio SPA. Vanilla HTML/CSS/JS — no build step. Deploys to GitHub Pages.

## Develop

```bash
npm run serve
# → http://localhost:5173
```

Edits hit the browser on refresh; nothing to compile.

## Deploy (GitHub Pages)

1. Push `main` to GitHub.
2. Settings → Pages → Source: `Deploy from a branch`, branch `main`, folder `/ (root)`.
3. Done. `.nojekyll` and `404.html` (hash-route fallback) are already in place.

## Add a project

Edit `assets/js/projects.js`. Each entry:

```js
{
  slug: 'kebab-slug',         // becomes #/work/kebab-slug
  title: 'Project name',
  url: 'https://live-site',   // loaded inside iframe preview
  screenshot: 'images/gallery/project-1.jpg',
  tech: ['React', 'Stripe'],
  year: '2025',
  role: 'Design & Build',
  blurb: 'One or two crisp sentences.',
}
```

### Screenshots

Drop raw PNG/JPG into `images/_raw/`, then:

```bash
npm run optimize-images
```

Outputs web-sized `.jpg` + `.webp` into `images/gallery/`. Reference the `.jpg` from `projects.js`.

If a screenshot doesn't exist, the card shows a numbered placeholder — the preview modal also handles missing screenshots gracefully.

## Preview modal

Click any project card. Loads the live URL in an iframe. If the site sends `X-Frame-Options` or a CSP that blocks framing (GitHub, Stripe, most banks), the modal automatically swaps in the screenshot and shows an "open live ↗" link. Detection races a 3.5s timeout against the iframe's `load` event + a same-origin doc probe.

## Contact form

`index.html` has a form pointed at `https://formspree.io/f/TODO`. Replace `TODO` with your Formspree form ID (free tier works). If left as `TODO`, the form falls back to opening the user's email client via `mailto:` — change the destination address inside `assets/js/main.js`.

## Layout

```
index.html          # SPA shell — all sections inline
404.html            # GitHub Pages SPA hash-route redirect (don't change)
.nojekyll           # tells GH Pages to skip Jekyll
assets/css/         # tokens / base / components / sections
assets/js/          # main / router / projects / preview / motion
images/hero/        # noise overlay + signature
images/gallery/     # project screenshots
scripts/            # optimize-images
```

## Tech notes

- Hash routing (`#/`, `#/about`, `#/work/<slug>`) so deep-links work on GH Pages.
- All motion gated on `prefers-reduced-motion`.
- Fonts: Fraunces (display), Inter Tight (body), JetBrains Mono (meta).
- Targets: Lighthouse Performance ≥ 95, Accessibility ≥ 95.
