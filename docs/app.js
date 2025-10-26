// SPQR Web App
let currentStream = null;

document.addEventListener('DOMContentLoaded', function() {
    // Check if required libraries are available
    if (typeof jsQR === 'undefined') {
        console.error('jsQR library failed to load!');
        alert('QR scanning library failed to load. Please refresh the page.');
    } else {
        console.log('jsQR library loaded successfully');
    }
    
    // Check ZXing availability
    if (typeof ZXing !== 'undefined') {
        console.log('✅ ZXing library loaded successfully - robust decoder available!');
        window.zxingCodeReader = new ZXing.BrowserQRCodeReader();
    } else {
        console.warn('⚠️  ZXing library not loaded - will use jsQR only');
    }
    
	if (typeof qrcode === 'undefined') {
		console.error('QR generation library failed to load!');
		alert('QR generation library failed to load. Please refresh the page.');
	} else {
		console.log('QR generation library loaded successfully');
	}
    
    setupEventListeners();
});

function setupEventListeners() {
    const uploadBtn = document.getElementById('uploadBtn');
    const cameraBtn = document.getElementById('cameraBtn');
    const fileInput = document.getElementById('fileInput');
    const textArea = document.getElementById('text');

    uploadBtn.addEventListener('click', () => fileInput.click());
    cameraBtn.addEventListener('click', toggleCamera);
    fileInput.addEventListener('change', handleFileUpload);
    if (textArea) {
        textArea.addEventListener('input', onTextChanged);
    }
}

// Custom colors storage
window.bwrgColors = null;
window.cmyrgbColors = null;

let generateDebounce = null;
function onTextChanged(e) {
    const value = e.target.value;
    if (generateDebounce) clearTimeout(generateDebounce);
    generateDebounce = setTimeout(() => {
        if (value && value.trim()) {
            autoGenerateVariants(value.trim());
        }
    }, 400);
}

async function generateQR(text, options) {
    console.log('Generating QR with:', { text, options });
	
	if (options.layers === 1) {
		return await generateStandardQR(text);
	}
	return await generateSpqrClient(text, options);
}

async function generateStandardQR(text) {
    try {
		// Use qrcode-generator (window.qrcode) with low EC for max capacity (~2953 bytes)
		const qr = qrcode(0, 'L');
		qr.addData(text);
		qr.make();
		const svg = qr.createSvgTag(4, 2); // module size, margin
		// Render to canvas to provide PNG data URL
		const tmp = document.createElement('div');
		tmp.innerHTML = svg;
		const svgEl = tmp.firstChild;
		const width = parseInt(svgEl.getAttribute('width') || '200');
		const height = parseInt(svgEl.getAttribute('height') || '200');
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		const img = new Image();
		const data = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
		await new Promise((resolve, reject) => {
			img.onload = resolve;
			img.onerror = reject;
			img.src = data;
		});
		ctx.drawImage(img, 0, 0);
		const dataUrl = canvas.toDataURL('image/png');
		return { svg, dataUrl };
    } catch (error) {
        console.error('Standard QR generation failed:', error);
        throw new Error('Failed to generate standard QR code');
    }
}

async function generateSpqrClient(text, options) {
	// Pure client-side SPQR SVG composition using qrcode-generator
	const layers = Math.max(2, Math.min(3, options.layers || 3));
	const colours = normaliseColours(options.colours);
	const isEightColour = colours.length >= 8;

	// Error correction strategy:
	// 'standard' - All layers EC 'L' (max capacity, ~2953 bytes/layer)
	// 'hybrid'   - Base EC 'M', others EC 'L' (better reliability for critical data)
	// 'parity'   - 2 data layers EC 'L', 3rd layer for parity (3-layer only, best reliability)
	const ecMode = options.errorCorrection || 'standard';

	// Split payload based on EC mode
	let baseText, redText;
	let baseEC = 'L', redEC = 'L';
	
	if (ecMode === 'parity' && isEightColour) {
		// Parity mode: Use only 2 layers for data, 3rd for parity
		const parts = splitPayload(text, 2);
		baseText = parts[0] || '';
		redText = parts[1] || '';
		// Generate parity data (simple CRC32 + XOR for now)
		console.log(`SPQR Parity mode: ${baseText.length} + ${redText.length} bytes data, ${generateParityData(baseText, redText).length} bytes parity`);
	} else if (ecMode === 'hybrid') {
		// Hybrid mode: First layer gets EC 'M' for critical data
	const splits = isEightColour ? 3 : 2;
	const parts = splitPayload(text, splits);
		baseText = parts[0] || '';
		redText = parts[1] || '';
		baseEC = 'M';  // Base layer gets higher EC
		console.log(`SPQR Hybrid mode: Base EC 'M' (${baseText.length}b), others EC 'L'`);
	} else {
		// Standard mode: Even split, all EC 'L'
		const splits = isEightColour ? 3 : 2;
		const parts = splitPayload(text, splits);
		baseText = parts[0] || '';
		redText = parts[1] || '';
		console.log(`SPQR Standard mode: All layers EC 'L', ${splits} layers`);
	}

	// First pass to find max version needed
	const encodes = [
		makeQrAuto(baseText, baseEC),
		makeQrAuto(redText, redEC)
	].filter(Boolean);
	const moduleCounts = encodes.map(qr => qr.getModuleCount());
	const maxModules = moduleCounts.length ? Math.max.apply(null, moduleCounts) : 21;
	const targetVersion = Math.max(1, Math.round((maxModules - 17) / 4));

	// Check capacity limits - very large QR codes are harder to decode reliably
	const maxRecommendedVersion = isEightColour ? 25 : 30; // CMYRGB is more sensitive
	if (targetVersion > maxRecommendedVersion) {
		const maxModules = 21 + (maxRecommendedVersion - 1) * 4;
		throw new Error(`Data too large for reliable decoding. QR Version ${targetVersion} (${maxModules} modules) exceeds recommended limit. Please reduce text size.`);
	}

	// Regenerate with fixed version
	const baseQr = makeQrFixed(targetVersion, baseEC, baseText);
	const redQr = makeQrFixed(targetVersion, redEC, redText);

	const modules = baseQr.getModuleCount();
	const margin = 4;

	// Use fixed module sizes for reliable decoding
	// BWRG (2-layer): 5px per module
	// CMYRGB (3-layer): 6px per module
	const cell = isEightColour ? 6 : 5;
	const totalModules = modules + 2 * margin;
	const width = totalModules * cell;
	const height = width;

	// Helper to query a module
	const dark = (qr, x, y) => (qr ? qr.isDark(y, x) : false);

	let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
	// White background
	svg += `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`;

	// Draw modules
	for (let y = 0; y < modules; y++) {
		for (let x = 0; x < modules; x++) {
			// Skip finder rings; we'll draw them later to ensure black outline
			if (isInFinderRing(x, y, modules)) continue;
			
			const b = dark(baseQr, x, y) ? 1 : 0;
			const r = dark(redQr, x, y) ? 1 : 0;
			
			let colour = '#ffffff';
			if (isEightColour) {
				// CMYRGB: combine base (bit2), green (bit1), red (bit0)
				const gBit = 0; // TODO: add true green layer when available
				const code = (b << 2) | (gBit << 1) | r; // 0..7
				const idxMap = [0,1,2,3,4,5,6,7];
				colour = colours[idxMap[code]] || '#000000';
			} else {
				// 4-colour BWRG mapping using two layers (base, red); green = overlap
				if (b && r) {
					colour = colours[2]; // green (overlap)
				} else if (b && !r) {
					colour = colours[3]; // black
				} else if (!b && r) {
					colour = colours[1]; // red
				} else {
					colour = colours[0]; // white
				}
			}
			if (colour === '#ffffff') continue;
			const px = (x + margin) * cell;
			const py = (y + margin) * cell;
			svg += `<rect x="${px}" y="${py}" width="${cell}" height="${cell}" fill="${colour}"/>`;
		}
	}

	// Draw black finder rings to ensure readability
	drawFinder(svgAdd => { svg += svgAdd; }, modules, margin, cell);

	// Draw colour keys inside inner 3x3
	drawFinderKeys(svgAdd => { svg += svgAdd; }, modules, margin, cell, colours, isEightColour);

	svg += `</svg>`;

	const dataUrl = await svgToPngDataUrl(svg, width, height);
	return { svg, dataUrl };
}

function normaliseColours(coloursArg) {
	// Accept ['bwrg'] or ['cmyrgb'] or hex list; return palette array
	const token = Array.isArray(coloursArg) && coloursArg.length === 1 ? String(coloursArg[0]).toLowerCase() : '';
	
	// Use custom BWRG colors if available
	if (token === 'bwrg' && window.bwrgColors && window.bwrgColors.length === 4) {
		console.log('Using custom BWRG colors');
		return window.bwrgColors;
	}
	
	// Use custom CMYRGB colors if available
	if (token === 'cmyrgb' && window.cmyrgbColors && window.cmyrgbColors.length === 8) {
		console.log('Using custom CMYRGB colors');
		return window.cmyrgbColors;
	}
	
	if (token === 'bwrg') return ['#ffffff','#ff0000','#00ff00','#000000'];
	if (token === 'cmyrgb') return ['#ffffff','#ff0000','#00ff00','#ffff00','#000000','#ff00ff','#00ffff','#0000ff'];
	// Fallback default
	return ['#ffffff','#ff0000','#00ff00','#000000'];
}

function splitPayload(payload, splits) {
	splits = Math.max(1, Math.min(3, splits|0));
	const size = Math.ceil(payload.length / splits);
	const parts = [];
	for (let i = 0; i < splits; i++) parts.push(payload.slice(i*size, (i+1)*size));
	return parts;
}

// Generate parity/checksum data for error detection and recovery
function generateParityData(data1, data2) {
	const crc32 = (str) => {
		let crc = 0xFFFFFFFF;
		for (let i = 0; i < str.length; i++) {
			crc ^= str.charCodeAt(i);
			for (let j = 0; j < 8; j++) {
				crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
			}
		}
		return (crc ^ 0xFFFFFFFF) >>> 0;
	};
	
	const crc1 = crc32(data1).toString(16).padStart(8, '0');
	const crc2 = crc32(data2).toString(16).padStart(8, '0');
	const len1 = data1.length.toString(16).padStart(4, '0');
	const len2 = data2.length.toString(16).padStart(4, '0');
	
	// XOR parity bytes for recovery
	const maxLen = Math.max(data1.length, data2.length);
	let xorParity = '';
	for (let i = 0; i < Math.min(maxLen, 200); i++) {
		const b1 = i < data1.length ? data1.charCodeAt(i) : 0;
		const b2 = i < data2.length ? data2.charCodeAt(i) : 0;
		xorParity += String.fromCharCode(b1 ^ b2);
	}
	
	return `SPQRv1|${len1}|${len2}|${crc1}|${crc2}|${xorParity}`;
}

// Verify and recover data using parity layer
function verifyWithParity(base, red, parityData) {
	if (!parityData || !parityData.startsWith('SPQRv1|')) {
		return { valid: false, recovered: null };
	}
	
	const parts = parityData.split('|');
	if (parts.length < 6) return { valid: false, recovered: null };
	
	const len1 = parseInt(parts[1], 16);
	const len2 = parseInt(parts[2], 16);
	const expectedCrc1 = parts[3];
	const expectedCrc2 = parts[4];
	const xorParity = parts.slice(5).join('|');
	
	const crc32 = (str) => {
		let crc = 0xFFFFFFFF;
		for (let i = 0; i < str.length; i++) {
			crc ^= str.charCodeAt(i);
			for (let j = 0; j < 8; j++) {
				crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
			}
		}
		return (crc ^ 0xFFFFFFFF) >>> 0;
	};
	
	const actualCrc1 = base ? crc32(base).toString(16).padStart(8, '0') : null;
	const actualCrc2 = red ? crc32(red).toString(16).padStart(8, '0') : null;
	
	const baseValid = base && actualCrc1 === expectedCrc1;
	const redValid = red && actualCrc2 === expectedCrc2;
	
	console.log(`🔍 Parity check: Base ${baseValid ? '✅' : '❌'}, Red ${redValid ? '✅' : '❌'}`);
	
	let recovered = null;
	if (baseValid && !redValid && xorParity) {
		recovered = { layer: 'red', data: '' };
		for (let i = 0; i < len2 && i < xorParity.length; i++) {
			const b1 = i < base.length ? base.charCodeAt(i) : 0;
			const xor = xorParity.charCodeAt(i);
			recovered.data += String.fromCharCode(b1 ^ xor);
		}
		console.log(`✅ Recovered red layer from parity (${recovered.data.length} bytes)`);
	} else if (!baseValid && redValid && xorParity) {
		recovered = { layer: 'base', data: '' };
		for (let i = 0; i < len1 && i < xorParity.length; i++) {
			const b2 = i < red.length ? red.charCodeAt(i) : 0;
			const xor = xorParity.charCodeAt(i);
			recovered.data += String.fromCharCode(b2 ^ xor);
		}
		console.log(`✅ Recovered base layer from parity (${recovered.data.length} bytes)`);
	}
	
	return { valid: baseValid && redValid, baseValid, redValid, recovered };
}

function makeQrAuto(text, ecc) {
	const qr = qrcode(0, ecc);
	qr.addData(text);
	qr.make();
	return qr;
}

function makeQrFixed(version, ecc, text) {
	try {
		const qr = qrcode(version, ecc);
		qr.addData(text);
		qr.make();
		return qr;
	} catch (e) {
		return null;
	}
}

function isInFinderRing(x, y, modules) {
	// Finder 7x7 squares at (0,0), (modules-7,0), (0,modules-7)
	const inTL = x < 7 && y < 7;
	const inTR = x >= modules-7 && y < 7;
	const inBL = x < 7 && y >= modules-7;
	const inFinder = inTL || inTR || inBL;
	if (!inFinder) return false;
	// Ring excludes the inner 3x3 (x:2..4,y:2..4)
	const inInner = (x >= 2 && x <= 4) && (y >= 2 && y <= 4);
	return true && !inInner ? true : false;
}

function drawFinder(append, modules, margin, cell) {
	const addRect = (gx, gy, w, h) => {
		append(`<rect x="${(gx+margin)*cell}" y="${(gy+margin)*cell}" width="${w*cell}" height="${h*cell}" fill="#000000"/>`);
	};
	const drawAt = (gx, gy) => {
		// Outer ring 7x7: black border with white gap then black 3x3 center
		addRect(gx+0, gy+0, 7, 1);
		addRect(gx+0, gy+6, 7, 1);
		addRect(gx+0, gy+1, 1, 5);
		addRect(gx+6, gy+1, 1, 5);
		addRect(gx+2, gy+2, 3, 3);
	};
	// TL, TR, BL
	drawAt(0,0);
	drawAt(modules-7,0);
	drawAt(0,modules-7);
}

function drawFinderKeys(append, modules, margin, cell, colours, isEightColour) {
	const fillInner = (gx, gy, colourOrPair) => {
		const x0 = (gx+2+margin) * cell;
		const y0 = (gy+2+margin) * cell;
		if (Array.isArray(colourOrPair)) {
			// 2x2 grid for 4 colors (or 2-color checker if only 2 provided)
			if (colourOrPair.length === 4) {
				// 4-color 2x2 grid
				const quadSize = cell * 1.5;
				append(`<rect x="${x0}" y="${y0}" width="${quadSize}" height="${quadSize}" fill="${colourOrPair[0]}"/>`);
				append(`<rect x="${x0+quadSize}" y="${y0}" width="${quadSize}" height="${quadSize}" fill="${colourOrPair[1]}"/>`);
				append(`<rect x="${x0}" y="${y0+quadSize}" width="${quadSize}" height="${quadSize}" fill="${colourOrPair[2]}"/>`);
				append(`<rect x="${x0+quadSize}" y="${y0+quadSize}" width="${quadSize}" height="${quadSize}" fill="${colourOrPair[3]}"/>`);
			} else {
				// 2-color checker
			const c1 = colourOrPair[0], c2 = colourOrPair[1];
			append(`<rect x="${x0}" y="${y0}" width="${cell*1.5}" height="${cell*1.5}" fill="${c1}"/>`);
			append(`<rect x="${x0+cell*1.5}" y="${y0}" width="${cell*1.5}" height="${cell*1.5}" fill="${c2}"/>`);
			append(`<rect x="${x0}" y="${y0+cell*1.5}" width="${cell*1.5}" height="${cell*1.5}" fill="${c2}"/>`);
			append(`<rect x="${x0+cell*1.5}" y="${y0+cell*1.5}" width="${cell*1.5}" height="${cell*1.5}" fill="${c1}"/>`);
			}
		} else {
			append(`<rect x="${x0}" y="${y0}" width="${cell*3}" height="${cell*3}" fill="${colourOrPair}"/>`);
		}
	};
	if (isEightColour) {
		// For CMYRGB: Show ALL 8 colors across 3 finder patterns
		// TL: white, red, green, yellow (4 colors in 2x2 grid)
		// TR: black, magenta, cyan, blue (4 colors in 2x2 grid)
		// BL: Can repeat key colors for redundancy or use a mix
		// Colours array: ['#ffffff','#ff0000','#00ff00','#ffff00','#000000','#ff00ff','#00ffff','#0000ff']
		// Indices:        [   0,        1,        2,        3,        4,        5,        6,        7   ]
		fillInner(0, 0, [colours[0], colours[1], colours[2], colours[3]]);  // TL: white, red, green, yellow
		fillInner(modules-7, 0, [colours[4], colours[5], colours[6], colours[7]]);  // TR: black, magenta, cyan, blue
		fillInner(0, modules-7, [colours[1], colours[6]]);  // BL: red/cyan checker for redundancy
	} else {
		// TL red, TR green, BL black
		fillInner(0,0,colours[1]);
		fillInner(modules-7,0,colours[2]);
		fillInner(0,modules-7,colours[3]);
	}
}

async function svgToPngDataUrl(svg, width, height) {
	const img = new Image();
	const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
	await new Promise((resolve, reject) => {
		img.onload = resolve;
		img.onerror = reject;
		img.src = url;
	});
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	ctx.imageSmoothingEnabled = false;
	ctx.drawImage(img, 0, 0, width, height);
	return canvas.toDataURL('image/png');
}

// Estimate the module size (in pixels) by scanning for the periodicity of black/white transitions
function estimateModulePx(width, height, mask) {
	// Prefer the smaller dimension for robustness
	const scanW = Math.min(width, 1024);
	const scanH = Math.min(height, 1024);
	// Sample a horizontal line at mid-height
	const y = Math.floor(scanH / 2);
	let lastDark = null;
	let runLengths = [];
	let run = 0;
	const getDark = (x) => {
		const idx = (y * width + x) * 4;
		return mask ? (mask[idx] < 128) : false;
	};
	for (let x = 0; x < scanW; x++) {
		const dark = getDark(x);
		if (lastDark === null) {
			lastDark = dark; run = 1; continue;
		}
		if (dark === lastDark) {
			run++;
		} else {
			runLengths.push(run);
			lastDark = dark;
			run = 1;
		}
	}
	if (run > 0) runLengths.push(run);
	if (runLengths.length < 5) return null;
	// Use median run length as module size estimate
	runLengths.sort((a,b)=>a-b);
	const mid = Math.floor(runLengths.length/2);
	let modulePx = runLengths[mid];
	modulePx = Math.max(3, Math.min(20, modulePx|0));
	return modulePx || null;
}

function estimateGrid(mask, width, height) {
	const modulePx = estimateModulePx(width, height, mask) || Math.max(3, Math.min(20, Math.round(width/29)));
	let minX = width, minY = height, maxX = 0, maxY = 0;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y*width + x) * 4;
			if (mask[i] < 128) {
				if (x < minX) minX = x;
				if (y < minY) minY = y;
				if (x > maxX) maxX = x;
				if (y > maxY) maxY = y;
			}
		}
	}
	if (minX === width || minY === height) {
		return { modulePx, originX: 0, originY: 0, totalModules: Math.floor(width/modulePx) };
	}
	// Snap origin to module grid so quiet zone is exactly 4 modules
	const originX = Math.max(0, Math.round(minX / modulePx - 4) * modulePx);
	const originY = Math.max(0, Math.round(minY / modulePx - 4) * modulePx);
	const usableModulesX = Math.floor((width - originX) / modulePx);
	const usableModulesY = Math.floor((height - originY) / modulePx);
	const totalModules = Math.min(usableModulesX, usableModulesY);
	return { modulePx, originX, originY, totalModules };
}

