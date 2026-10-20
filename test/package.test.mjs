// The published entry point (npm dependencies, not the vendored browser copies) and the CLI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import spqr, { encode, toRgba, decode, createSpqr, palette } from '../index.js';

test('package entry round trips', () => {
	for (const layers of [1, 2, 3]) {
		const text = `package entry, ${layers} layer(s) — ünïcødé 🎉`;
		const res = decode(toRgba(encode(text, { layers }), { modulePx: 4 }));
		assert.equal(res.status, 'ok');
		assert.equal(res.text, text);
		assert.equal(res.layers, layers);
	}
	assert.equal(typeof spqr.encode, 'function');
	assert.equal(typeof createSpqr, 'function');
	assert.equal(palette(3).length, 8);
});

test('npm and vendored qrcode-generator produce identical codes', async () => {
	const { qrcode, jsQR } = await import('./load.mjs');
	const vendored = createSpqr({ qrcode, jsQR });
	const text = 'same matrix from both copies of the library '.repeat(4);
	for (const layers of [1, 2, 3]) {
		assert.deepEqual(encode(text, { layers }).cells, vendored.encode(text, { layers }).cells);
	}
});

test('CLI encodes to PNG and decodes it back', () => {
	const dir = mkdtempSync(join(tmpdir(), 'spqr-'));
	try {
		const png = join(dir, 'code.png');
		const cli = new URL('../bin/spqr.js', import.meta.url).pathname;
		execFileSync('node', [cli, 'encode', 'hello from the command line', '-l', '2', '-o', png], { stdio: 'pipe' });
		const out = execFileSync('node', [cli, 'decode', png], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
		assert.equal(out.trim(), 'hello from the command line');
		const svg = execFileSync('node', [cli, 'encode', 'svg to stdout'], { encoding: 'utf8' });
		assert.match(svg, /^<svg /);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
