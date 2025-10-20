// Test if the individual layers in SPQR are valid QRs when generated separately
import fs from 'fs';
import { generateColourQr, splitPayload } from '../dist/generator.js';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import sharp from 'sharp';

async function testIndividualLayers() {
    console.log('=== Individual Layer QR Test ===');
    
    const testText = 'This is a long test string with more than 64 characters to verify SPQR encoding and decoding works correctly in all scenarios!';
    console.log(`Test text (${testText.length} chars): "${testText}"`);
    
    try {
        // Split payload like SPQR does
        console.log('\n1. Splitting payload for 3 layers...');
        const splits = splitPayload(testText, 3);
        console.log('Splits:', splits.map((s, i) => `Layer ${i}: "${s}"`));
        
        // Test each layer individually using standard QR
        for (let i = 0; i < splits.length; i++) {
            const layerText = splits[i];
            console.log(`\n2.${i+1}. Testing Layer ${i} ("${layerText}")...`);
            
            // Generate with standard qrcode library
            const standardSvg = await QRCode.toString(layerText, {
                type: 'svg',
                width: 200,
                margin: 4,
                color: { dark: '#000000', light: '#ffffff' }
            });
            
            const standardPng = await sharp(Buffer.from(standardSvg)).png().toBuffer();
            fs.writeFileSync(`/tmp/layer_${i}_standard.png`, standardPng);
            
            // Test decoding
            const image = sharp(standardPng);
            const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            
            const result = jsQR(data, info.width, info.height);
            console.log(`   Standard QR for layer ${i}: ${result ? `✅ "${result.data}"` : '❌ null'}`);
            
            // Also test with our single-layer generator
            const ourResult = await generateColourQr(layerText, { layers: 1 });
            const ourPng = await sharp(Buffer.from(ourResult.svg)).png().toBuffer();
            fs.writeFileSync(`/tmp/layer_${i}_our.png`, ourPng);
            
            const ourImage = sharp(ourPng);
            const { data: ourData, info: ourInfo } = await ourImage.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            
            const ourDecodeResult = jsQR(ourData, ourInfo.width, ourInfo.height);
            console.log(`   Our generator for layer ${i}: ${ourDecodeResult ? `✅ "${ourDecodeResult.data}"` : '❌ null'}`);
        }
        
        console.log('\n3. Now testing multi-layer generation vs composition...');
        
        // Generate the multi-layer SPQR
        const spqrResult = await generateColourQr(testText, {
            layers: 3,
            colours: ['bwrg'],
            modulePx: 8,
            marginModules: 4
        });
        
        const spqrPng = await sharp(Buffer.from(spqrResult.svg))
            .resize(spqrResult.width, spqrResult.height, { kernel: 'nearest' })
            .png()
            .toBuffer();
        fs.writeFileSync('/tmp/spqr_multi.png', spqrPng);
        
        console.log(`Generated SPQR: ${spqrResult.width}x${spqrResult.height}px`);
        
        // Try to see if the multi-layer SVG contains recognizable QR patterns
        const rectCount = (spqrResult.svg.match(/<rect/g) || []).length;
        console.log(`SPQR contains ${rectCount} rectangles`);
        
        // Sample some pixels to see the color distribution
        const spqrImage = sharp(spqrPng);
        const { data: spqrData, info: spqrInfo } = await spqrImage.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        
        let blacks = 0, whites = 0, reds = 0, greens = 0;
        for (let i = 0; i < spqrData.length; i += 4) {
            const r = spqrData[i], g = spqrData[i+1], b = spqrData[i+2];
            if (r < 50 && g < 50 && b < 50) blacks++;
            else if (r > 200 && g > 200 && b > 200) whites++;
            else if (r > g + 50 && r > b + 50) reds++;
            else if (g > r + 50 && g > b + 50) greens++;
        }
        
        const total = blacks + whites + reds + greens;
        console.log(`SPQR colors: ${blacks} black (${(blacks/total*100).toFixed(1)}%), ${whites} white (${(whites/total*100).toFixed(1)}%), ${reds} red (${(reds/total*100).toFixed(1)}%), ${greens} green (${(greens/total*100).toFixed(1)}%)`);
        
        return true;
        
    } catch (error) {
        console.error('\n❌ ERROR in layer test:', error);
        return false;
    }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
    testIndividualLayers().catch(err => {
        console.error('Test failed:', err);
        process.exit(1);
    });
}

export { testIndividualLayers };
