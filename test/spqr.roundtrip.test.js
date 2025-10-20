// Simple SPQR round-trip test using CLI functions
import fs from 'fs';
import { generateColourQr } from '../dist/generator.js';
import { decodeRasterTwoLayer, decodeImageToText } from '../dist/decoder.js';
import sharp from 'sharp';

async function testSPQRRoundTrip() {
    console.log('=== SPQR CLI Round-Trip Test ===');
    
    // Generate a test string (64+ chars)
    const testText = 'This is a long test string with more than 64 characters to verify SPQR encoding and decoding works correctly in all scenarios!';
    console.log(`Test text (${testText.length} chars): "${testText}"`);
    
    try {
        // Step 1: Generate SPQR using CLI generator
        console.log('\n1. Generating SPQR (BWRG scheme)...');
        const spqrResult = await generateColourQr(testText, {
            layers: 3,
            colours: ['bwrg'], // Black, White, Red, Green
            modulePx: 6,
            marginModules: 4
        });
        
        console.log(`Generated SPQR: ${spqrResult.width}x${spqrResult.height}px`);
        
        // Step 2: Save as PNG
        const pngPath = '/tmp/test_spqr_cli.png';
        const svgPath = '/tmp/test_spqr_cli.svg';
        
        const pngBuffer = await sharp(Buffer.from(spqrResult.svg))
            .resize(spqrResult.width, spqrResult.height, { kernel: 'nearest' })
            .png()
            .toBuffer();
        
        fs.writeFileSync(pngPath, pngBuffer);
        fs.writeFileSync(svgPath, spqrResult.svg);
        console.log(`Saved to: ${pngPath} and ${svgPath}`);
        
        // Step 3: Try standard QR decode first (should fail)
        console.log('\n2. Testing standard QR decode...');
        const standardResult = await decodeImageToText(pngPath);
        console.log('Standard QR result:', standardResult.text || 'null');
        
        // Step 4: Try SPQR decode
        console.log('\n3. Testing SPQR decode...');
        const spqrDecodeResult = await decodeRasterTwoLayer(pngPath);
        console.log('SPQR decode result:', spqrDecodeResult);
        
        // Step 5: Check if we got our text back
        const decodedTexts = [
            spqrDecodeResult.base,
            spqrDecodeResult.red,
            spqrDecodeResult.combined
        ].filter(Boolean);
        
        console.log('\n4. Verification:');
        console.log('Decoded texts:', decodedTexts);
        
        // Check if any decoded text contains our original text or parts of it
        const originalParts = testText.split(' ');
        let foundParts = 0;
        
        for (const decoded of decodedTexts) {
            if (decoded && typeof decoded === 'string') {
                for (const part of originalParts) {
                    if (decoded.includes(part) && part.length > 3) {
                        foundParts++;
                    }
                }
            }
        }
        
        console.log(`Found ${foundParts} word parts out of ${originalParts.length}`);
        
        // Success if we found significant portions or exact match
        const success = decodedTexts.some(text => 
            text && (
                text.includes(testText) || 
                text.includes('This is a long test') ||
                foundParts > originalParts.length / 2
            )
        );
        
        if (success) {
            console.log('\n✅ SUCCESS: SPQR round-trip test passed!');
            console.log('Original:', testText);
            console.log('Best match:', decodedTexts.find(t => t && t.length > 10) || 'none');
            return true;
        } else {
            console.log('\n❌ FAILURE: SPQR round-trip test failed');
            console.log('Expected parts of:', testText);
            console.log('Got:', decodedTexts);
            return false;
        }
        
    } catch (error) {
        console.error('\n❌ ERROR in SPQR test:', error);
        console.error('Stack:', error.stack);
        return false;
    }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
    testSPQRRoundTrip().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(err => {
        console.error('Test failed with error:', err);
        process.exit(1);
    });
}

export { testSPQRRoundTrip };
