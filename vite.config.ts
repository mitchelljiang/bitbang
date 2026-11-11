import { defineConfig, type Plugin } from 'vite';
import { index } from './src/search';

const SITE = 'https://bitbang.fyi/';

/**
 * Writes sitemap.xml next to the built site: the home page, every page that has content (not the "soon" entries), and
 * the pages outside the sections. Search engines index each ?p= address as its own page, with the description and
 * canonical address main.ts sets, so the sitemap tells them every address that exists.
 */
function sitemap(): Plugin {
  return {
    name: 'bitbang-sitemap',
    apply: 'build',
    generateBundle() {
      const ids = [...index.filter((e) => e.status === 'live').map((e) => e.id), 'paths', 'glossary', 'about', 'changelog'];
      const urls = [SITE, ...[...new Set(ids)].map((id) => `${SITE}?p=${id}`)];
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`,
      });
    },
  };
}

export default defineConfig({ plugins: [sitemap()] });
