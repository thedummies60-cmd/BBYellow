#!/usr/bin/env node
/**
 * Enforces the layering rules in CLAUDE.md §2.
 *
 * Prose rules rot. This makes them fail the build instead.
 *
 *   - Dependencies point downward only.
 *   - `three` is imported only under src/render/.
 *   - core/ and game/ touch no browser globals.
 *   - Math.random() exists only in core/rng.ts.
 *
 * Run: npm run check:layers
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SRC = 'src';

/** Layer → the layers it is allowed to import from (plus itself). */
const ALLOWED = {
  shared: [],
  core: ['shared'],
  platform: ['shared', 'core'],
  render: ['shared', 'core', 'platform'],
  audio: ['shared', 'core', 'platform'],
  input: ['shared', 'core', 'platform'],
  game: ['shared', 'core', 'platform', 'audio', 'input'],
  ui: ['shared', 'core', 'platform', 'game'],
};

/** Layers that must stay free of Three.js. */
const NO_THREE = ['shared', 'core', 'platform', 'audio', 'input', 'game', 'ui'];

/** Layers that must stay free of browser globals (pure, headless-testable). */
const NO_DOM = ['core', 'game'];

const DOM_GLOBALS =
  /\b(window|document|navigator|localStorage|sessionStorage|fetch|requestAnimationFrame|HTMLElement)\b/;

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_RE = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

const errors = [];

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts') && !p.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/** Layer name from a file path, or null if the file is not inside a layer. */
function layerOf(file) {
  const parts = relative(SRC, file).split(sep);
  return parts.length > 1 && parts[0] in ALLOWED ? parts[0] : null;
}

/** Layer an import specifier resolves to, or null if it is external/local. */
function importedLayer(spec, fromLayer) {
  if (spec.startsWith('@')) {
    const name = spec.slice(1).split('/')[0];
    return name in ALLOWED ? name : null;
  }
  if (spec.startsWith('.')) {
    // Relative imports that climb out of the current layer, e.g. '../render/x'
    const m = spec.match(/(?:\.\.\/)+([a-z-]+)\//);
    if (m && m[1] in ALLOWED && m[1] !== fromLayer) return m[1];
    return null;
  }
  return null;
}

function specifiers(source) {
  const found = [];
  for (const re of [IMPORT_RE, DYNAMIC_IMPORT_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(source)) !== null) found.push(m[1]);
  }
  return found;
}

/** Strip comments and string literals so we don't flag words in prose. */
function stripNonCode(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, "''");
}

for (const file of walk(SRC)) {
  const layer = layerOf(file);
  if (!layer) continue;

  const source = readFileSync(file, 'utf8');
  const code = stripNonCode(source);
  const rel = file.replace(/\\/g, '/');

  for (const spec of specifiers(source)) {
    if (spec === 'three' || spec.startsWith('three/')) {
      if (NO_THREE.includes(layer)) {
        errors.push(`${rel}: imports 'three' — only src/render/ may (CLAUDE.md §2)`);
      }
      continue;
    }
    const target = importedLayer(spec, layer);
    if (target && target !== layer && !ALLOWED[layer].includes(target)) {
      errors.push(
        `${rel}: '${layer}' imports from '${target}' — dependencies point downward only (CLAUDE.md §2)`,
      );
    }
  }

  if (NO_DOM.includes(layer)) {
    const hit = code.match(DOM_GLOBALS);
    if (hit) {
      errors.push(
        `${rel}: uses browser global '${hit[1]}' — '${layer}' must stay headless; inject it via platform/ (CLAUDE.md §2)`,
      );
    }
  }

  if (/\bMath\.random\s*\(/.test(code) && rel !== 'src/core/rng.ts') {
    errors.push(`${rel}: uses Math.random() — use the seeded PRNG in core/rng.ts (CLAUDE.md §3)`);
  }
}

if (errors.length > 0) {
  console.error(`\nLayering violations (${errors.length}):\n`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error('\nSee CLAUDE.md §2 and docs/architecture.md.\n');
  process.exit(1);
}

console.log('✓ Layering rules hold.');