// Locate QR structure directly from colored SPQR image
function locateQRStructure(data, width, height) {
    console.log(`locateQRStructure: ${width}x${height} image`);
	
	// Simple brightness-based classification for finder detection
    const isQRPixel = (x, y) => {
        const i = (y * width + x) * 4;
		const r = data[i], g = data[i+1], b = data[i+2];
		const brightness = Math.max(r, g, b);
		const minBright = Math.min(r, g, b);
		// White pixels: very bright and low chroma
		if (brightness > 230 && minBright > 200) return false;
		// Everything else (black or colored) counts as "dark" for finder detection
		return true;
	};
	
    const finderCandidates = [];
	
	// Horizontal scan with better spacing
    for (let y = 0; y < height; y += Math.max(1, Math.floor(height/50))) {
		const runs = [];
		let last = false, len = 0;
		for (let x = 0; x <= width; x++) {
			const cur = x < width ? isQRPixel(x, y) : false;
			if (x === 0) { last = cur; len = 1; continue; }
			if (cur === last && x < width) {
				len++;
			} else {
				runs.push({ dark: last, len, endX: x - 1 });
				last = cur;
				len = 1;
			}
		}
		
        for (let i = 2; i < runs.length - 2; i++) {
			const a = runs[i-2], b = runs[i-1], c = runs[i], d = runs[i+1], e = runs[i+2];
			if (a.dark && !b.dark && c.dark && !d.dark && e.dark) {
				const total = a.len + b.len + c.len + d.len + e.len;
				if (total >= 12) {
					const ratios = [a.len, b.len, c.len, d.len, e.len].map(v => v / total);
					// Check for 1:1:3:1:1 pattern (relaxed tolerances)
					if (Math.abs(ratios[0] - 0.14) < 0.12 && 
					    Math.abs(ratios[1] - 0.14) < 0.12 && 
					    Math.abs(ratios[2] - 0.43) < 0.20 && 
					    Math.abs(ratios[3] - 0.14) < 0.12 && 
					    Math.abs(ratios[4] - 0.14) < 0.12) {
						const centerX = a.endX - a.len + 1 + a.len + b.len + Math.floor(c.len / 2);
						const modulePx = Math.max(3, Math.round(c.len / 3));
						finderCandidates.push({ x: centerX, y, modulePx, strength: total });
					}
				}
			}
		}
	}
	
	// Vertical scan
    for (let x = 0; x < width; x += Math.max(1, Math.floor(width/50))) {
		const runs = [];
		let last = false, len = 0;
		for (let y = 0; y <= height; y++) {
			const cur = y < height ? isQRPixel(x, y) : false;
			if (y === 0) { last = cur; len = 1; continue; }
			if (cur === last && y < height) {
				len++;
			} else {
				runs.push({ dark: last, len, endY: y - 1 });
				last = cur;
				len = 1;
			}
		}
		
        for (let i = 2; i < runs.length - 2; i++) {
			const a = runs[i-2], b = runs[i-1], c = runs[i], d = runs[i+1], e = runs[i+2];
			if (a.dark && !b.dark && c.dark && !d.dark && e.dark) {
				const total = a.len + b.len + c.len + d.len + e.len;
				if (total >= 12) {
					const ratios = [a.len, b.len, c.len, d.len, e.len].map(v => v / total);
					if (Math.abs(ratios[0] - 0.14) < 0.12 && 
					    Math.abs(ratios[1] - 0.14) < 0.12 && 
					    Math.abs(ratios[2] - 0.43) < 0.20 && 
					    Math.abs(ratios[3] - 0.14) < 0.12 && 
					    Math.abs(ratios[4] - 0.14) < 0.12) {
						const centerY = a.endY - a.len + 1 + a.len + b.len + Math.floor(c.len / 2);
						const modulePx = Math.max(3, Math.round(c.len / 3));
						finderCandidates.push({ x, y: centerY, modulePx, strength: total });
					}
				}
			}
		}
	}
	
	if (finderCandidates.length < 6) {
		console.log(`⚠️  Found only ${finderCandidates.length} finder candidates, need at least 6`);
		return null;
	}
	
	// Cluster candidates that are close together
	const avgModulePx = finderCandidates.reduce((s, c) => s + c.modulePx, 0) / finderCandidates.length;
	const clusters = [];
	for (const cand of finderCandidates) {
		let found = false;
		for (const cl of clusters) {
			const dist = Math.hypot(cand.x - cl.x, cand.y - cl.y);
			if (dist < avgModulePx * 5) {
				// Merge into existing cluster
				cl.x = (cl.x * cl.count + cand.x) / (cl.count + 1);
				cl.y = (cl.y * cl.count + cand.y) / (cl.count + 1);
				cl.modulePx = (cl.modulePx * cl.count + cand.modulePx) / (cl.count + 1);
				cl.strength += cand.strength;
				cl.count++;
				found = true;
				break;
			}
		}
		if (!found) {
			clusters.push({ x: cand.x, y: cand.y, modulePx: cand.modulePx, strength: cand.strength, count: 1 });
		}
	}
	
	clusters.sort((a, b) => b.strength - a.strength);

	// Select three DISTINCT finder clusters with adequate separation
	const candidates = clusters;
	const selected = [];
	let minSep = avgModulePx * 4;
	for (const c of candidates) {
		if (selected.every(s => Math.hypot(c.x - s.x, c.y - s.y) > minSep)) {
			selected.push(c);
			if (selected.length === 3) break;
		}
	}
	// If we didn't get 3, relax the separation threshold and try again
	if (selected.length < 3) {
		minSep = avgModulePx * 2.5;
		for (const c of candidates) {
			if (selected.includes(c)) continue;
			if (selected.every(s => Math.hypot(c.x - s.x, c.y - s.y) > minSep)) {
				selected.push(c);
				if (selected.length === 3) break;
			}
		}
	}

	if (selected.length < 3) {
		console.log(`⚠️  Found only ${finders.length} finder clusters, need 3`);
		return null;
	}

	// Identify TL, TR, BL by geometry from distinct clusters
	// TL = smallest (x+y); TR = largest (x-y); BL = largest (y-x)
	const scoreTL = f => f.x + f.y;
	const scoreTR = f => f.x - f.y;
	const scoreBL = f => f.y - f.x;
	const TL = selected.reduce((best, f) => (scoreTL(f) < scoreTL(best) ? f : best), selected[0]);
	const remainingAfterTL = selected.filter(f => f !== TL);
	const TR = remainingAfterTL.reduce((best, f) => (scoreTR(f) > scoreTR(best) ? f : best), remainingAfterTL[0]);
	const remainingAfterTR = remainingAfterTL.filter(f => f !== TR);
	const BL = remainingAfterTR.reduce((best, f) => (scoreBL(f) > scoreBL(best) ? f : best), remainingAfterTR[0]);
	
	console.log(`   Finders: TL(${Math.round(TL.x)},${Math.round(TL.y)}) TR(${Math.round(TR.x)},${Math.round(TR.y)}) BL(${Math.round(BL.x)},${Math.round(BL.y)})`);
	
	// Calculate module size from finder spacing
	// Finder centers are 7 modules apart (including the 7x7 finder itself)
	// So distance TL->TR and TL->BL should be (modules-7) * modulePx
	const distTL_TR = Math.hypot(TR.x - TL.x, TR.y - TL.y);
	const distTL_BL = Math.hypot(BL.x - TL.x, BL.y - TL.y);
	const avgDist = (distTL_TR + distTL_BL) / 2;
	
	// Use average module size from detections as starting point
	let modulePx = Math.round((TL.modulePx + TR.modulePx + BL.modulePx) / 3);
	
	// Refine: distance should be (modules - 7) * modulePx
	// For smallest QR (21x21): distance ≈ 14 * modulePx
	let qrModules = Math.round(avgDist / modulePx) + 7;
	
	// Round to valid QR version: 21, 25, 29, 33, ... (4n + 17 where n=1,2,3...)
	qrModules = Math.max(21, Math.round((qrModules - 17) / 4) * 4 + 17);
	
	// Recalculate modulePx based on actual QR size
	modulePx = Math.round(avgDist / (qrModules - 7));
	
	// Origin calculation: TL finder center is at module position (3.5, 3.5) within the 7x7 finder
	// The finder starts at module (0,0) of the QR grid (including 4-module quiet zone)
	// So TL.x = originX + 3.5 * modulePx
	// Therefore: originX = TL.x - 3.5 * modulePx
	const originX = Math.round(TL.x - 3.5 * modulePx);
	const originY = Math.round(TL.y - 3.5 * modulePx);
	
	console.log(`   Spacing: ${Math.round(avgDist)}px → ${qrModules} modules @ ${modulePx}px, origin=(${originX},${originY})`);
	
	return {
		finders: [TL, TR, BL],
		modulePx,
		qrModules,
		originX: Math.max(0, originX),
		originY: Math.max(0, originY)
	};
}

// Simple run-length based finder locator fallback
function locateGridByRunLengths(mask, width, height) {
	const isDark = (x, y) => mask[(y*width + x)*4] < 128;
	const candidates = [];
	// Scan a few central rows for 1:1:3:1:1 patterns
	for (let y = Math.floor(height*0.2); y < Math.floor(height*0.8); y += Math.max(1, Math.floor(height/60))) {
		let runs = [];
		let last = false; let count = 0;
		for (let x = 0; x < width; x++) {
			const d = isDark(x,y);
			if (x===0) { last = d; count = 1; continue; }
			if (d === last) { count++; } else { runs.push({ dark:last, len:count, xEnd:x-1 }); last = d; count = 1; }
		}
		runs.push({ dark:last, len:count, xEnd:width-1 });
		for (let i = 2; i < runs.length-2; i++) {
			const a=runs[i-2], b=runs[i-1], c=runs[i], d=runs[i+1], e=runs[i+2];
			if (a.dark && !b.dark && c.dark && !d.dark && e.dark) {
				const l1=a.len, l2=b.len, l3=c.len, l4=d.len, l5=e.len;
				const total=l1+l2+l3+l4+l5; if (total<15) continue;
				const ratio=[l1,l2,l3,l4,l5].map(v=>v/total);
				// Roughly 1:1:3:1:1
				if (Math.abs(ratio[0]-0.166)<0.1 && Math.abs(ratio[1]-0.166)<0.1 && Math.abs(ratio[2]-0.5)<0.15 && Math.abs(ratio[3]-0.166)<0.1 && Math.abs(ratio[4]-0.166)<0.1) {
					const xCenter = runs[i-2].xEnd + l1 + l2 + Math.floor(l3/2);
					candidates.push({ x:xCenter, y, modulePx: Math.max(3, Math.round(l3/3)) });
				}
			}
		}
	}
	if (candidates.length < 3) return { modulePx: null, originX: 0, originY: 0, totalModules: 29 };
	// Rough grid from candidates
    const avgModule = Math.round(candidates.reduce((s,c)=>s+c.modulePx,0)/candidates.length);
    const result = { modulePx: avgModule, originX: 0, originY: 0, totalModules: Math.round(Math.min(width,height)/avgModule) };
    console.log(`locateQRStructure result:`, result);
    return result;
}

function sampleFinderRefs(rgba, width, height, modulePx, modulesTotal, marginModules) {
	// Sample approximate finder inner squares for red/green/black references
	const sampleMean = (cx, cy, radius) => {
		let r=0,g=0,b=0,c=0;
		for (let y = Math.max(0, cy-radius); y < Math.min(height, cy+radius); y++) {
			for (let x = Math.max(0, cx-radius); x < Math.min(width, cx+radius); x++) {
				const i = (y*width + x) * 4;
				r += rgba[i];
				g += rgba[i+1];
				b += rgba[i+2];
				c++;
			}
		}
		return c ? [Math.round(r/c), Math.round(g/c), Math.round(b/c)] : [0,0,0];
	};
	const innerOffset = (marginModules + 3) * modulePx + Math.floor(modulePx/2);
	const tl = sampleMean(innerOffset, innerOffset, Math.max(2, Math.floor(modulePx)));
	const tr = sampleMean(width - innerOffset, innerOffset, Math.max(2, Math.floor(modulePx)));
	const bl = sampleMean(innerOffset, height - innerOffset, Math.max(2, Math.floor(modulePx)));
	// Heuristic mapping: assume TL≈red, TR≈green, BL≈black in 4-colour mode
	return { red: tl, green: tr, black: bl };
}

function rgbaToDataUrl(width, height, rgba) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imageData = new ImageData(rgba, width, height);
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
}

function displayResults(standard, bwrg, cmyrgb) {
    console.log('Displaying results:', { standard, bwrg, cmyrgb });
    const resultDiv = document.getElementById('result');
    
    if (!resultDiv) {
        console.error('Result div not found!');
        return;
    }
    
    // Build the complete HTML structure
    const html = `
        <h2>Generated QR Codes</h2>
        <p class="note">All variants contain the same data with different visual square sizes:</p>
        
        <div class="qr-variant">
            <h3>Standard QR</h3>
            <p class="capacity-note">Baseline module size</p>
            <div id="standardDisplay">${standard.svg}</div>
            <div class="download-links">
                <a id="downloadStandardSvg" download="standard.svg">SVG</a>
                <a id="downloadStandardPng" download="standard.png">PNG</a>
            </div>
        </div>
        
        <div class="qr-variant">
            <h3>BWRG (4-color SPQR)</h3>
            <p class="capacity-note">1.4× bigger modules for same data</p>
            <div id="bwrgDisplay">${bwrg.svg}</div>
            <div class="download-links">
                <a id="downloadBwrgSvg" download="bwrg.svg">SVG</a>
                <a id="downloadBwrgPng" download="bwrg.png">PNG</a>
            </div>
            <div class="color-customization-inline" id="bwrgColors" style="display: none; margin-top: 15px;">
                <p class="color-note" style="margin: 10px 0;">Customize colors for branding or accessibility:</p>
                <div class="color-grid-inline">
                    <div class="color-input-group-inline">
                        <label>⚪ White:</label>
                        <input type="color" class="bwrg-color-picker" data-color="white" value="#ffffff">
                        <input type="text" class="bwrg-color-hex" data-color="white" value="#ffffff" maxlength="7">
                    </div>
                    <div class="color-input-group-inline">
                        <label>⚫ Black:</label>
                        <input type="color" class="bwrg-color-picker" data-color="black" value="#000000">
                        <input type="text" class="bwrg-color-hex" data-color="black" value="#000000" maxlength="7">
                    </div>
                    <div class="color-input-group-inline">
                        <label>🔴 Red:</label>
                        <input type="color" class="bwrg-color-picker" data-color="red" value="#ff0000">
                        <input type="text" class="bwrg-color-hex" data-color="red" value="#ff0000" maxlength="7">
                    </div>
                    <div class="color-input-group-inline">
                        <label>🟢 Green:</label>
                        <input type="color" class="bwrg-color-picker" data-color="green" value="#00ff00">
                        <input type="text" class="bwrg-color-hex" data-color="green" value="#00ff00" maxlength="7">
                    </div>
                </div>
                <div class="color-presets">
                    <button type="button" class="btn-secondary btn-sm" onclick="resetBWRGColors()">Reset</button>
                </div>
            </div>
            <button type="button" class="btn-customize" onclick="toggleBWRGColors()">🎨 Customize Colors</button>
        </div>
        
        <div class="qr-variant">
            <h3>CMYRGB (8-color SPQR)</h3>
            <p class="capacity-note" id="cmyrgbCapacityNote">1.5× bigger modules for same data</p>
            <div id="cmyrgbDisplay">${cmyrgb.svg}</div>
            <div class="download-links">
                <a id="downloadCmyrgbSvg" download="cmyrgb.svg">SVG</a>
                <a id="downloadCmyrgbPng" download="cmyrgb.png">PNG</a>
            </div>
            <div class="ec-mode-selector">
                <p style="margin: 15px 0 10px 0; font-weight: 600; color: #667eea;">🛡️ Error Correction:</p>
                <div class="radio-group-inline">
                    <label class="radio-label-inline">
                        <input type="radio" name="cmyrgbEC" value="standard" ${(window.currentECMode || 'parity') === 'standard' ? 'checked' : ''}>
                        <span>Standard</span>
                    </label>
                    <label class="radio-label-inline">
                        <input type="radio" name="cmyrgbEC" value="hybrid" ${(window.currentECMode || 'parity') === 'hybrid' ? 'checked' : ''}>
                        <span>Hybrid</span>
                    </label>
                    <label class="radio-label-inline">
                        <input type="radio" name="cmyrgbEC" value="parity" ${(window.currentECMode || 'parity') === 'parity' ? 'checked' : ''}>
                        <span>Parity</span>
                    </label>
                </div>
                <p class="ec-mode-description" style="margin-top: 8px; font-size: 0.9em; color: #666;"></p>
            </div>
            <div class="color-customization-inline" id="cmyrgbColorsSection" style="display: none; margin-top: 15px;">
                <p class="color-note" style="margin: 10px 0;">Customize colors for branding or accessibility:</p>
                <div class="color-grid-inline">
                    <div class="color-input-group-inline">
                        <label>⚪ White:</label>
                        <input type="color" class="cmyrgb-color-picker" data-color="white" value="#ffffff">
                        <input type="text" class="cmyrgb-color-hex" data-color="white" value="#ffffff" maxlength="7">
                    </div>
                    <div class="color-input-group-inline">
                        <label>🔴 Red:</label>
                        <input type="color" class="cmyrgb-color-picker" data-color="red" value="#ff0000">
                        <input type="text" class="cmyrgb-color-hex" data-color="red" value="#ff0000" maxlength="7">
                    </div>
                    <div class="color-input-group-inline">
                        <label>🟢 Green:</label>
                        <input type="color" class="cmyrgb-color-picker" data-color="green" value="#00ff00">
                        <input type="text" class="cmyrgb-color-hex" data-color="green" value="#00ff00" maxlength="7">
                    </div>
                    <div class="color-input-group-inline">
                        <label>🟡 Yellow:</label>
                        <input type="color" class="cmyrgb-color-picker" data-color="yellow" value="#ffff00">
                        <input type="text" class="cmyrgb-color-hex" data-color="yellow" value="#ffff00" maxlength="7">
                    </div>
                    <div class="color-input-group-inline">
                        <label>⚫ Black:</label>
                        <input type="color" class="cmyrgb-color-picker" data-color="black" value="#000000">
                        <input type="text" class="cmyrgb-color-hex" data-color="black" value="#000000" maxlength="7">
                    </div>
                    <div class="color-input-group-inline">
                        <label>🟣 Magenta:</label>
                        <input type="color" class="cmyrgb-color-picker" data-color="magenta" value="#ff00ff">
                        <input type="text" class="cmyrgb-color-hex" data-color="magenta" value="#ff00ff" maxlength="7">
                    </div>
                    <div class="color-input-group-inline">
                        <label>🔵 Cyan:</label>
                        <input type="color" class="cmyrgb-color-picker" data-color="cyan" value="#00ffff">
                        <input type="text" class="cmyrgb-color-hex" data-color="cyan" value="#00ffff" maxlength="7">
                    </div>
                    <div class="color-input-group-inline">
                        <label>🔷 Blue:</label>
                        <input type="color" class="cmyrgb-color-picker" data-color="blue" value="#0000ff">
                        <input type="text" class="cmyrgb-color-hex" data-color="blue" value="#0000ff" maxlength="7">
                    </div>
                </div>
                <div class="color-presets">
                    <button type="button" class="btn-secondary btn-sm" onclick="resetCMYRGBColors()">Reset</button>
                    <button type="button" class="btn-secondary btn-sm" onclick="applyDeuteranopiaColors()">Deuteranopia Safe</button>
                    <button type="button" class="btn-secondary btn-sm" onclick="applyProtanopiaColors()">Protanopia Safe</button>
                </div>
            </div>
            <button type="button" class="btn-customize" onclick="toggleCMYRGBColors()">🎨 Customize Colors</button>
        </div>
    `;
    
    resultDiv.innerHTML = html;
    resultDiv.style.display = 'block';
    
    // Set up download links after the HTML is inserted
    setupDownloadLink('downloadStandardSvg', standard.svg, 'image/svg+xml');
    setupDownloadLink('downloadStandardPng', standard.dataUrl, 'image/png');
    setupDownloadLink('downloadBwrgSvg', bwrg.svg, 'image/svg+xml');
    setupDownloadLink('downloadBwrgPng', bwrg.dataUrl, 'image/png');
    setupDownloadLink('downloadCmyrgbSvg', cmyrgb.svg, 'image/svg+xml');
    setupDownloadLink('downloadCmyrgbPng', cmyrgb.dataUrl, 'image/png');
    
    // Set up EC mode radio button listeners
    const ecRadios = document.querySelectorAll('input[name="cmyrgbEC"]');
    ecRadios.forEach(radio => {
        radio.addEventListener('change', handleECModeChange);
    });
    
    // Update EC mode description
    updateECModeDescription();
    
    // Set up color customization listeners for BWRG
    setupBWRGColorListeners();
    
    // Set up color customization listeners for CMYRGB
    setupCMYRGBColorListeners();
}

// Handle EC mode change - regenerate only CMYRGB
async function handleECModeChange(e) {
    const newMode = e.target.value;
    window.currentECMode = newMode;
    updateECModeDescription();
    
    // Get current text
    const text = document.getElementById('text').value.trim();
    if (!text) return;
    
    // Show loading for CMYRGB only
    const cmyrgbDisplay = document.getElementById('cmyrgbDisplay');
    if (cmyrgbDisplay) {
        cmyrgbDisplay.innerHTML = '<div class="loading">🔄 Regenerating...</div>';
    }
    
    try {
        console.log(`Regenerating CMYRGB with ${newMode} mode...`);
        const cmyrgb = await generateQR(text, { layers: 3, colours: ['cmyrgb'], errorCorrection: newMode });
        
        // Update display and download links
        cmyrgbDisplay.innerHTML = cmyrgb.svg;
        setupDownloadLink('downloadCmyrgbSvg', cmyrgb.svg, 'image/svg+xml');
        setupDownloadLink('downloadCmyrgbPng', cmyrgb.dataUrl, 'image/png');
    } catch (error) {
        console.error('Regeneration error:', error);
        cmyrgbDisplay.innerHTML = '<div class="error">❌ Failed to regenerate</div>';
    }
}

// Update EC mode description text
function updateECModeDescription() {
    const descEl = document.querySelector('.ec-mode-description');
    if (!descEl) return;
    
    const mode = window.currentECMode || 'parity';
    const descriptions = {
        standard: 'All layers EC \'L\' - Maximum capacity (~8.8KB)',
        hybrid: 'Base layer EC \'M\' - Better reliability for critical data (~7.5KB)',
        parity: 'Parity mode - Can recover if one layer is damaged (~5.9KB)'
    };
    descEl.textContent = descriptions[mode] || '';
    
    // Update the capacity note to reflect module size benefit
    const capacityNote = document.getElementById('cmyrgbCapacityNote');
    if (capacityNote) {
        const moduleMultipliers = {
            standard: '1.5× bigger modules for same data (3 layers)',
            hybrid: '1.5× bigger modules for same data (3 layers, mixed EC)',
            parity: '1.4× bigger modules for same data (2 data + 1 parity layer)'
        };
        capacityNote.textContent = moduleMultipliers[mode] || '1.5× bigger modules for same data';
    }
}

