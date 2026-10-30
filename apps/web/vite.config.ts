import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Playtest por túnel temporário da Cloudflare: o Vite recusa hosts desconhecidos, então liberamos só os do túnel.
const tunnelHosts = ['.trycloudflare.com'];

/**
 * Decodificador Draco dos modelos (public/modelos/*.glb), servido em /draco/ direto do three instalado:
 * sem CDN externo e sem copiar binário para o repositório. Fica sempre na versão do three.
 */
function draco(): Plugin {
  const dir = fileURLToPath(new URL('./node_modules/three/examples/jsm/libs/draco/gltf/', import.meta.url));
  const files = ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js'];
  return {
    name: 'trukenza-draco',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.startsWith('/draco/') ? req.url.slice('/draco/'.length).split('?')[0] : '';
        if (!files.includes(name!)) return next();
        res.setHeader('content-type', name!.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        res.end(readFileSync(join(dir, name!)));
      });
    },
    generateBundle() {
      for (const name of files) this.emitFile({ type: 'asset', fileName: `draco/${name}`, source: readFileSync(join(dir, name)) });
    },
  };
}

export default defineConfig({
  plugins: [react(), draco()],
  server: { allowedHosts: tunnelHosts, port: 5180, strictPort: true },
  preview: { allowedHosts: tunnelHosts, port: 4180, strictPort: true },
  // three e React Three Fiber ficam no pedaço da cena, baixado só ao entrar numa mesa (~900 kB): o aviso é esperado.
  build: { chunkSizeWarningLimit: 1200 },
});
