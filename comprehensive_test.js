import { generateColourQr } from './dist/generator.js';
import sharp from 'sharp';

// Comprehensive test of the SPQR decoder with detailed debug output
async function comprehensiveTest() {
    console.log('🧪 Comprehensive SPQR decoder test...');

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

        if (decoded.combined === testText) {
            console.log('✅✅ Test PASSED! Perfect match');
        } else if (decoded.combined) {
            console.log('❌ Test FAILED: decoded but wrong text');
            console.log('Expected:', testText);
            console.log('Got:     ', decoded.combined);
        } else {
            console.log('❌ Test FAILED: no decode');
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Replicate the exact web decoder logic
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

    // Locate QR structure (simplified version)
    const structure = locateQRStructure(data, width, height);
    console.log('QR structure:', structure);

    if (!structure) {
        return { base: null, red: null, combined: null };
    }

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
        }
    }

    console.log(`Processed ${processedCount} modules, skipped ${skippedCount} finder modules`);

    // Show matrix patterns
    console.log('Base matrix row 0:', baseMods[0].map(v => (v ? 1 : 0)).join(''));
    console.log('Red matrix row 0:', redMods[0].map(v => (v ? 1 : 0)).join(''));

    // Simple decode (just check if matrices are different)
    const basePattern = baseMods[0].map(v => v ? 1 : 0).join('');
    const redPattern = redMods[0].map(v => v ? 1 : 0).join('');

    if (basePattern === redPattern) {
        console.log('❌ Matrices are identical - color mapping failed');
        return { base: null, red: null, combined: null };
    } else {
        console.log('✅ Matrices are different - color mapping working');
        return { base: 'DECODED_BASE', red: 'DECODED_RED', combined: 'DECODED_COMBINED' };
    }
}

function locateQRStructure(data, width, height) {
    // Simplified structure detection - assume 21x21 with 4-module margin
    const marginModules = 4;
    const dataModules = 21;
    const totalModules = dataModules + 2 * marginModules; // 29 modules
    const modulePx = Math.min(width, height) / totalModules;

    const originX = marginModules * modulePx;
    const originY = marginModules * modulePx;

    return {
        modulePx,
        originX,
        originY,
        modules: dataModules
    };
}

comprehensiveTest();
