import { readFileSync, writeFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { index } from './src/search';

const SITE = 'https://bitbang.fyi/';

/** Every address the site has besides the home page: each page with content, and the pages outside the sections. */
const pages = (status = ['live']) => {
  const shown = index.filter((e) => status.includes(e.status));
  const ids = [...new Set([...shown.map((e) => e.id), 'paths', 'glossary', 'about', 'changelog'])];
  return ids.map((id) => ({ id, entry: shown.find((e) => e.id === id) }));
};

/**
 * Writes sitemap.xml next to the built site: the home page and every page address, so search engines know each one
 * exists. main.ts sets the description and canonical address once a page is on screen.
 */
function sitemap(): Plugin {
  return {
    name: 'bitbang-sitemap',
    apply: 'build',
    generateBundle() {
      const urls = [SITE, ...pages().map((p) => `${SITE}${p.id}`)];
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`,
      });
    },
  };
}

/**
 * Gives every page its own address: bitbang.fyi/uart is served from uart.html, a copy of index.html carrying that
 * page's address, title and description for link previews (main.ts then shows the page the address names). 404.html
 * is the same page for any other address, such as one with a trailing slash; its <base> keeps the assets findable.
 */
function pageFiles(): Plugin {
  const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return {
    name: 'bitbang-page-files',
    apply: 'build',
    closeBundle() {
      const html = readFileSync('dist/index.html', 'utf8');
      // Pages still in progress have an address too, though the sitemap leaves them out.
      for (const { id, entry } of pages(['live', 'wip'])) {
        let page = html.split(`"${SITE}"`).join(`"${SITE}${id}"`);
        if (entry && entry.name !== 'Overview') {
          const title = attr(`${entry.name} · bitbang`);
          page = page.replace('<title>bitbang</title>', `<title>${title}</title>`)
            .replace(/(<meta (?:property="og|name="twitter):title" content=")[^"]*"/g, `$1${title}"`);
          if (entry.blurb) page = page.replace(/(<meta (?:name="description"|property="og:description"|name="twitter:description") content=")[^"]*"/g, `$1${attr(entry.blurb)}"`);
        }
        writeFileSync(`dist/${id}.html`, page);
      }
      writeFileSync('dist/404.html', html.replace('<head>', '<head>\n    <base href="/" />'));
    },
  };
}

export default defineConfig({ plugins: [sitemap(), pageFiles()] });
