import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Serves data/demo at /data/demo/ in dev and copies it into dist/ on build. The private profile is never copied: it is inlined by scripts/build-private.ts. */
function demoData(): Plugin {
  const src = path.resolve(__dirname, 'data/demo');
  return {
    name: 'demo-data',
    configureServer(server) {
      server.middlewares.use('/data/demo', (req, res, next) => {
        const file = path.join(src, decodeURIComponent((req.url ?? '/').split('?')[0]));
        if (!file.startsWith(src) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
        res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'text/plain');
        fs.createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      fs.cpSync(src, path.resolve(__dirname, 'dist/data/demo'), { recursive: true, filter: (f) => !f.endsWith('.md') });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), demoData()],
  test: {
    environment: 'node',
    include: process.env.SHIPPING_PROFILE === 'private' ? ['tests-private/**/*.test.{ts,tsx}'] : ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/helpers/setup.ts'],
  },
});
