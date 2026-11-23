import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LEGACY_SAVE_KEY, SaveSystem, defaultSave } from '../src/systems/SaveSystem';

const NEW_KEY = 'spooky-diner-rush-save';

function fakeStorage(): Record<string, string> {
  const store: Record<string, string> = {};
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => (k in store ? store[k]! : null),
    setItem: (k: string, v: string) => void (store[k] = v),
    removeItem: (k: string) => void delete store[k],
  };
  return store;
}

describe('save key rename (chef-rush-save -> spooky-diner-rush-save)', () => {
  let store: Record<string, string>;
  const original = (globalThis as unknown as { localStorage?: unknown }).localStorage;
  beforeEach(() => {
    store = fakeStorage();
  });
  afterEach(() => {
    (globalThis as unknown as { localStorage?: unknown }).localStorage = original;
  });

  it('uses the new key name', () => {
    SaveSystem.load();
    SaveSystem.save();
    expect(Object.keys(store)).toEqual([NEW_KEY]);
  });

  it('an old save under the previous key is still loaded, copied to the new key, and left in place', () => {
    const old = { ...defaultSave(), coins: 1234 };
    store[LEGACY_SAVE_KEY] = JSON.stringify(old);
    const loaded = SaveSystem.load();
    expect(loaded.coins).toBe(1234);
    SaveSystem.save();
    expect(JSON.parse(store[NEW_KEY]!).coins).toBe(1234);
    expect(store[LEGACY_SAVE_KEY]).toBe(JSON.stringify(old)); // untouched backup
  });

  it('when both exist the new key wins', () => {
    store[LEGACY_SAVE_KEY] = JSON.stringify({ ...defaultSave(), coins: 1 });
    store[NEW_KEY] = JSON.stringify({ ...defaultSave(), coins: 99 });
    expect(SaveSystem.load().coins).toBe(99);
  });

  it('a fresh player gets the default save', () => {
    expect(SaveSystem.load().coins).toBe(defaultSave().coins);
  });
});
