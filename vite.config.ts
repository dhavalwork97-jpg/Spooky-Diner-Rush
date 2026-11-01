import { defineConfig } from 'vite';
import { existsSync, readdirSync, rmSync } from 'node:fs';

/** The ghost cutout PNGs are only the source for tools/make_customer_art.py (the game uses customers.webp), so they are not shipped. */
const dropSourceArt = {
  name: 'drop-source-art',
  closeBundle(): void {
    const dir = 'dist/assets/customers/ghosts';
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir)) if (f.endsWith('.png')) rmSync(`${dir}/${f}`);
  },
};

export default defineConfig({
  base: './',
  plugins: [dropSourceArt],
  build: { chunkSizeWarningLimit: 1500 },
  test: { include: ['tests/**/*.test.ts'] },
} as never);
