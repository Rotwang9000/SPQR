// For each message length and layer count, find the smallest on-screen size
// (in camera pixels) at which the code still decodes reliably.
import { spqr } from './load.mjs';
import { photograph, rng } from './camera-sim.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const trials = +(args.trials ?? 20);
const cond = { blur: +(args.blur ?? 1.0), skew: +(args.skew ?? 0.05), crosstalk: +(args.crosstalk ?? 0.1), noise: +(args.noise ?? 5), jpeg: +(args.jpeg ?? 85) };
const lengths = (args.lengths ?? '60,200,500').split(',').map(Number);
const ecc = args.ecc ?? 'M';
const target = +(args.target ?? 0.8);

function message(n, seed) {
	const rand = rng(seed);
	const words = ['spqr', 'roma', 'quick', 'brown', 'fox', 'https://example.com/', 'lorem', 'ipsum', '42', 'ünï', 'colour'];
	let s = '';
	while (s.length < n) s += words[Math.floor(rand() * words.length)] + ' ';
	return s.slice(0, n);
}

async function rate(text, layers, codePx) {
	const code = spqr.encode(text, { layers, ecc });
	const img = spqr.toRgba(code, { modulePx: 6 });
	let ok = 0;
	for (let t = 0; t < trials; t++) {
		const photo = await photograph(img, { ...cond, codePx }, rng(1000 * codePx + t * 7 + layers));
		const r = spqr.decode(photo);
		if (r.status === 'ok' && r.text === text) ok++;
	}
	return { rate: ok / trials, code };
}

async function smallest(text, layers) {
	// Grow the size in ~7% steps until it decodes reliably at two sizes in a row
	// (a single lucky size is noise, not a threshold).
	let px = 60;
	let first = null;
	while (px < 2000) {
		const { rate: r } = await rate(text, layers, px);
		if (r >= target) {
			if (first) return first;
			first = px;
		} else first = null;
		px = Math.round(px * 1.07);
	}
	return null;
}

console.log(`conditions: ${JSON.stringify(cond)} ecc=${ecc} trials=${trials} target=${target * 100}%`);
for (const n of lengths) {
	const text = message(n, n);
	const row = [];
	for (const layers of [1, 2, 3]) {
		const code = spqr.encode(text, { layers, ecc });
		const px = await smallest(text, layers);
		row.push({ layers, version: code.version, modules: code.size, px });
	}
	const base = row[0].px;
	console.log(`${n} bytes: ` + row.map((r) => `${r.layers}L v${r.version} (${r.modules}²) needs ${r.px}px${r.layers > 1 ? ` (${Math.round((r.px / base) * 100)}%)` : ''}`).join(' | '));
}
