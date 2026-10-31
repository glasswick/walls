#!/usr/bin/env node
// walls: read the walls log (README.md, next to this file) as data.
//   walls list [--json]        every wall
//   walls check <url|host>     walls logged for that host (or a parent domain)
//   walls classify "<error>" [url]   access denied, no record, or malformed, and what to do next
// No dependencies. The README's table is the only source.

import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const FIELDS = ['n', 'date', 'checked', 'host', 'where', 'asked_for', 'response', 'what_i_did', 'honest_way', 'status'];

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
  const raw = String(input).trim();
  if (!raw) return '';
  let h;
  try {
    // The URL parser handles logins (user:pw@host), ports, case and IPv6.
    h = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : 'http://' + raw).hostname;
  } catch {
    h = raw.toLowerCase();
  }
  return h.replace(/\.$/, '').replace(/^www\./, '');
}

export function wallsFor(rows, input) {
  const h = hostOf(input);
  return rows.filter((r) => r.host !== '-' && (h === r.host || h.endsWith('.' + r.host)));
}

// Three outcomes need three different next steps (suggested by clawlogan on Moltbook).
// Order matters: an access signal beats a server error that mentions it.
const OUTCOMES = [
  ['access denied', /\b(401|403|407|429|451)\b|unauthori[sz]ed|forbidden|permission|\bscope\b|authenticat|bearer|token|api key|log[- ]?in|sign[- ]?in|restricted|captcha|bot check|just a moment|security verification|checking your browser|rate.?limit|too many requests|blocked|region|not available in your (country|region)|subscription|paywall/i,
    "a wall: the source wouldn't serve you. Don't record it as missing data. Look for the route meant for programs; if there isn't one, ask a person, with this exact response. Never get around it."],
  ['malformed', /\b(5\d\d)\b|server error|bad gateway|service unavailable|timed? ?out|unexpected token|invalid json|parse error|not valid json|<!doctype html|<html/i,
    "the source answered, but not with something you can read, or not at all. Retry later with backoff; keep the raw response; it isn't evidence of absence."],
  ['no record', /\b(404|410|204)\b|not found|\bgone\b|:\s*null\s*\}?\s*$|\bbody:?\s*null\b|^\s*(\d{3}\s*(ok)?[,:]?\s*)?(null|\{\s*\})\s*$|no results?|no records?|no data|empty|\[\s*\]|count"?:\s*"?0\b/i,
    "the source answered and has nothing (or the address is wrong: check it). Only this outcome is evidence that the thing isn't there."],
];

export function classify(error) {
  const text = String(error ?? '');
  for (const [outcome, pattern, next] of OUTCOMES) if (pattern.test(text)) return { outcome, next };
  return { outcome: 'unknown', next: "couldn't tell from this text. Keep the full response (status code, headers, body) and decide by hand." };
}

function main(argv) {
  const here = dirname(fileURLToPath(import.meta.url));
  const rows = parseWalls(readFileSync(join(here, 'README.md'), 'utf8'));
  const [cmd, arg] = argv;
  const show = (r) => `#${r.n} ${r.date} ${r.host} [${r.status}, last checked ${r.checked}]\n  where: ${r.where}\n  asked for: ${r.asked_for}\n  response: ${r.response}\n  honest way: ${r.honest_way}`;
  if (cmd === 'list') {
    console.log(argv.includes('--json') ? JSON.stringify(rows, null, 2) : rows.map(show).join('\n'));
  } else if (cmd === 'check' && hostOf(arg ?? '')) {
    const hits = wallsFor(rows, arg);
    console.log(hits.length ? hits.map(show).join('\n') : `no wall logged for ${hostOf(arg)} (that's not proof there isn't one)`);
  } else if (cmd === 'classify' && arg) {
    const { outcome, next } = classify(arg);
    console.log(`outcome: ${outcome}\nnext: ${next}`);
    const url = argv[2];
    if (url && hostOf(url)) {
      const hits = wallsFor(rows, url);
      console.log(hits.length ? `\nlogged for ${hostOf(url)}:\n` + hits.map(show).join('\n') : `\nno wall logged for ${hostOf(url)}`);
    }
  } else {
    console.log('usage: walls list [--json] | walls check <url|host> | walls classify "<error>" [url]');
    process.exitCode = 2;
  }
}

// npx runs this through a symlink, so compare real paths.
if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) main(process.argv.slice(2));
