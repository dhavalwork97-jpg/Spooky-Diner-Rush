import { describe, expect, it } from 'vitest';

// The owner's wording rule: only "Lv N" is used for progression. The three banned words are
// built from pieces so this file does not contain them itself.
const BANNED = ['sh' + 'ift', 'st' + 'age', 'st' + 'ar'];
const re = new RegExp(`\\b(${BANNED.join('|')})s?\\b`, 'i');

// Raw text of every code, data and docs file (Vite resolves these at test time).
const sources = {
  ...import.meta.glob('../src/**/*.ts', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../data/**/*.json', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../docs/**/*.md', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../tests/**/*.ts', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../README.md', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../index.html', { query: '?raw', import: 'default', eager: true }),
} as Record<string, string>;

describe('wording rule', () => {
  it('scans a sensible number of files', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(40);
  });
  it('no banned word appears in code, data, docs, README or index.html', () => {
    const hits = Object.entries(sources).filter(([, text]) => re.test(text)).map(([f]) => f);
    expect(hits).toEqual([]);
  });
  it('the scan itself catches a banned word', () => {
    expect(re.test(`a ${BANNED[1]} of the game`)).toBe(true);
    expect(re.test('Lv 5')).toBe(false);
  });
});
