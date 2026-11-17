// Builds data/topics.json from the topic sheet (CSV export).
// The sheet is the source of truth; run this after every sheet update.
//
//   npm run build                      -> uses the single .csv in the project root
//   npm run build -- path/to/file.csv  -> uses that file
//
// Output shape: { version, count, categories: [name], topics: [[id, categoryIndex, topic]] }

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'data', 'topics.json');

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

function findCsv() {
  const found = readdirSync(root).filter((n) => n.toLowerCase().endsWith('.csv'));
  if (found.length !== 1) {
    fail(`Expected exactly one .csv in the project root, found ${found.length}. ` +
      'Pass the path instead: npm run build -- path/to/topics.csv');
  }
  return join(root, found[0]);
}

// Minimal RFC 4180 parser: quoted fields, doubled quotes, CRLF or LF.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

const csvPath = process.argv[2] ? resolve(process.argv[2]) : findCsv();
const rows = parseCsv(readFileSync(csvPath, 'utf8'));
const header = rows.shift()?.map((h) => h.trim().toLowerCase());
const col = { id: header?.indexOf('id'), category: header?.indexOf('category'), topic: header?.indexOf('topic') };
if (Object.values(col).some((i) => i == null || i < 0)) fail('The CSV needs the columns ID, Category and Topic.');

const errors = [];
const warnings = [];
const ids = new Set();
const names = new Map();
const categories = [];
const topics = [];

rows.forEach((r, n) => {
  const line = n + 2;
  const id = Number(r[col.id]?.trim());
  const category = r[col.category]?.trim() ?? '';
  const topic = r[col.topic]?.trim().replace(/\s+/g, ' ') ?? '';
  if (!Number.isInteger(id) || id <= 0) return errors.push(`Line ${line}: ID "${r[col.id]}" is not a positive whole number.`);
  if (ids.has(id)) return errors.push(`Line ${line}: ID ${id} is used twice. IDs must never change or repeat.`);
  if (!category || !topic) return errors.push(`Line ${line}: missing category or topic.`);
  ids.add(id);
  const key = topic.toLowerCase();
  if (names.has(key)) errors.push(`Line ${line}: "${topic}" duplicates ID ${names.get(key)}.`);
  else names.set(key, id);
  const words = topic.split(' ').length; // a hyphenated term counts as one word
  if (words > 3) warnings.push(`ID ${id}: "${topic}" has ${words} words (limit is 3).`);
  let ci = categories.indexOf(category);
  if (ci < 0) ci = categories.push(category) - 1;
  topics.push([id, ci, topic]);
});

if (errors.length) fail(`${errors.length} problem(s) in ${relative(root, csvPath)}:\n  ${errors.join('\n  ')}`);

topics.sort((a, b) => a[0] - b[0]);
const json = JSON.stringify({ version: 1, count: topics.length, categories, topics });
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, json + '\n');

console.log(`✔ ${topics.length} topics in ${categories.length} categories → ${relative(root, outPath)} (${(json.length / 1024).toFixed(0)} KB)`);
if (warnings.length) console.warn(`⚠ ${warnings.length} warning(s):\n  ${warnings.join('\n  ')}`);