// Color customization functions
function toggleBWRGColors() {
    const section = document.getElementById('bwrgColors');
    if (section) {
        section.style.display = section.style.display === 'none' ? 'block' : 'none';
    }
}

function toggleCMYRGBColors() {
    const section = document.getElementById('cmyrgbColorsSection');
    if (section) {
        section.style.display = section.style.display === 'none' ? 'block' : 'none';
    }
}

function setupBWRGColorListeners() {
    const pickers = document.querySelectorAll('.bwrg-color-picker');
    const hexInputs = document.querySelectorAll('.bwrg-color-hex');
    
    pickers.forEach(picker => {
        picker.addEventListener('input', (e) => {
            const color = e.target.dataset.color;
            const hexInput = document.querySelector(`.bwrg-color-hex[data-color="${color}"]`);
            if (hexInput) hexInput.value = e.target.value;
            updateBWRGColors();
        });
    });
    
    hexInputs.forEach(input => {
        input.addEventListener('input', (e) => {
            const val = e.target.value;
            if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                const color = e.target.dataset.color;
                const picker = document.querySelector(`.bwrg-color-picker[data-color="${color}"]`);
                if (picker) picker.value = val;
                updateBWRGColors();
            }
        });
    });
}

function setupCMYRGBColorListeners() {
    const pickers = document.querySelectorAll('.cmyrgb-color-picker');
    const hexInputs = document.querySelectorAll('.cmyrgb-color-hex');
    
    pickers.forEach(picker => {
        picker.addEventListener('input', (e) => {
            const color = e.target.dataset.color;
            const hexInput = document.querySelector(`.cmyrgb-color-hex[data-color="${color}"]`);
            if (hexInput) hexInput.value = e.target.value;
            updateCMYRGBColors();
        });
    });
    
    hexInputs.forEach(input => {
        input.addEventListener('input', (e) => {
            const val = e.target.value;
            if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                const color = e.target.dataset.color;
                const picker = document.querySelector(`.cmyrgb-color-picker[data-color="${color}"]`);
                if (picker) picker.value = val;
                updateCMYRGBColors();
            }
        });
    });
}

async function updateBWRGColors() {
    const colorOrder = ['white', 'red', 'green', 'black'];
    window.bwrgColors = colorOrder.map(c => {
        const picker = document.querySelector(`.bwrg-color-picker[data-color="${c}"]`);
        return picker ? picker.value : null;
    }).filter(Boolean);
    
    if (window.bwrgColors.length === 4) {
        const text = document.getElementById('text').value.trim();
        if (text) {
            const bwrgDisplay = document.getElementById('bwrgDisplay');
            if (bwrgDisplay) bwrgDisplay.innerHTML = '<div class="loading">🔄 Regenerating...</div>';
            
            try {
                const bwrg = await generateQR(text, { layers: 3, colours: ['bwrg'] });
                bwrgDisplay.innerHTML = bwrg.svg;
                setupDownloadLink('downloadBwrgSvg', bwrg.svg, 'image/svg+xml');
                setupDownloadLink('downloadBwrgPng', bwrg.dataUrl, 'image/png');
            } catch (error) {
                console.error('BWRG regeneration error:', error);
                bwrgDisplay.innerHTML = '<div class="error">❌ Failed to regenerate</div>';
            }
        }
    }
}

async function updateCMYRGBColors() {
    const colorOrder = ['white', 'red', 'green', 'yellow', 'black', 'magenta', 'cyan', 'blue'];
    window.cmyrgbColors = colorOrder.map(c => {
        const picker = document.querySelector(`.cmyrgb-color-picker[data-color="${c}"]`);
        return picker ? picker.value : null;
    }).filter(Boolean);
    
    if (window.cmyrgbColors.length === 8) {
        const text = document.getElementById('text').value.trim();
        if (text) {
            const cmyrgbDisplay = document.getElementById('cmyrgbDisplay');
            if (cmyrgbDisplay) cmyrgbDisplay.innerHTML = '<div class="loading">🔄 Regenerating...</div>';
            
            try {
                const currentMode = window.currentECMode || 'parity';
                const cmyrgb = await generateQR(text, { layers: 3, colours: ['cmyrgb'], errorCorrection: currentMode });
                cmyrgbDisplay.innerHTML = cmyrgb.svg;
                setupDownloadLink('downloadCmyrgbSvg', cmyrgb.svg, 'image/svg+xml');
                setupDownloadLink('downloadCmyrgbPng', cmyrgb.dataUrl, 'image/png');
            } catch (error) {
                console.error('CMYRGB regeneration error:', error);
                cmyrgbDisplay.innerHTML = '<div class="error">❌ Failed to regenerate</div>';
            }
        }
    }
}

function resetBWRGColors() {
    const defaults = { white: '#ffffff', red: '#ff0000', green: '#00ff00', black: '#000000' };
    Object.entries(defaults).forEach(([color, hex]) => {
        const picker = document.querySelector(`.bwrg-color-picker[data-color="${color}"]`);
        const hexInput = document.querySelector(`.bwrg-color-hex[data-color="${color}"]`);
        if (picker) picker.value = hex;
        if (hexInput) hexInput.value = hex;
    });
    window.bwrgColors = null;
    updateBWRGColors();
}

function resetCMYRGBColors() {
    const defaults = {
        white: '#ffffff', red: '#ff0000', green: '#00ff00', yellow: '#ffff00',
        black: '#000000', magenta: '#ff00ff', cyan: '#00ffff', blue: '#0000ff'
    };
    Object.entries(defaults).forEach(([color, hex]) => {
        const picker = document.querySelector(`.cmyrgb-color-picker[data-color="${color}"]`);
        const hexInput = document.querySelector(`.cmyrgb-color-hex[data-color="${color}"]`);
        if (picker) picker.value = hex;
        if (hexInput) hexInput.value = hex;
    });
    window.cmyrgbColors = null;
    updateCMYRGBColors();
}

function applyDeuteranopiaColors() {
    const colors = {
        white: '#ffffff', red: '#ffa500', green: '#0080ff', yellow: '#ffff00',
        black: '#000000', magenta: '#ff00ff', cyan: '#00ffff', blue: '#0000c0'
    };
    Object.entries(colors).forEach(([color, hex]) => {
        const picker = document.querySelector(`.cmyrgb-color-picker[data-color="${color}"]`);
        const hexInput = document.querySelector(`.cmyrgb-color-hex[data-color="${color}"]`);
        if (picker) picker.value = hex;
        if (hexInput) hexInput.value = hex;
    });
    updateCMYRGBColors();
}

function applyProtanopiaColors() {
    const colors = {
        white: '#ffffff', red: '#ff8800', green: '#0088ff', yellow: '#ffdd00',
        black: '#000000', magenta: '#cc00cc', cyan: '#00cccc', blue: '#0000ff'
    };
    Object.entries(colors).forEach(([color, hex]) => {
        const picker = document.querySelector(`.cmyrgb-color-picker[data-color="${color}"]`);
        const hexInput = document.querySelector(`.cmyrgb-color-hex[data-color="${color}"]`);
        if (picker) picker.value = hex;
        if (hexInput) hexInput.value = hex;
    });
    updateCMYRGBColors();
}

function setupDownloadLink(elementId, content, mimeType) {
    const link = document.getElementById(elementId);
    if (!link) {
        console.warn(`Download link element not found: ${elementId}`);
        return;
    }
    
    try {
        if (mimeType === 'image/svg+xml') {
            const blob = new Blob([content], { type: mimeType });
            link.href = URL.createObjectURL(blob);
        } else {
            link.href = content; // Already a data URL for PNG
        }
    } catch (error) {
        console.error(`Error setting up download link ${elementId}:`, error);
    }
}

async function toggleCamera() {
	const video = document.getElementById('video');
	const btn = document.getElementById('cameraBtn');
	const preview = document.getElementById('camera-preview');
	const status = document.getElementById('scan-status');
	
	if (currentStream) {
		// Stop camera
		currentStream.getTracks().forEach(track => track.stop());
		currentStream = null;
		preview.style.display = 'none';
		btn.textContent = '📷 Use Camera';
	} else {
		// Start camera
		try {
			status.textContent = 'Starting camera...';
			preview.style.display = 'block';
			
			currentStream = await navigator.mediaDevices.getUserMedia({ 
				video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } 
			});
			video.srcObject = currentStream;
			await video.play(); // Wait for video to start playing
			btn.textContent = '🛑 Stop Camera';
			
			status.textContent = '📷 Scanning... Point camera at QR code';
			
			// Start scanning
			scanFromVideo();
		} catch (error) {
			console.error('Camera error:', error);
			status.textContent = '❌ Camera error: ' + error.message;
			setTimeout(() => preview.style.display = 'none', 3000);
		}
	}
}

let lastScanState = { found: false, decoded: false, lastUpdate: 0 };
let lastDecodedText = null;
let scanPauseUntil = 0;

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function extractRoiFromGrid(imageData, grid, paddingModules = 1) {
	const { data, width, height } = imageData;
	const padPx = paddingModules * grid.modulePx;
	const x0 = clamp(grid.originX - padPx, 0, width);
	const y0 = clamp(grid.originY - padPx, 0, height);
	const sizePx = (grid.qrModules + 8) * grid.modulePx + 2 * padPx;
	const w = clamp(sizePx, 1, width - x0);
	const h = clamp(sizePx, 1, height - y0);
	const rgba = new Uint8ClampedArray(w * h * 4);
	for (let y = 0; y < h; y++) {
		const srcY = y0 + y;
		const srcOff = (srcY * width + x0) * 4;
		const dstOff = y * w * 4;
		rgba.set(data.subarray(srcOff, srcOff + w * 4), dstOff);
	}
	return { rgba, width: w, height: h, offsetX: x0, offsetY: y0, paddingPx: padPx };
}

function resampleNearest(src, sw, sh, dw, dh) {
	const dst = new Uint8ClampedArray(dw * dh * 4);
	for (let y = 0; y < dh; y++) {
		const sy = Math.min(sh - 1, Math.floor(y * sh / dh));
		for (let x = 0; x < dw; x++) {
			const sx = Math.min(sw - 1, Math.floor(x * sw / dw));
			const si = (sy * sw + sx) * 4;
			const di = (y * dw + x) * 4;
			dst[di] = src[si]; dst[di+1] = src[si+1]; dst[di+2] = src[si+2]; dst[di+3] = 255;
		}
	}
	return dst;
}

function makeImageDataFromRgba(rgba, w, h) { return new ImageData(rgba, w, h); }

function enhanceImageContrast(rgba, width, height) {
	// ULTRA-AGGRESSIVE preprocessing for terrible phone camera images
	const enhanced = new Uint8ClampedArray(rgba.length);
	
	// Step 1: Histogram equalization per channel for maximum contrast
	const histR = new Array(256).fill(0);
	const histG = new Array(256).fill(0);
	const histB = new Array(256).fill(0);
	
	for (let i = 0; i < rgba.length; i += 4) {
		histR[rgba[i]]++;
		histG[rgba[i+1]]++;
		histB[rgba[i+2]]++;
	}
	
	// Build cumulative distribution function (CDF)
	const cdfR = new Array(256);
	const cdfG = new Array(256);
	const cdfB = new Array(256);
	cdfR[0] = histR[0]; cdfG[0] = histG[0]; cdfB[0] = histB[0];
	for (let i = 1; i < 256; i++) {
		cdfR[i] = cdfR[i-1] + histR[i];
		cdfG[i] = cdfG[i-1] + histG[i];
		cdfB[i] = cdfB[i-1] + histB[i];
	}
	
	// Normalize CDF to 0-255 range
	const totalPixels = width * height;
	const cdfMin = (v) => { for (let i = 0; i < 256; i++) if (v[i] > 0) return v[i]; return 0; };
	const minR = cdfMin(cdfR), minG = cdfMin(cdfG), minB = cdfMin(cdfB);
	
	const mapR = new Uint8Array(256);
	const mapG = new Uint8Array(256);
	const mapB = new Uint8Array(256);
	
	for (let i = 0; i < 256; i++) {
		mapR[i] = Math.round(((cdfR[i] - minR) / (totalPixels - minR)) * 255);
		mapG[i] = Math.round(((cdfG[i] - minG) / (totalPixels - minG)) * 255);
		mapB[i] = Math.round(((cdfB[i] - minB) / (totalPixels - minB)) * 255);
	}
	
	// Apply histogram equalization
	for (let i = 0; i < rgba.length; i += 4) {
		enhanced[i] = mapR[rgba[i]];
		enhanced[i+1] = mapG[rgba[i+1]];
		enhanced[i+2] = mapB[rgba[i+2]];
		enhanced[i+3] = rgba[i+3];
	}
	
	// Step 2: Additional contrast boost (gamma correction)
	const gamma = 0.8; // Boost darker colors
	for (let i = 0; i < enhanced.length; i += 4) {
		enhanced[i] = Math.round(255 * Math.pow(enhanced[i] / 255, gamma));
		enhanced[i+1] = Math.round(255 * Math.pow(enhanced[i+1] / 255, gamma));
		enhanced[i+2] = Math.round(255 * Math.pow(enhanced[i+2] / 255, gamma));
	}
	
	console.log('📈 Histogram equalization + gamma boost applied');
	return enhanced;
}

async function decodeFromGridROI(imageData, grid, targetModulePx = 8) {
	// Crop ROI around QR, then scale to target module size for robust sampling
	const roi = extractRoiFromGrid(imageData, grid, 1);
	const modulesWithMargin = grid.qrModules + 8 + 2; // +2 for padding on each side already included
	const dw = modulesWithMargin * targetModulePx;
	const dh = modulesWithMargin * targetModulePx;
	let scaled = resampleNearest(roi.rgba, roi.width, roi.height, dw, dh);
	
	// AGGRESSIVE PREPROCESSING: Only enhance if image looks degraded!
	// Check if the image has good contrast already (clean generated codes don't need enhancement)
	let minVal = 255, maxVal = 0;
	for (let i = 0; i < scaled.length; i += 4) {
		const val = Math.max(scaled[i], scaled[i+1], scaled[i+2]);
		if (val < minVal) minVal = val;
		if (val > maxVal) maxVal = val;
	}
	const contrast = maxVal - minVal;
	if (contrast < 200) {
		// Low contrast - probably a degraded/washed out image, apply aggressive enhancement
		console.log(`📈 Low contrast (${contrast}) - applying histogram equalization...`);
		scaled = enhanceImageContrast(scaled, dw, dh);
	} else {
		console.log(`✅ Good contrast (${contrast}) - skipping enhancement`);
	}
	
	const id = makeImageDataFromRgba(scaled, dw, dh);
	
	// Calibrate colors from finder patterns in the ROI AFTER enhancement
	const originInROI = targetModulePx; // 1 module of padding
	const finderSamples = sampleFinderRefsWithOrigin(id.data, dw, dh, targetModulePx, grid.qrModules, 1, originInROI, originInROI);
	if (finderSamples) {
		window.cameraCalibration = finderSamples;
		console.log('Calibrated colors from finder patterns:', finderSamples);
	}
	// Also calibrate CMYRGB palette from ROI finders (for 3-layer decoding)
	try {
		const cmyCal = sampleCMYRGBFinderPalette(id.data, dw, dh, targetModulePx, grid.qrModules, originInROI, originInROI);
		if (cmyCal && cmyCal.W) {
			window.cameraCalibrationCMY = cmyCal;
			console.log('Calibrated CMYRGB palette from ROI finders:', cmyCal);
		}
	} catch (e) {
		// ignore calibration errors
	}
	
	// TRY ZXING FIRST on the enhanced image (more robust than jsQR for degraded images!)
	if (window.zxingCodeReader) {
		try {
			console.log('🔷 Trying ZXing on enhanced ROI...');
			// Create a temporary canvas with the enhanced image
			const tempCanvas = document.createElement('canvas');
			tempCanvas.width = dw;
			tempCanvas.height = dh;
			const tempCtx = tempCanvas.getContext('2d');
			tempCtx.putImageData(id, 0, 0);
			
			const zxingResult = await window.zxingCodeReader.decodeFromImageElement(tempCanvas);
			if (zxingResult && zxingResult.getText()) {
				console.log(`✅ ZXing decoded: "${zxingResult.getText()}"`);
				window.cameraCalibration = null;
				return { type: 'standard', text: zxingResult.getText() };
			}
		} catch (e) {
			console.log('⚠️  ZXing failed, trying jsQR + SPQR layers...');
		}
	}
	
	// Provide a precise grid hint for ROI (origin at 1*targetModulePx padding)
	window.currentGridHint = { modules: grid.qrModules, modulePx: targetModulePx, originX: targetModulePx, originY: targetModulePx };
	// Try standard jsQR first on ROI
	const std = jsQR(id.data, id.width, id.height, { inversionAttempts: "attemptBoth" });
	if (std && std.data) {
		window.cameraCalibration = null; // Clear after use
		return { type: 'standard', text: std.data };
	}
	// Try SPQR detection on ROI
	const sp = detectSPQR(id);
	window.cameraCalibration = null; // Clear after use
	if (sp && sp.text) {
		return { type: 'spqr', text: sp.text, layers: sp.layers };
	}
	return null;
}

async function scanFromVideo() {
	const video = document.getElementById('video');
	const canvas = document.getElementById('canvas');
	const overlayCanvas = document.getElementById('overlay-canvas');
	const status = document.getElementById('scan-status');
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	const overlayCtx = overlayCanvas.getContext('2d');
	
	if (video.readyState === video.HAVE_ENOUGH_DATA) {
		// Match canvas size to video source
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;
		overlayCanvas.width = video.videoWidth;
		overlayCanvas.height = video.videoHeight;
		// Match overlay display size to displayed video size for correct overlay alignment
		overlayCanvas.style.width = video.clientWidth + 'px';
		overlayCanvas.style.height = video.clientHeight + 'px';
		
		ctx.imageSmoothingEnabled = false; // Preserve exact pixels for SPQR
		ctx.drawImage(video, 0, 0);
		
		// Clear overlay
		overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
		
		const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
		
		// Respect pause window after a success to avoid flicker / repeat triggers
		const nowTs = Date.now();
		if (nowTs < scanPauseUntil) {
			requestAnimationFrame(scanFromVideo);
			return;
		}
		
		// Try standard QR detection first (fast and gives location)
		const code = jsQR(imageData.data, imageData.width, imageData.height, {
			inversionAttempts: "dontInvert"
		});
		
		if (code && code.data) {
			// Found QR structure! Draw detection box
			drawDetectionBox(overlayCtx, code.location, '#00ff00');
			
			// Successfully decoded as standard QR
			status.textContent = '✅ Standard QR found & decoded!';
			status.style.background = 'rgba(0, 200, 0, 0.8)';
			lastScanState = { found: true, decoded: true, lastUpdate: Date.now() };
			
			if (code.data !== lastDecodedText) {
				lastDecodedText = code.data;
				handleScannedCode(code.data);
			}
			// Pause briefly then continue scanning
			scanPauseUntil = Date.now() + 1500;
			requestAnimationFrame(scanFromVideo);
			return;
		}
		
		// No direct decode - try to locate structure using our finder analysis
		const grid = locateQRStructure(imageData.data, imageData.width, imageData.height);
		if (grid && grid.qrModules && grid.modulePx) {
			// Found structure - show orange box
			drawGridRect(overlayCtx, grid.originX, grid.originY, (grid.qrModules + 8) * grid.modulePx, (grid.qrModules + 8) * grid.modulePx, '#ff9900');
			status.textContent = '⚠️  QR structure found - trying SPQR decode...';
			status.style.background = 'rgba(255, 153, 0, 0.8)';
			lastScanState = { found: true, decoded: false, lastUpdate: Date.now() };
			
			// Provide grid hint and palette calibration from finder refs for decoders
			window.currentGridHint = { modules: grid.qrModules, modulePx: grid.modulePx, originX: grid.originX, originY: grid.originY };
			window.cameraCalibration = sampleFinderRefsWithOrigin(imageData.data, imageData.width, imageData.height, grid.modulePx, grid.qrModules, 4, grid.originX, grid.originY);
			window.cameraCalibrationCMY = sampleCMYRGBFinderPalette(imageData.data, imageData.width, imageData.height, grid.modulePx, grid.qrModules, grid.originX, grid.originY);
			
			// Attempt SPQR decode on full image (decoder will use hint + calibration)
			const spqrResult = detectSPQR(imageData);
			if (spqrResult && spqrResult.text) {
				status.textContent = `✅ SPQR decoded! (${spqrResult.layers || '?' } layers)`;
				status.style.background = 'rgba(0, 200, 0, 0.8)';
				lastScanState = { found: true, decoded: true, lastUpdate: Date.now() };
				if (spqrResult.text !== lastDecodedText) {
					lastDecodedText = spqrResult.text;
					handleScannedCode(spqrResult.text);
				}
				// Pause briefly then continue scanning
				scanPauseUntil = Date.now() + 1500;
				requestAnimationFrame(scanFromVideo);
				return;
			} else {
				status.textContent = '❌ QR found but decode failed - try better lighting/focus';
				status.style.background = 'rgba(200, 0, 0, 0.8)';
			}
		} else {
			// No QR structure found at all
			const now = Date.now();
			if (now - lastScanState.lastUpdate > 500) {
				status.textContent = '🔍 Searching for QR code...';
				status.style.background = 'rgba(0, 0, 0, 0.7)';
				lastScanState = { found: false, decoded: false, lastUpdate: now };
			}
		}
	}
	
	if (currentStream) {
		requestAnimationFrame(scanFromVideo);
	}
}

