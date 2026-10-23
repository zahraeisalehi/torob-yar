// Copies MapLibre's web worker into /public so the bundler never has to resolve it (Turbopack can't).
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs');
const dst = path.join(root, 'public/vendor/maplibre-gl-worker.mjs');
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.copyFileSync(src, dst);
console.log('copied maplibre worker →', path.relative(root, dst));
