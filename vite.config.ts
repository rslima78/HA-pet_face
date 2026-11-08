import { defineConfig } from 'vite';

// Identificador do build, mostrado no setup e no painel dev: ajuda a ver se o tablet
// está rodando uma versão em cache.
const BUILD_ID = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

// `vite build` gera a página avulsa (index.html + assets/).
// `vite build --mode card` gera o cartão do HA num arquivo único, dist/pet-face-card.js.
export default defineConfig(({ mode }) => ({
  // base relativa: o mesmo build funciona em /local/pet/ no HA e no servidor de dev.
  base: './',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: { host: true },
  build:
    mode === 'card'
      ? {
          target: 'es2020',
          outDir: 'dist',
          emptyOutDir: false,
          lib: { entry: 'src/card.ts', formats: ['es' as const], fileName: () => 'pet-face-card.js' },
          rollupOptions: { output: { inlineDynamicImports: true } },
        }
      : { target: 'es2020', outDir: 'dist', emptyOutDir: true },
}));
