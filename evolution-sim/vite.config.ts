import { defineConfig } from 'vite';
// Relative base so the built page works from any folder (e.g. GitHub Pages under /apps/)
export default defineConfig({ base: './', build: { outDir: 'web-dist' }, worker: { format: 'es' } });
