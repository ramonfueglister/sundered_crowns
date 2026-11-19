// The stamp of the kept pieces (tools/stamp/piece_key.ts) changes with what the pieces are made of, and only with that.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PIECE_ROOTS, libraryVersions, packageOf, pieceKey } from '../tools/stamp/piece_key';

const pkg = (version: string, dependencies?: Record<string, string>) => ({ version, integrity: `sha-${version}`, dependencies });

describe('the libraries in the piece key', () => {
  it('names the package of a bare import', () => {
    expect(packageOf('three')).toBe('three');
    expect(packageOf('three/webgpu')).toBe('three');
    expect(packageOf('three/addons/tsl/display/GTAONode.js')).toBe('three');
    expect(packageOf('@scope/lib/sub')).toBe('@scope/lib');
  });

  it('follows dependencies the way Node finds them: next to the package first, then further up', () => {
    const lock = { packages: {
      'node_modules/a': pkg('1.0.0', { b: '^1', c: '^2' }),
      'node_modules/a/node_modules/b': pkg('1.5.0', { c: '^1' }),
      'node_modules/b': pkg('9.0.0'),
      'node_modules/c': pkg('2.0.0'),
      'node_modules/unused': pkg('3.0.0'),
    } };
    expect(libraryVersions(lock, ['a'])).toEqual([
      'node_modules/a/node_modules/b@1.5.0 sha-1.5.0',
      'node_modules/a@1.0.0 sha-1.0.0',
      'node_modules/c@2.0.0 sha-2.0.0',
    ]);
  });

  it('refuses a package the lock file does not hold', () => {
    expect(() => libraryVersions({ packages: {} }, ['three'])).toThrow(/three/);
  });
});

describe('the piece key of a tree', () => {
  let root = '';
  afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); });

  const put = (file: string, text: string) => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), text); };
  const lock = (lib: string, tool: string) => JSON.stringify({ lockfileVersion: 3, packages: {
    '': { devDependencies: { tool } }, 'node_modules/lib': pkg(lib), 'node_modules/tool': pkg(tool),
  } });

  function tree() {
    root = mkdtempSync(join(tmpdir(), 'piece-key-'));
    for (const f of PIECE_ROOTS) put(f, '');
    put(PIECE_ROOTS[0], "import { part } from './part';\nimport { gunzip } from 'lib/sub';\nimport { readFileSync } from 'node:fs';\nimport './look.css';\n");
    put('src/worldprobe/part.ts', 'export const part = 1;\n');
    put('src/worldprobe/look.css', 'a {}');
    put('src/worldprobe/elsewhere.ts', 'export const elsewhere = 1;\n');
    put('public/map/tile.bin', 'tile');
    put('package-lock.json', lock('1.0.0', '1.0.0'));
  }

  it('stays when only a tool or a file outside the workers changes', () => {
    tree();
    const before = pieceKey(root);
    put('package-lock.json', lock('1.0.0', '2.0.0'));
    put('src/worldprobe/elsewhere.ts', 'export const elsewhere = 2;\n');
    expect(pieceKey(root)).toBe(before);
  });

  it('changes with the code, the data and the libraries of the pieces', () => {
    tree();
    const keys = new Set([pieceKey(root)]);
    put('src/worldprobe/part.ts', 'export const part = 2;\n'); keys.add(pieceKey(root));
    put('src/worldprobe/look.css', 'b {}'); keys.add(pieceKey(root));
    put('public/map/tile.bin', 'other tile'); keys.add(pieceKey(root));
    put('package-lock.json', lock('1.0.1', '1.0.0')); keys.add(pieceKey(root));
    expect(keys.size).toBe(5);
  });
});
