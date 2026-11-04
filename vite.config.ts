import { defineConfig } from 'vite';
import { existsSync, readdirSync, rmSync } from 'node:fs';

/** The ghost cutout PNGs are only the source for tools/make_customer_art.py (the game uses customers.webp), so they are not shipped. */
const dropSourceArt = (outDir: string) => ({
  name: 'drop-source-art',
  closeBundle(): void {
    const dir = `${outDir}/assets/customers/ghosts`;
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir)) if (f.endsWith('.png')) rmSync(`${dir}/${f}`);
  },
});

/** The CrazyGames build has no intro video (see src/build/target.ts), so the 1.5 MB file is left out of the ZIP. */
const dropIntroVideo = (outDir: string) => ({
  name: 'drop-intro-video',
  closeBundle(): void {
    const file = `${outDir}/assets/intro/intro.mp4`;
    if (existsSync(file)) rmSync(file);
  },
});

export default defineConfig(({ mode }) => {
  const crazygames = mode === 'crazygames';
  const outDir = crazygames ? 'dist-crazygames' : 'dist';
  return {
    base: './',
    plugins: [dropSourceArt(outDir), ...(crazygames ? [dropIntroVideo(outDir)] : [])],
    build: { outDir, chunkSizeWarningLimit: 1500 },
    test: { include: ['tests/**/*.test.ts'] },
  } as never;
});
