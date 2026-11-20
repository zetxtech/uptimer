import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../public/index.html', import.meta.url));
const destination = fileURLToPath(new URL('../dist/index.html', import.meta.url));
const functionEntrypoint = fileURLToPath(
  new URL('../edge-functions/api/probe.js', import.meta.url),
);
const healthEntrypoint = fileURLToPath(
  new URL('../edge-functions/api/health.js', import.meta.url),
);

if (!existsSync(source) || !existsSync(functionEntrypoint) || !existsSync(healthEntrypoint)) {
  throw new Error('Missing static landing page or EdgeOne function entrypoints');
}
mkdirSync(fileURLToPath(new URL('../dist/', import.meta.url)), { recursive: true });
copyFileSync(source, destination);
console.log('EdgeOne Makers build completed');
