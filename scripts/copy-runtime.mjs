import { mkdir, copyFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const source = dirname(require.resolve('pyodide/package.json'));
const version = require('pyodide/package.json').version;
const destination = `public/runtime/pyodide-${version}`;
await mkdir(destination, { recursive: true });
for (const name of await readdir(source)) {
  if (/\.(mjs|wasm|zip|json)$/.test(name) || /LICENSE/.test(name)) {
    await copyFile(join(source, name), join(destination, name));
  }
}
console.log(`Python runtime ready: /runtime/pyodide-${version}/`);
