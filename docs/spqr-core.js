// SPQR core: Stacked Polychromatic QR.
//
// An SPQR code is 1–3 ordinary QR codes of the same version, one per RGB
// channel. Layer i is "dark" where channel i is low, so:
//
//   - every layer shares the same finder/timing/alignment patterns, which are
//     dark in all layers and so come out black, exactly like a normal QR;
//   - splitting a photo into its R, G and B channels gives back each layer as a
//     plain black-and-white QR that any standard decoder (jsQR here) can read,
//     with its own perspective correction and Reed-Solomon error correction.
//
// The payload's UTF-8 bytes are split evenly across the layers, so each layer
// carries 1/N of the data and needs a lower QR version: fewer, bigger modules
// for the same message.
//
// This module is environment-agnostic: pass in the qrcode-generator factory and
// jsQR, and it works the same in the browser and in Node.

export const ECC_LEVELS = ['L', 'M', 'Q', 'H'];

// Channel order for layers 0..2.
export const CHANNELS = ['R', 'G', 'B'];

// Colour for each combination of dark layers, indexed by bitmask (bit i = layer i dark).
const PALETTES = {
	1: ['#ffffff', '#000000'],
	// Two layers live in R and G. B is kept low for every non-white module so the
	// palette is the familiar white/red/green/black.
	2: ['#ffffff', '#00ff00', '#ff0000', '#000000'],
	// Three layers: subtractive CMY primaries.
	3: ['#ffffff', '#00ffff', '#ff00ff', '#0000ff', '#ffff00', '#00ff00', '#ff0000', '#000000'],
};

export function palette(layers) {
	return PALETTES[layers];
}

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8', { fatal: false });

export function splitBytes(bytes, parts) {
	let sizes = [];
	const even = Math.ceil(bytes.length / parts);
	for (let i = 0; i < parts; i++) sizes.push(Math.max(0, Math.min(even, bytes.length - i * even)));
	let out = slices(bytes, sizes);
	// Identical chunks would give identical layers, i.e. a plain black-and-white
	// QR that a reader would take as the whole message. Unequal lengths avoid it.
	if (parts > 1 && out.every((c) => c.length === out[0].length && c.every((v, i) => v === out[0][i]))) {
		const base = Math.floor(bytes.length / parts);
		sizes = parts === 2 ? [base + 1, base - 1] : [base + 1, base, base - 1];
		sizes[0] += bytes.length - base * parts;
		out = slices(bytes, sizes);
	}
	return out;
}

function slices(bytes, sizes) {
	const out = [];
	let o = 0;
	for (const n of sizes) {
		out.push(bytes.slice(o, o + n));
		o += n;
	}
	return out;
}

function bytesToBinaryString(bytes) {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return s;
}

