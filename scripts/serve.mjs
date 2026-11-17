// Zero-dependency static server for local development.
//   npm start                 -> http://localhost:5173 (this computer only)
//   npm start -- --host       -> also reachable from a phone on the same Wi-Fi
//   PORT=8080 npm start       -> another port

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 5173;
const exposed = process.argv.includes('--host');
const host = exposed ? '0.0.0.0' : '127.0.0.1';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = resolve(join(root, path));
    if (file !== root && !file.startsWith(root + sep)) throw Object.assign(new Error('forbidden'), { code: 'EACCES' });
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
    if (/[\\/](scripts|tests|node_modules)[\\/]/.test(file.slice(root.length))) throw Object.assign(new Error('hidden'), { code: 'ENOENT' });
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch (err) {
    res.writeHead(err.code === 'EACCES' ? 403 : 404, { 'Content-Type': 'text/plain' });
    res.end(err.code === 'EACCES' ? 'Forbidden' : 'Not found');
  }
}).listen(port, host, () => {
  console.log(`Blurto running at http://localhost:${port}`);
  if (exposed) {
    for (const nets of Object.values(networkInterfaces())) {
      for (const n of nets ?? []) if (n.family === 'IPv4' && !n.internal) console.log(`  on your network: http://${n.address}:${port}`);
    }
  }
  console.log(`  fast test run: http://localhost:${port}/?speed=60  (20 min → 20 s)`);
});
