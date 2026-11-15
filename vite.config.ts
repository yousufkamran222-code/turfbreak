import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

function commitHash(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

const platforms = ['web', 'crazygames', 'android'] as const;
const platform = process.env.VITE_PLATFORM ?? 'web';
if (!(platforms as readonly string[]).includes(platform)) {
  throw new Error(`VITE_PLATFORM must be one of ${platforms.join(', ')}, got "${platform}"`);
}

export default defineConfig({
  // Relative paths are required by portals, GitHub Pages subpaths and Capacitor.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commitHash()),
    'import.meta.env.VITE_PLATFORM': JSON.stringify(platform),
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
  },
});
