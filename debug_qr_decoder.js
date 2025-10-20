import { generateColourQr } from './dist/generator.js';
import sharp from 'sharp';

// Debug the QR decoder directly
async function debugQRDecoder() {
    console.log('🧪 Debugging QR decoder...');

    const testText = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    console.log('Test text:', testText);

    try {
        // Generate SPQR
        const result = await generateColourQr(testText, {
            colours: ['#ffffff', '#ff0000', '#00ff00', '#000000'],
            composition: 'discrete',
            layers: 2
        });

        console.log('✅ Generated SPQR');

        // Convert SVG to PNG buffer
        const svgBuffer = Buffer.from(result.svg);
        const pngBuffer = await sharp(svgBuffer).png().toBuffer();

        // Create ImageData-like object
        const image = await sharp(pngBuffer).raw().toBuffer({ resolveWithObject: true });
        const { data, info } = image;
        const { width, height } = info;

        console.log(`Image: ${width}x${height}`);

        // Test the exact same logic as the web decoder
        const decoded = await decodeSPQRWeb(data, width, height);

        console.log('Decoded result:', decoded);

    } catch (error) {
        console.error('❌ Debug failed:', error.message);
    }
}

// Simplified SPQR decoder for debugging
async function decodeSPQRWeb(data, width, height) {
    console.log('Starting SPQR decode...');

    // Color classification thresholds
    const isBlackRGB = (r,g,b) => r < 128 && g < 128 && b < 128;
    const isWhiteRGB = (r,g,b) => r > 200 && g > 200 && b > 200;

    const classifyTag = (r,g,b) => {
        if (isBlackRGB(r,g,b)) return 'BLACK';
        if (isWhiteRGB(r,g,b)) return 'WHITE';
        const redExcess = r - Math.max(g,b);
        const greenExcess = g - Math.max(r,b);
        if (redExcess > 35 && r > 120 && g < 220) return 'RED';
        if (greenExcess > 35 && g > 120 && r < 220) return 'GREEN';
        if (redExcess > 28 && greenExcess > 28) return 'YELLOW';
        if (r - g > 20 && r - b > 20) return 'RED';
        if (g - r > 20 && g - b > 20) return 'GREEN';
        return 'WHITE';
    };

    // Simple structure detection
    const structure = {
        modulePx: 5,
        originX: 20,
        originY: 20,
        modules: 21
    };
    console.log('QR structure:', structure);

    const { modulePx, originX, originY, modules } = structure;
    const margin = 4;

    // Build base and red matrices
    const baseMods = Array.from({ length: modules }, () => Array(modules).fill(false));
    const redMods = Array.from({ length: modules }, () => Array(modules).fill(false));

    const markFinder = (mx, my) => (mx < 7 && my < 7) || (mx >= modules - 7 && my < 7) || (mx < 7 && my >= modules - 7);

    let processedCount = 0;
    let skippedCount = 0;

    for (let my = 0; my < modules; my++) {
        for (let mx = 0; mx < modules; mx++) {
            if (markFinder(mx, my)) {
                skippedCount++;
                continue;
            }
            processedCount++;

            // Sample color (simplified version)
            const cx = originX + (margin + mx) * modulePx + modulePx / 2;
            const cy = originY + (margin + my) * modulePx + modulePx / 2;
            const px = Math.round(cx), py = Math.round(cy);
            const idx = (py * width + px) * 4;
            const r = data[idx], g = data[idx + 1], b = data[idx + 2];
            const tag = classifyTag(r, g, b);

            // Debug: check what colors are in finder pattern areas
            const finderArea = (mx < 7 && my < 7) || (mx >= 14 && my < 7) || (mx < 7 && my >= 14);
            if (finderArea && my === 0 && mx < 7) {
                console.log(`FINDER Module (${mx},${my}): RGB(${r},${g},${b}) at (${px},${py}) → ${tag}`);
            }

            // Map to layers
            let baseBit = 0, redBit = 0;
            if (tag === 'WHITE') {
                baseBit = 0; redBit = 0;
            } else if (tag === 'RED') {
                baseBit = 0; redBit = 1;
            } else if (tag === 'BLACK') {
                baseBit = 1; redBit = 0;
            } else if (tag === 'GREEN') {
                baseBit = 1; redBit = 1;
            }

            baseMods[my][mx] = !!baseBit;
            redMods[my][mx] = !!redBit;

            // Debug: log color mapping for first few modules
            if (my < 2 && mx < 15) {
                const bits = (baseBit << 1) | redBit;
                console.log(`Module (${mx},${my}): RGB(${r},${g},${b}) → ${tag} → base=${baseBit}, red=${redBit}, bits=${bits}`);
            }

            // Debug: check finder pattern areas
            const isFinderArea = (mx < 7 && my < 7) || (mx >= 14 && my < 7) || (mx < 7 && my >= 14);
            if (isFinderArea && my === 0 && mx < 7) {
                console.log(`FINDER Module (${mx},${my}): RGB(${r},${g},${b}) → ${tag} → base=${baseBit}, red=${redBit}`);
            }
        }
    }

    console.log(`Processed ${processedCount} modules, skipped ${skippedCount} finder modules`);

    // Show matrix patterns
    console.log('Base matrix row 0:', baseMods[0].map(v => (v ? 1 : 0)).join(''));
    console.log('Red matrix row 0:', redMods[0].map(v => (v ? 1 : 0)).join(''));

    // Test QR decoding on both matrices
    console.log('\n=== Testing QR Decoder ===');

    try {
        const baseResult = decodeMatrix(baseMods);
        console.log('Base decode result:', baseResult);
    } catch (e) {
        console.log('Base decode error:', e.message);
    }

    try {
        const redResult = decodeMatrix(redMods);
        console.log('Red decode result:', redResult);
    } catch (e) {
        console.log('Red decode error:', e.message);
    }

    // Use SPQR direct decoding
    const spqrBits = extractSPQRColorBitsDirect(data, width, height, originX, originY, modulePx, modules);
    console.log(`SPQR: Extracted ${spqrBits.length} bits for direct decoding`);

    if (spqrBits.length > 0) {
        const combinedText = decodeSPQRBitsDirect(spqrBits);
        if (combinedText) {
            console.log('SPQR decode successful:', combinedText);
            return {
                base: null,
                red: null,
                combined: combinedText
            };
        }
    }

    console.log('SPQR direct decoding failed, trying matrix-based approach...');
    return { base: null, red: null, combined: null };
}