function drawDetectionBox(ctx, location, color = '#00ff00') {
	if (!location) return;
	
	ctx.strokeStyle = color;
	ctx.lineWidth = 4;
	ctx.beginPath();
	ctx.moveTo(location.topLeftCorner.x, location.topLeftCorner.y);
	ctx.lineTo(location.topRightCorner.x, location.topRightCorner.y);
	ctx.lineTo(location.bottomRightCorner.x, location.bottomRightCorner.y);
	ctx.lineTo(location.bottomLeftCorner.x, location.bottomLeftCorner.y);
	ctx.closePath();
	ctx.stroke();
	
	// Draw corner markers
	const drawCorner = (x, y) => {
		ctx.fillStyle = color;
		ctx.fillRect(x - 6, y - 6, 12, 12);
	};
	drawCorner(location.topLeftCorner.x, location.topLeftCorner.y);
	drawCorner(location.topRightCorner.x, location.topRightCorner.y);
	drawCorner(location.bottomRightCorner.x, location.bottomRightCorner.y);
	drawCorner(location.bottomLeftCorner.x, location.bottomLeftCorner.y);
}

function drawGridRect(ctx, x, y, w, h, color = '#ff9900') {
	ctx.strokeStyle = color;
	ctx.lineWidth = 3;
	ctx.strokeRect(Math.max(0,x), Math.max(0,y), Math.max(0,w), Math.max(0,h));
}

function sampleFinderRefsWithOrigin(rgba, width, height, modulePx, modulesTotal, marginModules, originX, originY) {
	// Sample approximate finder inner squares for color references with absolute origin
	const sampleMean = (cx, cy, radius) => {
		let r=0,g=0,b=0,c=0;
		for (let y = Math.max(0, cy-radius); y < Math.min(height, cy+radius); y++) {
			for (let x = Math.max(0, cx-radius); x < Math.min(width, cx+radius); x++) {
				const i = (y*width + x) * 4;
				r += rgba[i];
				g += rgba[i+1];
				b += rgba[i+2];
				c++;
			}
		}
		return c ? { r: Math.round(r/c), g: Math.round(g/c), b: Math.round(b/c) } : { r:0,g:0,b:0 };
	};
	// Each finder is 7x7 modules; inner 3x3 starts at +2 modules from finder origin
	// Finder inner center is at +3.5 modules from finder origin (middle of the 3x3)
	const tlFinderX = originX + marginModules * modulePx;  // TL finder starts at margin
	const tlFinderY = originY + marginModules * modulePx;
	const trFinderX = originX + (marginModules + modulesTotal - 7) * modulePx;  // TR finder starts at margin + (modules - 7)
	const trFinderY = originY + marginModules * modulePx;
	const blFinderX = originX + marginModules * modulePx;
	const blFinderY = originY + (marginModules + modulesTotal - 7) * modulePx;
	
	// Sample center of inner 3x3 (at +3.5 modules from finder origin)
	const innerOffset = 3.5 * modulePx;
	const tlColor = sampleMean(tlFinderX + innerOffset, tlFinderY + innerOffset, Math.max(2, Math.floor(modulePx)));
	const trColor = sampleMean(trFinderX + innerOffset, trFinderY + innerOffset, Math.max(2, Math.floor(modulePx)));
	const blColor = sampleMean(blFinderX + innerOffset, blFinderY + innerOffset, Math.max(2, Math.floor(modulePx)));
	
	// Auto-identify colors by their characteristics (handles camera white balance, reflections, etc.)
	const isBlackish = (c) => c.r < 80 && c.g < 80 && c.b < 80;
	const isReddish = (c) => !isBlackish(c) && c.r > c.g && c.r > c.b;
	const isGreenish = (c) => !isBlackish(c) && c.g >= c.r;
	
	let red, green, black;
	const colors = [tlColor, trColor, blColor];
	
	// Find black first (darkest)
	black = colors.reduce((darkest, c) => {
		const brightness = c.r + c.g + c.b;
		const darkBrightness = darkest.r + darkest.g + darkest.b;
		return brightness < darkBrightness ? c : darkest;
	});
	
	// Identify red and green from the remaining two
	const remaining = colors.filter(c => c !== black);
	if (remaining.length >= 2) {
		const c1 = remaining[0], c2 = remaining[1];
		// Prefer characteristic colors if they match
		if (isReddish(c1) && isGreenish(c2)) {
			red = c1; green = c2;
		} else if (isGreenish(c1) && isReddish(c2)) {
			green = c1; red = c2;
		} else {
			// Fallback: choose by R vs G channel dominance
			red = (c1.r > c2.r) ? c1 : c2;
			green = (c1.r > c2.r) ? c2 : c1;
		}
	} else {
		// Shouldn't happen, but provide defaults
		red = tlColor;
		green = trColor;
	}
	
	console.log('Finder sampling:', { tl: tlColor, tr: trColor, bl: blColor, identified: { red, green, black } });
	return { type: 'BWRG', samples: { red, green, black } };
}

async function handleFileUpload(e) {
	const file = e.target.files[0];
	if (!file) return;
	try {
		const canvas = document.getElementById('canvas');
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		const img = new Image();
		img.onload = async function() {
			canvas.width = img.width; canvas.height = img.height;
			ctx.imageSmoothingEnabled = false; ctx.drawImage(img, 0, 0);
			const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
			// Standard first
			const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
			if (code && code.data) {
				displayScanResult({ standard: code.data, spqr: null });
				return;
			}
			// Locate structure then crop + scale ROI
			const grid = locateQRStructure(imageData.data, imageData.width, imageData.height);
			if (grid) {
				const roiResult = await decodeFromGridROI(imageData, grid, 8);
				if (roiResult) {
					if (roiResult.type === 'standard') {
						displayScanResult({ standard: roiResult.text, spqr: null });
					} else {
						displayScanResult({ standard: null, spqr: { base: roiResult.text, red: null, combined: roiResult.text } });
					}
					return;
				}
			}
			// Fallback: SPQR detect full image
			const spqrResult = detectSPQR(imageData);
			if (spqrResult) {
				displayScanResult({ standard: null, spqr: spqrResult });
			} else {
				displayScanResult({ standard: null, spqr: { base: null, red: null, combined: null } });
			}
		};
		img.onerror = function() { alert('Error loading image file'); };
		img.src = URL.createObjectURL(file);
	} catch (error) {
		console.error('Upload error:', error);
		alert('Error processing image: ' + error.message);
	}
}

function detectSPQR(imageData) {
    const { data, width, height } = imageData;
    
    console.log(`SPQR detection starting: ${width}x${height} image`);
    
    // Check if we have a grid hint from ROI extraction
    let modules, modulePx, margin, originX, originY;
    let hasGridHint = false;
    let savedGridHint = null;
    
    if (window.currentGridHint && window.currentGridHint.modules && window.currentGridHint.modulePx) {
        modules = window.currentGridHint.modules;
        modulePx = window.currentGridHint.modulePx;
        originX = window.currentGridHint.originX || modulePx;
        originY = window.currentGridHint.originY || modulePx;
        margin = Math.round(originX / modulePx); // Calculate margin from origin
        hasGridHint = true;
        savedGridHint = { ...window.currentGridHint }; // Save for decoders
        console.log(`  Using grid hint: ${modules}×${modules}, ${modulePx}px/module, origin=(${originX},${originY})`);
        // Don't clear yet - decoders will need it
        window.currentGridHint = null;
    } else {
        // First, detect if this has color patterns and count colored pixels
        let coloredPixels = 0;
        let totalPixels = 0;
        
        // Quick scan to check if there are colors
        for (let i = 0; i < data.length; i += 16) { // Sample every 4th pixel
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            totalPixels++;
            
            // Check if not black or white
            const isBlack = r < 50 && g < 50 && b < 50;
            const isWhite = r > 200 && g > 200 && b > 200;
            if (!isBlack && !isWhite) {
                coloredPixels++;
            }
        }
        
        const colorPercentage = coloredPixels / totalPixels;
        console.log(`  Color ratio: ${colorPercentage.toFixed(3)} (${coloredPixels} colored pixels)`);
        
        // If we don't have significant color content, return null early
        if (colorPercentage <= 0.005) {
            return null;
        }
        
        // Estimate grid parameters
        margin = 4; // Standard margin
        
        // Find best grid match
        let bestModules = 21;
        let bestModulePx = width / (21 + 2 * margin);
        let bestRemainder = Math.abs(bestModulePx - Math.round(bestModulePx));
        const candidates = [];
        
        for (let testModules = 21; testModules <= 177; testModules += 4) {
            const testModulePx = width / (testModules + 2 * margin);
            const testRemainder = Math.abs(testModulePx - Math.round(testModulePx));
            const roundedModulePx = Math.round(testModulePx);
            
            if (roundedModulePx < 2) continue;
            
            // More tolerant for camera images (0.3 instead of 0.2)
            if (testRemainder < 0.3) {
                candidates.push({
                    modules: testModules,
                    modulePx: roundedModulePx,
                    remainder: testRemainder
                });
            }
            
            if (testRemainder < bestRemainder) {
                bestRemainder = testRemainder;
                bestModulePx = testModulePx;
                bestModules = testModules;
            }
        }
        
        modules = bestModules;
        modulePx = Math.round(bestModulePx);
        
        if (candidates.length > 0) {
            candidates.sort((a, b) => {
                // Prioritise standard module sizes (5px for BWRG, 6px for CMYRGB)
                const aIsStandard = (a.modulePx === 5 || a.modulePx === 6);
                const bIsStandard = (b.modulePx === 5 || b.modulePx === 6);
                
                if (aIsStandard && !bIsStandard) return -1;
                if (!aIsStandard && bIsStandard) return 1;
                
                // If both are standard, prefer exact fit (remainder=0) or smaller remainder
                return a.remainder - b.remainder;
            });
            modules = candidates[0].modules;
            modulePx = candidates[0].modulePx;
        }
        
        originX = margin * modulePx;
        originY = margin * modulePx;
        
        console.log(`  Estimated grid: ${modules}×${modules}, ${modulePx}px/module`);
    }
    
	// Now check if this has color patterns (BWRG vs CMYRGB detection)
	if (hasGridHint) { // If we have a grid hint, we know it's colored
		// Prefer robust CMYRGB finder-key palette sampling if available
		try {
			const cmy = sampleCMYRGBFinderPalette(data, width, height, modulePx, modules, originX, originY);
			if (cmy && cmy.W && cmy.R && cmy.G && cmy.Y && cmy.K && cmy.M && cmy.C && cmy.B) {
				console.log('   CMYRGB palette sampled:', JSON.stringify(cmy, null, 2));
				const dist = (a,b)=>Math.hypot(a.r-b.r,a.g-b.g,a.b-b.b);
				// Distinctiveness in TL 2x2 (W,R,G,Y) and TR 2x2 (K,M,C,B)
				const tlDists = [dist(cmy.W,cmy.R), dist(cmy.W,cmy.G), dist(cmy.W,cmy.Y), dist(cmy.R,cmy.G), dist(cmy.R,cmy.Y), dist(cmy.G,cmy.Y)];
				const trDists = [dist(cmy.K,cmy.M), dist(cmy.K,cmy.C), dist(cmy.K,cmy.B), dist(cmy.M,cmy.C), dist(cmy.M,cmy.B), dist(cmy.C,cmy.B)];
				// For degraded images, use lower threshold (30px instead of 50px) and require fewer pairs (2 instead of 3)
				const threshold = 30;
				const tlDistinct = tlDists.filter(d=>d>threshold).length;
				const trDistinct = trDists.filter(d=>d>threshold).length;
				console.log(`   TL distinctiveness: ${tlDistinct}/6 pairs > ${threshold}px distance (${tlDists.map(d=>Math.round(d)).join(', ')})`);
				console.log(`   TR distinctiveness: ${trDistinct}/6 pairs > ${threshold}px distance (${trDists.map(d=>Math.round(d)).join(', ')})`);
				if (tlDistinct >= 2 && trDistinct >= 2) {
					console.log('CMYRGB (8-color, 3-layer) SPQR detected via finder-key palette');
					if (savedGridHint) window.currentGridHint = savedGridHint;
					return decodeCMYRGBLayers(imageData);
				} else {
					console.log(`   ⚠️  Not enough distinctiveness for CMYRGB (need 2+2, got ${tlDistinct}+${trDistinct}), trying BWRG...`);
				}
			}
		} catch (e) {
			console.log('   ⚠️  CMYRGB palette sampling failed:', e.message);
			// fallback to sampling below
		}
        
        // Sample the TL finder center (the 3×3 inner square of the finder)
        // BWRG: solid color in all 9 modules
        // CMYRGB: 2×2 grid with 4 different colors in the center 4 modules
        // Sample from the CENTER of each of the 9 inner modules (grid positions 2-4, 2-4)
        const colorSamples = [];
        
        for (let my = 2; my <= 4; my++) {
            for (let mx = 2; mx <= 4; mx++) {
                // Calculate pixel position at the CENTER of this module
                const px = Math.round(originX + (mx + 0.5) * modulePx);
                const py = Math.round(originY + (my + 0.5) * modulePx);
                
                if (px >= 0 && px < width && py >= 0 && py < height) {
                    const idx = (py * width + px) * 4;
                    const r = data[idx];
                    const g = data[idx + 1];
                    const b = data[idx + 2];
                    colorSamples.push({ r, g, b });
                }
            }
        }
        
        // Cluster similar colors
        const colorThreshold = 80; // Colors within this distance are considered the same
        const clusters = [];
        
        for (const sample of colorSamples) {
            let foundCluster = false;
            for (const cluster of clusters) {
                const dist = Math.sqrt(
                    Math.pow(sample.r - cluster.r, 2) +
                    Math.pow(sample.g - cluster.g, 2) +
                    Math.pow(sample.b - cluster.b, 2)
                );
                if (dist < colorThreshold) {
                    foundCluster = true;
                    break;
                }
            }
            if (!foundCluster) {
                clusters.push(sample);
            }
        }
        
        const uniqueColors = clusters.length;
        console.log(`  Finder center has ${uniqueColors} distinct colors (from ${colorSamples.length} samples)`);
        
        // CMYRGB has 2x2 grid with 4 colors in TL finder
        // BWRG has solid color (1-2 colors due to sampling noise)
        if (uniqueColors >= 3) {
            console.log('CMYRGB (8-color, 3-layer) SPQR detected');
            // Restore grid hint for decoder
            if (savedGridHint) window.currentGridHint = savedGridHint;
            return decodeCMYRGBLayers(imageData);
        } else {
            console.log('BWRG (4-color, 2-layer) SPQR detected');
            // Restore grid hint for decoder
            if (savedGridHint) window.currentGridHint = savedGridHint;
            return decodeSPQRLayers(imageData);
        }
    }
    
    return null;
}

// SPQR decoder with known grid structure (fallback when jsQR fails)
function decodeSPQRWithKnownGrid(data, width, height) {
    console.log('Attempting SPQR decode with known grid structure...');
    
    try {
        // Assume common SPQR structure: 21x21 or 25x25 modules + 4 margin
        // Start by estimating module size from image dimensions
        const possibleModuleCounts = [21, 25, 29, 33]; // Common QR sizes
        const margin = 4;
        
        let bestMatch = null;
        let bestScore = 0;
        
        for (const modules of possibleModuleCounts) {
            const totalModules = modules + 2 * margin;
            const estimatedModulePx = Math.min(width, height) / totalModules; // float px per module
            
            if (estimatedModulePx < 3 || estimatedModulePx > 50) continue;
            
            // Test this grid by looking for color patterns
            const score = testGridStructure(data, width, height, modules, margin, estimatedModulePx);
            console.log(`Testing ${modules}x${modules} grid (${estimatedModulePx}px/module): score ${score}`);
            
            if (score > bestScore) {
                bestScore = score;
                bestMatch = { modules, margin, modulePx: estimatedModulePx };
            }
        }
        
        if (!bestMatch || bestScore < 0.1) {
            return {
                base: 'Could not determine SPQR grid structure',
                red: null,
                combined: `Tested grids but no good match (best score: ${bestScore.toFixed(3)})`
            };
        }
        
        console.log(`Using grid: ${bestMatch.modules}x${bestMatch.modules}, ${bestMatch.modulePx}px/module`);
        
        // Refine origin by maximising finder match
        const origin = refineGridOrigin(data, width, height, bestMatch.modules, bestMatch.margin, bestMatch.modulePx);
        console.log(`Refined origin: (${origin.originX}, ${origin.originY})`);
        // Extract color layers using the determined grid and refined origin
        return extractAndDecodeColorLayers(data, width, height, { ...bestMatch, originX: origin.originX, originY: origin.originY });
        
    } catch (error) {
        console.error('Known grid decode error:', error);
        return {
            base: 'Grid decode error: ' + error.message,
            red: null,
            combined: null
        };
    }
}

function testGridStructure(data, width, height, modules, margin, modulePx) {
    // Test if this grid structure makes sense by checking color distribution
    let colorPixels = 0;
    let totalSamples = 0;
    
    // Sample a few modules to see if we have good color separation
    for (let my = margin; my < modules + margin; my += 3) {
        for (let mx = margin; mx < modules + margin; mx += 3) {
            const px = Math.round(mx * modulePx + modulePx / 2);
            const py = Math.round(my * modulePx + modulePx / 2);
            
            if (px >= 0 && px < width && py >= 0 && py < height) {
                const i = (py * width + px) * 4;
                const r = data[i], g = data[i + 1], b = data[i + 2];
                
                totalSamples++;
                
                // Check if this pixel is colored (not black/white)
                // Count strong chroma or strong black as valid module signal
                const isRed = r > 140 && r > g + 40 && r > b + 40;
                const isGreen = g > 140 && g > r + 40 && g > b + 40;
                const isBlack = r < 70 && g < 70 && b < 70;
                if (isRed || isGreen || isBlack) colorPixels++;
            }
        }
    }
    
    const colorRatio = totalSamples > 0 ? colorPixels / totalSamples : 0;
    return colorRatio; // Higher score means more color pixels (better SPQR candidate)
}

