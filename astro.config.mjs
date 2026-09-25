import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: 'https://rolemining.up.railway.app',
  build: { inlineStylesheets: 'auto' },
});
