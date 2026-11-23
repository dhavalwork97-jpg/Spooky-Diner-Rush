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

/** The Poki build loads the Poki SDK instead of the CrazyGames one (the two are never both in a build). */
const swapPortalScript = {
  name: 'poki-sdk-script',
  transformIndexHtml(html: string): string {
    return html.replace(/<script src="https:\/\/sdk\.crazygames\.com\/[^"]*"><\/script>/, '<script src="https://game-cdn.poki.com/scripts/v2/poki-sdk.js"></script>');
  },
};

export default defineConfig(({ mode }) => {
  const crazygames = mode === 'crazygames';
  const poki = mode === 'poki';
  const outDir = crazygames ? 'dist-crazygames' : poki ? 'dist-poki' : 'dist';
  return {
    base: './',
    plugins: [dropSourceArt(outDir), ...(crazygames || poki ? [dropIntroVideo(outDir)] : []), ...(poki ? [swapPortalScript] : [])],
    // Phaser is its own file: it never changes between releases, so players (and the CrazyGames CDN) keep it cached when only the game code changes.
    build: { outDir, chunkSizeWarningLimit: 1500, rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'phaser', test: /node_modules[\\/]phaser/ }] } } } },
    test: { include: ['tests/**/*.test.ts'] },
  } as never;
});
