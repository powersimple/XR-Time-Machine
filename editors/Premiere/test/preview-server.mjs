// Serves the panel in a browser for a look without Premiere: http://localhost:5180
//   node test/preview-server.mjs
// /panel/… is this plugin folder; /rec/… is Altspace/recordings (read-only), which the fake file system reads.
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT ?? 5180);
const PANEL = fileURLToPath(new URL('..', import.meta.url));
const RECORDINGS = fileURLToPath(new URL('../../../Altspace/recordings/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.xml': 'text/xml' };

const within = (root, rel) => {
  const file = normalize(join(root, decodeURIComponent(rel)));
  return file.startsWith(root.endsWith(sep) ? root : root + sep) ? file : null;
};

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    if (pathname === '/') { res.writeHead(302, { Location: '/panel/test/preview.html' }).end(); return; }
    if (pathname === '/latest') {
      // The newest recording that has a studio export.
      const dirs = [];
      for (const d of await readdir(RECORDINGS)) {
        try { dirs.push({ d, t: (await stat(join(RECORDINGS, d, 'studio', 'project.json'))).mtimeMs }); } catch { /* not exported */ }
      }
      const best = dirs.sort((a, b) => b.t - a.t)[0];
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ name: best?.d ?? null, nativePath: best ? join(RECORDINGS, best.d) : null }));
      return;
    }
    const file = pathname.startsWith('/panel/') ? within(PANEL, pathname.slice(7)) : pathname.startsWith('/rec/') ? within(RECORDINGS, pathname.slice(5)) : null;
    if (!file) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(await readFile(file));
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Panel preview: http://localhost:${PORT}`));