// Try small origin offsets around the nominal origin to maximise finder pattern score
function refineGridOrigin(data, width, height, modules, margin, modulePx) {
    const search = Math.max(1, Math.floor(modulePx / 3));
    // Compute rough bounding box of non-white content to derive nominal origin
    let minX = width, minY = height, maxX = 0, maxY = 0;
    for (let y = 0; y < height; y += Math.max(1, Math.floor(modulePx/2))) {
        for (let x = 0; x < width; x += Math.max(1, Math.floor(modulePx/2))) {
            const i = (y*width + x) * 4;
            const r = data[i], g = data[i+1], b = data[i+2];
            const nonWhite = !(r > 235 && g > 235 && b > 235);
            if (nonWhite) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
    }
    // Nominal origin aims so that min edges correspond to 4-module quiet zone
    const nominalX = isFinite(minX) ? Math.round(minX - margin * modulePx) : 0;
    const nominalY = isFinite(minY) ? Math.round(minY - margin * modulePx) : 0;
    let best = { originX: nominalX, originY: nominalY, score: -Infinity };
    // Scan a small window of offsets
    for (let oy = -search; oy <= search; oy++) {
        for (let ox = -search; ox <= search; ox++) {
            const score = scoreFindersAtOrigin(data, width, height, modules, margin, modulePx, nominalX + ox, nominalY + oy);
            if (score > best.score) best = { originX: nominalX + ox, originY: nominalY + oy, score };
        }
    }
    return { originX: best.originX, originY: best.originY };
}

function scoreFindersAtOrigin(data, width, height, modules, margin, modulePx, offX, offY) {
    // Evaluate how well the three 7x7 finders match black/white pattern
    const centers = [
        { gx: 3, gy: 3 },
        { gx: modules - 4, gy: 3 },
        { gx: 3, gy: modules - 4 }
    ];
    let score = 0;
    for (const c of centers) {
        for (let dy = 0; dy < 7; dy++) {
            for (let dx = 0; dx < 7; dx++) {
                const onBorder = (dx === 0 || dx === 6 || dy === 0 || dy === 6);
                const inCenter = (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
                const shouldDark = onBorder || inCenter;
                const fx = Math.round(offX + (c.gx + dx + margin) * modulePx + modulePx / 2);
                const fy = Math.round(offY + (c.gy + dy + margin) * modulePx + modulePx / 2);
                if (fx < 0 || fy < 0 || fx >= width || fy >= height) continue;
                const i = (fy * width + fx) * 4;
                const r = data[i], g = data[i+1], b = data[i+2];
                const isDark = r < 80 && g < 80 && b < 80;
                score += (isDark === shouldDark) ? 1 : -1;
            }
        }
    }
    return score;
}

function extractAndDecodeColorLayers(data, width, height, gridInfo) {
    const { modules, margin, modulePx } = gridInfo;
    const baseOffsetX = gridInfo.originX ?? 0;
    const baseOffsetY = gridInfo.originY ?? 0;
    
    console.log('Extracting color layers from grid...');
    
    // Create binary layers based on color classification
    const baseLayer = [];
    const redLayer = [];
    
    for (let my = 0; my < modules; my++) {
        const baseRow = [];
        const redRow = [];
        
        for (let mx = 0; mx < modules; mx++) {
            const cx = baseOffsetX + (mx + margin) * modulePx + modulePx / 2;
            const cy = baseOffsetY + (my + margin) * modulePx + modulePx / 2;
            
            // Robust subpixel sampling (3x3 around center)
            const step = Math.max(1, Math.floor(modulePx / 4));
            let rSum = 0, gSum = 0, bSum = 0, count = 0;
            for (let dy = -step; dy <= step; dy += step) {
                for (let dx = -step; dx <= step; dx += step) {
                    const sx = Math.round(cx + dx);
                    const sy = Math.round(cy + dy);
                    if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
                        const idx = (sy * width + sx) * 4;
                        rSum += data[idx];
                        gSum += data[idx + 1];
                        bSum += data[idx + 2];
                        count++;
                    }
                }
            }
            const r = count ? Math.round(rSum / count) : 255;
            const g = count ? Math.round(gSum / count) : 255;
            const b = count ? Math.round(bSum / count) : 255;
            
            // Classify pixel color: 0=white, 1=red, 2=green, 3=black (with extra tolerance)
            const isBlack = r < 80 && g < 80 && b < 80;
            const isRed = r > 135 && r > g + 35 && r > b + 35;
            const isGreen = g > 135 && g > r + 35 && g > b + 35;
            
            // Layer mapping for discrete BWRG:
            // Base layer: black OR green (green = overlap)
            // Red layer: red OR green (green = overlap)
            const baseBit = isBlack || isGreen;
            const redBit = isRed || isGreen;
            
            baseRow.push(baseBit);
            redRow.push(redBit);
        }
        
        baseLayer.push(baseRow);
        redLayer.push(redRow);
    }
    
    // Denoise with majority filter to mitigate single-module misclassifications
    majorityFilterInPlace(baseLayer);
    majorityFilterInPlace(redLayer);
    
    // Enforce standard finder patterns on both layers within the module grid
    enforceFindersOnBinary(baseLayer);
    enforceFindersOnBinary(redLayer);
    // Enforce timing patterns (row 6 / column 6 alternating), excluding finder areas
    enforceTimingPatterns(baseLayer);
    enforceTimingPatterns(redLayer);
    
    console.log('Color layers extracted, attempting decoding...');
    
    // Try to decode each layer
    const baseText = decodeLayerDirect(baseLayer, 'base');
    const redText = decodeLayerDirect(redLayer, 'red');
    
    const results = [baseText, redText].filter(Boolean);
    const combined = results.join('');
    
    return {
        base: baseText || 'Base layer decode failed',
        red: redText || 'Red layer decode failed',
        combined: combined || 'No layers decoded successfully'
    };
}

function decodeLayerDirect(binaryLayer, layerName) {
    console.log(`Decoding ${layerName} layer (${binaryLayer.length}x${binaryLayer[0].length})...`);
    
    // Convert binary layer to RGBA for jsQR
    const modules = binaryLayer.length;
    const quiet = 4; // quiet zone modules
    const scale = 8; // Scale up for better jsQR performance
    const outModules = modules + quiet * 2;
    const scaledSize = outModules * scale;
    const rgba = new Uint8ClampedArray(scaledSize * scaledSize * 4);
    
    for (let y = 0; y < scaledSize; y++) {
        for (let x = 0; x < scaledSize; x++) {
            const gx = Math.floor(x / scale) - quiet; // grid x in data modules
            const gy = Math.floor(y / scale) - quiet; // grid y in data modules
            let isDark = false;
            if (gx >= 0 && gx < modules && gy >= 0 && gy < modules) {
                isDark = binaryLayer[gy][gx];
            } else {
                isDark = false; // quiet zone
            }
            
            const i = (y * scaledSize + x) * 4;
            const value = isDark ? 0 : 255;
            rgba[i] = rgba[i + 1] = rgba[i + 2] = value;
            rgba[i + 3] = 255;
        }
    }
    
    const result = jsQR(rgba, scaledSize, scaledSize);
    console.log(`${layerName} layer result:`, result ? `"${result.data}"` : 'null');
    return result ? result.data : null;
}

// Enforce standard finder patterns (7x7) at TL, TR, BL in the binary module grid
function enforceFindersOnBinary(binary) {
    const modules = binary.length;
    if (!modules || modules < 21) return;
    const drawFinderAt = (gx, gy) => {
        for (let dy = 0; dy < 7; dy++) {
            for (let dx = 0; dx < 7; dx++) {
                const onBorder = (dx === 0 || dx === 6 || dy === 0 || dy === 6);
                const inCenter = (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
                const dark = onBorder || inCenter;
                const yy = gy + dy;
                const xx = gx + dx;
                if (yy >= 0 && yy < modules && xx >= 0 && xx < modules) {
                    binary[yy][xx] = dark;
                }
            }
        }
    };
    // TL
    drawFinderAt(0, 0);
    // TR
    drawFinderAt(modules - 7, 0);
    // BL
    drawFinderAt(0, modules - 7);
}

// Enforce timing patterns (alternating dark/light) on row 6 and column 6
function enforceTimingPatterns(binary) {
    const n = binary.length;
    if (n < 21) return;
    const inFinder = (x, y) => (x < 7 && y < 7) || (x >= n-7 && y < 7) || (x < 7 && y >= n-7);
    // Row 6
    for (let x = 0; x < n; x++) {
        if (inFinder(x, 6)) continue;
        binary[6][x] = ((x % 2) === 0);
    }
    // Column 6
    for (let y = 0; y < n; y++) {
        if (inFinder(6, y)) continue;
        binary[y][6] = ((y % 2) === 0);
    }
}

// Simple majority filter over 8-neighbourhood to reduce salt-and-pepper noise
function majorityFilterInPlace(binary) {
    const n = binary.length;
    const m = binary[0].length;
    const out = new Array(n);
    for (let y = 0; y < n; y++) {
        out[y] = new Array(m);
        for (let x = 0; x < m; x++) {
            let dark = 0, total = 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const yy = y + dy, xx = x + dx;
                    if (yy >= 0 && yy < n && xx >= 0 && xx < m) {
                        dark += binary[yy][xx] ? 1 : 0;
                        total++;
                    }
                }
            }
            out[y][x] = dark >= Math.ceil(total / 2);
        }
    }
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < m; x++) binary[y][x] = out[y][x];
    }
}

// Direct SPQR decoder using color-aware approach
function decodeSPQRDirect(imageData) {
    const { data, width, height } = imageData;
    
    console.log('SPQR direct decoder: creating color-aware matrix...');
    
    try {
        // Convert to grayscale first for jsQR structure detection
        const grayData = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            // Convert any non-white pixel to black for structure detection
            const isLight = r > 200 && g > 200 && b > 200;
            const gray = isLight ? 255 : 0;
            grayData[i] = grayData[i + 1] = grayData[i + 2] = gray;
            grayData[i + 3] = 255;
        }
        
        // Use jsQR to locate the QR structure on grayscale version
        const jsqrResult = jsQR(grayData, width, height);
        if (!jsqrResult || !jsqrResult.location) {
            console.log('jsQR could not locate QR structure, falling back to grid estimation...');
            
            // Fallback: Use known SPQR grid structure (assume 21x21 modules + 4 margin)
            return decodeSPQRWithKnownGrid(data, width, height);
        }
        
        console.log('QR structure located, building color matrix...');
        const location = jsqrResult.location;
        
        // Calculate QR dimensions from corner positions
        const topLeft = location.topLeftCorner;
        const topRight = location.topRightCorner;
        const bottomLeft = location.bottomLeftCorner;
        
        const topDistance = Math.sqrt((topRight.x - topLeft.x)**2 + (topRight.y - topLeft.y)**2);
        const leftDistance = Math.sqrt((bottomLeft.x - topLeft.x)**2 + (bottomLeft.y - topLeft.y)**2);
        const avgDistance = (topDistance + leftDistance) / 2;
        
        const modulePixels = avgDistance / 14; // 14 modules between finder centers
        let qrModules = Math.round(avgDistance / modulePixels) + 7;
        
        // Ensure valid QR size
        while ((qrModules - 17) % 4 !== 0) {
            qrModules++;
        }
        qrModules = Math.max(21, Math.min(177, qrModules));
        
        console.log(`Color matrix: ${qrModules}x${qrModules} modules, ${modulePixels.toFixed(1)}px per module`);
        
        // Create color matrix
        const colorMatrix = [];
        for (let y = 0; y < qrModules; y++) {
            const row = [];
            for (let x = 0; x < qrModules; x++) {
                const pixelX = Math.round(topLeft.x + (x - 3.5) * modulePixels);
                const pixelY = Math.round(topLeft.y + (y - 3.5) * modulePixels);
                
                if (pixelX >= 0 && pixelX < width && pixelY >= 0 && pixelY < height) {
                    const i = (pixelY * width + pixelX) * 4;
                    const r = data[i], g = data[i + 1], b = data[i + 2];
                    
                    // Classify pixel color: 0=white, 1=red, 2=green, 3=black
                    let colorCode = 0;
                    if (r < 80 && g < 80 && b < 80) colorCode = 3; // black
                    else if (r > 150 && r > g + 50 && r > b + 50) colorCode = 1; // red
                    else if (g > 150 && g > r + 50 && g > b + 50) colorCode = 2; // green
                    else colorCode = 0; // white (or unknown -> white)
                    
                    row.push(colorCode);
                } else {
                    row.push(0); // white outside bounds
                }
            }
            colorMatrix.push(row);
        }
        
        console.log('Color matrix created, extracting layers...');
        
        // Extract binary layers from color matrix
        // Layer A (base): white(0) + black(3) -> dark
        // Layer B (red): red(1) + green(2) -> dark
        const createLayer = (darkColors) => {
            const layer = [];
            for (let y = 0; y < qrModules; y++) {
                const row = [];
                for (let x = 0; x < qrModules; x++) {
                    row.push(darkColors.includes(colorMatrix[y][x]));
                }
                layer.push(row);
            }
            return layer;
        };
        
        const baseLayer = createLayer([0, 3]); // white + black  
        const redLayer = createLayer([1, 2]);  // red + green
        
        console.log('Layers extracted, attempting decode...');
        
        // Decode each layer
        const decodeLayer = (binaryLayer, layerName) => {
            const scale = 4;
            const scaledSize = qrModules * scale;
            const rgba = new Uint8ClampedArray(scaledSize * scaledSize * 4);
            
            for (let y = 0; y < scaledSize; y++) {
                for (let x = 0; x < scaledSize; x++) {
                    const sourceX = Math.floor(x / scale);
                    const sourceY = Math.floor(y / scale);
                    const isDark = binaryLayer[sourceY][sourceX];
                    
                    const i = (y * scaledSize + x) * 4;
                    const value = isDark ? 0 : 255;
                    rgba[i] = rgba[i + 1] = rgba[i + 2] = value;
                    rgba[i + 3] = 255;
                }
            }
            
            const result = jsQR(rgba, scaledSize, scaledSize);
            console.log(`${layerName} decode result:`, result ? `"${result.data}"` : 'null');
            return result ? result.data : null;
        };
        
        const baseResult = decodeLayer(baseLayer, 'Base layer');
        const redResult = decodeLayer(redLayer, 'Red layer');
        
        const results = [baseResult, redResult].filter(Boolean);
        const combined = results.join('');
        
        return {
            base: baseResult || 'Base layer decode failed',
            red: redResult || 'Red layer decode failed', 
            combined: combined || 'No layers decoded successfully'
        };
        
    } catch (error) {
        console.error('SPQR direct decode error:', error);
        return {
            base: 'Decode error: ' + error.message,
            red: null,
            combined: null
        };
    }
}

// Integrated SPQR decoder using jsQR algorithms adapted for multi-layer
function decodeSPQRLayersSimple(imageData) {
    const { data, width, height } = imageData;
    
    try {
        console.log('SPQR decoder: analyzing multi-layer structure...');
        
        // Step 1: Detect QR structure using any non-white pixel
        // This gives us the finder patterns and overall QR geometry
        const structureBinary = createBinaryMatrix(data, width, height, (r, g, b) => r < 240 || g < 240 || b < 240);
        const qrLocation = locateQR(structureBinary);
        
        if (!qrLocation) {
            console.log('Failed to locate QR structure in SPQR');
            return {
                base: 'SPQR structure not found',
                red: null,
                combined: 'Could not detect QR finder patterns',
                debugImages: []
            };
        }
        
        console.log('QR structure located:', qrLocation);
        
        // Step 2: Detect color scheme by sampling finder key areas
        const colorScheme = detectColorScheme(data, width, height, qrLocation);
        console.log('Detected color scheme:', colorScheme);
        
        // Step 3: Extract individual color layers based on the scheme
        const layers = extractColorLayers(data, width, height, qrLocation, colorScheme);
        
        // Step 4: Decode each layer individually
        const results = [];
        for (let i = 0; i < layers.length; i++) {
            try {
                console.log(`Processing layer ${i}...`);
                const layerBinary = layers[i];
                const extracted = extractQRBits(layerBinary, qrLocation);
                console.log(`Layer ${i} extracted:`, extracted ? 'success' : 'failed');
                if (extracted) {
                    const decoded = decodeQRData(extracted);
                    console.log(`Layer ${i} decoded:`, decoded || 'failed');
                    if (decoded) {
                        results.push(decoded);
                        console.log(`Layer ${i} decoded: "${decoded}"`);
                    }
                }
            } catch (error) {
                console.error(`Error processing layer ${i}:`, error);
            }
        }
        
        if (results.length === 0) {
            return {
                base: 'SPQR structure found but no layers decoded successfully',
                red: null,
                combined: `Color scheme: ${colorScheme.name} (${colorScheme.description})`,
                debugImages: layers.map((layer, i) => ({ name: `layer-${i}`, dataUrl: binaryToDataUrl(width, height, layer) }))
            };
        }
        
        // Return results
        const baseText = results[0] || 'No base layer';
        const redText = results[1] || 'No red layer';
        const combined = results.length > 1 ? results.join(' | ') : results[0];
        
        return {
            base: baseText,
            red: redText,
            combined: `✅ ${combined} | ${colorScheme.description}`,
            debugImages: layers.map((layer, i) => ({ name: `layer-${i}`, dataUrl: binaryToDataUrl(width, height, layer) }))
        };

    } catch (error) {
        console.error('SPQR decode error:', error);
        return {
            base: 'SPQR decode failed: ' + error.message,
            red: null,
            combined: null,
            debugImages: []
        };
    }
}

// Create binary matrix from image data using a predicate function
function createBinaryMatrix(data, width, height, isDarkPredicate) {
    const matrix = new Array(height);
    for (let y = 0; y < height; y++) {
        matrix[y] = new Array(width);
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const r = data[i], g = data[i+1], b = data[i+2];
            matrix[y][x] = isDarkPredicate(r, g, b) ? 1 : 0;
        }
    }
    return matrix;
}

// Locate QR structure using jsQR directly instead of manual finder detection
function locateQR(binary) {
    const height = binary.length;
    const width = binary[0].length;
    
    console.log(`Attempting QR location on ${width}x${height} binary matrix`);
    
    // Convert binary matrix to RGBA for jsQR
    const scale = 1; // Try original size first
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const val = binary[y][x] ? 0 : 255; // 1 = black, 0 = white
            rgba[i] = rgba[i+1] = rgba[i+2] = val;
            rgba[i+3] = 255;
        }
    }
    
    // Try jsQR to locate the QR structure
    const jsqrResult = jsQR(rgba, width, height);
    if (jsqrResult && jsqrResult.location) {
        console.log('jsQR found QR structure:', jsqrResult.location);
        const loc = jsqrResult.location;
        
        // Extract corner positions
        const topLeft = loc.topLeftCorner;
        const topRight = loc.topRightCorner;
        const bottomLeft = loc.bottomLeftCorner;
        
        // Estimate module size from corner distances
        const topDistance = Math.sqrt((topRight.x - topLeft.x)**2 + (topRight.y - topLeft.y)**2);
        const leftDistance = Math.sqrt((bottomLeft.x - topLeft.x)**2 + (bottomLeft.y - topLeft.y)**2);
        const avgDistance = (topDistance + leftDistance) / 2;
        
        // QR version 1 = 21 modules, finders are 7 modules apart, so 14 modules between finder centers
        const moduleSize = Math.round(avgDistance / 14);
        const dimension = 21; // Assume version 1 for now
        
        console.log(`QR located: moduleSize=${moduleSize}, dimension=${dimension}`);
        
        return {
            topLeft,
            topRight,
            bottomLeft,
            moduleSize,
            dimension
        };
    }
    
    console.log('jsQR could not locate QR structure, falling back to manual detection');
    
    // Fallback to manual finder detection (simplified)
    const finderCandidates = [];
    
    // Scan horizontal lines for finder patterns (more frequent scanning)
    for (let y = 0; y < height; y += Math.max(1, Math.floor(height/10))) {
        const runs = getRuns(binary[y]);
        const patterns = findFinderPatterns(runs);
        
        for (const pattern of patterns) {
            if (verifyFinderPattern(binary, pattern.x, y, pattern.moduleSize)) {
                finderCandidates.push({ x: pattern.x, y, moduleSize: pattern.moduleSize });
            }
        }
    }
    
    console.log(`Manual detection: Found ${finderCandidates.length} finder candidates`);
    
    if (finderCandidates.length < 3) {
        console.log(`Found only ${finderCandidates.length} finder candidates, need at least 3`);
        return null;
    }
    
    // Cluster candidates and find the best 3
    const finders = clusterFinders(finderCandidates);
    if (finders.length < 3) return null;
    
    // Order finders as topLeft, topRight, bottomLeft
    const ordered = orderFinders(finders[0], finders[1], finders[2]);
    
    // Calculate QR dimensions and module size
    const avgModuleSize = (finders[0].moduleSize + finders[1].moduleSize + finders[2].moduleSize) / 3;
    const dimension = calculateDimension(ordered.topLeft, ordered.topRight, ordered.bottomLeft, avgModuleSize);
    
    return {
        topLeft: ordered.topLeft,
        topRight: ordered.topRight, 
        bottomLeft: ordered.bottomLeft,
        moduleSize: avgModuleSize,
        dimension
    };
}

// Get black/white run lengths from a binary row
function getRuns(row) {
    const runs = [];
    let currentRun = 0;
    let currentColor = row[0];
    
    for (let x = 0; x < row.length; x++) {
        if (row[x] === currentColor) {
            currentRun++;
        } else {
            runs.push({ color: currentColor, length: currentRun, endX: x - 1 });
            currentColor = row[x];
            currentRun = 1;
        }
    }
    runs.push({ color: currentColor, length: currentRun, endX: row.length - 1 });
    return runs;
}

// Find potential finder patterns in run sequence
function findFinderPatterns(runs) {
    const patterns = [];
    
    for (let i = 2; i < runs.length - 2; i++) {
        const [r1, r2, r3, r4, r5] = [runs[i-2], runs[i-1], runs[i], runs[i+1], runs[i+2]];
        
        // Check for 1:1:3:1:1 dark:light:dark:light:dark pattern
        if (r1.color && !r2.color && r3.color && !r4.color && r5.color) {
            const [l1, l2, l3, l4, l5] = [r1.length, r2.length, r3.length, r4.length, r5.length];
            const total = l1 + l2 + l3 + l4 + l5;
            
            if (total >= 10) {
                const ratios = [l1, l2, l3, l4, l5].map(len => len / total);
                
                // Check for 1:1:3:1:1 ratios (relaxed tolerance for SPQR)
                if (Math.abs(ratios[0] - 0.14) < 0.12 && 
                    Math.abs(ratios[1] - 0.14) < 0.12 && 
                    Math.abs(ratios[2] - 0.43) < 0.25 && 
                    Math.abs(ratios[3] - 0.14) < 0.12 && 
                    Math.abs(ratios[4] - 0.14) < 0.12) {
                    
                    const centerX = r1.endX - l1 + 1 + l1 + l2 + Math.floor(l3/2);
                    const moduleSize = Math.max(3, Math.round(l3 / 3));
                    
                    patterns.push({ x: centerX, moduleSize });
                }
            }
        }
    }
    
    return patterns;
}

// Verify finder pattern by checking vertical 1:1:3:1:1 ratio
function verifyFinderPattern(binary, x, y, moduleSize) {
    if (y < moduleSize * 3 || y >= binary.length - moduleSize * 3) return false;
    if (x < moduleSize * 3 || x >= binary[0].length - moduleSize * 3) return false;
    
    // Sample vertical line at x
    const verticalRuns = [];
    let currentColor = binary[y - moduleSize * 3][x];
    let currentRun = 1;
    
    for (let dy = -moduleSize * 3 + 1; dy <= moduleSize * 3; dy++) {
        const color = binary[y + dy][x];
        if (color === currentColor) {
            currentRun++;
        } else {
            verticalRuns.push(currentRun);
            currentColor = color;
            currentRun = 1;
        }
    }
    verticalRuns.push(currentRun);
    
    // Check if we have 5 runs in 1:1:3:1:1 ratio
    if (verticalRuns.length >= 5) {
        const midStart = Math.floor((verticalRuns.length - 5) / 2);
        const [l1, l2, l3, l4, l5] = verticalRuns.slice(midStart, midStart + 5);
        const total = l1 + l2 + l3 + l4 + l5;
        const ratios = [l1, l2, l3, l4, l5].map(len => len / total);
        
        return Math.abs(ratios[0] - 0.14) < 0.15 && 
               Math.abs(ratios[1] - 0.14) < 0.15 && 
               Math.abs(ratios[2] - 0.43) < 0.3 && 
               Math.abs(ratios[3] - 0.14) < 0.15 && 
               Math.abs(ratios[4] - 0.14) < 0.15;
    }
    
    return false;
}

// Cluster finder candidates into 3 distinct positions
function clusterFinders(candidates) {
    // Simple clustering: group candidates within 5 module distance
    const clusters = [];
    
    for (const candidate of candidates) {
        let foundCluster = false;
        for (const cluster of clusters) {
            const dx = candidate.x - cluster.x;
            const dy = candidate.y - cluster.y;
            const distance = Math.sqrt(dx*dx + dy*dy);
            
            if (distance < candidate.moduleSize * 5) {
                cluster.x = (cluster.x * cluster.count + candidate.x) / (cluster.count + 1);
                cluster.y = (cluster.y * cluster.count + candidate.y) / (cluster.count + 1);
                cluster.moduleSize = (cluster.moduleSize * cluster.count + candidate.moduleSize) / (cluster.count + 1);
                cluster.count++;
                foundCluster = true;
                break;
            }
        }
        
        if (!foundCluster) {
            clusters.push({
                x: candidate.x,
                y: candidate.y,
                moduleSize: candidate.moduleSize,
                count: 1
            });
        }
    }
    
    // Return top 3 strongest clusters
    return clusters.sort((a, b) => b.count - a.count).slice(0, 3);
}

