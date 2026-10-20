import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spqr } from './load.mjs';
import { splitBytes } from '../docs/spqr-core.js';
import { photograph, rng } from './camera-sim.mjs';

const roundTrip = (text, layers, ecc = 'M') => {
	const code = spqr.encode(text, { layers, ecc });
	return { code, res: spqr.decode(spqr.toRgba(code, { modulePx: 4 })) };
};

for (const layers of [1, 2, 3]) {
	test(`${layers}-layer round trip`, () => {
		for (const text of ['a', 'Hello, SPQR!', 'https://example.com/a/rather/long/path?with=query&and=more '.repeat(6)]) {
			const { res } = roundTrip(text, layers);
			assert.equal(res.status, 'ok');
			assert.equal(res.layers, layers);
			assert.equal(res.text, text);
		}
	});
}

test('multi-byte characters split across layers survive', () => {
	const text = '🎉ünïcødé — 日本語テキスト 🎉'.repeat(3);
	for (const layers of [2, 3]) assert.equal(roundTrip(text, layers).res.text, text);
});

test('every ECC level round trips', () => {
	for (const ecc of ['L', 'M', 'Q', 'H']) assert.equal(roundTrip('error correction '.repeat(8), 3, ecc).res.text, 'error correction '.repeat(8));
});

test('repetitive text never produces identical layers', () => {
	for (const layers of [2, 3]) {
		const text = 'x'.repeat(600);
		const { code, res } = roundTrip(text, layers);
		const [a, b] = code.layerBytes;
		assert.notDeepEqual(a, b);
		assert.equal(res.layers, layers);
		assert.equal(res.text, text);
	}
});

test('splitBytes keeps every byte in order', () => {
	const bytes = Uint8Array.from({ length: 101 }, (_, i) => i);
	for (const parts of [1, 2, 3]) {
		const chunks = splitBytes(bytes, parts);
		assert.equal(chunks.length, parts);
		assert.deepEqual(Uint8Array.from(chunks.flatMap((c) => [...c])), bytes);
	}
});

test('more layers means a smaller QR version', () => {
	const text = 'z'.repeat(400);
	const v = [1, 2, 3].map((layers) => spqr.encode(text, { layers }).version);
	assert.ok(v[0] > v[1] && v[1] > v[2], `versions ${v}`);
});

test('too much text is rejected with a clear error', () => {
	assert.throws(() => spqr.encode('q'.repeat(3000), { layers: 1, ecc: 'H' }), /too long/);
	assert.throws(() => spqr.encode('', { layers: 2 }), /Nothing to encode/);
});

test('function patterns are black and white', () => {
	const code = spqr.encode('finder patterns stay black', { layers: 3 });
	const { size, cells } = code;
	// Top-left finder: outer ring all-dark (all 3 layers), next ring all-light.
	for (let i = 0; i < 7; i++) {
		assert.equal(cells[i], 7);
		assert.equal(cells[6 * size + i], 7);
	}
	for (let i = 1; i < 6; i++) assert.equal(cells[1 * size + i], 0);
});

// Wipe out one channel so only the others can be read.
function blank(img, channel) {
	const data = Uint8ClampedArray.from(img.data);
	for (let i = channel; i < data.length; i += 4) data[i] = 200;
	return { ...img, data };
}

test('aggregator assembles layers read from different frames', () => {
	const text = 'collected one layer at a time across several camera frames';
	const img = spqr.toRgba(spqr.encode(text, { layers: 3 }), { modulePx: 4 });
	const agg = spqr.createAggregator();
	let res = agg.push(blank(blank(img, 1), 2), { now: 0 });
	assert.notEqual(res.status, 'ok');
	assert.deepEqual(agg.locked, [true, false, false]);
	res = agg.push(blank(blank(img, 0), 2), { now: 100 });
	assert.notEqual(res.status, 'ok');
	res = agg.push(blank(blank(img, 0), 1), { now: 200 });
	assert.equal(res.status, 'ok');
	assert.equal(res.text, text);
});

test('aggregator forgets stale partial reads', () => {
	const img = spqr.toRgba(spqr.encode('stale', { layers: 2 }), { modulePx: 4 });
	const agg = spqr.createAggregator({ maxAgeMs: 1000 });
	agg.push(blank(img, 1), { now: 0 });
	assert.deepEqual(agg.locked, [true, false, false]);
	agg.push(blank(blank(img, 0), 1), { now: 5000 });
	assert.deepEqual(agg.locked, [false, false, false]);
});

test('decodes simulated camera photos', async () => {
	const text = 'Simulated photo: perspective, blur, colour bleed, noise and JPEG.';
	for (const layers of [1, 2, 3]) {
		const img = spqr.toRgba(spqr.encode(text, { layers }), { modulePx: 6 });
		let ok = 0;
		for (let t = 0; t < 4; t++) {
			const photo = await photograph(img, { codePx: 260, blur: 1, skew: 0.05, crosstalk: 0.1, noise: 5, jpeg: 85 }, rng(t + layers * 10));
			const res = spqr.decode(photo);
			if (res.status === 'ok' && res.text === text && res.layers === layers) ok++;
		}
		assert.ok(ok >= 3, `${layers} layers: ${ok}/4`);
	}
});