// Simplified QR decoder for testing
function decodeMatrix(mods) {
    if (!mods || !mods[0]) return null;

    // Convert to binary string
    const binary = mods.map(row => row.map(v => v ? '1' : '0').join('')).join('');

    // Check if it looks like a valid QR code (basic check)
    if (binary.length !== 441) { // 21x21
        throw new Error(`Invalid matrix size: ${binary.length} bits`);
    }

    // Check for finder patterns (basic check)
    const hasFinderPattern = binary.substring(0, 7) === '1111111' ||
                            binary.substring(434, 441) === '1111111' ||
                            binary.substring(0, 7) + binary.substring(21, 28) + binary.substring(42, 49) === '111111111111111111111111';

    if (!hasFinderPattern) {
        throw new Error('No finder pattern found');
    }

    return 'DECODED:' + binary.substring(0, 50) + '...';
}

// SPQR direct decoding functions
function extractSPQRColorBitsDirect(data, width, height, originX, originY, modulePx, modules) {
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

    // Use proper QR code reading order (zigzag pattern)
    let readingUp = true;
    for (let col = modules - 1; col > 0; col -= 2) {
        if (col === 6) col--; // Skip vertical timing pattern
        for (let i = 0; i < modules; i++) {
            const y = readingUp ? (modules - 1 - i) : i;
            for (let dx = 0; dx < 2; dx++) {
                const x = col - dx;
                // Skip structure areas
                const isStructure = (x < 7 && y < 7) || (x >= modules - 7 && y < 7) || (x < 7 && y >= modules - 7) ||
                                   (y === 8 && x <= 8 && x !== 6) || (x === 8 && y <= 7 && y !== 6) ||
                                   (y === 8 && x >= modules - 8) || (x === 8 && y >= modules - 8 && y !== modules - 1);

                if (!isStructure) {
                    // Sample color
                    const cx = originX + x * modulePx + modulePx / 2;
                    const cy = originY + y * modulePx + modulePx / 2;
                    const px = Math.round(cx), py = Math.round(cy);
                    const idx = (py * width + px) * 4;
                    const r = data[idx], g = data[idx + 1], b = data[idx + 2];
                    const color = classifyColor(r, g, b);

                    // Map to bits
                    let baseBit = 0, redBit = 0;
                    if (color === 'BLACK') {
                        baseBit = 1; redBit = 0;
                    } else if (color === 'RED') {
                        baseBit = 0; redBit = 1;
                    } else if (color === 'GREEN') {
                        baseBit = 1; redBit = 1;
                    }

                    bits.push(baseBit, redBit);
                    dataModules++;

                    if (dataModules <= 10) {
                        console.log(`SPQR Color Module (${x},${y}): RGB(${r},${g},${b}) → ${color} → bits=${(baseBit << 1) | redBit}`);
                    }
                }
            }
        }
        readingUp = !readingUp;
    }

    console.log(`SPQR: Extracted ${bits.length} bits from ${dataModules} color modules`);
    return bits;
}

function decodeSPQRBitsDirect(bits) {
    if (bits.length < 16) return null;

    // Convert bits to bytes (QR codes store bits LSB first)
    const bytes = [];
    for (let i = 0; i < bits.length; i += 8) {
        let byte = 0;
        for (let j = 0; j < 8 && i + j < bits.length; j++) {
            // QR codes store bits LSB first, so reverse the order
            byte = (byte << 1) | bits[i + j];
        }
        bytes.push(byte);
    }

    if (bytes.length < 4) return null;

    // Check mode
    const mode = (bytes[0] >> 4) & 0xF;
    const length = bytes[1] | ((bytes[0] & 0xF) << 8);

    console.log(`SPQR decode: mode=${mode}, length=${length}, bytes=${bytes.length}`);
    console.log('First 8 bytes:', bytes.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));

    if (mode !== 4) {
        console.log(`SPQR: Invalid mode ${mode}, expected 4 (byte mode)`);
        return null;
    }

    if (length > bytes.length - 2) {
        console.log(`SPQR: Length ${length} too large for ${bytes.length} bytes`);
        return null;
    }

    // Extract data
    const dataBytes = bytes.slice(2, 2 + length);

    try {
        const text = new TextDecoder('utf-8').decode(new Uint8Array(dataBytes));
        console.log(`SPQR decoded text: "${text}"`);
        return text;
    } catch (e) {
        console.log('SPQR UTF-8 decode failed:', e.message);
        return null;
    }
}

debugQRDecoder();
