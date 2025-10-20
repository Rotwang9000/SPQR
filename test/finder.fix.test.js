// Test if the finder pattern fix allows jsQR to locate SPQR structure
import fs from 'fs';
import { generateColourQr } from '../dist/generator.js';
import jsQR from 'jsqr';
import sharp from 'sharp';

async function testFinderFix() {
    console.log('=== Finder Pattern Fix Test ===');
    
    const testText = 'Hello World!';
    console.log(`Test text: "${testText}"`);
    
    try {
        // Generate SPQR with the fixed generator
        console.log('\n1. Generating SPQR with fixed finder patterns...');
        const spqrResult = await generateColourQr(testText, {
            layers: 3,
            colours: ['bwrg'],
            modulePx: 8,
            marginModules: 4,
            addKey: false  // Disable finder keys that overwrite finder centers
        });
        
        // Convert to PNG 
        const pngBuffer = await sharp(Buffer.from(spqrResult.svg))
            .resize(spqrResult.width, spqrResult.height, { kernel: 'nearest' })
            .png()
            .toBuffer();
        
        fs.writeFileSync('/tmp/finder_fix_test.png', pngBuffer);
        fs.writeFileSync('/tmp/finder_fix_test.svg', spqrResult.svg);
        console.log(`Generated: ${spqrResult.width}x${spqrResult.height}px`);
        console.log('SVG saved for inspection: /tmp/finder_fix_test.svg');
        
        // Test direct jsQR on the color image
        const image = sharp(pngBuffer);
        const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        
        console.log('\n2. Testing jsQR on color SPQR...');
        const colorResult = jsQR(data, info.width, info.height);
        console.log('Color SPQR result:', colorResult ? `Found QR: "${colorResult.data}"` : 'No QR found');
        
        // Test grayscale conversion
        console.log('\n3. Testing jsQR on grayscale conversion...');
        const grayData = new Uint8ClampedArray(info.width * info.height * 4);
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const isLight = r > 200 && g > 200 && b > 200;
            const gray = isLight ? 255 : 0;
            grayData[i] = grayData[i + 1] = grayData[i + 2] = gray;
            grayData[i + 3] = 255;
        }
        
        const grayResult = jsQR(grayData, info.width, info.height);
        console.log('Grayscale result:', grayResult ? `Found QR: "${grayResult.data}"` : 'No QR found');
        
        if (grayResult && grayResult.location) {
            console.log('\n4. Structure detection successful!');
            console.log('Location:', {
                topLeft: grayResult.location.topLeftCorner,
                topRight: grayResult.location.topRightCorner,
                bottomLeft: grayResult.location.bottomLeftCorner
            });
            
            return true;
        } else {
            console.log('\n4. Structure detection failed');
            return false;
        }
        
    } catch (error) {
        console.error('\n❌ ERROR:', error);
        return false;
    }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
    testFinderFix().then(success => {
        console.log(success ? '✅ SUCCESS: Finder patterns fixed!' : '❌ FAILURE: Still broken');
        process.exit(success ? 0 : 1);
    });
}

export { testFinderFix };
