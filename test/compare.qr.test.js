// Compare our QR generator with standard qrcode library
import fs from 'fs';
import { generateColourQr } from '../dist/generator.js';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import sharp from 'sharp';

async function compareQRGenerators() {
    console.log('=== QR Generator Comparison Test ===');
    
    const testText = 'Hello123';
    console.log(`Test text: "${testText}"`);
    
    try {
        // Generate with standard qrcode library
        console.log('\n1. Standard qrcode library...');
        const standardSvg = await QRCode.toString(testText, { 
            type: 'svg',
            width: 200,
            margin: 4,
            color: { dark: '#000000', light: '#ffffff' }
        });
        fs.writeFileSync('/tmp/standard_lib.svg', standardSvg);
        
        // Convert to PNG and test decoding
        const standardPng = await sharp(Buffer.from(standardSvg)).png().toBuffer();
        fs.writeFileSync('/tmp/standard_lib.png', standardPng);
        
        const standardImage = sharp(standardPng);
        const { data: standardData, info: standardInfo } = await standardImage.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        
        const standardResult = jsQR(standardData, standardInfo.width, standardInfo.height);
        console.log(`Standard library result: ${standardResult ? `"${standardResult.data}"` : 'null'}`);
        
        // Generate with our generator (single layer)
        console.log('\n2. Our generator (single layer)...');
        const ourResult = await generateColourQr(testText, {
            layers: 1,
            colours: ['#000000', '#ffffff'],
            modulePx: 4,
            marginModules: 4
        });
        
        fs.writeFileSync('/tmp/our_gen.svg', ourResult.svg);
        
        const ourPng = await sharp(Buffer.from(ourResult.svg))
            .resize(ourResult.width, ourResult.height, { kernel: 'nearest' })
            .png()
            .toBuffer();
        fs.writeFileSync('/tmp/our_gen.png', ourPng);
        
        const ourImage = sharp(ourPng);
        const { data: ourData, info: ourInfo } = await ourImage.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        
        const ourDecodeResult = jsQR(ourData, ourInfo.width, ourInfo.height);
        console.log(`Our generator result: ${ourDecodeResult ? `"${ourDecodeResult.data}"` : 'null'}`);
        
        // Compare SVG structure
        console.log('\n3. SVG Analysis...');
        console.log(`Standard SVG length: ${standardSvg.length} chars`);
        console.log(`Our SVG length: ${ourResult.svg.length} chars`);
        
        const standardRects = (standardSvg.match(/<rect/g) || []).length;
        const ourRects = (ourResult.svg.match(/<rect/g) || []).length;
        console.log(`Standard rectangles: ${standardRects}`);
        console.log(`Our rectangles: ${ourRects}`);
        
        // Try decoding our QR at different scales
        console.log('\n4. Scale testing our QR...');
        for (const scale of [1, 2, 4]) {
            const scaledW = ourInfo.width * scale;
            const scaledH = ourInfo.height * scale;
            const scaledData = new Uint8ClampedArray(scaledW * scaledH * 4);
            
            for (let y = 0; y < scaledH; y++) {
                for (let x = 0; x < scaledW; x++) {
                    const srcX = Math.floor(x / scale);
                    const srcY = Math.floor(y / scale);
                    const srcI = (srcY * ourInfo.width + srcX) * 4;
                    const dstI = (y * scaledW + x) * 4;
                    
                    scaledData[dstI] = ourData[srcI];
                    scaledData[dstI + 1] = ourData[srcI + 1];
                    scaledData[dstI + 2] = ourData[srcI + 2];
                    scaledData[dstI + 3] = ourData[srcI + 3];
                }
            }
            
            const scaledResult = jsQR(scaledData, scaledW, scaledH);
            console.log(`${scale}x scale: ${scaledResult ? `"${scaledResult.data}"` : 'null'}`);
        }
        
        console.log('\n5. Success Summary:');
        console.log(`Standard qrcode library: ${standardResult ? '✅' : '❌'}`);
        console.log(`Our generator: ${ourDecodeResult ? '✅' : '❌'}`);
        
        return standardResult && ourDecodeResult;
        
    } catch (error) {
        console.error('\n❌ ERROR in comparison test:', error);
        return false;
    }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
    compareQRGenerators().catch(err => {
        console.error('Test failed:', err);
        process.exit(1);
    });
}

export { compareQRGenerators };
