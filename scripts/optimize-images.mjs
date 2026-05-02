// Drop raw screenshots into images/_raw/. Run `npm run optimize-images`.
// Outputs web-sized JPG + WebP into images/gallery/ keyed by source filename.
import { readdir, mkdir, stat } from 'node:fs/promises';
import { join, parse } from 'node:path';
import sharp from 'sharp';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SRC = join(ROOT, 'images', '_raw');
const OUT = join(ROOT, 'images', 'gallery');
const MAX_W = 1600;

async function ensure(dir) {
  try { await mkdir(dir, { recursive: true }); } catch {}
}

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function main() {
  if (!(await exists(SRC))) {
    console.log(`[optimize-images] No source dir at ${SRC}. Create images/_raw/ and drop PNG/JPG files.`);
    return;
  }
  await ensure(OUT);
  const files = (await readdir(SRC)).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
  if (!files.length) {
    console.log('[optimize-images] No source files found.');
    return;
  }
  for (const f of files) {
    const { name } = parse(f);
    const inP = join(SRC, f);
    const outJpg = join(OUT, `${name}.jpg`);
    const outWebp = join(OUT, `${name}.webp`);
    const img = sharp(inP).resize({ width: MAX_W, withoutEnlargement: true });
    await img.clone().jpeg({ quality: 82, mozjpeg: true }).toFile(outJpg);
    await img.clone().webp({ quality: 80 }).toFile(outWebp);
    console.log(`[optimize-images] ${f} → gallery/${name}.{jpg,webp}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