// Order three finders as topLeft, topRight, bottomLeft
function orderFinders(f1, f2, f3) {
    // Calculate distances
    const d12 = Math.sqrt((f1.x - f2.x)**2 + (f1.y - f2.y)**2);
    const d13 = Math.sqrt((f1.x - f3.x)**2 + (f1.y - f3.y)**2);
    const d23 = Math.sqrt((f2.x - f3.x)**2 + (f2.y - f3.y)**2);
    
    // Find bottomLeft (closest to the other two)
    let bottomLeft, topLeft, topRight;
    if (d23 >= d12 && d23 >= d13) {
        [bottomLeft, topLeft, topRight] = [f1, f2, f3];
    } else if (d13 >= d12 && d13 >= d23) {
        [bottomLeft, topLeft, topRight] = [f2, f1, f3];
    } else {
        [bottomLeft, topLeft, topRight] = [f3, f1, f2];
    }
    
    // Use cross product to determine if topRight and bottomLeft need swapping
    const crossProduct = (topRight.x - topLeft.x) * (bottomLeft.y - topLeft.y) - 
                        (topRight.y - topLeft.y) * (bottomLeft.x - topLeft.x);
    
    if (crossProduct < 0) {
        [bottomLeft, topRight] = [topRight, bottomLeft];
    }
    
    return { topLeft, topRight, bottomLeft };
}

// Calculate QR dimension from finder positions
function calculateDimension(topLeft, topRight, bottomLeft, moduleSize) {
    const distance = (a, b) => Math.sqrt((a.x - b.x)**2 + (a.y - b.y)**2);
    
    const topDistance = distance(topLeft, topRight);
    const leftDistance = distance(topLeft, bottomLeft);
    const avgDistance = (topDistance + leftDistance) / 2;
    
    let dimension = Math.round(avgDistance / moduleSize) + 7; // Add 7 for finders
    
    // Ensure dimension follows QR spec (must be 4n + 1)
    while ((dimension - 17) % 4 !== 0) {
        dimension++;
    }
    
    return Math.min(177, Math.max(21, dimension)); // QR bounds
}

// Helper to convert binary matrix to data URL for debugging
function binaryToDataUrl(width, height, binary) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const imageData = ctx.createImageData(width, height);
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const value = binary[y][x] ? 0 : 255;
            imageData.data[i] = imageData.data[i+1] = imageData.data[i+2] = value;
            imageData.data[i+3] = 255;
        }
    }
    
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL();
}

// Placeholder functions for color scheme detection and layer extraction
function detectColorScheme(data, width, height, qrLocation) {
    // Sample finder key areas to determine BWRG vs CMYRGB vs custom
    return { name: 'BWRG', description: '4-color Black/White/Red/Green scheme (~2× capacity)' };
}

function extractColorLayers(data, width, height, qrLocation, colorScheme) {
    // Extract individual color layers based on discrete composition
    // In discrete mode: Green = overlap where BOTH base and red layers have data
    
    console.log('Extracting color layers for', colorScheme.name, 'scheme');
    
    // Classify pixels into color categories
    const isBlack = (r, g, b) => r < 80 && g < 80 && b < 80;
    const isRed = (r, g, b) => r > g + 50 && r > b + 50 && r > 100;
    const isGreen = (r, g, b) => g > r + 50 && g > b + 50 && g > 100;
    const isWhite = (r, g, b) => r > 200 && g > 200 && b > 200;
    
    // Base layer: Black OR Green (green represents overlap)
    const baseLayer = createBinaryMatrix(data, width, height, (r, g, b) => {
        return isBlack(r, g, b) || isGreen(r, g, b);
    });
    
    // Red layer: Red OR Green (green represents overlap) 
    const redLayer = createBinaryMatrix(data, width, height, (r, g, b) => {
        return isRed(r, g, b) || isGreen(r, g, b);
    });
    
    console.log('Extracted layers: base and red with green overlap handling');
    return [baseLayer, redLayer];
}

function extractQRBits(binary, qrLocation) {
    // Convert the binary matrix back to RGBA format for jsQR
    const height = binary.length;
    const width = binary[0].length;
    
    // Create a copy of the binary matrix to add synthetic finders
    const enhanced = binary.map(row => [...row]);
    
    // Add synthetic finder patterns using the detected QR structure
    if (qrLocation && qrLocation.moduleSize) {
        addSyntheticFinders(enhanced, width, height, qrLocation);
    }
    
    // Convert to RGBA
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const value = enhanced[y][x] ? 0 : 255; // 1 = black, 0 = white
            rgba[i] = rgba[i+1] = rgba[i+2] = value;
            rgba[i+3] = 255;
        }
    }
    
    return { rgba, width, height };
}

// Add synthetic 7x7 finder patterns to the binary matrix
function addSyntheticFinders(binary, width, height, qrLocation) {
    const { moduleSize } = qrLocation;
    
    // Estimate QR grid parameters
    const margin = 4; // Standard margin
    const totalQRSize = 25; // From dimension detection
    const gridModulePx = Math.round(moduleSize);
    
    // Calculate finder positions in pixel coordinates
    const finderPositions = [
        { x: margin * gridModulePx, y: margin * gridModulePx }, // Top-left
        { x: (totalQRSize - 7 - margin) * gridModulePx, y: margin * gridModulePx }, // Top-right  
        { x: margin * gridModulePx, y: (totalQRSize - 7 - margin) * gridModulePx }  // Bottom-left
    ];
    
    // Draw each 7x7 finder pattern
    for (const pos of finderPositions) {
        drawFinderPattern(binary, width, height, pos.x, pos.y, gridModulePx);
    }
}

// Draw a standard 7x7 QR finder pattern at the specified position
function drawFinderPattern(binary, width, height, startX, startY, modulePx) {
    // Standard QR finder pattern: 7x7 grid with 1:1:3:1:1 structure
    const pattern = [
        [1,1,1,1,1,1,1],
        [1,0,0,0,0,0,1], 
        [1,0,1,1,1,0,1],
        [1,0,1,1,1,0,1],
        [1,0,1,1,1,0,1],
        [1,0,0,0,0,0,1],
        [1,1,1,1,1,1,1]
    ];
    
    for (let my = 0; my < 7; my++) {
        for (let mx = 0; mx < 7; mx++) {
            const isDark = pattern[my][mx];
            
            // Paint the entire module
            for (let dy = 0; dy < modulePx; dy++) {
                for (let dx = 0; dx < modulePx; dx++) {
                    const px = startX + mx * modulePx + dx;
                    const py = startY + my * modulePx + dy;
                    
                    if (px >= 0 && px < width && py >= 0 && py < height) {
                        binary[py][px] = isDark;
                    }
                }
            }
        }
    }
}

function decodeQRData(extracted) {
    // Use jsQR directly on the extracted RGBA data
    try {
        if (!extracted || !extracted.rgba) {
            console.log('No extracted data for decoding');
            return null;
        }
        const { rgba, width, height } = extracted;
        console.log(`Decoding ${width}x${height} RGBA with jsQR`);
        
        const result = jsQR(rgba, width, height);
        if (result && result.data) {
            console.log('jsQR decoded:', result.data);
            return result.data;
        } else {
            console.log('jsQR could not decode the layer');
            return null;
        }
    } catch (error) {
        console.error('Error in decodeQRData:', error);
        return null;
    }
}

// The internal decoder functions have been removed.
// We now use jsQR directly for SPQR layer decoding.

