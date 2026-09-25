import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: 'https://mounkeila-real.github.io',
  base: '/rolemining',
  trailingSlash: 'ignore',
  build: { inlineStylesheets: 'auto' },
});