export function createSpqr({ qrcode, jsQR }) {
	// qrcode-generator converts strings to bytes with a global hook; we hand it
	// pre-encoded bytes as a binary string, so it must take char codes as-is.
	const latin1 = (s) => {
		const out = [];
		for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff);
		return out;
	};

	function makeQr(bytes, version, ecc) {
		const prev = qrcode.stringToBytes;
		qrcode.stringToBytes = latin1;
		try {
			const qr = qrcode(version, ecc);
			qr.addData(bytesToBinaryString(bytes), 'Byte');
			qr.make();
			return qr;
		} finally {
			qrcode.stringToBytes = prev;
		}
	}

	function fits(bytes, version, ecc) {
		try {
			makeQr(bytes, version, ecc);
			return true;
		} catch {
			return false;
		}
	}

	function minVersion(bytes, ecc) {
		// Binary search on 1..40; capacity is monotonic in version.
		if (!fits(bytes, 40, ecc)) return null;
		let lo = 1;
		let hi = 40;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (fits(bytes, mid, ecc)) hi = mid;
			else lo = mid + 1;
		}
		return lo;
	}

	/**
	 * Encode text into an SPQR code.
	 * @returns {{ layers, ecc, version, size, cells: Uint8Array, layerBytes: Uint8Array[] }}
	 *   cells[y*size+x] is the bitmask of dark layers for that module.
	 */
	function encode(text, { layers = 2, ecc = 'M' } = {}) {
		if (!(layers >= 1 && layers <= 3)) throw new Error('layers must be 1, 2 or 3');
		if (!ECC_LEVELS.includes(ecc)) throw new Error(`ecc must be one of ${ECC_LEVELS.join(', ')}`);
		const bytes = text instanceof Uint8Array ? text : utf8Encoder.encode(text);
		if (bytes.length === 0) throw new Error('Nothing to encode');
		const layerBytes = splitBytes(bytes, layers);
		// The first chunk is always the largest.
		const version = minVersion(layerBytes[0], ecc);
		if (version === null) throw new Error('Text is too long for this layer count and error correction level');
		const qrs = layerBytes.map((b) => makeQr(b, version, ecc));
		const size = qrs[0].getModuleCount();
		const cells = new Uint8Array(size * size);
		for (let l = 0; l < layers; l++) {
			const qr = qrs[l];
			for (let y = 0; y < size; y++) {
				for (let x = 0; x < size; x++) {
					if (qr.isDark(y, x)) cells[y * size + x] |= 1 << l;
				}
			}
		}
		return { layers, ecc, version, size, cells, layerBytes };
	}

	/** Render to an SVG string. Adjacent same-colour modules in a row are merged. */
	function toSvg(code, { modulePx = 10, quietZone = 4 } = {}) {
		const { size, cells, layers } = code;
		const pal = palette(layers);
		const total = (size + quietZone * 2) * modulePx;
		const parts = [];
		for (let y = 0; y < size; y++) {
			let x = 0;
			while (x < size) {
				const c = cells[y * size + x];
				let run = 1;
				while (x + run < size && cells[y * size + x + run] === c) run++;
				if (c !== 0) {
					parts.push(`<rect x="${(x + quietZone) * modulePx}" y="${(y + quietZone) * modulePx}" width="${run * modulePx}" height="${modulePx}" fill="${pal[c]}"/>`);
				}
				x += run;
			}
		}
		return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${total}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
			`<rect width="100%" height="100%" fill="#ffffff"/>${parts.join('')}</svg>`;
	}

	/** Render to RGBA pixels (for canvas/PNG export and tests). */
	function toRgba(code, { modulePx = 10, quietZone = 4 } = {}) {
		const { size, cells, layers } = code;
		const rgb = palette(layers).map(hexToRgb);
		const total = (size + quietZone * 2) * modulePx;
		const data = new Uint8ClampedArray(total * total * 4).fill(255);
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				const [r, g, b] = rgb[cells[y * size + x]];
				const px0 = (x + quietZone) * modulePx;
				const py0 = (y + quietZone) * modulePx;
				for (let py = py0; py < py0 + modulePx; py++) {
					let i = (py * total + px0) * 4;
					for (let px = 0; px < modulePx; px++, i += 4) {
						data[i] = r;
						data[i + 1] = g;
						data[i + 2] = b;
					}
				}
			}
		}
		return { data, width: total, height: total };
	}

	// --- decoding -------------------------------------------------------------

	// Ways of turning a colour photo into one greyscale image per channel. The
	// first is the plain channel. The second undoes some colour bleed between
	// channels (camera sensors and screens both leak a little of each primary
	// into the others). The third divides out brightness, so a channel is judged
	// by hue rather than by lighting: this helps with glare and vignetting.
	const EXTRACTORS = [
		function raw(r, g, b, c) {
			return c === 0 ? r : c === 1 ? g : b;
		},
		function unmix(r, g, b, c) {
			const v = c === 0 ? r : c === 1 ? g : b;
			return (v - 0.12 * (r + g + b)) / 0.64;
		},
		function chroma(r, g, b, c) {
			const max = Math.max(r, g, b);
			if (max < 48) return 0;
			const v = c === 0 ? r : c === 1 ? g : b;
			return (v * 255) / max;
		},
	];

	function channelImage(src, channel, extractor) {
		const { data, width, height } = src;
		const out = new Uint8ClampedArray(width * height * 4);
		for (let i = 0; i < data.length; i += 4) {
			const v = extractor(data[i], data[i + 1], data[i + 2], channel);
			out[i] = out[i + 1] = out[i + 2] = v;
			out[i + 3] = 255;
		}
		return out;
	}

	function tryChannel(src, channel, extractorIndices = [0, 1, 2]) {
		for (const e of extractorIndices) {
			const img = channelImage(src, channel, EXTRACTORS[e]);
			const res = jsQR(img, src.width, src.height, { inversionAttempts: 'dontInvert' });
			if (res) {
				return { bytes: Uint8Array.from(res.binaryData), version: res.version, location: res.location, extractor: EXTRACTORS[e].name };
			}
		}
		return null;
	}

	/**
	 * Does the code use the blue channel for data? Two-layer codes only ever have
	 * B high where R and G are also high (white). Three-layer codes have cyan,
	 * magenta and blue modules where B is high but R or G is low.
	 */
	function looksThreeLayer(src, location) {
		const { data, width } = src;
		const xs = [location.topLeftCorner.x, location.topRightCorner.x, location.bottomLeftCorner.x, location.bottomRightCorner.x];
		const ys = [location.topLeftCorner.y, location.topRightCorner.y, location.bottomLeftCorner.y, location.bottomRightCorner.y];
		const x0 = Math.max(0, Math.floor(Math.min(...xs)));
		const x1 = Math.min(width - 1, Math.ceil(Math.max(...xs)));
		const y0 = Math.max(0, Math.floor(Math.min(...ys)));
		const y1 = Math.min(src.height - 1, Math.ceil(Math.max(...ys)));
		let blueish = 0;
		let total = 0;
		const step = Math.max(1, Math.floor((x1 - x0) / 120));
		for (let y = y0; y <= y1; y += step) {
			for (let x = x0; x <= x1; x += step) {
				const i = (y * width + x) * 4;
				const r = data[i];
				const g = data[i + 1];
				const b = data[i + 2];
				total++;
				if (b - Math.min(r, g) > 60) blueish++;
			}
		}
		return total > 0 && blueish / total > 0.04;
	}

	function sameBytes(a, b) {
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
		return true;
	}

	/**
	 * Work out what a set of per-channel results amounts to.
	 * @param results  array of 3 (per channel) result-or-null
	 * @param threeLayerHint  boolean|null from looksThreeLayer
	 */
	function assemble(results, threeLayerHint) {
		const found = results.filter(Boolean);
		if (found.length === 0) return { status: 'none', layers: null, found: results.map(Boolean) };
		// A plain black-and-white QR decodes identically in every channel.
		if (found.length >= 2 && found.every((r) => sameBytes(r.bytes, found[0].bytes))) {
			return finish([found[0]], 1, results);
		}
		const versions = new Set(found.map((r) => r.version));
		if (versions.size > 1) return { status: 'mixed', layers: null, found: results.map(Boolean) };
		let layers;
		if (results[2]) layers = 3;
		else if (threeLayerHint === true) layers = 3;
		else if (threeLayerHint === false) layers = 2;
		else layers = null;
		if (layers === null) return { status: 'partial', layers: null, found: results.map(Boolean) };
		const needed = results.slice(0, layers);
		if (needed.every(Boolean)) return finish(needed, layers, results);
		return { status: 'partial', layers, found: results.map(Boolean) };
	}

	function finish(parts, layers, results) {
		const total = parts.reduce((n, p) => n + p.bytes.length, 0);
		const bytes = new Uint8Array(total);
		let o = 0;
		for (const p of parts) {
			bytes.set(p.bytes, o);
			o += p.bytes.length;
		}
		return {
			status: 'ok',
			layers,
			version: parts[0].version,
			text: utf8Decoder.decode(bytes),
			bytes,
			location: parts[0].location,
			found: results.map(Boolean),
		};
	}

	/**
	 * Decode an image ({data: RGBA, width, height}).
	 * @param opts.skip  channels already known (camera aggregation) — not retried
	 */
	function decodeChannels(src, { skip = [false, false, false], extractors = [0, 1, 2] } = {}) {
		const results = [0, 1, 2].map((c) => (skip[c] ? null : tryChannel(src, c, extractors)));
		const loc = results.find(Boolean)?.location;
		const hint = loc ? looksThreeLayer(src, loc) : null;
		return { results, threeLayerHint: hint };
	}

	function decode(src, opts) {
		const { results, threeLayerHint } = decodeChannels(src, opts);
		return assemble(results, threeLayerHint);
	}

	/**
	 * Accumulates per-channel decodes across camera frames, so a code whose
	 * layers are each readable in different frames still comes together.
	 */
	function createAggregator({ maxAgeMs = 4000 } = {}) {
		let locked = [null, null, null];
		let lockedAt = 0;
		let hints = [];
		return {
			get locked() {
				return locked.map(Boolean);
			},
			reset() {
				locked = [null, null, null];
				hints = [];
			},
			push(src, { now = Date.now(), extractors } = {}) {
				if (locked.some(Boolean) && now - lockedAt > maxAgeMs) this.reset();
				const { results, threeLayerHint } = decodeChannels(src, { skip: locked.map(Boolean), extractors });
				for (let c = 0; c < 3; c++) {
					const r = results[c];
					if (!r) continue;
					const clash = locked.some((l) => l && l.version !== r.version);
					if (clash) this.reset();
					locked[c] = r;
					lockedAt = now;
				}
				if (threeLayerHint !== null) {
					hints.push(threeLayerHint);
					if (hints.length > 5) hints.shift();
				}
				const votes = hints.length ? hints.filter(Boolean).length / hints.length : null;
				const hint = votes === null ? null : votes >= 0.5;
				return assemble(locked, hint);
			},
		};
	}

	return { encode, toSvg, toRgba, decode, decodeChannels, assemble, createAggregator, minVersion };
}

export function hexToRgb(hex) {
	const h = hex.replace('#', '');
	return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
