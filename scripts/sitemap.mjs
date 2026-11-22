// Writes dist/sitemap.xml and dist/robots.txt using SITE_URL (set it in Vercel env).
import { writeFileSync } from 'node:fs';

const site = (process.env.SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || 'https://example.com')
  .replace(/\/$/, '')
  .replace(/^(?!https?:\/\/)/, 'https://');
const pages = ['/', '/app/', '/blog/swiggy-zomato-commission-calculator/'];
const today = new Date().toISOString().slice(0, 10);

writeFileSync(
  'dist/sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
    .map((p) => `  <url><loc>${site}${p}</loc><lastmod>${today}</lastmod></url>`)
    .join('\n')}\n</urlset>\n`,
);
writeFileSync('dist/robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`);
console.log(`sitemap + robots written for ${site}`);

// Make canonical and og:image URLs absolute, as crawlers and link previews expect.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
for (const f of walk('dist').filter((f) => f.endsWith('.html'))) {
  const html = readFileSync(f, 'utf8')
    .replaceAll('https://__SITE__', site);
  writeFileSync(f, html);
}
