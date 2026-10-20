#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { encode, toSvg, toRgba, decode } from '../index.js';

const USAGE = `Usage:
  spqr encode <text> [-l 1|2|3] [-e L|M|Q|H] [-m modulePx] [-o out.svg|out.png]
  spqr encode -i message.txt ...      read the text from a file ("-" for stdin)
  spqr decode <image>                 PNG, JPEG, WebP… (needs the optional "sharp" package)

Encode writes SVG to stdout unless -o is given. PNG output also needs "sharp".`;

async function loadSharp() {
	try {
		return (await import('sharp')).default;
	} catch {
		fail('This needs the optional "sharp" package: npm install sharp');
	}
}

function fail(msg) {
	console.error(msg);
	process.exit(1);
}

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		layers: { type: 'string', short: 'l', default: '3' },
		ecc: { type: 'string', short: 'e', default: 'M' },
		module: { type: 'string', short: 'm', default: '10' },
		out: { type: 'string', short: 'o' },
		input: { type: 'string', short: 'i' },
		help: { type: 'boolean', short: 'h' },
	},
});

const [cmd, arg] = positionals;
if (values.help || !cmd) {
	console.log(USAGE);
	process.exit(values.help ? 0 : 1);
}

if (cmd === 'encode') {
	const text = values.input !== undefined ? readFileSync(values.input === '-' ? 0 : values.input, 'utf8') : arg;
	if (!text) fail(USAGE);
	let code;
	try {
		code = encode(text, { layers: Number(values.layers), ecc: values.ecc.toUpperCase() });
	} catch (e) {
		fail(e.message);
	}
	const modulePx = Number(values.module);
	if (values.out?.toLowerCase().endsWith('.png')) {
		const sharp = await loadSharp();
		const { data, width, height } = toRgba(code, { modulePx });
		await sharp(Buffer.from(data.buffer), { raw: { width, height, channels: 4 } }).png().toFile(values.out);
	} else {
		const svg = toSvg(code, { modulePx });
		if (values.out) writeFileSync(values.out, svg);
		else process.stdout.write(svg + '\n');
	}
	if (values.out) console.error(`${code.layers}-layer SPQR, version ${code.version} (${code.size}×${code.size} modules) → ${values.out}`);
} else if (cmd === 'decode') {
	if (!arg) fail(USAGE);
	const sharp = await loadSharp();
	// Large photos decode better scaled down; try a few sizes.
	let res = null;
	for (const max of [1000, 1600, 640, 2400]) {
		const { data, info } = await sharp(arg).rotate().resize(max, max, { fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
		res = decode({ data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height });
		if (res.status === 'ok') break;
	}
	if (res.status !== 'ok') {
		const got = res.found.map((ok, i) => (ok ? `layer ${i + 1}` : null)).filter(Boolean);
		fail(got.length ? `Only read ${got.join(' and ')}.` : 'No QR or SPQR code found.');
	}
	console.error(res.layers === 1 ? `Standard QR, version ${res.version}` : `${res.layers}-layer SPQR, version ${res.version}`);
	process.stdout.write(res.text + '\n');
} else {
	fail(USAGE);
}
