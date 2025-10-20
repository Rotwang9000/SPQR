import sharp from 'sharp';
import { matrixFromModules } from './decoderCore.js';
import { readFile } from 'node:fs/promises';
const DEBUG = /^(1|true|yes)$/i.test(process.env.SPQR_DEBUG ?? '');
const debugLog = (...args) => { if (DEBUG)
    console.log(...args); };
function classifyColour(r, g, b) {
    const isBlack = r < 50 && g < 50 && b < 50;
    const isWhite = r > 250 && g > 250 && b > 250;
    const isRed = r > 200 && g < 50 && b < 50; // Fixed!
    const isGreen = g > 200 && r < 50 && b < 50;
    const result = { isBlack, isWhite, isRed, isGreen };
    return result;
}
function enforceFindersAndTiming(mods) {
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
    // Finders
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
function majorityFilter(mods) {
    const h = mods.length, w = mods[0].length;
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
function matrixFromMods(mods) {
    return matrixFromModules(mods);
}
function estimateGrid(data, width, height) {
    debugLog(`[DEBUG] estimateGrid: ${width}x${height}`);
    // Bounding box of non-white
    let minX = width, minY = height, maxX = 0, maxY = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            if (!(r > 235 && g > 235 && b > 235)) {
                if (x < minX)
                    minX = x;
                if (y < minY)
                    minY = y;
                if (x > maxX)
                    maxX = x;
                if (y > maxY)
                    maxY = y;
            }
        }
    }
    debugLog(`[DEBUG] Bounding box: minX=${minX} minY=${minY} maxX=${maxX} maxY=${maxY}`);
    if (minX >= maxX || minY >= maxY) {
        debugLog(`[DEBUG] No non-white pixels found`);
        return null;
    }
    const qrW = maxX - minX + 1;
    debugLog(`[DEBUG] QR width: ${qrW}px`);
    // Try common sizes; pick best by aligning finders
    const candidates = [21, 25, 29, 33];
    let best = null;
    let bestScore = -Infinity;
    for (const modules of candidates) {
        const margin = 4;
        const modulePx = qrW / (modules + 2 * margin);
        if (modulePx < 3 || modulePx > 50)
            continue;
        const originX = Math.round(minX - margin * modulePx);
        const originY = Math.round(minY - margin * modulePx);
        // score: sample finder patterns
        const score = scoreFinders(data, width, height, modules, margin, modulePx, originX, originY);
        debugLog(`[DEBUG] Candidate ${modules}x${modules}: modulePx=${modulePx.toFixed(1)} origin=(${originX},${originY}) score=${score}`);
        if (score > bestScore) {
            bestScore = score;
            best = { modules, margin, modulePx, originX, originY };
        }
    }
    // Force correct size based on image dimensions
    if (best) {
        // Use whole image size and find best module count by testing remainders
        const imgSize = Math.min(width, height);
        const margin = 4;
        let bestModules = 21;
        let bestModulePx = imgSize / (21 + 2 * margin);
        let bestRemainder = Math.abs(bestModulePx - Math.round(bestModulePx));
        // QR codes range from Version 1 (21×21) to Version 40 (177×177), incrementing by 4
        // When multiple sizes have similar remainders, prefer the larger one (more data capacity)
        for (let testModules = 21; testModules <= 177; testModules += 4) {
            const testModulePx = imgSize / (testModules + 2 * margin);
            const testRemainder = Math.abs(testModulePx - Math.round(testModulePx));
            // Accept if better remainder, or same remainder but larger module count
            if (testRemainder < bestRemainder || (testRemainder === bestRemainder && testModules > bestModules)) {
                bestRemainder = testRemainder;
                bestModulePx = testModulePx;
                bestModules = testModules;
            }
        }
        const modulePx = imgSize / (bestModules + 2 * margin);
        const originX = 0; // Image starts at origin
        const originY = 0;
        best = { modules: bestModules, margin, modulePx, originX, originY };
        debugLog(`[DEBUG] Using whole-image calculation: ${bestModules}x${bestModules}, ${modulePx}px/module (remainder: ${bestRemainder.toFixed(3)})`);
    }
    return best;
}
function scoreFinders(data, width, height, modules, margin, modulePx, originX, originY) {
    const centres = [{ x: 3, y: 3 }, { x: modules - 4, y: 3 }, { x: 3, y: modules - 4 }];
    let score = 0;
    for (const c of centres) {
        for (let dy = 0; dy < 7; dy++) {
            for (let dx = 0; dx < 7; dx++) {
                const onBorder = dx === 0 || dx === 6 || dy === 0 || dy === 6;
                const inCenter = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
                const shouldDark = onBorder || inCenter;
                const cx = Math.round(originX + (c.x + dx + margin) * modulePx + modulePx / 2);
                const cy = Math.round(originY + (c.y + dy + margin) * modulePx + modulePx / 2);
                if (cx < 0 || cy < 0 || cx >= width || cy >= height)
                    continue;
                const i = (cy * width + cx) * 4;
                const r = data[i], g = data[i + 1], b = data[i + 2];
                const isDark = r < 80 && g < 80 && b < 80;
                score += (isDark === shouldDark) ? 1 : -1;
            }
        }
    }
    return score;
}
export async function decodeSPQRIntegrated(inputPath) {
    let image = sharp(inputPath);
    let svgMeta = null;
    if (inputPath.toLowerCase().endsWith('.svg')) {
        const svg = await readFile(inputPath, 'utf8');
        image = sharp(Buffer.from(svg));
        svgMeta = {
            modulesW: Number(svg.match(/data-modules-w=\"(\d+)\"/)?.[1] ?? NaN),
            modulesH: Number(svg.match(/data-modules-h=\"(\d+)\"/)?.[1] ?? NaN),
            margin: Number(svg.match(/data-margin-modules=\"(\d+)\"/)?.[1] ?? NaN)
        };
        if (!Number.isFinite(svgMeta.modulesW) || !Number.isFinite(svgMeta.modulesH) || !Number.isFinite(svgMeta.margin))
            svgMeta = null;
    }
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = info;
    // View buffer as clamped array without copy
    const rgba = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
    // Determine grid
    let grid = svgMeta && svgMeta.modulesW && svgMeta.modulesH && svgMeta.margin !== undefined
        ? {
            modules: svgMeta.modulesW,
            margin: svgMeta.margin,
            modulePx: width / (svgMeta.modulesW + 2 * svgMeta.margin),
            originX: 0,
            originY: 0
        }
        : estimateGrid(rgba, width, height);
    debugLog(`[DEBUG] Grid:`, grid);
    if (!grid) {
        console.log(`[DEBUG] No grid estimated`);
        return { base: null, red: null, green: null, combined: null };
    }
    const { modules, margin, modulePx, originX, originY } = grid;
    const total = modules + 2 * margin;
    // Build module-space boolean matrices for two logical layers
    const baseMods = Array.from({ length: modules }, () => Array(modules).fill(false));
    const redMods = Array.from({ length: modules }, () => Array(modules).fill(false));
    for (let my = 0; my < modules; my++) {
        for (let mx = 0; mx < modules; mx++) {
            const cx = originX + (mx + margin) * modulePx + modulePx / 2;
            const cy = originY + (my + margin) * modulePx + modulePx / 2;
            // Subpixel average around centre
            const step = Math.max(1, Math.floor(modulePx / 4));
            let rs = 0, gs = 0, bs = 0, c = 0;
            for (let dy = -step; dy <= step; dy += step) {
                for (let dx = -step; dx <= step; dx += step) {
                    const sx = Math.round(cx + dx);
                    const sy = Math.round(cy + dy);
                    if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
                        const i = (sy * width + sx) * 4;
                        rs += rgba[i];
                        gs += rgba[i + 1];
                        bs += rgba[i + 2];
                        c++;
                    }
                }
            }
            const r = c ? rs / c : 255;
            const g = c ? gs / c : 255;
            const b = c ? bs / c : 255;
            const cc = classifyColour(r, g, b);
            // BWRG mapping: white=no bits, red=red bit, green=green bit, black=red+green bits or base bit
            // For 4-color BWRG: base bit is represented by black
            const baseBit = cc.isBlack; // base = black only
            const redBit = cc.isRed; // red = red only
            const greenBit = cc.isGreen; // green = green only
            // For BWRG 4-color: reconstruct 3 layers from the color mapping
            // 000: white (no bits) -> base=0, red=0, green=0
            // 001: red (red bit) -> base=0, red=1, green=0
            // 010: green (green bit) -> base=0, red=0, green=1
            // 011: black (red+green bits) -> base=0, red=1, green=1
            // 100: black (base bit) -> base=1, red=0, green=0
            // 101: red (base+red bits) -> base=1, red=1, green=0
            // 110: green (base+green bits) -> base=1, red=0, green=1
            // 111: white (all bits) -> base=1, red=1, green=1
            // For CMYRGB 8-color with 3 layers: each color represents a unique 3-bit combination
            // Need to map colors to layer bits properly
            // BWRG discrete mode mapping (matching browser app.js):
            // WHITE (W): base=0, red=0 (no data in either layer)
            // RED   (R): base=0, red=1 (data in red layer only)
            // GREEN (G): base=1, red=1 (OVERLAP - data in BOTH layers)
            // BLACK (K): base=1, red=0 (data in base layer only)
            if (cc.isWhite) {
                baseMods[my][mx] = false; // W: base=light
                redMods[my][mx] = false; // W: red=light
            }
            else if (cc.isRed) {
                baseMods[my][mx] = false; // R: base=light
                redMods[my][mx] = true; // R: red=dark
            }
            else if (cc.isGreen) {
                baseMods[my][mx] = true; // G: base=dark  (OVERLAP)
                redMods[my][mx] = true; // G: red=dark   (OVERLAP)
            }
            else if (cc.isBlack) {
                baseMods[my][mx] = true; // K: base=dark
                redMods[my][mx] = false; // K: red=light
            }
            else {
                // Fallback for unclassified pixels
                baseMods[my][mx] = false;
                redMods[my][mx] = false;
            }
        }
    }
    // Denoise and enforce function patterns
    // Note: Majority filter can corrupt edge pixels, so skip it
    // majorityFilter(baseMods);
    // majorityFilter(redMods);
    enforceFindersAndTiming(baseMods);
    enforceFindersAndTiming(redMods);
    // Debug: print first few rows of matrices
    if (DEBUG) {
        console.log(`[DEBUG] Base matrix first 8x8:`);
        for (let y = 0; y < Math.min(8, baseMods.length); y++) {
            console.log(`  ${y}: ${baseMods[y].slice(0, 8).map(b => b ? '1' : '0').join('')}`);
        }
        console.log(`[DEBUG] Red matrix first 8x8:`);
        for (let y = 0; y < Math.min(8, redMods.length); y++) {
            console.log(`  ${y}: ${redMods[y].slice(0, 8).map(b => b ? '1' : '0').join('')}`);
        }
    }
    // Decode using jsQR (like the browser implementation)
    const jsQR = (await import('jsqr')).default;
    const decodeLayer = (mods, layerName) => {
        const scale = 8; // Scale up for jsQR
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
        const result = jsQR(rgba, scaledSize, scaledSize);
        if (result) {
            debugLog(`[DEBUG] ${layerName} decoded: "${result.data}"`);
            return result.data;
        }
        else {
            debugLog(`[DEBUG] ${layerName} decode failed`);
            return null;
        }
    };
    const base = decodeLayer(baseMods, 'Base layer');
    const red = decodeLayer(redMods, 'Red layer');
    let combined = null;
    if (base && red)
        combined = base + red;
    else if (base)
        combined = base;
    else if (red)
        combined = red;
    debugLog(`[DEBUG] Combined: "${combined}"`);
    return { base, red, combined };
}
//# sourceMappingURL=spqrDecoder.js.map