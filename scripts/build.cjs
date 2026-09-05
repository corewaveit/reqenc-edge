const esbuild = require('esbuild');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

console.log('[REQENC] Generating TypeScript declarations...');
try {
  execSync('npx tsc --emitDeclarationOnly --outDir dist -p tsconfig.json', {
    cwd: rootDir,
    stdio: 'inherit',
  });
} catch (e) {
  console.warn('[REQENC] tsc declaration warning:', e.message);
}

console.log('[REQENC] Bundling ESM & CJS with esbuild...');

// 1. ESM Bundle (for import { reqenc } from 'reqenc-edge')
esbuild.buildSync({
  entryPoints: [path.join(rootDir, 'src/index.ts')],
  outfile: path.join(distDir, 'index.mjs'),
  format: 'esm',
  bundle: true,
  platform: 'neutral',
  target: ['node16', 'es2022'],
  sourcemap: true,
});

// 2. CJS Bundle (for const { reqenc } = require('reqenc-edge'))
esbuild.buildSync({
  entryPoints: [path.join(rootDir, 'src/index.ts')],
  outfile: path.join(distDir, 'index.cjs'),
  format: 'cjs',
  bundle: true,
  platform: 'node',
  target: ['node16', 'es2022'],
  sourcemap: true,
});

console.log('✅ [REQENC EDGE] Successfully built production bundles:');
console.log('   - dist/index.mjs (ESM)');
console.log('   - dist/index.cjs (CommonJS)');
console.log('   - dist/index.d.ts (Types)');
