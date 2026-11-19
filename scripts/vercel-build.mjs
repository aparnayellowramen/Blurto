// Vercel build: copy just the app's files into public/, which Vercel serves.
// (Keeps the topic CSV, scripts, tests and node_modules off the website.)
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public');
const APP = ['index.html', 'manifest.webmanifest', 'sw.js', 'src', 'data', 'icons', 'vendor'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const item of APP) {
  const from = join(root, item);
  if (!existsSync(from)) { console.error(`missing ${item}`); process.exit(1); }
  cpSync(from, join(out, item), { recursive: true });
}
console.log(`✔ copied ${APP.join(', ')} → public/`);
