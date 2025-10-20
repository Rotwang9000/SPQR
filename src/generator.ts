import QRCode from 'qrcode';
import * as rmqrModule from 'rmqr';

// Force byte mode constant - qrcode module uses value 4
const BYTE_MODE = 4;

export type Colour = string;

export type Mode = 'square' | 'rmqr';
export type Composition = 'overlay' | 'discrete';
export type KeyPlacement = 'quietZone' | 'finderCenter';
export type FinderCorner = 'tr' | 'tl' | 'bl';

export type GeneratorOptions = {
	mode?: Mode; // default 'square'
	layers?: number; // 1-3 (default 3: base+R+G)
	colours?: Colour[]; // default RGBW mapping
	addKey?: boolean; // default true
	composition?: Composition; // default 'discrete'
	zeroIsBlack?: boolean; // discrete: when base is white and code==0, use black if true
	keyPlacement?: KeyPlacement; // default 'quietZone'
	keyFinderCorner?: FinderCorner; // default 'tr' if keyPlacement==='finderCenter'
	keyFinderCorners?: FinderCorner[]; // optional list; if provided, overrides single corner
	modulePx?: number; // pixels per module (default 4)
	marginModules?: number; // quiet zone in modules (default 4)
	/** ECC level for square QR. Defaults to 'M' to maximise capacity. */
	eccLevel?: 'L' | 'M' | 'Q' | 'H';
	/** Layering strategy: 'split' (default) splits payload across layers; 'duplicate' encodes full payload in all layers */
	layering?: 'split' | 'duplicate';
	/** Finder key style: fill inner finder squares ('finderFill') or omit keys ('none'). */
	finderKeyStyle?: 'finderFill' | 'none';
};

export type SvgResult = { svg: string; width: number; height: number };

