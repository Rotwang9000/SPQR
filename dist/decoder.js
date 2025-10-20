import sharp from 'sharp';
import jsQR from 'jsqr';
import { readFile } from 'node:fs/promises';
import { decodeMatrixGuessMask, matrixFromModules } from './decoderCore.js';
const DEBUG = /^(1|true|yes)$/i.test(process.env.SPQR_DEBUG ?? '');
const debugLog = (...args) => { if (DEBUG)
    console.log(...args); };
function majorityFilterMods(mods) {
    const h = mods.length, w = mods[0]?.length ?? 0;
    const out = Array.from({ length: h }, () => Array(w).fill(false));
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let dark = 0, tot = 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const yy = y + dy, xx = x + dx;
                    if (yy >= 0 && yy < h && xx >= 0 && xx < w) {
                        tot++;
                        dark += mods[yy][xx] ? 1 : 0;
                    }
                }
            }
            out[y][x] = dark >= Math.ceil(tot / 2);
        }
    }
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
            mods[y][x] = out[y][x];
}
function enforceFunctionPatterns(mods) {
    const n = mods.length;
    const drawFinder = (gx, gy) => {
        for (let dy = 0; dy < 7; dy++) {
            for (let dx = 0; dx < 7; dx++) {
                const onBorder = dx === 0 || dx === 6 || dy === 0 || dy === 6;
                const inCenter = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
                const yy = gy + dy, xx = gx + dx;
                if (yy >= 0 && yy < n && xx >= 0 && xx < n)
                    mods[yy][xx] = onBorder || inCenter;
            }
        }
    };
    // Finder patterns
    drawFinder(0, 0);
    drawFinder(n - 7, 0);
    drawFinder(0, n - 7);
    // Timing patterns
    const inFinder = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
    for (let x = 0; x < n; x++)
        if (!inFinder(x, 6))
            mods[6][x] = (x % 2) === 0;
    for (let y = 0; y < n; y++)
        if (!inFinder(6, y))
            mods[y][6] = (y % 2) === 0;
}
function parseSvgMeta(svg) {
    const num = (re) => {
        const m = svg.match(re);
        return m ? Number(m[1]) : undefined;
    };
    return {
        w: num(/width=\"(\d+)\"/),
        h: num(/height=\"(\d+)\"/),
        modulesW: num(/data-modules-w=\"(\d+)\"/),
        modulesH: num(/data-modules-h=\"(\d+)\"/),
        margin: num(/data-margin-modules=\"(\d+)\"/),
        modulePx: num(/data-module-px=\"(\d+)\"/),
        colours: (svg.match(/data-colours=\"([^\"]+)\"/)?.[1] ?? '').split(',')
    };
}
function renderGridToRgba(modW, modH, margin, modulePx, blackSet) {
    const widthPx = (modW + 2 * margin) * modulePx;
    const heightPx = (modH + 2 * margin) * modulePx;
    const buf = new Uint8ClampedArray(widthPx * heightPx * 4);
    // init white
    for (let i = 0; i < buf.length; i += 4) {
        buf[i] = 255;
        buf[i + 1] = 255;
        buf[i + 2] = 255;
        buf[i + 3] = 255;
    }
    for (let y = 0; y < modH; y++) {
        for (let x = 0; x < modW; x++) {
            if (!blackSet.has(`${x},${y}`))
                continue;
            const startX = (x + margin) * modulePx;
            const startY = (y + margin) * modulePx;
            for (let py = 0; py < modulePx; py++) {
                for (let px = 0; px < modulePx; px++) {
                    const xx = startX + px;
                    const yy = startY + py;
                    const idx = (yy * widthPx + xx) * 4;
                    buf[idx] = 0;
                    buf[idx + 1] = 0;
                    buf[idx + 2] = 0;
                    buf[idx + 3] = 255;
                }
            }
        }
    }
    return { data: buf, width: widthPx, height: heightPx };
}
async function decodeSvgViaRects(inputPath) {
    const svg = await readFile(inputPath, 'utf8');
    const meta = parseSvgMeta(svg);
    if (!meta.modulesW || !meta.modulesH || meta.margin === undefined || !meta.modulePx)
        return null;
    const blackSet = new Set();
    const rectRe = /<rect\s+[^>]*x=\"(\d+)\"\s+y=\"(\d+)\"\s+width=\"(\d+)\"\s+height=\"(\d+)\"\s+fill=\"#000(?:000)?\"/g;
    let m;
    while ((m = rectRe.exec(svg)) !== null) {
        const x = Number(m[1]);
        const y = Number(m[2]);
        const w = Number(m[3]);
        const h = Number(m[4]);
        if (w !== meta.modulePx || h !== meta.modulePx)
            continue; // only 1x1 module rects
        // Convert pixel coords back to module grid
        const gridX = x / meta.modulePx - meta.margin;
        const gridY = y / meta.modulePx - meta.margin;
        if (gridX !== Math.floor(gridX) || gridY !== Math.floor(gridY))
            continue;
        if (gridX < 0 || gridY < 0 || gridX >= meta.modulesW || gridY >= meta.modulesH)
            continue;
        blackSet.add(`${gridX},${gridY}`);
    }
    // Restore finder centres to solid black (3x3) to compensate for embedded colour keys
    const centres = [
        { x: 3, y: 3 },
        { x: meta.modulesW - 4, y: 3 },
        { x: 3, y: meta.modulesH - 4 }
    ];
    for (const c of centres) {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const gx = c.x + dx;
                const gy = c.y + dy;
                if (gx >= 0 && gy >= 0 && gx < meta.modulesW && gy < meta.modulesH) {
                    blackSet.add(`${gx},${gy}`);
                }
            }
        }
    }
    const upscaleModulePx = Math.max(meta.modulePx ?? 4, 16);
    const { data, width, height } = renderGridToRgba(meta.modulesW, meta.modulesH, meta.margin, upscaleModulePx, blackSet);
    const code = jsQR(data, width, height);
    if (!code)
        return { text: null, format: 'none' };
    return { text: code.data, format: 'qr' };
}
export async function decodeImageToText(inputPath) {
    // For SVG files, try direct parsing first
    if (inputPath.toLowerCase().endsWith('.svg')) {
        const parsed = await decodeSvgViaRects(inputPath).catch(() => null);
        if (parsed)
            return parsed;
    }
    // Rasterise input to RGBA buffer
    let image = sharp(inputPath);
    if (inputPath.toLowerCase().endsWith('.svg')) {
        try {
            const svg = await readFile(inputPath, 'utf8');
            const meta = parseSvgMeta(svg);
            const w = meta.w ?? 512;
            const h = meta.h ?? 512;
            image = sharp(Buffer.from(svg)).resize(w, h, { kernel: 'nearest' });
        }
        catch {
            // fallback silently
        }
        // For SVGs, upscale to make modules crisp for jsQR
        image = image.resize({ width: 1024, height: 1024, fit: 'inside', kernel: 'nearest' });
    }
    // For PNGs/JPEGs, keep original size
    let { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // If SVG with known module size and margin, black-out finder inner 3x3 key areas to restore base finder
    if (inputPath.toLowerCase().endsWith('.svg')) {
        try {
            const svg = await readFile(inputPath, 'utf8');
            const meta = parseSvgMeta(svg);
            if (meta.modulesW && meta.modulesH && meta.margin !== undefined && meta.modulePx) {
                const fx = { tl: 3, tr: meta.modulesW - 4, bl: 3 };
                const fy = { tl: 3, tr: 3, bl: meta.modulesH - 4 };
                const coords = [
                    { x: fx.tl, y: fy.tl },
                    { x: fx.tr, y: fy.tr },
                    { x: fx.bl, y: fy.bl }
                ];
                for (const c of coords) {
                    const topLeftX = (c.x - 1 + meta.margin) * meta.modulePx;
                    const topLeftY = (c.y - 1 + meta.margin) * meta.modulePx;
                    const size = 3 * meta.modulePx;
                    for (let yy = topLeftY; yy < topLeftY + size; yy++) {
                        for (let xx = topLeftX; xx < topLeftX + size; xx++) {
                            if (xx < 0 || yy < 0 || xx >= info.width || yy >= info.height)
                                continue;
                            const idx = (yy * info.width + xx) * 4;
                            data[idx] = 0;
                            data[idx + 1] = 0;
                            data[idx + 2] = 0;
                            data[idx + 3] = 255;
                        }
                    }
                }
            }
        }
        catch {
            // ignore
        }
    }
    // Convert to base-only monochrome: keep only near-black as black, everything else white
    const mono = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const sum = r + g + b;
        const isBlack = sum < 90; // very conservative: only near-black stays black
        const v = isBlack ? 0 : 255;
        mono[i] = v;
        mono[i + 1] = v;
        mono[i + 2] = v;
        mono[i + 3] = 255;
    }
    const code = jsQR(mono, info.width, info.height);
    if (!code)
        return { text: null, format: 'none' };
    return { text: code.data, format: 'qr' };
}
// Raster colour-layer decoding: build two QR layers from unions
export async function decodeRasterTwoLayer(inputPath) {
    let image = sharp(inputPath);
    if (inputPath.toLowerCase().endsWith('.svg')) {
        const svg = await readFile(inputPath, 'utf8');
        image = sharp(Buffer.from(svg));
        // Only upscale SVGs for crisp module detection
        image = image.resize({ width: 1024, height: 1024, fit: 'inside', kernel: 'nearest' });
    }
    // Keep original size for raster images
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const width = info.width, height = info.height;
    debugLog(`Image loaded: ${width}x${height}`);
    const pixels = width * height;
    const maskBlack = new Uint8Array(pixels);
    const maskRed = new Uint8Array(pixels);
    const maskGreen = new Uint8Array(pixels);
    // Sample a few pixels to see RGB values
    debugLog(`Sample pixels (RGB): center=${data[width * height * 2]},${data[width * height * 2 + 1]},${data[width * height * 2 + 2]} corner=${data[0]},${data[1]},${data[2]} edge=${data[width * 2]},${data[width * 2 + 1]},${data[width * 2 + 2]}`);
    // Coarse black mask  
    for (let i = 0, p = 0; p < pixels; i += 4, p++) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const sum = r + g + b;
        if (sum < 50)
            maskBlack[p] = 1; // Super strict black threshold
    }
    // Estimate module size by run-lengths on center row/col
    function estimateModulePx(mask) {
        const rowY = Math.floor(height / 2);
        let runs = [];
        let curr = 0;
        let last = 0;
        for (let x = 0; x < width; x++) {
            const v = mask[rowY * width + x];
            if (v === last)
                curr++;
            else {
                if (curr > 2 && curr < 128)
                    runs.push(curr);
                last = v;
                curr = 1;
            }
        }
        if (curr > 2 && curr < 128)
            runs.push(curr);
        if (runs.length === 0)
            return 8;
        // GCD of small runs
        const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
        let g = runs[0];
        for (let i = 1; i < runs.length; i++)
            g = gcd(g, runs[i]);
        return Math.max(4, Math.min(64, g));
    }
    const modulePx = estimateModulePx(maskBlack);
    debugLog(`Estimated module size: ${modulePx}px`);
    // Use SVG metadata if available, otherwise estimate from image
    let modulesW = 21, modulesH = 21, margin = 4; // defaults for standard QR
    let actualModulePx = modulePx; // use the estimated module size
    // Try to extract metadata from the original SVG if it exists
    if (inputPath.toLowerCase().endsWith('.svg')) {
        try {
            const svgContent = await readFile(inputPath, 'utf8');
            const wMatch = svgContent.match(/data-modules-w="(\d+)"/);
            const hMatch = svgContent.match(/data-modules-h="(\d+)"/);
            const marginMatch = svgContent.match(/data-margin-modules="(\d+)"/);
            if (wMatch && hMatch && marginMatch) {
                modulesW = parseInt(wMatch[1]);
                modulesH = parseInt(hMatch[1]);
                margin = parseInt(marginMatch[1]);
                actualModulePx = Math.round(width / (modulesW + 2 * margin));
                debugLog(`Using SVG metadata: ${modulesW}x${modulesH} QR, ${margin} margin, ${actualModulePx}px per module`);
            }
        }
        catch (e) {
            debugLog(`Could not read SVG metadata: ${e}`);
        }
    }
    if (!inputPath.toLowerCase().endsWith('.svg')) {
        // For PNG/JPEG, estimate QR dimensions from the estimated module size
        const expectedTotal = Math.round(width / actualModulePx);
        // Common QR sizes: 21, 25, 29, 33, 37, 41, etc. + 8 margin = 29, 33, 37, 41, 45, 49
        margin = 4; // standard margin
        modulesW = modulesH = expectedTotal - 2 * margin;
        debugLog(`Estimated for raster: ${modulesW}x${modulesH} QR, ${margin} margin, ${actualModulePx}px per module`);
    }
    // Colour calibration from finder key centres (placed at +2,+2 and +2,+2 etc from finder corners)
    function sampleMean(x0, y0, x1, y1) {
        let rs = 0, gs = 0, bs = 0, c = 0;
        const minX = Math.max(0, Math.floor(x0));
        const maxX = Math.min(width - 1, Math.floor(x1));
        const minY = Math.max(0, Math.floor(y0));
        const maxY = Math.min(height - 1, Math.floor(y1));
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const p = (y * width + x) * 4;
                rs += data[p];
                gs += data[p + 1];
                bs += data[p + 2];
                c++;
            }
        }
        if (c === 0)
            return { r: 0, g: 0, b: 0 };
        return { r: rs / c, g: gs / c, b: bs / c };
    }
    // Calculate finder key positions based on the actual QR structure
    // Finder keys are placed at the center of the 3x3 inner square of each finder pattern
    // For a QR with margin, the finder patterns start at modules (0,0), (W-7,0), (0,H-7)
    // The 3x3 inner square center is at modules (3,3), (W-4,3), (3,H-4)
    const tlFinderModX = 3, tlFinderModY = 3;
    const trFinderModX = modulesW - 4, trFinderModY = 3;
    const blFinderModX = 3, blFinderModY = modulesH - 4;
    // Convert module coordinates to pixel coordinates (including margin)
    const tlKeyX = (margin + tlFinderModX) * actualModulePx + actualModulePx / 2;
    const tlKeyY = (margin + tlFinderModY) * actualModulePx + actualModulePx / 2;
    const trKeyX = (margin + trFinderModX) * actualModulePx + actualModulePx / 2;
    const trKeyY = (margin + trFinderModY) * actualModulePx + actualModulePx / 2;
    const blKeyX = (margin + blFinderModX) * actualModulePx + actualModulePx / 2;
    const blKeyY = (margin + blFinderModY) * actualModulePx + actualModulePx / 2;
    const sampleR = Math.max(2, actualModulePx / 2); // sample region
    const tlMean = sampleMean(tlKeyX - sampleR, tlKeyY - sampleR, tlKeyX + sampleR, tlKeyY + sampleR);
    const trMean = sampleMean(trKeyX - sampleR, trKeyY - sampleR, trKeyX + sampleR, trKeyY + sampleR);
    const blMean = sampleMean(blKeyX - sampleR, blKeyY - sampleR, blKeyX + sampleR, blKeyY + sampleR);
    debugLog(`Sampling TL:(${tlKeyX.toFixed(1)},${tlKeyY.toFixed(1)}) TR:(${trKeyX.toFixed(1)},${trKeyY.toFixed(1)}) BL:(${blKeyX.toFixed(1)},${blKeyY.toFixed(1)}) with radius ${sampleR.toFixed(1)}`);
    debugLog(`Finder colors - TL: rgb(${tlMean.r.toFixed(0)},${tlMean.g.toFixed(0)},${tlMean.b.toFixed(0)}), TR: rgb(${trMean.r.toFixed(0)},${trMean.g.toFixed(0)},${trMean.b.toFixed(0)}), BL: rgb(${blMean.r.toFixed(0)},${blMean.g.toFixed(0)},${blMean.b.toFixed(0)})`);
    // Detect color scheme from finder keys
    const isRed = (c) => c.r > c.g + 30 && c.r > c.b + 30 && c.r > 100;
    const isGreen = (c) => c.g > c.r + 30 && c.g > c.b + 30 && c.g > 100;
    const isBlack = (c) => c.r + c.g + c.b < 120;
    const isWhite = (c) => c.r > 200 && c.g > 200 && c.b > 200;
    // Determine scheme: BWRG (4-color) vs CMYRGB (8-color)
    const tlIsRed = isRed(tlMean);
    const trIsGreen = isGreen(trMean);
    const blIsBlack = isBlack(blMean);
    const is4ColorScheme = tlIsRed && trIsGreen && blIsBlack;
    debugLog(`Color scheme detected: ${is4ColorScheme ? '4-color BWRG' : '8-color CMYRGB'}`);
    debugLog(`TL=${tlIsRed ? 'RED' : 'OTHER'}, TR=${trIsGreen ? 'GREEN' : 'OTHER'}, BL=${blIsBlack ? 'BLACK' : 'OTHER'}`);
    const len = (v) => Math.max(1e-6, Math.hypot(v.r, v.g, v.b));
    const nRed = { r: tlMean.r / len(tlMean), g: tlMean.g / len(tlMean), b: tlMean.b / len(tlMean) };
    const nGreen = { r: trMean.r / len(trMean), g: trMean.g / len(trMean), b: trMean.b / len(trMean) };
    const nBlack = { r: blMean.r / len(blMean), g: blMean.g / len(blMean), b: blMean.b / len(blMean) };
    const dot = (a, b) => a.r * b.r + a.g * b.g + a.b * b.b;
    for (let i = 0, p = 0; p < pixels; i += 4, p++) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const l = len({ r, g, b });
        const nv = { r: r / l, g: g / l, b: b / l };
        const sum = r + g + b;
        // Black detection (conservative)
        if (sum < 140 || dot(nv, nBlack) > 0.985)
            maskBlack[p] = 1;
        if (is4ColorScheme) {
            // 4-color BWRG scheme: strict red/green detection
            if ((dot(nv, nRed) > 0.94 && r > 110) || (r > g + 25 && r > b + 25 && r > 120))
                maskRed[p] = 1;
            if ((dot(nv, nGreen) > 0.94 && g > 110) || (g > r + 25 && g > b + 25 && g > 120))
                maskGreen[p] = 1;
        }
        else {
            // 8-color CMYRGB scheme: broader detection for multi-hue colors
            // Red detection (includes magenta, yellow)
            if (r > 120 && (r > g + 15 || r > b + 15))
                maskRed[p] = 1;
            // Green detection (includes cyan, yellow)  
            if (g > 120 && (g > r + 15 || g > b + 15))
                maskGreen[p] = 1;
        }
    }
    const toImage = (mask) => {
        const out = new Uint8ClampedArray(pixels * 4);
        for (let p = 0, o = 0; p < pixels; p++, o += 4) {
            const v = mask[p] ? 0 : 255;
            out[o] = v;
            out[o + 1] = v;
            out[o + 2] = v;
            out[o + 3] = 255;
        }
        return out;
    };
    // Count mask pixels for debug
    let blackCount = 0, redCount = 0, greenCount = 0;
    for (let p = 0; p < pixels; p++) {
        if (maskBlack[p])
            blackCount++;
        if (maskRed[p])
            redCount++;
        if (maskGreen[p])
            greenCount++;
    }
    debugLog(`Mask counts: black=${blackCount}, red=${redCount}, green=${greenCount}`);
    // Create grid-based layers for better QR detection  
    const gridW = modulesW + 2 * margin;
    const gridH = modulesH + 2 * margin;
    debugLog(`Creating ${gridW}x${gridH} module grid (QR: ${modulesW}x${modulesH}, margin: ${margin})`);
    const layerAGrid = new Array(gridH).fill(0).map(() => new Array(gridW).fill(0));
    const layerBGrid = new Array(gridH).fill(0).map(() => new Array(gridW).fill(0));
    // Convert pixel masks to module grid
    const modulePixels = actualModulePx;
    for (let gy = 0; gy < gridH; gy++) {
        for (let gx = 0; gx < gridW; gx++) {
            let blackCount = 0, redCount = 0, greenCount = 0, totalSamples = 0;
            const px0 = gx * modulePixels;
            const py0 = gy * modulePixels;
            const px1 = Math.min(width, px0 + modulePixels);
            const py1 = Math.min(height, py0 + modulePixels);
            for (let py = py0; py < py1; py++) {
                for (let px = px0; px < px1; px++) {
                    const p = py * width + px;
                    if (maskBlack[p])
                        blackCount++;
                    if (maskRed[p])
                        redCount++;
                    if (maskGreen[p])
                        greenCount++;
                    totalSamples++;
                }
            }
            // Majority vote for each module
            const threshold = Math.floor(totalSamples * 0.5);
            layerAGrid[gy][gx] = (blackCount + greenCount > threshold) ? 1 : 0;
            layerBGrid[gy][gx] = (redCount + greenCount > threshold) ? 1 : 0;
        }
    }
    // Add synthetic finder patterns to both layers
    function addSyntheticFinder(grid, ox, oy) {
        for (let dy = 0; dy < 7; dy++) {
            for (let dx = 0; dx < 7; dx++) {
                const gx = ox + dx, gy = oy + dy;
                if (gx >= 0 && gy >= 0 && gx < gridW && gy < gridH) {
                    const inOuter = dx === 0 || dx === 6 || dy === 0 || dy === 6;
                    const inInner = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
                    grid[gy][gx] = (inOuter || inInner) ? 1 : 0;
                }
            }
        }
    }
    // Add finders at standard QR positions (within the QR area)
    addSyntheticFinder(layerAGrid, margin, margin); // TL at (0,0) in QR coordinates
    addSyntheticFinder(layerAGrid, margin + modulesW - 7, margin); // TR 
    addSyntheticFinder(layerAGrid, margin, margin + modulesH - 7); // BL
    addSyntheticFinder(layerBGrid, margin, margin); // TL  
    addSyntheticFinder(layerBGrid, margin + modulesW - 7, margin); // TR
    addSyntheticFinder(layerBGrid, margin, margin + modulesH - 7); // BL
    // Debug: count active modules in each layer
    let layerACount = 0, layerBCount = 0;
    for (let gy = 0; gy < gridH; gy++) {
        for (let gx = 0; gx < gridW; gx++) {
            if (layerAGrid[gy][gx])
                layerACount++;
            if (layerBGrid[gy][gx])
                layerBCount++;
        }
    }
    debugLog(`Grid modules - Layer A: ${layerACount}/${gridW * gridH}, Layer B: ${layerBCount}/${gridW * gridH}`);
    // Convert grids back to images for jsQR
    const renderGrid = (grid) => {
        const img = new Uint8ClampedArray(width * height * 4);
        for (let gy = 0; gy < gridH; gy++) {
            for (let gx = 0; gx < gridW; gx++) {
                const value = grid[gy][gx] ? 0 : 255; // black if 1, white if 0
                const px0 = gx * modulePixels;
                const py0 = gy * modulePixels;
                const px1 = Math.min(width, px0 + modulePixels);
                const py1 = Math.min(height, py0 + modulePixels);
                for (let py = py0; py < py1; py++) {
                    for (let px = px0; px < px1; px++) {
                        const idx = (py * width + px) * 4;
                        img[idx] = value;
                        img[idx + 1] = value;
                        img[idx + 2] = value;
                        img[idx + 3] = 255;
                    }
                }
            }
        }
        return img;
    };
    // Create a black-only version for standard decode
    const blackOnlyImage = new Uint8ClampedArray(width * height * 4);
    for (let i = 0, p = 0; p < pixels; i += 4, p++) {
        const isBlackModule = maskBlack[p];
        const value = isBlackModule ? 0 : 255;
        blackOnlyImage[i] = value;
        blackOnlyImage[i + 1] = value;
        blackOnlyImage[i + 2] = value;
        blackOnlyImage[i + 3] = 255;
    }
    // Try basic black-only decode with jsQR directly  
    const blackOnlyResult = jsQR(blackOnlyImage, width, height);
    if (blackOnlyResult) {
        debugLog(`Black-only decode successful: "${blackOnlyResult.data}"`);
        return { base: blackOnlyResult.data, red: null, combined: blackOnlyResult.data };
    }
    else {
        debugLog(`Black-only decode failed`);
    }
    // Save debug image to see what the black-only extraction looks like
    if (DEBUG) {
        try {
            const buf = Buffer.from(blackOnlyImage);
            await sharp(buf, { raw: { width, height, channels: 4 } }).png().toFile(`out/debug_black_only.png`);
        }
        catch (e) {
            console.log(`Failed to save debug image:`, e);
        }
    }
    // Multi-layer decode using grid approach
    const imgA = renderGrid(layerAGrid);
    // Save layer A for debugging
    if (DEBUG) {
        try {
            await sharp(Buffer.from(imgA), { raw: { width, height, channels: 4 } }).png().toFile('out/debug_layer_a.png');
        }
        catch (e) {
            console.log('Failed to save layer A debug image');
        }
    }
    const sliceToMods = (grid) => Array.from({ length: modulesH }, (_, my) => Array.from({ length: modulesW }, (_, mx) => grid[margin + my][margin + mx] === 1));
    const decodeWithInternal = (mods) => {
        majorityFilterMods(mods);
        enforceFunctionPatterns(mods);
        const mat = matrixFromModules(mods);
        return decodeMatrixGuessMask(mat)?.text ?? null;
    };
    // Attempt standard jsQR decode for layer A, fallback to internal decoder
    let resA = jsQR(imgA, width, height);
    let base = resA ? resA.data : null;
    debugLog(`Layer A (black|green) decode: ${base ? `"${base}"` : 'null'}`);
    if (!base) {
        const fallback = decodeWithInternal(sliceToMods(layerAGrid));
        if (fallback) {
            base = fallback;
            debugLog(`Layer A fallback decode succeeded: "${base}"`);
        }
    }
    const imgB = renderGrid(layerBGrid);
    // Save layer B for debugging
    if (DEBUG) {
        try {
            await sharp(Buffer.from(imgB), { raw: { width, height, channels: 4 } }).png().toFile('out/debug_layer_b.png');
        }
        catch (e) {
            console.log('Failed to save layer B debug image');
        }
    }
    // Attempt standard jsQR decode for layer B
    let resB = jsQR(imgB, width, height);
    let red = resB ? resB.data : null;
    debugLog(`Layer B (red|green) decode: ${red ? `"${red}"` : 'null'}`);
    if (!red) {
        const fallbackRed = decodeWithInternal(sliceToMods(layerBGrid));
        if (fallbackRed) {
            red = fallbackRed;
            debugLog(`Layer B fallback decode succeeded: "${red}"`);
        }
    }
    // Debug: save layer images to see what we're sending to jsQR
    if (DEBUG) {
        const saveDebugImage = async (imgData, name) => {
            try {
                const buf = Buffer.from(imgData);
                await sharp(buf, { raw: { width, height, channels: 4 } }).png().toFile(`out/debug_${name}.png`);
            }
            catch (e) {
                console.log(`Failed to save debug image ${name}:`, e);
            }
        };
        await saveDebugImage(imgA, 'layer_a_grid');
        await saveDebugImage(imgB, 'layer_b_grid');
    }
    let combined = null;
    if (base && red)
        combined = `${base}${red}`;
    else
        combined = base;
    return { base, red, combined };
}
function addStandardFinders(set, w, h) {
    const drawFinder = (ox, oy) => {
        for (let dy = 0; dy < 7; dy++) {
            for (let dx = 0; dx < 7; dx++) {
                const x = ox + dx;
                const y = oy + dy;
                const inOuter = dx === 0 || dx === 6 || dy === 0 || dy === 6;
                const inInner = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
                if (inOuter || inInner)
                    set.add(`${x},${y}`);
            }
        }
    };
    drawFinder(0, 0);
    drawFinder(w - 7, 0);
    drawFinder(0, h - 7);
}
export async function decodeSvgMultiLayer(inputPath) {
    const svg = await readFile(inputPath, 'utf8');
    const meta = parseSvgMeta(svg);
    if (!meta.modulesW || !meta.modulesH || meta.margin === undefined || !meta.modulePx) {
        const base = (await decodeImageToText(inputPath)).text;
        return { base, red: null, green: null, combined: base };
    }
    // If embedded matrices are present, prefer rebuilding from them
    const embedded = svg.match(/<metadata id=\"spqr\">([\s\S]*?)<\/metadata>/);
    if (embedded) {
        try {
            const json = JSON.parse(embedded[1]);
            const cols = json.colours || ['#000000', '#ff0000', '#00ff00'];
            const modW = json.width;
            const modH = json.height;
            const margin = json.margin;
            const modulePx = Math.max(8, json.modulePx);
            const toSet = (idx) => {
                if (!json.matrices?.[idx]?.bits)
                    return new Set();
                const bits = json.matrices[idx].bits;
                const s = new Set();
                for (let y = 0; y < modH; y++) {
                    for (let x = 0; x < modW; x++) {
                        const i = y * modW + x;
                        if (bits[i] === '1')
                            s.add(`${x},${y}`);
                    }
                }
                return s;
            };
            // Base, red, green
            const baseSet = toSet(0);
            const redSet = toSet(1);
            const greenSet = toSet(2);
            let raster = renderGridToRgba(modW, modH, margin, modulePx, baseSet);
            let out = jsQR(raster.data, raster.width, raster.height);
            const base = out ? out.data : null;
            const redWithFinders = new Set(redSet);
            addStandardFinders(redWithFinders, modW, modH);
            raster = renderGridToRgba(modW, modH, margin, modulePx, redWithFinders);
            out = jsQR(raster.data, raster.width, raster.height);
            const red = out ? out.data : null;
            const greenWithFinders = new Set(greenSet);
            addStandardFinders(greenWithFinders, modW, modH);
            raster = renderGridToRgba(modW, modH, margin, modulePx, greenWithFinders);
            out = jsQR(raster.data, raster.width, raster.height);
            const green = out ? out.data : null;
            let combined = null;
            if (base && red && green)
                combined = `${base}${red}${green}`;
            else if (base && red)
                combined = `${base}${red}`;
            else
                combined = base;
            // Two-layer downmix: A = base ∪ green, B = red ∪ green
            const twoASet = new Set([...baseSet, ...greenSet]);
            const twoBSet = new Set([...redSet, ...greenSet]);
            const twoAFinders = new Set(twoASet);
            addStandardFinders(twoAFinders, modW, modH);
            const twoBFinders = new Set(twoBSet);
            addStandardFinders(twoBFinders, modW, modH);
            let rr = renderGridToRgba(modW, modH, margin, modulePx, twoAFinders);
            let oo = jsQR(rr.data, rr.width, rr.height);
            const twoLayerA = oo ? oo.data : null;
            rr = renderGridToRgba(modW, modH, margin, modulePx, twoBFinders);
            oo = jsQR(rr.data, rr.width, rr.height);
            const twoLayerB = oo ? oo.data : null;
            return { base, red, green, combined, twoLayerA, twoLayerB };
        }
        catch { }
    }
    const modW = meta.modulesW;
    const modH = meta.modulesH;
    const rectModulePx = meta.modulePx;
    const modulePx = Math.max(8, rectModulePx);
    // Helper to collect rects of a given colour with 1x1 module size
    const collect = (hex) => {
        const re = new RegExp(`<rect\\s+[^>]*x=\\"(\\d+)\\"\\s+y=\\"(\\d+)\\"\\s+width=\\"${rectModulePx}\\"\\s+height=\\"${rectModulePx}\\"\\s+fill=\\"${hex}\\"`, 'g');
        const s = new Set();
        let m;
        while ((m = re.exec(svg)) !== null) {
            const x = Number(m[1]);
            const y = Number(m[2]);
            const gx = x / rectModulePx - meta.margin;
            const gy = y / rectModulePx - meta.margin;
            if (gx >= 0 && gy >= 0 && gx < modW && gy < modH && Number.isInteger(gx) && Number.isInteger(gy))
                s.add(`${gx},${gy}`);
        }
        return s;
    };
    // Detect key colours from finder inner 3x3 blocks if present
    const total = meta.modulePx * 3;
    const pos = (fx, fy) => ({ x: (fx - 1 + meta.margin) * meta.modulePx, y: (fy - 1 + meta.margin) * meta.modulePx });
    const tl = pos(3, 3);
    const tr = pos(meta.modulesW - 4, 3);
    const bl = pos(3, meta.modulesH - 4);
    const colourAt = (p) => {
        const m = new RegExp(`<rect\\s+[^>]*x=\\"${p.x}\\"\\s+y=\\"${p.y}\\"\\s+width=\\"${total}\\"\\s+height=\\"${total}\\"\\s+fill=\\"([^\"]+)\\"`).exec(svg);
        return m?.[1];
    };
    const tlFill = colourAt(tl);
    const trFill = colourAt(tr);
    const blFill = colourAt(bl);
    const baseHex = blFill || meta.colours?.[0] || '#000000';
    const secondHex = tlFill || meta.colours?.[1] || '#ff0000';
    const thirdHex = trFill || meta.colours?.[2] || '#00ff00';
    const baseSet = collect(baseHex);
    const redSet = collect(secondHex);
    const greenSet = collect(thirdHex);
    // Base raster
    let raster = renderGridToRgba(modW, modH, meta.margin, modulePx, baseSet);
    let out = jsQR(raster.data, raster.width, raster.height);
    const base = out ? out.data : null;
    // Red raster with standard finders
    const redWithFinders = new Set(redSet);
    addStandardFinders(redWithFinders, modW, modH);
    raster = renderGridToRgba(modW, modH, meta.margin, modulePx, redWithFinders);
    out = jsQR(raster.data, raster.width, raster.height);
    const red = out ? out.data : null;
    // Green raster with standard finders
    const greenWithFinders = new Set(greenSet);
    addStandardFinders(greenWithFinders, modW, modH);
    raster = renderGridToRgba(modW, modH, meta.margin, modulePx, greenWithFinders);
    out = jsQR(raster.data, raster.width, raster.height);
    const green = out ? out.data : null;
    let combined = null;
    if (base && red && green)
        combined = `${base}${red}${green}`;
    else if (base && red)
        combined = `${base}${red}`;
    else
        combined = base;
    return { base, red, green, combined };
}
//# sourceMappingURL=decoder.js.map