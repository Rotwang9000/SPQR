// Debug the grayscale conversion to see why jsQR can't find QR structure
import fs from 'fs';
import { generateColourQr } from '../dist/generator.js';
import jsQR from 'jsqr';
import sharp from 'sharp';

async function debugGrayscaleConversion() {
    console.log('=== Grayscale Conversion Debug ===');
    
    const testText = 'Hello123';
    console.log(`Test text: "${testText}"`);
    
    try {
        // Generate SPQR with improved finder patterns
        console.log('\n1. Generating SPQR...');
        const spqrResult = await generateColourQr(testText, {
            layers: 3,
            colours: ['bwrg'],
            modulePx: 8,
            marginModules: 4,
            addKey: false  // No finder keys
        });
        
        // Convert to PNG
        const pngBuffer = await sharp(Buffer.from(spqrResult.svg))
            .resize(spqrResult.width, spqrResult.height, { kernel: 'nearest' })
            .png()
            .toBuffer();
        
        fs.writeFileSync('/tmp/debug_spqr_original.png', pngBuffer);
        console.log(`Generated SPQR: ${spqrResult.width}x${spqrResult.height}px`);
        
        // Load as ImageData
        const image = sharp(pngBuffer);
        const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        
        console.log('\n2. Testing different grayscale conversion approaches...');
        
        // Approach 1: Current approach (any non-white -> black)
        const gray1 = new Uint8ClampedArray(info.width * info.height * 4);
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const isLight = r > 200 && g > 200 && b > 200;
            const val = isLight ? 255 : 0;
            gray1[i] = gray1[i + 1] = gray1[i + 2] = val;
            gray1[i + 3] = 255;
        }
        
        // Save and test approach 1
        const gray1Buffer = await sharp(Buffer.from(gray1), {
            raw: { width: info.width, height: info.height, channels: 4 }
        }).png().toBuffer();
        fs.writeFileSync('/tmp/debug_gray1_nonwhite_black.png', gray1Buffer);
        
        const result1 = jsQR(gray1, info.width, info.height);
        console.log('Approach 1 (non-white->black):', result1 ? `"${result1.data}"` : 'null');
        
        // Approach 2: Only pure black stays black, everything else white
        const gray2 = new Uint8ClampedArray(info.width * info.height * 4);
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const isPureBlack = r < 50 && g < 50 && b < 50;
            const val = isPureBlack ? 0 : 255;
            gray2[i] = gray2[i + 1] = gray2[i + 2] = val;
            gray2[i + 3] = 255;
        }
        
        const gray2Buffer = await sharp(Buffer.from(gray2), {
            raw: { width: info.width, height: info.height, channels: 4 }
        }).png().toBuffer();
        fs.writeFileSync('/tmp/debug_gray2_only_black.png', gray2Buffer);
        
        const result2 = jsQR(gray2, info.width, info.height);
        console.log('Approach 2 (only pure black):', result2 ? `"${result2.data}"` : 'null');
        
        // Approach 3: Weighted grayscale
        const gray3 = new Uint8ClampedArray(info.width * info.height * 4);
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
            const val = gray < 128 ? 0 : 255;
            gray3[i] = gray3[i + 1] = gray3[i + 2] = val;
            gray3[i + 3] = 255;
        }
        
        const gray3Buffer = await sharp(Buffer.from(gray3), {
            raw: { width: info.width, height: info.height, channels: 4 }
        }).png().toBuffer();
        fs.writeFileSync('/tmp/debug_gray3_weighted.png', gray3Buffer);
        
        const result3 = jsQR(gray3, info.width, info.height);
        console.log('Approach 3 (weighted grayscale):', result3 ? `"${result3.data}"` : 'null');
        
        // Approach 4: Base layer only (preserve original QR structure from base matrix)
        console.log('\n3. Testing base layer extraction...');
        
        // We need to get the base QR matrix from the generator
        // For now, let's generate a standard QR to compare
        const standardResult = await generateColourQr(testText, {
            layers: 1,
            modulePx: 8,
            marginModules: 4
        });
        
        const standardPng = await sharp(Buffer.from(standardResult.svg)).png().toBuffer();
        fs.writeFileSync('/tmp/debug_standard.png', standardPng);
        
        const standardImage = sharp(standardPng);
        const { data: standardData, info: standardInfo } = await standardImage.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        
        const standardResult_jsqr = jsQR(standardData, standardInfo.width, standardInfo.height);
        console.log('Standard QR (baseline):', standardResult_jsqr ? `"${standardResult_jsqr.data}"` : 'null');
        
        console.log('\n4. Summary:');
        console.log('Original SPQR:', '/tmp/debug_spqr_original.png');
        console.log('Gray approach 1:', '/tmp/debug_gray1_nonwhite_black.png');
        console.log('Gray approach 2:', '/tmp/debug_gray2_only_black.png'); 
        console.log('Gray approach 3:', '/tmp/debug_gray3_weighted.png');
        console.log('Standard baseline:', '/tmp/debug_standard.png');
        
        return result1 || result2 || result3;
        
    } catch (error) {
        console.error('\n❌ ERROR:', error);
        return false;
    }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
    debugGrayscaleConversion().then(success => {
        console.log(success ? '✅ Found a working approach!' : '❌ All approaches failed');
        process.exit(success ? 0 : 1);
    });
}

export { debugGrayscaleConversion };
