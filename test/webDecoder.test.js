// Test SPQR generation and decoding using the same functions as the web page
import fs from 'fs';
import path from 'path';
import { generateColourQr } from '../dist/generator.js';
import jsQR from 'jsqr';
import sharp from 'sharp';

// Mock browser globals for the web functions
global.console = console;
global.jsQR = jsQR;

// Read the web app functions (simplified approach)
const webAppCode = fs.readFileSync(path.join(process.cwd(), 'web/app.js'), 'utf8');

// Extract just the functions we need by eval'ing them in a safe context
function createWebContext() {
    const context = {
        jsQR: global.jsQR,
        console: global.console,
        Math: Math,
        Array: Array,
        Uint8ClampedArray: Uint8ClampedArray,
        String: String,
        parseInt: parseInt,
        require: (id) => { 
            if (id === 'jsqr') return jsQR;
            throw new Error(`Mock require: ${id} not supported`);
        }
    };
    
    // Extract the SPQR detection and decoding functions from web app
    const functionExtracts = [
        'detectSPQR',
        'decodeSPQRLayersSimple', 
        'createBinaryMatrix',
        'locateQR',
        'getRuns',
        'findFinderPatterns',
        'verifyFinderPattern',
        'clusterFinders',
        'orderFinders',
        'calculateDimension',
        'detectColorScheme',
        'extractColorLayers',
        'extractQRBits',
        'decodeQRData',
        'addSyntheticFinders',
        'drawFinderPattern',
        'binaryToDataUrl'
    ];
    
    // Simple extraction - look for function definitions
    for (const funcName of functionExtracts) {
        const regex = new RegExp(`function ${funcName}\\([^)]*\\)[\\s\\S]*?(?=\\nfunction|\\n\\/\\/|$)`, 'm');
        const match = webAppCode.match(regex);
        if (match) {
            try {
                eval(`context.${funcName} = ${match[0]}`);
            } catch (e) {
                console.warn(`Failed to extract ${funcName}:`, e.message);
            }
        }
    }
    
    return context;
}

async function testSPQRRoundTrip() {
    console.log('=== SPQR Round-Trip Test ===');
    
    // Generate a test string (64+ chars)
    const testText = 'This is a long test string with more than 64 characters to verify SPQR encoding and decoding works correctly in all scenarios!';
    console.log(`Test text (${testText.length} chars): "${testText}"`);
    
    try {
        // Step 1: Generate SPQR using the same function as CLI
        console.log('\n1. Generating SPQR...');
        const spqrResult = await generateColourQr(testText, {
            layers: 3,
            colours: ['bwrg'], // Black, White, Red, Green
            modulePx: 6,
            marginModules: 4
        });
        
        console.log(`Generated SPQR: ${spqrResult.width}x${spqrResult.height}px`);
        
        // Step 2: Convert SVG to PNG for testing (simulate upload)
        const pngBuffer = await sharp(Buffer.from(spqrResult.svg))
            .resize(spqrResult.width, spqrResult.height, { kernel: 'nearest' })
            .png()
            .toBuffer();
        
        // Save for debugging
        fs.writeFileSync('/tmp/test_spqr.png', pngBuffer);
        fs.writeFileSync('/tmp/test_spqr.svg', spqrResult.svg);
        console.log('Saved test SPQR to /tmp/test_spqr.png and /tmp/test_spqr.svg');
        
        // Step 3: Load PNG back as ImageData (simulate web upload)
        const image = sharp(pngBuffer);
        const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        
        const imageData = {
            data: new Uint8ClampedArray(data),
            width: info.width,
            height: info.height
        };
        
        console.log(`\n2. Loading image data: ${imageData.width}x${imageData.height}`);
        
        // Step 4: Try standard QR detection first (should fail)
        console.log('\n3. Testing standard QR detection...');
        const standardResult = jsQR(imageData.data, imageData.width, imageData.height);
        console.log('Standard QR result:', standardResult ? standardResult.data : 'null');
        
        // Step 5: Test SPQR detection using web functions
        console.log('\n4. Testing SPQR detection...');
        const webContext = createWebContext();
        
        if (!webContext.detectSPQR) {
            throw new Error('Failed to extract detectSPQR function from web app');
        }
        
        const spqrDetectionResult = webContext.detectSPQR(imageData);
        console.log('SPQR detection result:', spqrDetectionResult);
        
        // Step 6: Verify results
        if (spqrDetectionResult && spqrDetectionResult.combined && spqrDetectionResult.combined.includes(testText)) {
            console.log('\n✅ SUCCESS: SPQR round-trip test passed!');
            console.log('Original:', testText);
            console.log('Decoded:', spqrDetectionResult.combined);
            return true;
        } else {
            console.log('\n❌ FAILURE: SPQR round-trip test failed');
            console.log('Expected:', testText);
            console.log('Got:', spqrDetectionResult ? spqrDetectionResult.combined : 'null');
            return false;
        }
        
    } catch (error) {
        console.error('\n❌ ERROR in SPQR test:', error);
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
