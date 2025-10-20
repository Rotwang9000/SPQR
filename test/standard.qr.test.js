// Test decoding a standard QR to verify decoderCore works
import fs from 'fs';
import { generateColourQr } from '../dist/generator.js';
import { decodeMatrixWithParams, matrixFromModules } from '../dist/decoderCore.js';
import jsQR from 'jsqr';
import sharp from 'sharp';

async function testStandardQR() {
    console.log('=== Standard QR Decoding Test ===');
    
    const testText = 'Hello World 123';
    console.log(`Test text: "${testText}"`);
    
    try {
        // Generate a standard single-layer QR  
        console.log('\n1. Generating standard QR...');
        const qrResult = await generateColourQr(testText, {
            layers: 1,
            colours: ['#000000', '#ffffff'], // Standard black/white
            modulePx: 8,
            marginModules: 4
        });
        
        console.log(`Generated QR: ${qrResult.width}x${qrResult.height}px`);
        
        // Convert to PNG
        const pngBuffer = await sharp(Buffer.from(qrResult.svg))
            .resize(qrResult.width, qrResult.height, { kernel: 'nearest' })
            .png()
            .toBuffer();
        
        // Save for inspection
        fs.writeFileSync('/tmp/standard_qr_test.png', pngBuffer);
        fs.writeFileSync('/tmp/standard_qr_test.svg', qrResult.svg);
        console.log('Saved to /tmp/standard_qr_test.png');
        
        // Test decoding
        console.log('\n2. Testing decoding...');
        
        // Load image data
        const image = sharp(pngBuffer);
        const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        
        console.log(`Image: ${info.width}x${info.height}`);
        
        // Test jsQR directly
        const jsqrResult = jsQR(data, info.width, info.height);
        console.log(`jsQR: ${jsqrResult ? `"${jsqrResult.data}"` : 'null'}`);
        
        // Test decoderCore
        const modules = [];
        for (let y = 0; y < info.height; y++) {
            const row = [];
            for (let x = 0; x < info.width; x++) {
                const i = (y * info.width + x) * 4;
                const gray = (data[i] + data[i+1] + data[i+2]) / 3;
                row.push(gray < 128); // true = dark
            }
            modules.push(row);
        }
        
        const matrix = matrixFromModules(modules);
        console.log(`Matrix size: ${matrix.width}x${matrix.height}`);
        
        const decoderResult = decodeMatrixWithParams(matrix);
        console.log(`decoderCore: ${decoderResult ? `"${decoderResult.text}"` : 'null'}`);
        
        // Check success
        const success = (jsqrResult && jsqrResult.data === testText) || 
                       (decoderResult && decoderResult.text === testText);
        
        if (success) {
            console.log('\n✅ Standard QR test PASSED');
            return true;
        } else {
            console.log('\n❌ Standard QR test FAILED');
            console.log('Expected:', testText);
            console.log('jsQR got:', jsqrResult?.data || 'null');
            console.log('decoderCore got:', decoderResult?.text || 'null');
            return false;
        }
        
    } catch (error) {
        console.error('\n❌ ERROR in standard QR test:', error);
        return false;
    }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
    testStandardQR().catch(err => {
        console.error('Test failed:', err);
        process.exit(1);
    });
}

export { testStandardQR };
