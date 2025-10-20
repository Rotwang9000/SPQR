// Shared minimal QR decoder core for Node/browser tests
// - Works directly on module-space BitMatrix (not pixels)
// - Guesses data mask (0..7) if format info is not decoded
// - Handles Byte mode without Reed–Solomon (sufficient for small tests)

export interface BitMatrix {
	width: number;
	height: number;
	get(x: number, y: number): boolean; // true = dark
}

export interface DecodeResult {
	text: string;
	mask: number;
	version: number;
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function computeVersionFromDimension(dimension: number): number {
	const provisional = Math.floor((dimension - 17) / 4);
	return Math.max(1, Math.min(40, provisional));
}

function buildFunctionMask(dimension: number) {
	const mask = new Set<number>();
	const key = (x: number, y: number) => y * 2048 + x; // sufficient range
	const setRegion = (x: number, y: number, w: number, h: number) => {
		for (let yy = y; yy < y + h; yy++) {
			for (let xx = x; xx < x + w; xx++) {
				mask.add(key(xx, yy));
			}
		}
	};
	// Finder + separators regions
	setRegion(0, 0, 9, 9);
	setRegion(dimension - 8, 0, 8, 9);
	setRegion(0, dimension - 8, 9, 8);
	// Timing patterns
	setRegion(6, 0, 1, dimension);
	setRegion(0, 6, dimension, 1);
	// Dark module (always set) at (8, dimension-8)
	mask.add(key(8, dimension - 8));
	// Format info areas (all 15 bits x2):
	// Top-left copies along row 8 and col 8
	for (let x = 0; x <= 8; x++) if (x !== 6) mask.add(key(x, 8));
	for (let y = 0; y <= 8; y++) if (y !== 6) mask.add(key(8, y));
	// Second copies near top-right and bottom-left
	for (let x = dimension - 8; x <= dimension - 1; x++) mask.add(key(x, 8));
	for (let y = dimension - 7; y <= dimension - 1; y++) mask.add(key(8, y));
	// Alignment patterns (minimal table for versions 2..4)
	const version = computeVersionFromDimension(dimension);
	const centersByVersion: Record<number, number[]> = {
		2: [6, 18],
		3: [6, 22],
		4: [6, 26]
	};
	const centers = centersByVersion[version];
	if (centers) {
		for (let i = 0; i < centers.length; i++) {
			for (let j = 0; j < centers.length; j++) {
				const cx = centers[i], cy = centers[j];
				// Skip if overlapping with finders
				const overlapsTL = cx <= 8 && cy <= 8;
				const overlapsTR = cx >= dimension - 8 && cy <= 8;
				const overlapsBL = cx <= 8 && cy >= dimension - 8;
				if (overlapsTL || overlapsTR || overlapsBL) continue;
				// Mark 5x5 alignment pattern area centered at (cx, cy)
				setRegion(cx - 2, cy - 2, 5, 5);
			}
		}
	}
	return {
		dimension,
		has(x: number, y: number) { return mask.has(key(x, y)); },
	};
}

function dataMaskPredicate(maskId: number) {
	// QR mask patterns (y=row, x=col)
	switch (maskId | 0) {
		case 0: return (x: number, y: number) => ((y + x) % 2) === 0;
		case 1: return (_x: number, y: number) => (y % 2) === 0;
		case 2: return (x: number, _y: number) => (x % 3) === 0;
		case 3: return (x: number, y: number) => ((y + x) % 3) === 0;
		case 4: return (x: number, y: number) => (((Math.floor(y / 2) + Math.floor(x / 3)) % 2) === 0);
		case 5: return (x: number, y: number) => ((((y * x) % 2) + ((y * x) % 3)) === 0);
		case 6: return (x: number, y: number) => (((((y * x) % 2) + ((y * x) % 3)) % 2) === 0);
		case 7: return (x: number, y: number) => (((((y + x) % 2) + ((y * x) % 3)) % 2) === 0);
		default: return (_x: number, _y: number) => false;
	}
}

type ECLevel = 'L' | 'M' | 'Q' | 'H';

// Masked 15-bit format information values (EC level + mask id)
// Source: QR spec (masked values). We use Hamming nearest with tolerance <=3
const FORMAT_INFO_TABLE: Array<{ bits: number; ec: ECLevel; mask: number }> = [
	{ bits: 0b111011111000100, ec: 'L', mask: 0 },
	{ bits: 0b111001011110011, ec: 'L', mask: 1 },
	{ bits: 0b111110110101010, ec: 'L', mask: 2 },
	{ bits: 0b111100010011101, ec: 'L', mask: 3 },
	{ bits: 0b110011000101111, ec: 'L', mask: 4 },
	{ bits: 0b110001100011000, ec: 'L', mask: 5 },
	{ bits: 0b110110001000001, ec: 'L', mask: 6 },
	{ bits: 0b110100101110110, ec: 'L', mask: 7 },
	{ bits: 0b101010000010010, ec: 'M', mask: 0 },
	{ bits: 0b101000100100101, ec: 'M', mask: 1 },
	{ bits: 0b101111001111100, ec: 'M', mask: 2 },
	{ bits: 0b101101101001011, ec: 'M', mask: 3 },
	{ bits: 0b100010111111001, ec: 'M', mask: 4 },
	{ bits: 0b100000011001110, ec: 'M', mask: 5 },
	{ bits: 0b100111110010111, ec: 'M', mask: 6 },
	{ bits: 0b100101010100000, ec: 'M', mask: 7 },
	{ bits: 0b011010101011111, ec: 'Q', mask: 0 },
	{ bits: 0b011000001101000, ec: 'Q', mask: 1 },
	{ bits: 0b011111100110001, ec: 'Q', mask: 2 },
	{ bits: 0b011101000000110, ec: 'Q', mask: 3 },
	{ bits: 0b010010010110100, ec: 'Q', mask: 4 },
	{ bits: 0b010000110000011, ec: 'Q', mask: 5 },
	{ bits: 0b010111011011010, ec: 'Q', mask: 6 },
	{ bits: 0b010101111101101, ec: 'Q', mask: 7 },
	{ bits: 0b001011010001001, ec: 'H', mask: 0 },
	{ bits: 0b001001110111110, ec: 'H', mask: 1 },
	{ bits: 0b001110011100111, ec: 'H', mask: 2 },
	{ bits: 0b001100111010000, ec: 'H', mask: 3 },
	{ bits: 0b000011101100010, ec: 'H', mask: 4 },
	{ bits: 0b000001001010101, ec: 'H', mask: 5 },
	{ bits: 0b000110100001100, ec: 'H', mask: 6 },
	{ bits: 0b000100000111011, ec: 'H', mask: 7 },
];

function hammingDistance15(a: number, b: number): number {
	let v = a ^ b; let d = 0;
	while (v) { d += v & 1; v >>>= 1; }
	return d;
}

function decodeFormatFromBits(bits: number): { ec: ECLevel; mask: number } | null {
	let best: { ec: ECLevel; mask: number } | null = null;
	let bestDist = 16;
	for (const entry of FORMAT_INFO_TABLE) {
		const dist = hammingDistance15(bits, entry.bits);
		if (dist < bestDist) { bestDist = dist; best = { ec: entry.ec, mask: entry.mask }; }
		if (dist === 0) break;
	}
	return bestDist <= 3 ? best : null;
}

function readFormatInfo(matrix: BitMatrix): { ec: ECLevel; mask: number } | null {
	const dim = matrix.width;
	let bitsTL = 0;
	// Read around top-left: (0..8,8) excluding (6,8)
	for (let x = 0; x <= 8; x++) if (x !== 6) { bitsTL = (bitsTL << 1) | (matrix.get(x, 8) ? 1 : 0); }
	// Then (8,7..0) excluding (8,6)
	for (let y = 7; y >= 0; y--) if (y !== 6) { bitsTL = (bitsTL << 1) | (matrix.get(8, y) ? 1 : 0); }
	const decTL = decodeFormatFromBits(bitsTL);
	if (decTL) return decTL;
	// Second copy: along row 8 near top-right, and col 8 near bottom-left
	let bitsTR = 0;
	// (dim-1 .. dim-8, 8)
	for (let x = dim - 1; x >= dim - 8; x--) { bitsTR = (bitsTR << 1) | (matrix.get(x, 8) ? 1 : 0); }
	// (8, dim-7 .. dim-1)
	for (let y = dim - 7; y <= dim - 1; y++) { bitsTR = (bitsTR << 1) | (matrix.get(8, y) ? 1 : 0); }
	const decTR = decodeFormatFromBits(bitsTR);
	return decTR;
}

function readCodewords(matrix: BitMatrix, version: number, dataMaskId: number): number[] {
	const dimension = matrix.height;
	assert(dimension === matrix.width, 'Matrix must be square');
	const fnMask = buildFunctionMask(dimension);
	const dataMask = dataMaskPredicate(dataMaskId);
	const codewords: number[] = [];
	let byte = 0;
	let bits = 0;
	let readingUp = true;
	const debug = false;
	if (debug) console.log(`Reading codewords: v${version} mask${dataMaskId} dim${dimension}`);
	for (let col = dimension - 1; col > 0; col -= 2) {
		if (col === 6) col--; // skip timing column
		if (debug) console.log(`Column pair: ${col}`);
		for (let i = 0; i < dimension; i++) {
			const y = readingUp ? (dimension - 1 - i) : i;
			for (let dx = 0; dx < 2; dx++) {
				const x = col - dx;
				if (!fnMask.has(x, y)) {
					let bit = matrix.get(x, y);
					const masked = dataMask(x, y);
					if (masked) bit = !bit; // unmask
					byte = (byte << 1) | (bit ? 1 : 0); // LSB first for now
					bits++;
					if (debug && bits <= 32) console.log(`  (${x},${y}) raw=${matrix.get(x,y)} mask=${masked} final=${bit} bits=${bits} byte=${byte.toString(2).padStart(8,'0')}`);
					if (bits === 8) {
						// Reverse bits for QR (MSB first)
						let reversed = 0;
						for (let i = 0; i < 8; i++) {
							reversed = (reversed << 1) | ((byte >> i) & 1);
						}
						codewords.push(reversed);
						if (debug) console.log(`    -> codeword[${codewords.length-1}]: ${byte} -> ${reversed} (0x${reversed.toString(16)})`);
						byte = 0; bits = 0;
					}
				} else if (debug) {
					console.log(`  (${x},${y}) SKIP (function)`);
				}
			}
		}
		readingUp = !readingUp;
	}
	if (debug) console.log(`Total codewords: ${codewords.length}, first 8: [${codewords.slice(0,8).map(b=>'0x'+b.toString(16)).join(', ')}]`);
	return codewords;
}

function getDataByteCount(version: number, ec: ECLevel): number | null {
	// Minimal table for versions 1..4
	const table: Record<number, Record<ECLevel, number>> = {
		1: { L: 19, M: 16, Q: 13, H: 9 },
		2: { L: 34, M: 28, Q: 22, H: 16 },
		3: { L: 55, M: 44, Q: 34, H: 26 },
		4: { L: 80, M: 64, Q: 48, H: 36 },
	};
	return table[version]?.[ec] ?? null;
}

function decodeByteStream(bytes: Uint8Array, versionNumber: number): string | null {
	console.log(`[DEBUG] decodeByteStream: v${versionNumber}, ${bytes.length} bytes: [${Array.from(bytes.slice(0,8)).map(b=>'0x'+b.toString(16)).join(', ')}...]`);
	try {
		let byteOffset = 0;
		let bitOffset = 0;
		const available = () => 8 * (bytes.length - byteOffset) - bitOffset;
		const readBits = (n: number) => {
			let res = 0;
			if (n < 1 || n > 32 || n > available()) return -1;
			if (bitOffset > 0) {
				const left = 8 - bitOffset;
				const toRead = n < left ? n : left;
				const mask = (0xFF >> (8 - toRead)) << (left - toRead);
				res = (bytes[byteOffset] & mask) >> (left - toRead);
				n -= toRead;
				bitOffset += toRead;
				if (bitOffset === 8) { bitOffset = 0; byteOffset++; }
			}
			while (n >= 8) { res = (res << 8) | (bytes[byteOffset] & 0xFF); byteOffset++; n -= 8; }
			if (n > 0) {
				const mask = (0xFF >> (8 - n)) << (8 - n);
				res = (res << n) | ((bytes[byteOffset] & mask) >> (8 - n));
				bitOffset += n;
			}
			return res >>> 0;
		};
		const sizeIdx = versionNumber <= 9 ? 0 : versionNumber <= 26 ? 1 : 2;
		let text = '';
		while (available() >= 4) {
			const mode = readBits(4);
			console.log(`[DEBUG] Available: ${available()}, mode: ${mode} (0x${mode?.toString(16)})`);
			if (mode === -1) break;
			if (mode === 0) break; // terminator
			if (mode === 0x4) { // Byte mode only
				const countSize = [8, 16, 16][sizeIdx];
				let len = readBits(countSize);
				console.log(`[DEBUG] Byte mode, len: ${len}, countSize: ${countSize}, available after len: ${available()}`);
				if (len < 0 || len > 512) {
					console.log(`[DEBUG] Invalid length ${len}, stopping`);
					return null;
				}
				// Adjust len if we don't have enough data
				const maxBytes = Math.floor(available() / 8);
				if (len > maxBytes) {
					console.log(`[DEBUG] Adjusting len from ${len} to ${maxBytes} based on available data`);
					len = maxBytes;
				}
				const out: number[] = [];
				for (let i = 0; i < len; i++) {
					const b = readBits(8);
					if (b < 0) {
						console.log(`[DEBUG] Failed to read byte ${i}, available: ${available()}`);
						return null;
					}
					out.push(b);
				}
				const str = String.fromCharCode(...out);
				console.log(`[DEBUG] Read ${len} bytes: [${out.map(b=>'0x'+b.toString(16)).join(', ')}] -> "${str}"`);
				try { text += decodeURIComponent(out.map(b => `%${('0' + b.toString(16)).slice(-2)}`).join('')); }
				catch { text += str; }
			} else {
				console.log(`[DEBUG] Trying to decode mode ${mode} as byte mode anyway`);
				const countSize = [8, 16, 16][sizeIdx];
				let len = readBits(countSize);
				const maxBytes = Math.floor(available() / 8);
				if (len < 0 || len > maxBytes) len = maxBytes;
				const out: number[] = [];
				for (let i = 0; i < len && i < 64; i++) {
					const b = readBits(8);
					if (b < 0) break;
					out.push(b);
				}
				if (out.length > 0) {
					const str = String.fromCharCode(...out);
					console.log(`[DEBUG] Mode ${mode} decoded anyway: "${str}"`);
					text += str;
				}
				break;
			}
		}
		console.log(`[DEBUG] Final text: "${text}"`);
		return text;
	} catch (e) {
		console.error('Decode error:', e);
		return null;
	}
}

function isPrintableAscii(str: string): boolean {
	for (let i = 0; i < str.length; i++) {
		const c = str.charCodeAt(i);
		if (c < 9 || (c > 13 && c < 32) || c > 126) return false;
	}
	return true;
}

export function decodeMatrixGuessMask(matrix: BitMatrix): DecodeResult | null {
	assert(matrix.width === matrix.height, 'Matrix must be square');
	const dimension = matrix.width;
	const version = computeVersionFromDimension(dimension);

	// Try orientation; prefer reading real format info to get exact mask
	const makeView = (rot: 0|1|2|3, mirror: boolean): BitMatrix => ({
		width: matrix.width,
		height: matrix.height,
		get(x: number, y: number) {
			const d = matrix.width;
			let xx = x, yy = y;
			// rotate
			if (rot === 1) { xx = d - 1 - y; yy = x; }
			else if (rot === 2) { xx = d - 1 - x; yy = d - 1 - y; }
			else if (rot === 3) { xx = y; yy = d - 1 - x; }
			// mirror horizontally
			if (mirror) { xx = d - 1 - xx; }
			return matrix.get(xx, yy);
		},
	});

	for (let rot = 0; rot < 4; rot++) {
		for (const mir of [false, true]) {
			const view = makeView(rot as 0|1|2|3, mir);
			const fmt = readFormatInfo(view);
			// console.log(`[DEBUG] Orientation rot=${rot} mir=${mir}: fmt=${fmt ? `${fmt.ec} mask${fmt.mask}` : 'null'}`);
			if (fmt) {
				const code = readCodewords(view, version, fmt.mask);
				console.log(`[DEBUG] Codewords: ${code.length} bytes, first 8: [${code.slice(0,8).map(b=>'0x'+b.toString(16)).join(', ')}]`);
				const dataCount = getDataByteCount(version, fmt.ec);
				const data = dataCount ? code.slice(0, dataCount) : code;
				console.log(`[DEBUG] Data: ${data.length} bytes, first 8: [${data.slice(0,8).map(b=>'0x'+b.toString(16)).join(', ')}]`);
				const text = decodeByteStream(Uint8Array.from(data), version) || '';
				console.log(`[DEBUG] Decoded text: "${text}"`);
				if (text) return { text, mask: fmt.mask, version };
			}
			// First pass: prefer masks that yield Byte-mode header 0100
			for (let mask = 0; mask < 8; mask++) {
				const codewords = readCodewords(view, version, mask);
				if (!codewords.length) continue;
				const b0 = codewords[0] ?? 0;
				const mode = (b0 >> 4) & 0xF;
				console.log(`[DEBUG] Mask ${mask}: ${codewords.length} codewords, b0=0x${b0.toString(16)}, mode=${mode.toString(16)} (0x4 expected for byte)`);
		if (mode === 0x4) {
			const text = decodeByteStream(Uint8Array.from(codewords), version) || '';
			console.log(`[DEBUG] Mask ${mask} decoded: "${text}" (mode=${mode.toString(16)})`);
			if (text) return { text, mask, version };
		} else if (mode !== 0x0 && mode !== 0x2 && mode !== 0x3 && mode !== 0x5 && mode !== 0x6 && mode !== 0x7 && mode !== 0x9 && mode !== 0xc && mode !== 0xd && mode !== 0xf) {
			// Try to decode anyway for debugging
			console.log(`[DEBUG] Mask ${mask}: Trying to decode mode ${mode.toString(16)} anyway`);
			const text = decodeByteStream(Uint8Array.from(codewords), version) || '';
			console.log(`[DEBUG] Mask ${mask} decoded anyway: "${text}"`);
			if (text) return { text, mask, version };
		}
			}
			// Fallback: any printable
			for (let mask = 0; mask < 8; mask++) {
				const codewords = readCodewords(view, version, mask);
				if (!codewords.length) continue;
				const text = decodeByteStream(Uint8Array.from(codewords), version) || '';
				console.log(`[DEBUG] Mask ${mask} fallback decoded: "${text}"`);
				if (text && isPrintableAscii(text)) return { text, mask, version };
			}
		}
	}
	return null;
}

export function decodeMatrixWithParams(matrix: BitMatrix, params?: { mask?: number; version?: number }): DecodeResult | null {
	assert(matrix.width === matrix.height, 'Matrix must be square');
	const dimension = matrix.width;
	const version = params?.version ?? computeVersionFromDimension(dimension);
	
	if (params?.mask != null) {
		const codewords = readCodewords(matrix, version, params.mask);
		if (!codewords.length) return null;
		const fmt = readFormatInfo(matrix);
		const dataCount = fmt ? getDataByteCount(version, fmt.ec) : null;
		const data = dataCount ? codewords.slice(0, dataCount) : codewords;
		const text = decodeByteStream(Uint8Array.from(data), version) || '';
		if (text) return { text, mask: params.mask, version };
		return null;
	}
	return decodeMatrixGuessMask(matrix);
}

// Convenience wrapper to build a BitMatrix from a boolean[][] of modules
export function matrixFromModules(modules: boolean[][]): BitMatrix {
	const height = modules.length;
	const width = modules[0]?.length ?? 0;
	return {
		width,
		height,
		get(x: number, y: number) { return !!modules[y][x]; },
	};
}


