import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseWalls, hostOf, wallsFor, classify } from './walls.mjs';

const rows = parseWalls(readFileSync(new URL('./README.md', import.meta.url), 'utf8'));

test('every row parses, numbered in order', () => {
  assert.ok(rows.length >= 16);
  rows.forEach((r, i) => assert.equal(r.n, i + 1));
  for (const r of rows) {
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(r.checked, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(r.checked >= r.date, `#${r.n} checked before it was hit`);
  }
});

test('hostOf strips scheme, www, path and port', () => {
  assert.equal(hostOf('https://www.ScienceDirect.com/science/article/pii/X?y=1'), 'sciencedirect.com');
  assert.equal(hostOf('datadryad.org:443/stash'), 'datadryad.org');
  assert.equal(hostOf('datadryad.org.'), 'datadryad.org');
  assert.equal(hostOf('https://user:pw@datadryad.org/x'), 'datadryad.org');
  assert.equal(hostOf('   '), '');
});

test('check matches a host and its subdomains, not lookalikes', () => {
  assert.deepEqual(wallsFor(rows, 'https://datadryad.org/api/v2/files/1').map((r) => r.n), [1, 2]);
  assert.ok(wallsFor(rows, 'eutils.ncbi.nlm.nih.gov').some((r) => r.n === 11));
  assert.equal(wallsFor(rows, 'notdatadryad.org').length, 0);
  assert.equal(wallsFor(rows, 'example.com').length, 0);
  assert.equal(wallsFor(rows, 'https://evil.com/?u=datadryad.org').length, 0);
  assert.equal(wallsFor(rows, 'datadryad.org.evil.com').length, 0);
});

test('a malformed row fails loudly', () => {
  assert.throws(() => parseWalls('| 1 | 2026-10-30 | x.org | too few |'), /cells/);
});

test('classify: every logged HTTP refusal is access denied, including row 17', () => {
  for (const r of rows) {
    if (/HTTP (4\d\d|303)|rate limit|bot check/i.test(r.response)) {
      assert.equal(classify(r.response).outcome, 'access denied', `#${r.n}: ${r.response}`);
    }
  }
  assert.equal(classify(rows.find((r) => r.n === 17).response).outcome, 'access denied');
});

test('classify: broken sources and empty answers are not walls', () => {
  assert.equal(classify('Server Error 500').outcome, 'malformed');
  assert.equal(classify('<!DOCTYPE html><html>...').outcome, 'malformed');
  assert.equal(classify('{"esearchresult":{"count":"0","idlist":[]}}').outcome, 'no record');
  assert.equal(classify('Entry not found [404]').outcome, 'no record');
  assert.equal(classify('').outcome, 'unknown');
});

test('classify: a door is not called a wall', () => {
  assert.notEqual(classify(rows.find((r) => r.n === 16).response).outcome, 'access denied');
});