function assert(condition: boolean, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

export function parseColourList(input?: string | string[]): Colour[] {
	// Default: 4-color high-contrast scheme (White, Red, Green, Yellow) for camera reliability
	if (!input) return ['#ffffff', '#ff0000', '#00ff00', '#ffff00']; 
	const raw = Array.isArray(input) ? input : String(input).split(',');
	
	// Preset schemes
	if (raw.length === 1 && raw[0] === 'bwrg') {
		return ['#ffffff', '#ff0000', '#00ff00', '#000000']; // Black, White, Red, Green (4-color)
	}
	if (raw.length === 1 && raw[0] === 'cmyrgb') {
		return ['#ffffff', '#ff0000', '#00ff00', '#ffff00', '#000000', '#ff00ff', '#00ffff', '#0000ff']; // 8-color CMYRGB+BW
	}
	
	const map: Record<string, string> = {
		r: '#ff0000', red: '#ff0000',
		g: '#00ff00', green: '#00ff00',
		b: '#0000ff', blue: '#0000ff',
		c: '#00ffff', cyan: '#00ffff',
		m: '#ff00ff', magenta: '#ff00ff',
		y: '#ffff00', yellow: '#ffff00',
		k: '#000000', black: '#000000',
		w: '#ffffff', white: '#ffffff'
	};
	return raw
		.map(s => s.trim())
		.filter(Boolean)
		.map(s => (s in map ? map[s] : s));
}

export function splitPayload(payload: string, splits: number): string[] {
	assert(splits >= 1 && splits <= 8, 'splits must be 1..8');
	const parts: string[] = [];
	const size = Math.ceil(payload.length / splits);
	for (let i = 0; i < splits; i++) parts.push(payload.slice(i * size, (i + 1) * size));
	return parts;
}

async function encodeSquareMatrix(text: string, ecc: 'L' | 'M' | 'Q' | 'H'): Promise<{ qr: number[][]; size: number }> {
	const segments = await QRCode.create(text, { errorCorrectionLevel: ecc });
	const size = segments.modules.size;
	const qr: number[][] = [];
	for (let y = 0; y < size; y++) {
		const row: number[] = [];
		for (let x = 0; x < size; x++) row.push(segments.modules.get(x, y) ? 1 : 0);
		qr.push(row);
	}
	return { qr, size };
}

async function encodeSquareMatrixWithVersion(text: string, version: number, ecc: 'L' | 'M' | 'Q' | 'H'): Promise<{ qr: number[][]; size: number }> {
	const segments = await QRCode.create(text, { errorCorrectionLevel: ecc, version });
	const size = segments.modules.size;
	const qr: number[][] = [];
	for (let y = 0; y < size; y++) {
		const row: number[] = [];
		for (let x = 0; x < size; x++) row.push(segments.modules.get(x, y) ? 1 : 0);
		qr.push(row);
	}
	return { qr, size };
}

async function encodeRmqrMatrix(text: string): Promise<{ qr: number[][]; width: number; height: number }> {
	const Rmqr: any = (rmqrModule as any).rmqr;
	const correction = ((rmqrModule as any).correction ?? { auto: 0, medium: 1, high: 2 }).high;
	const inst = new Rmqr();
	const { qr, width, height } = await inst.generate(text, { correction });
	return { qr, width, height };
}

export async function generateColourQr(payload: string, opts: GeneratorOptions = {}): Promise<SvgResult> {
	const mode: Mode = opts.mode ?? 'square';
	const layers = Math.max(1, Math.min(3, opts.layers ?? 3));

	// For single layer, use standard QR generation
	if (layers === 1) {
		console.log('Generating standard single-layer QR...');
		const svg = await QRCode.toString(payload, {
			type: 'svg',
			width: 200,
			margin: opts.marginModules ?? 4,
			color: { dark: '#000000', light: '#ffffff' }
		});
		// Extract dimensions from SVG
		const widthMatch = svg.match(/width="(\d+)"/);
		const heightMatch = svg.match(/height="(\d+)"/);
		const width = widthMatch ? parseInt(widthMatch[1]) : 200;
		const height = heightMatch ? parseInt(heightMatch[1]) : 200;
		return { svg, width, height };
	}

	// Honour full palette from --colours without truncation, and normalise common short forms
	let colours = parseColourList(opts.colours);
	// If user provided only two chroma colours, expand to [white, c1, c2, black]
	if (colours.length === 2) {
		colours = ['#ffffff', colours[0], colours[1], '#000000'];
	}
	// If three colours provided, ensure both white and black are present, then order as [white, c1, c2, black]
	if (colours.length === 3) {
		const hasWhite = colours.some(c => c.toLowerCase() === '#ffffff');
		const hasBlack = colours.some(c => c.toLowerCase() === '#000000');
		const chroma = colours.filter(c => {
			const lc = c.toLowerCase();
			return lc !== '#ffffff' && lc !== '#000000';
		});
		const white = hasWhite ? '#ffffff' : '#ffffff';
		const black = hasBlack ? '#000000' : '#000000';
		const c1 = chroma[0] ?? (colours.find(c => c.toLowerCase() !== '#ffffff' && c.toLowerCase() !== '#000000') ?? '#ff0000');
		const c2 = chroma[1] ?? (colours.find(c => c.toLowerCase() !== '#ffffff' && c.toLowerCase() !== '#000000' && c !== c1) ?? '#00ff00');
		colours = [white, c1, c2, black];
	}
	assert(colours.length >= Math.min(4, layers), 'colours length must be sufficient for selected layers');
	const composition: Composition = opts.composition ?? 'discrete';
	const ecc: 'L'|'M'|'Q'|'H' = opts.eccLevel ?? 'M';
	
	// Calculate capacity multiplier based on color scheme
	const bitsPerModule = Math.log2(colours.length >= 8 ? 8 : colours.length >= 4 ? 4 : 2);
	const capacityMultiplier = bitsPerModule / 1; // vs standard 1 bit per module
	console.log(`Color scheme: ${colours.length} colors, ${bitsPerModule.toFixed(1)} bits/module, ${capacityMultiplier.toFixed(1)}x capacity`);
	
	// Adjust module size to take advantage of capacity gain - bigger squares for same data
	const baseModuleSize = opts.modulePx ?? 4;
	const adjustedModuleSize = Math.floor(baseModuleSize * Math.sqrt(capacityMultiplier));
	const actualMultiplier = adjustedModuleSize / baseModuleSize;
	console.log(`Module size: ${baseModuleSize}px -> ${adjustedModuleSize}px (${actualMultiplier.toFixed(1)}× bigger)`);
	const finalModuleSize = Math.max(baseModuleSize, adjustedModuleSize);

	// Layer payloads - adjust splitting based on color capacity
	let textsForLayers: string[];
	if ((opts.layering ?? 'split') === 'split') {
		// Determine actual number of layers based on color scheme
		const actualLayers = colours.length >= 8 ? 3 : 2; // 8+ colors = 3 layers, 4 colors = 2 layers
		const effectiveSplits = colours.length >= 8 ? Math.min(actualLayers * 2, 8) : actualLayers;
		const splits = splitPayload(payload, effectiveSplits);
		textsForLayers = splits.slice(0, actualLayers);
		// Pad with empty strings if we have fewer chunks than actual layers
		while (textsForLayers.length < actualLayers) {
			textsForLayers.push('');
		}
		console.log(`Payload split: ${payload.length} chars -> ${effectiveSplits} splits -> ${textsForLayers.length} layers: [${textsForLayers.map(t => `"${t}"`).join(', ')}]`);
	} else {
		const actualLayers = colours.length >= 8 ? 3 : 2;
		textsForLayers = Array.from({ length: actualLayers }, () => payload);
	}
	let matrices: { qr: number[][]; width: number; height: number }[] = [];
	if (mode === 'square') {
		// Ensure all layers use the same version by computing the max required version
		const versions: number[] = [];
		for (const text of textsForLayers) {
			try {
				const { size } = await encodeSquareMatrix(text, ecc);
				const v = Math.max(1, Math.round((size - 17) / 4));
				versions.push(v);
			} catch (e) {
				// Fallback to lower ECC if capacity exceeded
				if (ecc !== 'L') {
					const { size } = await encodeSquareMatrix(text, 'L');
					const v = Math.max(1, Math.round((size - 17) / 4));
					versions.push(v);
				} else {
					throw e;
				}
			}
		}
		const maxVersion = Math.max(...versions);
		for (let i = 0; i < textsForLayers.length; i++) {
			const text = textsForLayers[i];
			try {
				const { qr, size } = await encodeSquareMatrixWithVersion(text, maxVersion, ecc);
				matrices.push({ qr, width: size, height: size });
				console.log(`Layer ${i} (v${maxVersion}, "${text}"): ${size}x${size}, first row: [${qr[0].slice(0,8).join('')}]`);
			} catch {
				const { qr, size } = await encodeSquareMatrixWithVersion(text, maxVersion, 'L');
				matrices.push({ qr, width: size, height: size });
				console.log(`Layer ${i} (v${maxVersion} fallback L, "${text}"): ${size}x${size}, first row: [${qr[0].slice(0,8).join('')}]`);
			}
		}
	} else {
		matrices = await Promise.all(
			textsForLayers.map(async (text) => {
				const { qr, width, height } = await encodeRmqrMatrix(text);
				return { qr, width, height };
			})
		);
	}

	const width = matrices[0].width;
	const height = matrices[0].height;
	for (const m of matrices) assert(m.width === width && m.height === height, 'all layers must match dimensions');

	const moduleSize = finalModuleSize;
	const margin = Math.max(2, Math.floor(opts.marginModules ?? 4));
	const pixelWidth = (width + margin * 2) * moduleSize;
	const pixelHeight = (height + margin * 2) * moduleSize;
	
	console.log(`Final QR: ${width}x${height} modules, ${moduleSize}px per module, total: ${pixelWidth}x${pixelHeight}px`);

	const rects: string[] = [];
	if (composition === 'overlay') {
		// Base black modules
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				if (matrices[0].qr[y][x]) {
					const px = (x + margin) * moduleSize;
					const py = (y + margin) * moduleSize;
					rects.push(`<rect x="${px}" y="${py}" width="${moduleSize}" height="${moduleSize}" fill="#000"/>`);
				}
			}
		}
		// Overlay coloured modules with opacity
		for (let layerIndex = 1; layerIndex < layers; layerIndex++) {
			const colour = colours[layerIndex] ?? '#ff0000';
			const { qr } = matrices[layerIndex];
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					// Skip finder rings to preserve black outlines
					const inTL = x < 7 && y < 7;
					const inTR = x >= width - 7 && y < 7;
					const inBL = x < 7 && y >= height - 7;
					const onRingTL = inTL && (x === 0 || x === 6 || y === 0 || y === 6);
					const onRingTR = inTR && (x === width - 7 || x === width - 1 || y === 0 || y === 6);
					const onRingBL = inBL && (x === 0 || x === 6 || y === height - 7 || y === height - 1);
					if (qr[y][x] && !(onRingTL || onRingTR || onRingBL)) {
						const px = (x + margin) * moduleSize;
						const py = (y + margin) * moduleSize;
						rects.push(`<rect x="${px}" y="${py}" width="${moduleSize}" height="${moduleSize}" fill="${colour}" fill-opacity="0.85"/>`);
					}
				}
			}
		}
	} else {
		// Discrete mapping: each layer combination gets a distinct high-contrast color
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				// Skip finder areas completely - preserve original QR structure
				const skipTL = x < 7 && y < 7;
				const skipTR = x >= width - 7 && y < 7;
				const skipBL = x < 7 && y >= height - 7;
				if (skipTL || skipTR || skipBL) {
					// Draw base layer only in finder areas
					if (matrices[0].qr[y][x]) {
						const px = (x + margin) * moduleSize;
						const py = (y + margin) * moduleSize;
						rects.push(`<rect x="${px}" y="${py}" width="${moduleSize}" height="${moduleSize}" fill="#000000"/>`);
					}
					continue;
				}
				
				const baseBit = matrices[0].qr[y][x] ? 1 : 0;
				const rBit = matrices.length >= 2 ? (matrices[1].qr[y][x] ? 1 : 0) : 0;
				const gBit = matrices.length >= 3 ? (matrices[2].qr[y][x] ? 1 : 0) : 0;
				
				// For 4-color palettes, only use 2-bit combinations (ignore base layer to avoid extra colors)
				// For 8-color palettes, use all 3-bit combinations
				let fill = colours[0] ?? '#ffffff';
				
				if (colours.length === 4) {
					// 4-color mode: 2-bit encoding with 2 layers (green layer ignored)
					const layerCode = (baseBit << 1) | rBit; // 0..3
					switch (layerCode) {
						case 0: fill = colours[0]; break; // 00 → white (base=0, red=0)
						case 1: fill = colours[1]; break; // 01 → red (base=0, red=1)
						case 2: fill = colours[3]; break; // 10 → black (base=1, red=0)  
						case 3: fill = colours[2]; break; // 11 → green (base=1, red=1)
					}
				} else {
					// 8-color mode: 3-bit encoding with 3 layers
					const layerCode = (baseBit << 2) | (gBit << 1) | rBit; // 0..7
					switch (layerCode) {
						case 0: fill = colours[0] ?? '#ffffff'; break; // 000: white
						case 1: fill = colours[1] ?? '#ff0000'; break; // 001: red
						case 2: fill = colours[2] ?? '#00ff00'; break; // 010: green  
						case 3: fill = colours[3] ?? '#ffff00'; break; // 011: yellow
						case 4: fill = colours[4] ?? '#000000'; break; // 100: black
						case 5: fill = colours[5] ?? '#ff00ff'; break; // 101: magenta
						case 6: fill = colours[6] ?? '#00ffff'; break; // 110: cyan
						case 7: fill = colours[7] ?? '#0000ff'; break; // 111: blue
					}
				}
				const px = (x + margin) * moduleSize;
				const py = (y + margin) * moduleSize;
				// Preserve black for complete finder patterns (ring + center)
				const inTL = x < 7 && y < 7;
				const inTR = x >= width - 7 && y < 7;
				const inBL = x < 7 && y >= height - 7;
				
				// Check if pixel is part of a finder pattern (both ring and center)
				const isFinderTL = inTL && ((x === 0 || x === 6 || y === 0 || y === 6) || (x >= 2 && x <= 4 && y >= 2 && y <= 4));
				const isFinderTR = inTR && ((x === width - 7 || x === width - 1 || y === 0 || y === 6) || (x >= width - 5 && x <= width - 3 && y >= 2 && y <= 4));
				const isFinderBL = inBL && ((x === 0 || x === 6 || y === height - 7 || y === height - 1) || (x >= 2 && x <= 4 && y >= height - 5 && y <= height - 3));
				
				const forcedFill = (isFinderTL || isFinderTR || isFinderBL) ? '#000000' : fill;
				rects.push(`<rect x="${px}" y="${py}" width="${moduleSize}" height="${moduleSize}" fill="${forcedFill}"/>`);
			}
		}
	}

	if (opts.addKey !== false && (opts.finderKeyStyle ?? 'finderFill') === 'finderFill') {
		// Always draw keys inside finder centres of TL, TR, BL
		const corners: FinderCorner[] = ['tl','tr','bl'];
			const sizeM = width; // width == height
			const is8Color = colours.length >= 7; // 8-color CMYRGB mode
			
			const drawAt = (fx: number, fy: number, cornerIndex: number) => {
				// Fill the entire 3x3 inner square area of the finder pattern
				const innerTopLeftXModules = fx - 1;
				const innerTopLeftYModules = fy - 1;
				const baseX = (innerTopLeftXModules + margin) * moduleSize;
				const baseY = (innerTopLeftYModules + margin) * moduleSize;
				const moduleSize3 = moduleSize * 3; // 3x3 modules area
				
				if (is8Color) {
					// 8-color mode: Use 2-color squares (2x2 pattern) for each finder
					// Always include black in the checker to keep strong contrast for outline
					const black = '#000000';
					const paletteIndex = cornerIndex * 2 + 1;
					const color1 = colours[paletteIndex] ?? '#ff0000';
					const color2 = (colours[paletteIndex + 1] ?? black);
					// Top-left and bottom-right: color1, top-right and bottom-left: color2
					rects.push(`<rect x="${baseX}" y="${baseY}" width="${moduleSize}" height="${moduleSize}" fill="${color1}"/>`);
					rects.push(`<rect x="${baseX + moduleSize}" y="${baseY}" width="${moduleSize}" height="${moduleSize}" fill="${color2}"/>`);
					rects.push(`<rect x="${baseX}" y="${baseY + moduleSize}" width="${moduleSize}" height="${moduleSize}" fill="${color2}"/>`);
					rects.push(`<rect x="${baseX + moduleSize}" y="${baseY + moduleSize}" width="${moduleSize}" height="${moduleSize}" fill="${color1}"/>`);
					// Center square
					rects.push(`<rect x="${baseX + moduleSize}" y="${baseY + moduleSize}" width="${moduleSize}" height="${moduleSize}" fill="${color1}"/>`);
				} else {
					// 4-color mode: Single colour per finder
					// Convention for 2-chroma + B/W: TL uses chroma 1, TR uses chroma 2, BL uses black
					const white = colours[0] ?? '#ffffff';
					const chroma1 = colours[1] ?? '#ff0000';
					const chroma2 = colours[2] ?? '#00ff00';
					const black = colours[3] ?? '#000000';
					let fill = chroma1; // default TL
					if (cornerIndex === 0) fill = chroma1; // tl
					else if (cornerIndex === 1) fill = chroma2; // tr
					else fill = black; // bl (spare finder) must be black
					rects.push(`<rect x="${baseX}" y="${baseY}" width="${moduleSize3}" height="${moduleSize3}" fill="${fill}"/>`);
				}
			};
			for (let i = 0; i < corners.length; i++) {
				const c = corners[i];
				let fx = 0; let fy = 0;
				switch (c) {
					case 'tl': fx = 3; fy = 3; break;
					case 'tr': fx = sizeM - 4; fy = 3; break;
					case 'bl': fx = 3; fy = sizeM - 4; break;
				}
				drawAt(fx, fy, i);
			}
	}

	const svg = `<?xml version="1.0" encoding="UTF-8"?>\n` +
		`<svg xmlns="http://www.w3.org/2000/svg" width="${pixelWidth}" height="${pixelHeight}" viewBox="0 0 ${pixelWidth} ${pixelHeight}" data-modules-w="${width}" data-modules-h="${height}" data-margin-modules="${margin}" data-module-px="${moduleSize}" data-colours="${colours.join(',')}">` +
		`<rect width="100%" height="100%" fill="#fff"/>` +
		rects.join('') +
		`</svg>`;

	return { svg, width: pixelWidth, height: pixelHeight };
}


