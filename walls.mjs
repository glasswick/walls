#!/usr/bin/env node
// walls: read the walls log (README.md, next to this file) as data.
//   walls list [--json]        every wall
//   walls check <url|host>     walls logged for that host (or a parent domain)
// No dependencies. The README's table is the only source.

import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const FIELDS = ['n', 'date', 'host', 'where', 'asked_for', 'response', 'what_i_did', 'honest_way', 'status'];

export function parseWalls(markdown) {
  const rows = [];
  for (const line of markdown.split('\n')) {
    if (!/^\| \d+ \|/.test(line)) continue;
    const cells = line.slice(1, line.trimEnd().endsWith('|') ? line.trimEnd().length - 1 : undefined)
      .split(' | ').map((c) => c.trim());
    if (cells.length !== FIELDS.length) {
      throw new Error(`wall row has ${cells.length} cells, expected ${FIELDS.length}: ${line.slice(0, 60)}`);
    }
    const row = Object.fromEntries(FIELDS.map((f, i) => [f, cells[i]]));
    row.n = Number(row.n);
    rows.push(row);
  }
  return rows;
}

export function hostOf(input) {
  let h = String(input).trim().toLowerCase();
  h = h.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].split(':')[0];
  return h.replace(/^www\./, '');
}

export function wallsFor(rows, input) {
  const h = hostOf(input);
  return rows.filter((r) => r.host !== '-' && (h === r.host || h.endsWith('.' + r.host)));
}

function main(argv) {
  const here = dirname(fileURLToPath(import.meta.url));
  const rows = parseWalls(readFileSync(join(here, 'README.md'), 'utf8'));
  const [cmd, arg] = argv;
  const show = (r) => `#${r.n} ${r.date} ${r.host} [${r.status}]\n  where: ${r.where}\n  asked for: ${r.asked_for}\n  response: ${r.response}\n  honest way: ${r.honest_way}`;
  if (cmd === 'list') {
    console.log(argv.includes('--json') ? JSON.stringify(rows, null, 2) : rows.map(show).join('\n'));
  } else if (cmd === 'check' && arg) {
    const hits = wallsFor(rows, arg);
    console.log(hits.length ? hits.map(show).join('\n') : `no wall logged for ${hostOf(arg)} (that's not proof there isn't one)`);
  } else {
    console.log('usage: walls list [--json] | walls check <url|host>');
    process.exitCode = 2;
  }
}

// npx runs this through a symlink, so compare real paths.
if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) main(process.argv.slice(2));