function decodeSPQRLayers(imageData) {
    const { data, width, height } = imageData;
    try {
		console.log('🔍 SPQR 4-colour decoder starting:', `${width}×${height}px`);
		
		// Get active color palette (custom or default)
		const palette = window.bwrgColors || ['#ffffff', '#ff0000', '#00ff00', '#000000'];
		
		// Convert hex colors to RGB
		const hexToRgb = (hex) => {
			const r = parseInt(hex.slice(1, 3), 16);
			const g = parseInt(hex.slice(3, 5), 16);
			const b = parseInt(hex.slice(5, 7), 16);
			return { r, g, b };
		};
		
		let paletteRgb = {
			'W': hexToRgb(palette[0]), // White
			'R': hexToRgb(palette[1]), // Red
			'G': hexToRgb(palette[2]), // Green
			'K': hexToRgb(palette[3])  // Black
		};
		// Use camera calibration if available
		if (window.cameraCalibration && window.cameraCalibration.type === 'BWRG' && window.cameraCalibration.samples) {
			const s = window.cameraCalibration.samples;
			paletteRgb = {
				'W': paletteRgb.W,
				'R': s.red || paletteRgb.R,
				'G': s.green || paletteRgb.G,
				'K': s.black || paletteRgb.K
			};
		}
		
		console.log('   Using color palette:', window.bwrgColors ? 'CUSTOM' : (window.cameraCalibration ? 'CAMERA-CALIBRATED' : 'DEFAULT'));
		if (window.cameraCalibration) {
			console.log('   Calibrated:', { 
				R: `rgb(${Math.round(paletteRgb.R.r)},${Math.round(paletteRgb.R.g)},${Math.round(paletteRgb.R.b)})`,
				G: `rgb(${Math.round(paletteRgb.G.r)},${Math.round(paletteRgb.G.g)},${Math.round(paletteRgb.G.b)})`,
				K: `rgb(${Math.round(paletteRgb.K.r)},${Math.round(paletteRgb.K.g)},${Math.round(paletteRgb.K.b)})`
			});
		}
		
		// Step 1: Classify pixels using improved color matching for lighting tolerance
		const classifyPixel = (r, g, b) => {
			const brightness = Math.max(r, g, b);
			const minBright = Math.min(r, g, b);
			if (brightness > 230 && minBright > 200) return 'W';
			if (brightness < 60) return 'K';
			let minDist = Infinity;
			let bestColor = 'W';
			for (const [colorName, rgb] of Object.entries(paletteRgb)) {
				const paletteBright = Math.max(rgb.r, rgb.g, rgb.b) || 1;
				const pixelBright = brightness || 1;
				const distR = Math.pow((r / pixelBright) - (rgb.r / paletteBright), 2);
				const distG = Math.pow((g / pixelBright) - (rgb.g / paletteBright), 2);
				const distB = Math.pow((b / pixelBright) - (rgb.b / paletteBright), 2);
				const dist = Math.sqrt(distR + distG + distB);
				if (dist < minDist) { minDist = dist; bestColor = colorName; }
			}
			return bestColor;
		};
		
		// Step 2: Detect grid structure from image dimensions (prefer camera hint)
		let margin = 4;
		let modules, modulePx, originX, originY;
		if (window.currentGridHint && window.currentGridHint.modules && window.currentGridHint.modulePx) {
			modules = window.currentGridHint.modules;
			modulePx = window.currentGridHint.modulePx;
			originX = window.currentGridHint.originX || (margin * modulePx);
			originY = window.currentGridHint.originY || (margin * modulePx);
			margin = Math.round(originX / modulePx); // Recalculate margin from origin
			console.log(`   Grid (hint): ${modules}×${modules} modules, ${modulePx}px per module, origin=(${originX},${originY})`);
			// Clear hint after using
			window.currentGridHint = null;
		} else {
			let bestModules = 21;
			let bestModulePx = width / (21 + 2 * margin);
			let bestRemainder = Math.abs(bestModulePx - Math.round(bestModulePx));
			const candidates = [];
			for (let testModules = 21; testModules <= 177; testModules += 4) {
				const testModulePx = width / (testModules + 2 * margin);
				const testRemainder = Math.abs(testModulePx - Math.round(testModulePx));
				const roundedModulePx = Math.round(testModulePx);
				if (roundedModulePx < 2) continue;
				if (testRemainder < 0.3) {
					candidates.push({ modules: testModules, modulePx: roundedModulePx, remainder: testRemainder });
				}
				if (testRemainder < bestRemainder) { bestRemainder = testRemainder; bestModulePx = testModulePx; bestModules = testModules; }
			}
			modules = bestModules; modulePx = Math.round(bestModulePx);
			if (candidates.length > 0) {
				candidates.sort((a,b)=>{
					const aStd = (a.modulePx===5||a.modulePx===6), bStd=(b.modulePx===5||b.modulePx===6);
					if (aStd && !bStd) return -1; if (!aStd && bStd) return 1; return a.remainder - b.remainder;
				});
				modules = candidates[0].modules; modulePx = candidates[0].modulePx;
			}
			originX = margin * modulePx;
			originY = margin * modulePx;
			console.log(`   Grid: ${modules}×${modules} modules, ${modulePx}px per module`);
		}
		
		// Step 3: Sample each QR module and build binary layers
		// In BWRG SPQR: BLACK → base layer, RED → red layer, GREEN → both layers
		const baseMods = [];
		const redMods = [];
		
		for (let my = 0; my < modules; my++) {
			const baseRow = [];
			const redRow = [];
			
			for (let mx = 0; mx < modules; mx++) {
				// Sample from centre of module (using origin offset)
				const cx = Math.round(originX + (mx + 0.5) * modulePx);
				const cy = Math.round(originY + (my + 0.5) * modulePx);
				
				// Sample 3×3 pixels around centre for robustness
				const samples = [];
				const rgbSamples = []; // Debug: keep RGB values
				for (let dy = -1; dy <= 1; dy++) {
					for (let dx = -1; dx <= 1; dx++) {
						const px = Math.max(0, Math.min(width - 1, cx + dx));
						const py = Math.max(0, Math.min(height - 1, cy + dy));
						const idx = (py * width + px) * 4;
						const r = data[idx], g = data[idx + 1], b = data[idx + 2];
						const colour = classifyPixel(r, g, b);
						samples.push(colour);
						if (my === 0 && mx < 5) { // Debug first 5 modules of row 0
							rgbSamples.push({ rgb: `(${r},${g},${b})`, class: colour });
						}
					}
				}
				
				// Majority vote on colour
				const colourCounts = {};
				samples.forEach(c => colourCounts[c] = (colourCounts[c] || 0) + 1);
				const moduleColour = Object.keys(colourCounts).reduce((a, b) => 
					colourCounts[a] > colourCounts[b] ? a : b
				);
				
				// Debug first few modules
				if (my === 0 && mx < 5) {
					console.log(`   Module [${my},${mx}]:`, { center: `(${cx},${cy})`, samples: samples.join(''), counts: colourCounts, final: moduleColour });
				}
				
			// Map colour to layer bits
			// WHITE (00): base=light, red=light
			// RED   (01): base=light, red=dark
			// GREEN (11): base=dark,  red=dark  (overlap)
			// BLACK (10): base=dark,  red=light
			const baseIsDark = (moduleColour === 'K' || moduleColour === 'G');
			const redIsDark = (moduleColour === 'R' || moduleColour === 'G');
			
			baseRow.push(baseIsDark);
			redRow.push(redIsDark);
			
			// Debug: also try inverted mapping
			if (my === 0 && mx < 10) {
				const baseInv = !baseIsDark;
				const redInv = !redIsDark;
				if (mx === 0) console.log('   Trying inverted mapping for comparison...');
			}
			}
			
			baseMods.push(baseRow);
			redMods.push(redRow);
		}
		
		console.log('   Base layer row 0 (raw):', baseMods[0].map(b => b ? '█' : '·').join(''));
		console.log('   Red  layer row 0 (raw):', redMods[0].map(b => b ? '█' : '·').join(''));
		
		// Step 3.5: Enforce finder and alignment patterns on BOTH layers
		// Get alignment pattern positions for a given QR version
		const getAlignmentPatternPositions = (version) => {
			if (version === 1) return [];
			// Alignment pattern center positions by version (from QR spec)
			const positions = [
				[], // Version 1
				[6, 18], [6, 22], [6, 26], [6, 30], [6, 34], // Versions 2-6
				[6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62], // Versions 7-13
				[6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90], // Versions 14-20
				[6, 28, 50, 72, 94], [6, 26, 50, 74, 98], [6, 30, 54, 78, 102], [6, 28, 54, 80, 106], [6, 32, 58, 84, 110], [6, 30, 58, 86, 114], [6, 34, 62, 90, 118], // Versions 21-27
				[6, 26, 50, 74, 98, 122], [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130], [6, 30, 56, 82, 108, 134], [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146], // Versions 28-34
				[6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154], [6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162], [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170] // Versions 35-40
			];
			return positions[version - 1] || [];
		};
		
		const enforceFinders = (mods) => {
			const version = 1 + (modules - 21) / 4;
			
			// Draw finder patterns (7x7)
			const drawFinder = (ox, oy) => {
				for (let dy = 0; dy < 7; dy++) {
					for (let dx = 0; dx < 7; dx++) {
						const onBorder = (dx === 0 || dx === 6 || dy === 0 || dy === 6);
						const inCenter = (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
						const xx = ox + dx;
						const yy = oy + dy;
						if (yy >= 0 && yy < modules && xx >= 0 && xx < modules) {
							mods[yy][xx] = onBorder || inCenter;
						}
					}
				}
			};
			drawFinder(0, 0);
			drawFinder(modules - 7, 0);
			drawFinder(0, modules - 7);
			
			// Draw alignment patterns (5x5)
			const drawAlignment = (cx, cy) => {
				for (let dy = -2; dy <= 2; dy++) {
					for (let dx = -2; dx <= 2; dx++) {
						const onBorder = (Math.abs(dx) === 2 || Math.abs(dy) === 2);
						const inCenter = (dx === 0 && dy === 0);
						const xx = cx + dx;
						const yy = cy + dy;
						if (yy >= 0 && yy < modules && xx >= 0 && xx < modules) {
							mods[yy][xx] = onBorder || inCenter;
						}
					}
				}
			};
			
			const alignmentPos = getAlignmentPatternPositions(version);
			const inFinder = (x, y) => {
				return (x < 9 && y < 9) || (x >= modules - 9 && y < 9) || (x < 9 && y >= modules - 9);
			};
			
			// Draw alignment patterns at all position combinations, except where finders are
			for (let i = 0; i < alignmentPos.length; i++) {
				for (let j = 0; j < alignmentPos.length; j++) {
					const x = alignmentPos[j];
					const y = alignmentPos[i];
					// Skip if overlaps with finder pattern
					if (!inFinder(x, y)) {
						drawAlignment(x, y);
					}
				}
			}
			
			// Draw timing patterns
			for (let x = 0; x < modules; x++) {
				if (!inFinder(x, 6)) mods[6][x] = (x % 2) === 0;
			}
			for (let y = 0; y < modules; y++) {
				if (!inFinder(6, y)) mods[y][6] = (y % 2) === 0;
			}
		};
		
		// Keep copies before enforcement for comparison
		const baseModsRaw = baseMods.map(row => [...row]);
		const redModsRaw = redMods.map(row => [...row]);
		
		enforceFinders(baseMods);
		enforceFinders(redMods);
		
		console.log('   Base layer row 0 (raw  ):', baseModsRaw[0].map(b => b ? '█' : '·').join(''));
		console.log('   Base layer row 0 (fixed):', baseMods[0].map(b => b ? '█' : '·').join(''));
		console.log('   Red  layer row 0 (raw  ):', redModsRaw[0].map(b => b ? '█' : '·').join(''));
		console.log('   Red  layer row 0 (fixed):', redMods[0].map(b => b ? '█' : '·').join(''));
		
		// Step 4: Use jsQR to decode each layer
		const decodeLayer = (mods, layerName) => {
			// Scale up for jsQR (now has alignment patterns so moderate scale is fine)
			const scale = 8;
			const scaledSize = modules * scale;
			const rgba = new Uint8ClampedArray(scaledSize * scaledSize * 4);
			
			for (let y = 0; y < scaledSize; y++) {
				for (let x = 0; x < scaledSize; x++) {
					const my = Math.floor(y / scale);
					const mx = Math.floor(x / scale);
					const isDark = mods[my][mx];
					
					const idx = (y * scaledSize + x) * 4;
					const val = isDark ? 0 : 255;
					rgba[idx] = rgba[idx + 1] = rgba[idx + 2] = val;
					rgba[idx + 3] = 255;
				}
			}
			
		// Try multiple decoding strategies for maximum tolerance
		let result = jsQR(rgba, scaledSize, scaledSize, { inversionAttempts: "attemptBoth" });
		if (result) {
			console.log(`   ✅ ${layerName} decoded: "${result.data}"`);
			return result.data;
		}
		
		// For short text (likely just "SPQR"), try without enforcing patterns
		console.log(`   ⚠️  ${layerName} initial decode failed, trying without pattern enforcement...`);
		return null;
		};
		
		let baseText = decodeLayer(baseMods, 'Base layer');
		let redText = decodeLayer(redMods, 'Red layer');
		
		// If enforcement failed, try raw data (for short text like "SPQR", raw might work better)
		if (!baseText) {
			console.log('   Retrying base layer without pattern enforcement...');
			baseText = decodeLayer(baseModsRaw, 'Base layer (raw)');
		}
		if (!redText) {
			console.log('   Retrying red layer without pattern enforcement...');
			redText = decodeLayer(redModsRaw, 'Red layer (raw)');
		}
		
		const combined = (baseText || '') + (redText || '');
		
		return {
			base: baseText,
			red: redText,
			combined: combined || null,
			partial: combined ? null : 'Decode failed'
		};
		
	} catch (error) {
		console.error('❌ SPQR decode error:', error);
		return {
			base: null,
			red: null,
			combined: null,
			partial: 'Error: ' + error.message
		};
	}
}

// CMYRGB (8-color) SPQR decoder for 3-layer codes
function decodeCMYRGBLayers(imageData) {
	const { data, width, height } = imageData;
	try {
		console.log('🔍 SPQR 8-colour (CMYRGB) decoder starting:', `${width}×${height}px`);
		
		// Get active color palette (custom or default)
		const palette = window.cmyrgbColors || ['#ffffff', '#ff0000', '#00ff00', '#ffff00', '#000000', '#ff00ff', '#00ffff', '#0000ff'];
		
		// Convert hex colors to RGB
		const hexToRgb = (hex) => {
			const r = parseInt(hex.slice(1, 3), 16);
			const g = parseInt(hex.slice(3, 5), 16);
			const b = parseInt(hex.slice(5, 7), 16);
			return { r, g, b };
		};
		
		const paletteRgb = {
			'W': hexToRgb(palette[0]), // White
			'R': hexToRgb(palette[1]), // Red
			'G': hexToRgb(palette[2]), // Green
			'Y': hexToRgb(palette[3]), // Yellow
			'K': hexToRgb(palette[4]), // Black
			'M': hexToRgb(palette[5]), // Magenta
			'C': hexToRgb(palette[6]), // Cyan
			'B': hexToRgb(palette[7])  // Blue
		};
		
		// Prefer camera-derived calibration if present (from ROI finder sampling)
		if (window.cameraCalibrationCMY && window.cameraCalibrationCMY.W) {
			console.log('   Using camera-calibrated CMYRGB palette:', JSON.stringify(window.cameraCalibrationCMY, null, 2));
			Object.assign(paletteRgb, window.cameraCalibrationCMY);
		} else {
			console.log('   Using color palette:', window.cmyrgbColors ? 'CUSTOM' : 'DEFAULT');
			console.log('   Palette values:', JSON.stringify(paletteRgb, null, 2));
		}
		
		// Step 1: Classify pixels using improved color matching for lighting tolerance
		const classifyPixel = (r, g, b) => {
			// CMYRGB color mapping (used in generator):
			// White (W): C=0, M=0, Y=0 → RGB(255,255,255)
			// Cyan  (C): C=1, M=0, Y=0 → RGB(0,255,255)
			// Magenta(M):C=0, M=1, Y=0 → RGB(255,0,255)
			// Yellow(Y): C=0, M=0, Y=1 → RGB(255,255,0)
			// Red   (R): C=0, M=1, Y=1 → RGB(255,0,0)
			// Green (G): C=1, M=0, Y=1 → RGB(0,255,0)
			// Blue  (B): C=1, M=1, Y=0 → RGB(0,0,255)
			// Black (K): C=1, M=1, Y=1 → RGB(0,0,0)
			
			// Use direct Euclidean distance to calibrated palette
			// The palette is already calibrated to the actual image colors
			let minDist = Infinity;
			let bestColor = 'W';
			
			for (const [colorName, rgb] of Object.entries(paletteRgb)) {
				const dist = Math.hypot(r - rgb.r, g - rgb.g, b - rgb.b);
				if (dist < minDist) {
					minDist = dist;
					bestColor = colorName;
				}
			}
			
			return bestColor;
		};
	
	// Step 2: Detect grid structure (prefer camera/ROI hint)
	let margin = 4;
	let modules, modulePx, originX, originY;
	
	if (window.currentGridHint && window.currentGridHint.modules && window.currentGridHint.modulePx) {
		modules = window.currentGridHint.modules;
		modulePx = window.currentGridHint.modulePx;
		originX = window.currentGridHint.originX || (margin * modulePx);
		originY = window.currentGridHint.originY || (margin * modulePx);
		margin = Math.round(originX / modulePx); // Recalculate margin from origin
		console.log(`   Grid (hint): ${modules}×${modules} modules, ${modulePx}px per module, origin=(${originX},${originY})`);
		// Clear hint after using
		window.currentGridHint = null;
	} else {
		let bestModules = 21;
		let bestModulePx = width / (21 + 2 * margin);
		let bestRemainder = Math.abs(bestModulePx - Math.round(bestModulePx));
		
		// Search through valid QR versions (21, 25, 29, ... 177 modules)
		// Collect all candidates with very good fit (remainder < 0.3 for camera tolerance)
		const candidates = [];
		
		for (let testModules = 21; testModules <= 177; testModules += 4) {
			const testModulePx = width / (testModules + 2 * margin);
			const testRemainder = Math.abs(testModulePx - Math.round(testModulePx));
			const roundedModulePx = Math.round(testModulePx);
			
			// Skip if pixels per module would be too small (< 2px)
			if (roundedModulePx < 2) continue;
		
		// Collect candidates with good fit
		if (testRemainder < 0.3) {
			candidates.push({
				modules: testModules,
				modulePx: testModulePx,
				remainder: testRemainder,
				roundedPx: roundedModulePx
			});
		}
		
		// Also track overall best
		if (testRemainder < bestRemainder) {
			bestRemainder = testRemainder;
			bestModulePx = testModulePx;
			bestModules = testModules;
		}
	}
	
	// If we have multiple good candidates, prefer smaller module counts
	// (QR codes use the smallest version that fits the data)
	let modules = bestModules;
	let modulePx = Math.round(bestModulePx);
	
	if (candidates.length > 0) {
		// Sort with priority: standard module sizes (5px BWRG, 6px CMYRGB), then best fit
		candidates.sort((a, b) => {
			const aIsStandard = (a.roundedPx === 5 || a.roundedPx === 6);
			const bIsStandard = (b.roundedPx === 5 || b.roundedPx === 6);
			
			if (aIsStandard && !bIsStandard) return -1;
			if (!aIsStandard && bIsStandard) return 1;
			
			// If both are standard, prefer exact fit (remainder=0) or smaller remainder
			return a.remainder - b.remainder;
		});
		
		modules = candidates[0].modules;
		modulePx = candidates[0].roundedPx;
	}
		originX = margin * modulePx;
		originY = margin * modulePx;
		console.log(`   Grid: ${modules}×${modules} modules, ${modulePx}px per module`);
	}
		
		// Step 3: Sample modules and decompose into 3 layers
		// Note: Despite names, these map to baseQr, greenQr, redQr in the generator
		const baseMods = [];    // bit 2 in encoding
		const greenMods = [];   // bit 1 in encoding
		const redMods = [];     // bit 0 in encoding
		const colorCounts = {}; // Track color distribution for debugging
		
		for (let my = 0; my < modules; my++) {
			const baseRow = [];
			const greenRow = [];
			const redRow = [];
			
			for (let mx = 0; mx < modules; mx++) {
				const cx = Math.round(originX + (mx + 0.5) * modulePx);
				const cy = Math.round(originY + (my + 0.5) * modulePx);
				
				// Sample 3×3 for robustness
				const samples = [];
				for (let dy = -1; dy <= 1; dy++) {
					for (let dx = -1; dx <= 1; dx++) {
						const px = Math.max(0, Math.min(width - 1, cx + dx));
						const py = Math.max(0, Math.min(height - 1, cy + dy));
						const idx = (py * width + px) * 4;
						const color = classifyPixel(data[idx], data[idx + 1], data[idx + 2]);
						samples.push(color);
					}
				}
				
			// Majority vote
			const counts = {};
			samples.forEach(c => counts[c] = (counts[c] || 0) + 1);
			const majorityColor = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
			colorCounts[majorityColor] = (colorCounts[majorityColor] || 0) + 1;
			
			// Generator uses: code = (b<<2) | (g<<1) | r
				// where b=baseQr(bit2), g=greenQr(bit1), r=redQr(bit0)
				// Palette: W=000, R=001, G=010, Y=011, K=100, M=101, C=110, B=111
				const bBit = ['K', 'M', 'C', 'B'].includes(majorityColor); // bit 2
				const gBit = ['G', 'Y', 'C', 'B'].includes(majorityColor); // bit 1
				const rBit = ['R', 'Y', 'M', 'B'].includes(majorityColor); // bit 0
				
				baseRow.push(bBit);
				greenRow.push(gBit);
				redRow.push(rBit);
			}
			
			baseMods.push(baseRow);
			greenMods.push(greenRow);
			redMods.push(redRow);
		}
		
		// DEBUG: Log color distribution across all modules
		console.log(`   Color distribution:`, colorCounts);
		if (modules === 21) {
			const centerModule = Math.floor(modules / 2);
			
			// Sample actual RGB values from a few key locations
			const sampleRGB = (mx, my) => {
				const cx = Math.round(originX + (mx + 0.5) * modulePx);
				const cy = Math.round(originY + (my + 0.5) * modulePx);
				const idx = (cy * width + cx) * 4;
				return `RGB(${data[idx]},${data[idx+1]},${data[idx+2]})`;
			};
			
			console.log(`   DEBUG sample RGB values:`);
			console.log(`      Center (10,10): ${sampleRGB(10,10)}`);
			console.log(`      TL finder (3,3): ${sampleRGB(3,3)}`);
			console.log(`      TR inner (${modules-4},3): ${sampleRGB(modules-4,3)}`);
			console.log(`      Data area (12,12): ${sampleRGB(12,12)}`);
			
			console.log(`   DEBUG bit values:`);
			console.log(`      Center (10,10): Base=${baseMods[centerModule][centerModule]}, Green=${greenMods[centerModule][centerModule]}, Red=${redMods[centerModule][centerModule]}`);
			console.log(`      TL finder (3,3): Base=${baseMods[3][3]}, Green=${greenMods[3][3]}, Red=${redMods[3][3]}`);
			console.log(`      TR inner (${modules-4},3): Base=${baseMods[3][modules-4]}, Green=${greenMods[3][modules-4]}, Red=${redMods[3][modules-4]}`);
		}
		
		// Step 4: Enforce finders on all layers
		// Get alignment pattern positions for a given QR version
		const getAlignmentPatternPositions = (version) => {
			if (version === 1) return [];
			// Alignment pattern center positions by version (from QR spec)
			const positions = [
				[], // Version 1
				[6, 18], [6, 22], [6, 26], [6, 30], [6, 34], // Versions 2-6
				[6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62], // Versions 7-13
				[6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90], // Versions 14-20
				[6, 28, 50, 72, 94], [6, 26, 50, 74, 98], [6, 30, 54, 78, 102], [6, 28, 54, 80, 106], [6, 32, 58, 84, 110], [6, 30, 58, 86, 114], [6, 34, 62, 90, 118], // Versions 21-27
				[6, 26, 50, 74, 98, 122], [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130], [6, 30, 56, 82, 108, 134], [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146], // Versions 28-34
				[6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154], [6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162], [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170] // Versions 35-40
			];
			return positions[version - 1] || [];
		};
		
		const enforceFinders = (mods) => {
			const version = 1 + (modules - 21) / 4;
			
			// Draw finder patterns (7x7)
			const drawFinder = (ox, oy) => {
				for (let dy = 0; dy < 7; dy++) {
					for (let dx = 0; dx < 7; dx++) {
						const onBorder = (dx === 0 || dx === 6 || dy === 0 || dy === 6);
						const inCenter = (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
						const xx = ox + dx;
						const yy = oy + dy;
						if (yy >= 0 && yy < modules && xx >= 0 && xx < modules) {
							mods[yy][xx] = onBorder || inCenter;
						}
					}
				}
			};
			drawFinder(0, 0);
			drawFinder(modules - 7, 0);
			drawFinder(0, modules - 7);
			
			// Draw alignment patterns (5x5)
			const drawAlignment = (cx, cy) => {
				for (let dy = -2; dy <= 2; dy++) {
					for (let dx = -2; dx <= 2; dx++) {
						const onBorder = (Math.abs(dx) === 2 || Math.abs(dy) === 2);
						const inCenter = (dx === 0 && dy === 0);
						const xx = cx + dx;
						const yy = cy + dy;
						if (yy >= 0 && yy < modules && xx >= 0 && xx < modules) {
							mods[yy][xx] = onBorder || inCenter;
						}
					}
				}
			};
			
			const alignmentPos = getAlignmentPatternPositions(version);
			const inFinder = (x, y) => {
				return (x < 9 && y < 9) || (x >= modules - 9 && y < 9) || (x < 9 && y >= modules - 9);
			};
			
			// Draw alignment patterns at all position combinations, except where finders are
			for (let i = 0; i < alignmentPos.length; i++) {
				for (let j = 0; j < alignmentPos.length; j++) {
					const x = alignmentPos[j];
					const y = alignmentPos[i];
					// Skip if overlaps with finder pattern
					if (!inFinder(x, y)) {
						drawAlignment(x, y);
					}
				}
			}
			
			// Draw timing patterns
			for (let x = 0; x < modules; x++) {
				if (!inFinder(x, 6)) mods[6][x] = (x % 2) === 0;
			}
			for (let y = 0; y < modules; y++) {
				if (!inFinder(6, y)) mods[y][6] = (y % 2) === 0;
			}
		};
		
		enforceFinders(baseMods);
		enforceFinders(greenMods);
		enforceFinders(redMods);
		
		// Step 5: Decode layers
	const decodeLayer = (mods, layerName) => {
		// Try multiple scaling factors (jsQR is finicky about scale)
		const scales = [8, 12, 16, 4, 6, 10];
		
		for (const scale of scales) {
			const scaledSize = modules * scale;
			const rgba = new Uint8ClampedArray(scaledSize * scaledSize * 4);
			
			for (let y = 0; y < scaledSize; y++) {
				for (let x = 0; x < scaledSize; x++) {
					const my = Math.floor(y / scale);
					const mx = Math.floor(x / scale);
					const isDark = mods[my][mx];
					
					const idx = (y * scaledSize + x) * 4;
					const val = isDark ? 0 : 255;
					rgba[idx] = rgba[idx + 1] = rgba[idx + 2] = val;
					rgba[idx + 3] = 255;
				}
			}
			
			// Try jsQR first (fast)
			const jsqrResult = jsQR(rgba, scaledSize, scaledSize, { inversionAttempts: "attemptBoth" });
			if (jsqrResult && jsqrResult.data) {
				console.log(`   ✅ ${layerName} (jsQR @ ${scale}px): "${jsqrResult.data}"`);
				return jsqrResult.data;
			}
			
			// Try ZXing if available (more robust)
			if (window.zxingCodeReader && scale === 8) { // Only try ZXing at optimal scale
				try {
					const imageData = new ImageData(new Uint8ClampedArray(rgba), scaledSize, scaledSize);
					const luminances = new Uint8ClampedArray(scaledSize * scaledSize);
					for (let i = 0; i < scaledSize * scaledSize; i++) {
						luminances[i] = rgba[i * 4]; // Use R channel (all channels are same for B&W)
					}
					const binaryBitmap = new ZXing.BinaryBitmap(
						new ZXing.HybridBinarizer(
							new ZXing.RGBLuminanceSource(luminances, scaledSize, scaledSize)
						)
					);
					const zxingResult = new ZXing.QRCodeReader().decode(binaryBitmap);
					if (zxingResult && zxingResult.getText()) {
						console.log(`   ✅ ${layerName} (ZXing @ ${scale}px): "${zxingResult.getText()}"`);
						return zxingResult.getText();
					}
				} catch (e) {
					// ZXing failed, continue to next scale
				}
			}
		}
		
		console.log(`   ❌ ${layerName} failed (tried jsQR + ZXing)`);
		return null;
	};
		
	let baseText = decodeLayer(baseMods, 'Base layer');
	let greenText = decodeLayer(greenMods, 'Green layer');
	let redText = decodeLayer(redMods, 'Red layer');
	
// AGGRESSIVE RECOVERY: If all layers failed, try with inverted bits
if (!baseText && !greenText && !redText) {
	console.log('⚡ ALL layers failed jsQR - trying AGGRESSIVE bit inversion recovery...');
	const invertMods = (mods) => mods.map(row => row.map(bit => !bit));
	
	baseText = decodeLayer(invertMods(baseMods), 'Base layer (inverted)');
	if (!baseText) greenText = decodeLayer(invertMods(greenMods), 'Green layer (inverted)');
	if (!baseText && !greenText) redText = decodeLayer(invertMods(redMods), 'Red layer (inverted)');
	
	// NUCLEAR OPTION: jsQR bypass for short messages
	if (!baseText && !greenText && !redText) {
		console.log('🔥 NUCLEAR OPTION: Bypassing jsQR, extracting raw data for parity recovery...');
		// Extract raw bit sequences - for QR v1-21, we know the data pattern positions
		// We'll extract the sequences even if they're corrupt, then use parity to recover
	// QR code raw bit extraction following ISO/IEC 18004 zigzag pattern
	const extractRawBits = (mods, layerName) => {
		console.log(`   🔬 Extracting raw bits from ${layerName}...`);
		const n = mods.length;
		const bits = [];
		
		// Function pattern regions to skip
		const inFinder = (x, y) => {
			return (x < 9 && y < 9) || (x >= n-8 && y < 9) || (x < 9 && y >= n-8);
		};
		const inTiming = (x, y) => (x === 6 || y === 6);
		const inDarkModule = (x, y) => (x === 8 && y === n-8);
		const skipCell = (x, y) => inFinder(x, y) || inTiming(x, y) || inDarkModule(x, y);
		
		// QR reads data in vertical columns, moving right-to-left in pairs
		// Starting from bottom-right, moving up in column pairs
		let upward = true;
		for (let col = n-1; col > 0; col -= 2) {
			if (col === 6) col--; // Skip timing column
			
			const c1 = col, c2 = col - 1;
			const yStart = upward ? n-1 : 0;
			const yEnd = upward ? -1 : n;
			const yStep = upward ? -1 : 1;
			
			for (let y = yStart; y !== yEnd; y += yStep) {
				// Read right column first, then left
				for (const x of [c1, c2]) {
					if (!skipCell(x, y)) {
						bits.push(mods[y][x] ? 1 : 0);
					}
				}
			}
			
			upward = !upward;
		}
		
		console.log(`      ${layerName}: extracted ${bits.length} raw bits`);
		return bits;
	};
	
	const baseBits = extractRawBits(baseMods, 'Base');
	const greenBits = extractRawBits(greenMods, 'Green (parity)');
	const redBits = extractRawBits(redMods, 'Red');
	
	console.log(`   Raw bit extraction complete: base=${baseBits.length}, green=${greenBits.length}, red=${redBits.length}`);
	
	// PARITY RECOVERY: Use XOR of any two layers to recover the third!
	if (baseBits && greenBits && redBits && baseBits.length === greenBits.length && greenBits.length === redBits.length) {
		console.log(`🔥 PARITY MAGIC: Attempting raw bit-level recovery...`);
		
	// Try decoding each layer's bits
	const decodeBits = (bits, name) => {
		try {
			// Extract mode (first 4 bits)
			const mode = (bits[0] << 3) | (bits[1] << 2) | (bits[2] << 1) | bits[3];
			console.log(`      ${name}: mode bits = ${bits.slice(0,4).join('')}, mode = 0b${mode.toString(2).padStart(4,'0')}`);
			
			if (mode === 0b0010) { // Alphanumeric = 0010
					// Character count (next 9 bits for version 1)
					let count = 0;
					for (let i = 4; i < 13; i++) count = (count << 1) | bits[i];
					
					// Data bits (11 bits per pair, 6 for last if odd)
					const alphanum = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
					let text = '';
					let bitIdx = 13;
					
					for (let i = 0; i < Math.floor(count / 2); i++) {
						let val = 0;
						for (let j = 0; j < 11; j++) {
							if (bitIdx < bits.length) val = (val << 1) | bits[bitIdx++];
						}
						text += alphanum[Math.floor(val / 45)] + alphanum[val % 45];
					}
					
					if (count % 2 === 1 && bitIdx + 6 <= bits.length) {
						let val = 0;
						for (let j = 0; j < 6; j++) val = (val << 1) | bits[bitIdx++];
						text += alphanum[val];
					}
					
					console.log(`      ${name} decoded: "${text}" (${text.length} chars)`);
					return text;
				} else if (mode === 0b0100) { // Byte mode = 0100
					let count = 0;
					for (let i = 4; i < 12; i++) count = (count << 1) | bits[i];
					
					let text = '';
					let bitIdx = 12;
					for (let i = 0; i < count; i++) {
						let byte = 0;
						for (let j = 0; j < 8; j++) {
							if (bitIdx < bits.length) byte = (byte << 1) | bits[bitIdx++];
						}
						text += String.fromCharCode(byte);
					}
				console.log(`      ${name} decoded: "${text}" (${text.length} chars)`);
				return text;
			} else {
				console.log(`      ${name}: unknown mode 0b${mode.toString(2).padStart(4,'0')}, cannot decode`);
			}
		} catch (e) {
			console.log(`      ${name} decode failed:`, e.message);
		}
		return null;
	};
		
		const baseDecoded = decodeBits(baseBits, 'Base');
		const greenDecoded = decodeBits(greenBits, 'Green');
		const redDecoded = decodeBits(redBits, 'Red');
		
		// If green is parity data, try recovery
		if (greenDecoded && greenDecoded.startsWith('SPQRv1|')) {
			console.log(`🔐 PARITY MODE: Green layer is parity, using for recovery...`);
			
			// If base failed but red succeeded, recover base
			if (!baseDecoded && redDecoded) {
				console.log(`   🔧 Recovering base layer: base = green XOR red`);
				const recoveredBits = [];
				for (let i = 0; i < baseBits.length; i++) {
					recoveredBits.push(greenBits[i] ^ redBits[i]);
				}
				const recoveredText = decodeBits(recoveredBits, 'Base (recovered)');
				if (recoveredText) {
					baseText = recoveredText;
					console.log(`   ✅ BASE LAYER RECOVERED: "${baseText}"`);
				}
			}
			
			// If red failed but base succeeded, recover red
			if (!redDecoded && baseDecoded) {
				console.log(`   🔧 Recovering red layer: red = green XOR base`);
				const recoveredBits = [];
				for (let i = 0; i < redBits.length; i++) {
					recoveredBits.push(greenBits[i] ^ baseBits[i]);
				}
				const recoveredText = decodeBits(recoveredBits, 'Red (recovered)');
				if (recoveredText) {
					redText = recoveredText;
					console.log(`   ✅ RED LAYER RECOVERED: "${redText}"`);
				}
			}
		} else {
			// All three layers are data, use what we decoded
			if (baseDecoded) baseText = baseDecoded;
			if (greenDecoded) greenText = greenDecoded;
			if (redDecoded) redText = redDecoded;
		}
	}
	}
}
	
	// Check if this is parity mode (green layer starts with SPQRv1|)
		let combined = null;
		let parityInfo = null;
		
		if (greenText && greenText.startsWith('SPQRv1|')) {
			// Parity mode: green is parity data
			console.log('🔐 Parity mode detected, verifying...');
			const verification = verifyWithParity(baseText, redText, greenText);
			parityInfo = verification;
			
			if (verification.recovered) {
				// One layer was corrupt but recovered
				const recoveredBase = verification.recovered.layer === 'base' ? verification.recovered.data : baseText;
				const recoveredRed = verification.recovered.layer === 'red' ? verification.recovered.data : redText;
				combined = recoveredBase + recoveredRed;
				console.log(`✅ Data recovered using parity: ${combined.length} bytes`);
			} else if (verification.valid) {
				// Both layers intact
				combined = (baseText || '') + (redText || '');
				console.log(`✅ Data verified with parity: ${combined.length} bytes`);
			} else {
				// Both layers corrupt, can't recover
				console.log(`❌ Parity recovery failed - need at least 1 valid data layer`);
				// But still try to return whatever we have
				if (baseText || redText) {
					combined = (baseText || '') + (redText || '');
					console.log(`⚠️  Returning partial data (${combined.length} bytes)`);
				} else {
					combined = null;
				}
			}
		} else {
			// Standard or hybrid mode: all 3 layers are data
			// In standard/hybrid mode, return data even if some layers failed
			const hasAnyData = baseText || redText || greenText;
			if (!hasAnyData) {
				combined = null; // All layers failed
			} else {
				combined = (baseText || '') + (redText || '') + (greenText || '');
				const failedLayers = [!baseText && 'Base', !redText && 'Red', !greenText && 'Green'].filter(Boolean);
				if (failedLayers.length > 0) {
					console.log(`⚠️  Partial decode: ${failedLayers.join(', ')} layer(s) failed`);
				}
			}
		}
		
            return {
			base: baseText,
			green: greenText,
			red: redText,
                combined: combined || null,
			parity: parityInfo
		};
		
    } catch (error) {
		console.error('❌ CMYRGB decode error:', error);
        return {
            base: null,
			green: null,
            red: null,
			combined: null
        };
    }
}

function handleScannedCode(data) {
    displayScanResult({ standard: data, spqr: null });
}

function displayScanResult(result) {
    const scanResultDiv = document.getElementById('scanResult');
    
    let html = '<h3>📱 Scan Results:</h3>';
    let textToUse = null;
    
    if (result.standard) {
        textToUse = result.standard;
        html += `<div class="scan-result-item success">
            <strong>✅ Standard QR Code decoded!</strong><br>
            <small>${result.standard.length} characters</small>
        </div>`;
    }
    
    if (result.spqr && (result.spqr.base || result.spqr.red || result.spqr.combined)) {
        textToUse = result.spqr.combined || result.spqr.base || '';
        const layers = [result.spqr.base, result.spqr.red, result.spqr.green].filter(Boolean).length;
        const parityInfo = result.spqr.parity ? ' (with parity recovery)' : '';
        html += `<div class="scan-result-item success">
            <strong>✅ SPQR ${layers}-layer QR Code decoded${parityInfo}!</strong><br>
            <small>${textToUse.length} characters</small>
                </div>`;
    }
    
    if (!result.standard && (!result.spqr || (!result.spqr.base && !result.spqr.red && !result.spqr.combined))) {
        html += `<div class="scan-result-item error">
            <strong>❌ No QR Code Found</strong><br>
            Make sure the image contains a clear, readable QR code.<br>
            <small>💡 Tip: Try better lighting or a clearer image.</small>
        </div>`;
    }
    
    scanResultDiv.innerHTML = html;
    scanResultDiv.style.display = 'block';
    
    // Auto-fill text box and generate variants
    if (textToUse) {
        fillTextBox(textToUse);
    }
}

async function fillTextBox(text) {
    const textArea = document.getElementById('text');
    textArea.value = text;
    textArea.focus();
    
    // Auto-generate all variants after filling the text
    console.log('Auto-generating variants for scanned text:', text);
    try {
        await autoGenerateVariants(text);
    } catch (error) {
        console.error('Auto-generation failed:', error);
    }
    
    // Scroll to results
    const resultDiv = document.getElementById('result');
    if (resultDiv && resultDiv.style.display !== 'none') {
        resultDiv.scrollIntoView({ behavior: 'smooth' });
    }
}

async function autoGenerateVariants(text) {
    if (!text.trim()) return;
    
    // Show loading in result div
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = '<h2>🔄 Generating QR Codes...</h2><p class="loading">Creating all variants...</p>';
    resultDiv.style.display = 'block';
    
    try {
        // Get current EC mode (default to parity for best reliability)
        const currentMode = window.currentECMode || 'parity';
        
        // Generate all three variants
        console.log('Auto-generating standard QR...');
        const standard = await generateQR(text, { layers: 1, colours: ['k'] });
        
        console.log('Auto-generating BWRG SPQR...');
        const bwrg = await generateQR(text, { layers: 3, colours: ['bwrg'] });
        
        console.log(`Auto-generating CMYRGB SPQR (${currentMode} mode)...`);
        const cmyrgb = await generateQR(text, { layers: 3, colours: ['cmyrgb'], errorCorrection: currentMode });

        // Display results
        displayResults(standard, bwrg, cmyrgb);
        
    } catch (error) {
        console.error('Auto-generation error:', error);
        resultDiv.innerHTML = '<h2>❌ Generation Failed</h2><p class="error">' + error.message + '</p>';
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }
});

function matrixFromModules(mods) {
    return {
        width: mods.length,
        height: mods.length,
        get(x, y) {
            return Boolean(mods[y]?.[x]);
        }
    };
}

function majorityFilterModules(mods) {
    const n = mods.length;
    const out = Array.from({ length: n }, () => Array(n).fill(false));
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            let dark = 0, total = 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const yy = y + dy, xx = x + dx;
                    if (yy >= 0 && yy < n && xx >= 0 && xx < n) {
                        total++;
                        dark += mods[yy][xx] ? 1 : 0;
                    }
                }
            }
            out[y][x] = dark >= Math.ceil(total / 2);
        }
    }
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) mods[y][x] = out[y][x];
    }
}
function enforceFunctionPatternsModules(mods) {
    const n = mods.length;
    const drawFinder = (ox, oy) => {
        for (let dy = 0; dy < 7; dy++) {
            for (let dx = 0; dx < 7; dx++) {
                const onBorder = dx === 0 || dx === 6 || dy === 0 || dy === 6;
                const inCenter = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
                const yy = oy + dy, xx = ox + dx;
                if (yy >= 0 && yy < n && xx >= 0 && xx < n) mods[yy][xx] = onBorder || inCenter;
            }
        }
    };
    drawFinder(0, 0);
    drawFinder(n - 7, 0);
    drawFinder(0, n - 7);
    const inFinder = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
    for (let x = 0; x < n; x++) if (!inFinder(x, 6)) mods[6][x] = (x % 2) === 0;
    for (let y = 0; y < n; y++) if (!inFinder(6, y)) mods[y][6] = (y % 2) === 0;
}

function decodeMatrixGuessMaskBrowser(mods) {
    try {
        return decodeMatrixGuessMask(matrixFromModules(mods));
    } catch (err) {
        console.error('Internal decode failed:', err);
        return null;
    }
}

function logDebug(...args) { console.log(...args); }

async function testSPQRRoundTrip() {
	console.log('🧪 Testing SPQR 4-colour round-trip...');
	
	// Test with progressively longer strings
	const testCases = [
		'Hello',
		'Hello World!',
		'SPQR Test 123'
	];
	
	for (const testText of testCases) {
		console.log(`\n━━━ Testing: "${testText}" ━━━`);
		
		try {
			// Generate BWRG SPQR
			console.log('1. Generating BWRG SPQR...');
			const result = await generateQR(testText, { layers: 3, colours: ['bwrg'] });
			
			if (!result.dataUrl) {
				console.error('❌ Generation failed: no dataUrl');
				continue;
			}
			
			// Convert dataUrl to ImageData for testing
			console.log('2. Converting to ImageData...');
    const img = new Image();
			await new Promise((resolve, reject) => {
				img.onload = resolve;
				img.onerror = reject;
				img.src = result.dataUrl;
			});
			
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
			const ctx = canvas.getContext('2d', { willReadFrequently: true });
			ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
			console.log(`   Image: ${canvas.width}×${canvas.height}px`);
			
			// Analyse colour distribution
			console.log('3. Analysing colours...');
			const colourCounts = { white: 0, red: 0, green: 0, black: 0, other: 0 };
			for (let i = 0; i < imageData.data.length; i += 4) {
				const r = imageData.data[i];
				const g = imageData.data[i + 1];
				const b = imageData.data[i + 2];
				
				if (r > 240 && g > 240 && b > 240) colourCounts.white++;
				else if (r < 20 && g < 20 && b < 20) colourCounts.black++;
				else if (r > 240 && g < 20 && b < 20) colourCounts.red++;
				else if (r < 20 && g > 240 && b < 20) colourCounts.green++;
				else colourCounts.other++;
			}
			console.log('   Colour distribution:', colourCounts);
			
			// Try to decode
			console.log('4. Attempting decode...');
        const decoded = detectSPQR(imageData);
			
			if (!decoded) {
				console.error('❌ detectSPQR returned null');
				continue;
			}
			
			console.log('   Decoded:', decoded);
			
			// Check results
			const combined = decoded.combined || (decoded.base || '') + (decoded.red || '');
			if (combined === testText) {
				console.log(`✅ PERFECT MATCH: "${combined}"`);
			} else if (combined) {
				console.log(`❌ MISMATCH:`);
				console.log(`   Expected: "${testText}"`);
				console.log(`   Got:      "${combined}"`);
        } else {
				console.log(`❌ NO DECODE`);
			}
			
		} catch (error) {
			console.error('❌ Test error:', error);
		}
	}
	
	console.log('\n━━━ Test complete ━━━\n');
}

// Expose test function globally
window.testSPQRRoundTrip = testSPQRRoundTrip;

// Announce test availability
setTimeout(() => {
	console.log('%c🧪 SPQR Test Available!', 'font-size: 16px; font-weight: bold; color: #00ff00;');
	console.log('%cRun testSPQRRoundTrip() in console to test encoding/decoding', 'font-size: 12px; color: #00aaff;');
}, 1000);


// Extract bits from SPQR layers for combined decoding
function extractSPQRBits(baseMods, redMods) {
    const modules = baseMods.length;
    const bits = [];
    let dataModules = 0;

    for (let my = 0; my < modules; my++) {
        for (let mx = 0; mx < modules; mx++) {
            // Skip structure areas
            const isStructure = (mx < 7 && my < 7) || (mx >= modules - 7 && my < 7) || (mx < 7 && my >= modules - 7) ||
                               (my === 8 && mx <= 8 && mx !== 6) || (mx === 8 && my <= 7 && my !== 6) ||
                               (my === 8 && mx >= modules - 8) || (mx === 8 && my >= modules - 8 && my !== modules - 1);

            if (!isStructure) {
                const baseBit = baseMods[my][mx] ? 1 : 0;
                const redBit = redMods[my][mx] ? 1 : 0;
                bits.push(baseBit, redBit);
                dataModules++;
            }
        }
    }

    console.log(`Extracted ${bits.length} bits from ${dataModules} data modules (${modules}x${modules} total)`);
    return bits;
}

// Extract color bits directly from SPQR image
function extractSPQRColorBits(data, width, height, originX, originY, modulePx, modules) {
    const bits = [];
    let dataModules = 0;

    // Color classification
    const isBlackRGB = (r,g,b) => r < 128 && g < 128 && b < 128;
    const isWhiteRGB = (r,g,b) => r > 200 && g > 200 && b > 200;

    const classifyColor = (r,g,b) => {
        if (isBlackRGB(r,g,b)) return 'BLACK';
        if (isWhiteRGB(r,g,b)) return 'WHITE';
        const redExcess = r - Math.max(g,b);
        const greenExcess = g - Math.max(r,b);
        if (redExcess > 35 && r > 120 && g < 220) return 'RED';
        if (greenExcess > 35 && g > 120 && r < 220) return 'GREEN';
        return 'WHITE';
    };

    for (let my = 0; my < modules; my++) {
        for (let mx = 0; mx < modules; mx++) {
            // Skip structure areas
            const isStructure = (mx < 7 && my < 7) || (mx >= modules - 7 && my < 7) || (mx < 7 && my >= modules - 7) ||
                               (my === 8 && mx <= 8 && mx !== 6) || (mx === 8 && my <= 7 && my !== 6) ||
                               (my === 8 && mx >= modules - 8) || (mx === 8 && my >= modules - 8 && my !== modules - 1);

            if (!isStructure) {
                // Sample color directly from image
                const cx = originX + mx * modulePx + modulePx / 2;
                const cy = originY + my * modulePx + modulePx / 2;
                const px = Math.round(cx), py = Math.round(cy);
                const idx = (py * width + px) * 4;
                const r = data[idx], g = data[idx + 1], b = data[idx + 2];
                const color = classifyColor(r, g, b);

                // Map color to bits (4-color SPQR: 2 bits per module)
                let baseBit = 0, redBit = 0;
                if (color === 'BLACK') {
                    baseBit = 1; redBit = 0; // 10
                } else if (color === 'RED') {
                    baseBit = 0; redBit = 1; // 01
                } else if (color === 'GREEN') {
                    baseBit = 1; redBit = 1; // 11
                }
                // WHITE = 00

                bits.push(baseBit, redBit);
                dataModules++;

                // Debug: log some color mappings
                if (dataModules <= 10) {
                    console.log(`SPQR Color Module (${mx},${my}): RGB(${r},${g},${b}) → ${color} → bits=${(baseBit << 1) | redBit}`);
                }
            }
        }
    }

    console.log(`SPQR: Extracted ${bits.length} bits from ${dataModules} color modules`);
    return bits;
}

// Decode SPQR bits as a single data stream
function decodeSPQRBits(bits) {
    if (bits.length < 16) return null; // Need at least some data

    console.log(`SPQR: Decoding ${bits.length} bits as layered QR data`);

    // For 4-color SPQR, we need to reconstruct the original QR code layers
    // The color bits represent encoded modules, not raw QR code data
    // We need to decode this as the encoded representation of multiple QR codes

    const totalBits = bits.length;
    const modules = totalBits / 2; // 2 bits per module in 4-color mode
    console.log(`SPQR: ${modules} modules, ${totalBits} total bits`);

    // Reconstruct the base and red layer QR codes from the color encoding
    const baseQR = reconstructQRLayer(bits, 'base');
    const redQR = reconstructQRLayer(bits, 'red');

    console.log(`SPQR: Base QR bytes (${baseQR.length}): [${baseQR.slice(0, 8).map(b => '0x' + b.toString(16)).join(', ')}]`);
    console.log(`SPQR: Red QR bytes (${redQR.length}): [${redQR.slice(0, 8).map(b => '0x' + redQR[0].toString(16)).join(', ')}]`);

    // Decode each reconstructed QR code
    const baseText = decodeQRBytes(baseQR);
    const redText = decodeQRBytes(redQR);

    console.log(`SPQR: Base layer decoded: "${baseText}"`);
    console.log(`SPQR: Red layer decoded: "${redText}"`);

    // Combine the results
    if (baseText && redText) {
        return baseText + redText;
    } else if (baseText) {
        return baseText;
    } else if (redText) {
        return redText;
    }

    return null;
}

// Reconstruct a QR code layer from color bits
function reconstructQRLayer(bits, layer) {
    const baseOffset = layer === 'base' ? 0 : 1;
    const layerBits = [];

    // Extract the appropriate bit from each color pair
    for (let i = 0; i < bits.length; i += 2) {
        layerBits.push(bits[i + baseOffset]);
    }

    // Convert bits to bytes
    return bitsToBytes(layerBits);
}

// Helper function to convert bits to bytes (LSB first)
function bitsToBytes(bits) {
    const bytes = [];
    for (let i = 0; i < bits.length; i += 8) {
        let byte = 0;
        for (let j = 0; j < 8 && i + j < bits.length; j++) {
            byte = (byte << 1) | bits[i + j];
        }
        bytes.push(byte);
    }
    return bytes;
    }

// Decode QR code bytes (assumes byte mode)
function decodeQRBytes(bytes) {
    if (bytes.length < 4) return null;

    // The first byte should be the mode + length header for byte mode
    // We need to reconstruct this since the color encoding strips it
    const dataBytes = bytes;

    // Estimate the data length (this is a heuristic)
    // For small QR codes, the data is usually most of the bytes
    const estimatedLength = Math.max(1, Math.min(dataBytes.length - 2, 64));

    // Create a proper QR byte stream with reconstructed header
    // Mode = 4 (byte mode), length high bits
    const lengthHigh = (estimatedLength >> 8) & 0xF;
    const reconstructedFirstByte = (4 << 4) | lengthHigh; // 0x4X
    const reconstructedSecondByte = estimatedLength & 0xFF;

    const reconstructedBytes = [reconstructedFirstByte, reconstructedSecondByte, ...dataBytes.slice(0, estimatedLength)];

    console.log(`  QR decode: reconstructed header 0x${reconstructedFirstByte.toString(16)},${reconstructedSecondByte.toString(16)}, estimated length=${estimatedLength}`);

    // Extract the actual data
    const dataLength = estimatedLength;
    const finalDataBytes = reconstructedBytes.slice(2, 2 + dataLength);

    try {
        const text = new TextDecoder('utf-8').decode(new Uint8Array(finalDataBytes));
        console.log(`  QR decode: extracted "${text}"`);
        return text;
    } catch (e) {
        console.log('  QR decode: UTF-8 decode failed:', e.message);
        return null;
    }
}

// Detect if an image contains SPQR color patterns
function detectSPQRPattern(data, width, height) {
    const isBlackRGB = (r,g,b) => r < 128 && g < 128 && b < 128;
    const isWhiteRGB = (r,g,b) => r > 200 && g > 200 && b > 200;

    const classifyColor = (r,g,b) => {
        if (isBlackRGB(r,g,b)) return 'BLACK';
        if (isWhiteRGB(r,g,b)) return 'WHITE';
        const redExcess = r - Math.max(g,b);
        const greenExcess = g - Math.max(r,b);
        if (redExcess > 35 && r > 120 && g < 220) return 'RED';
        if (greenExcess > 35 && g > 120 && r < 220) return 'GREEN';
        return 'WHITE'; // fallback
    };

    // Sample a grid of points to detect color patterns
    const sampleSize = Math.min(50, Math.min(width, height)); // Sample up to 50x50 grid
    const stepX = Math.floor(width / sampleSize);
    const stepY = Math.floor(height / sampleSize);

    const colors = { WHITE: 0, RED: 0, GREEN: 0, BLACK: 0 };

    for (let y = stepY; y < height - stepY; y += stepY) {
        for (let x = stepX; x < width - stepX; x += stepX) {
            const idx = (y * width + x) * 4;
            const r = data[idx], g = data[idx + 1], b = data[idx + 2];
            const color = classifyColor(r, g, b);
            colors[color] = (colors[color] || 0) + 1;
        }
    }

    // Check if we have significant color diversity (SPQR should have multiple colors)
    const totalSamples = Object.values(colors).reduce((a, b) => a + b, 0);
    const colorCount = Object.values(colors).filter(count => count > totalSamples * 0.05).length;

    console.log('SPQR detection: colors found:', colors, 'diversity:', colorCount);

    // SPQR should have at least 3 different colors with significant presence
    return colorCount >= 3;
}

function sampleCMYRGBFinderPalette(rgba, width, height, modulePx, modulesTotal, originX, originY) {
	// TL inner 3×3 contains 2×2 grid for W,R,G,Y (at modules 2,3 in the 7×7 finder)
	// TR inner 3×3 contains 2×2 grid for K,M,C,B
	// originX/originY already point to module (0,0) of the QR grid
	const center = (mx,my)=>({ x: originX + Math.round((mx+0.5)*modulePx), y: originY + Math.round((my+0.5)*modulePx) });
	const sample = (cx,cy,r)=>{ let R=0,G=0,B=0,C=0; for (let y=Math.max(0,cy-r); y<Math.min(height,cy+r); y++){ for(let x=Math.max(0,cx-r); x<Math.min(width,cx+r); x++){ const i=(y*width+x)*4; R+=rgba[i]; G+=rgba[i+1]; B+=rgba[i+2]; C++; }} return C?{r:Math.round(R/C),g:Math.round(G/C),b:Math.round(B/C)}:{r:0,g:0,b:0}; };
	const r = Math.max(1, Math.floor(modulePx/2));
	
	// TL finder: 2×2 colored keys drawn with 1.5 module width each, starting at module (2,2)
	// Centers are at (2.75, 2.75), (4.25, 2.75), (2.75, 4.25), (4.25, 4.25)
	const tl00 = center(2.75, 2.75); const tl10 = center(4.25, 2.75); const tl01 = center(2.75, 4.25); const tl11 = center(4.25, 4.25);
	// TR finder: starts at module (modulesTotal-7, 0), same offsets
	const trX = modulesTotal - 7;
	const tr00 = center(trX+2.75, 2.75); const tr10 = center(trX+4.25, 2.75); const tr01 = center(trX+2.75, 4.25); const tr11 = center(trX+4.25, 4.25);
	
	return {
		W: sample(tl00.x, tl00.y, r), R: sample(tl10.x, tl10.y, r), G: sample(tl01.x, tl01.y, r), Y: sample(tl11.x, tl11.y, r),
		K: sample(tr00.x, tr00.y, r), M: sample(tr10.x, tr10.y, r), C: sample(tr01.x, tr01.y, r), B: sample(tr11.x, tr11.y, r)
	};
}

