// Test the color-aware SPQR decoder approach
import fs from 'fs';
import { generateColourQr } from '../dist/generator.js';
import jsQR from 'jsqr';
import sharp from 'sharp';

// Copy the web decoder functions
function decodeSPQRDirect(imageData) {
    const { data, width, height } = imageData;
    
    console.log('SPQR direct decoder: creating color-aware matrix...');
    
    try {
        // Convert to grayscale first for jsQR structure detection
        const grayData = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            // Convert any non-white pixel to black for structure detection
            const isLight = r > 200 && g > 200 && b > 200;
            const gray = isLight ? 255 : 0;
            grayData[i] = grayData[i + 1] = grayData[i + 2] = gray;
            grayData[i + 3] = 255;
        }
        
        // Save grayscale version for debugging using sharp
        const grayBuffer = await sharp(Buffer.from(grayData), {
            raw: { width, height, channels: 4 }
        }).png().toBuffer();
        fs.writeFileSync('/tmp/spqr_grayscale.png', grayBuffer);
        console.log('Saved grayscale version for debugging: /tmp/spqr_grayscale.png');
        
        // Use jsQR to locate the QR structure on grayscale version
        const jsqrResult = jsQR(grayData, width, height);
        if (!jsqrResult || !jsqrResult.location) {
            console.log('jsQR could not locate QR structure for color mapping');
            console.log('Debugging: Trying direct jsQR on original color image...');
            const directResult = jsQR(data, width, height);
            console.log('Direct jsQR result:', directResult ? 'found QR' : 'no QR found');
            
            return {
                base: 'QR structure not found in grayscale conversion',
                red: null,
                combined: 'Could not locate QR finder patterns'
            };
        }
        
        console.log('QR structure located, building color matrix...');
        const location = jsqrResult.location;
        
        // Calculate QR dimensions from corner positions
        const topLeft = location.topLeftCorner;
        const topRight = location.topRightCorner;
        const bottomLeft = location.bottomLeftCorner;
        
        const topDistance = Math.sqrt((topRight.x - topLeft.x)**2 + (topRight.y - topLeft.y)**2);
        const leftDistance = Math.sqrt((bottomLeft.x - topLeft.x)**2 + (bottomLeft.y - topLeft.y)**2);
        const avgDistance = (topDistance + leftDistance) / 2;
        
        const modulePixels = avgDistance / 14; // 14 modules between finder centers
        let qrModules = Math.round(avgDistance / modulePixels) + 7;
        
        // Ensure valid QR size
        while ((qrModules - 17) % 4 !== 0) {
            qrModules++;
        }
        qrModules = Math.max(21, Math.min(177, qrModules));
        
        console.log(`Color matrix: ${qrModules}x${qrModules} modules, ${modulePixels.toFixed(1)}px per module`);
        
        // Create color matrix
        const colorMatrix = [];
        for (let y = 0; y < qrModules; y++) {
            const row = [];
            for (let x = 0; x < qrModules; x++) {
                const pixelX = Math.round(topLeft.x + (x - 3.5) * modulePixels);
                const pixelY = Math.round(topLeft.y + (y - 3.5) * modulePixels);
                
                if (pixelX >= 0 && pixelX < width && pixelY >= 0 && pixelY < height) {
                    const i = (pixelY * width + pixelX) * 4;
                    const r = data[i], g = data[i + 1], b = data[i + 2];
                    
                    // Classify pixel color: 0=white, 1=red, 2=green, 3=black
                    let colorCode = 0;
                    if (r < 80 && g < 80 && b < 80) colorCode = 3; // black
                    else if (r > 150 && r > g + 50 && r > b + 50) colorCode = 1; // red
                    else if (g > 150 && g > r + 50 && g > b + 50) colorCode = 2; // green
                    else colorCode = 0; // white (or unknown -> white)
                    
                    row.push(colorCode);
                } else {
                    row.push(0); // white outside bounds
                }
            }
            colorMatrix.push(row);
        }
        
        console.log('Color matrix created, extracting layers...');
        
        // Extract binary layers from color matrix
        // Layer A (base): white(0) + black(3) -> dark
        // Layer B (red): red(1) + green(2) -> dark
        const createLayer = (darkColors) => {
            const layer = [];
            for (let y = 0; y < qrModules; y++) {
                const row = [];
                for (let x = 0; x < qrModules; x++) {
                    row.push(darkColors.includes(colorMatrix[y][x]));
                }
                layer.push(row);
            }
            return layer;
        };
        
        const baseLayer = createLayer([0, 3]); // white + black  
        const redLayer = createLayer([1, 2]);  // red + green
        
        console.log('Layers extracted, attempting decode...');
        
        // Decode each layer
        const decodeLayer = (binaryLayer, layerName) => {
            const scale = 4;
            const scaledSize = qrModules * scale;
            const rgba = new Uint8ClampedArray(scaledSize * scaledSize * 4);
            
            for (let y = 0; y < scaledSize; y++) {
                for (let x = 0; x < scaledSize; x++) {
                    const sourceX = Math.floor(x / scale);
                    const sourceY = Math.floor(y / scale);
                    const isDark = binaryLayer[sourceY][sourceX];
                    
                    const i = (y * scaledSize + x) * 4;
                    const value = isDark ? 0 : 255;
                    rgba[i] = rgba[i + 1] = rgba[i + 2] = value;
                    rgba[i + 3] = 255;
                }
            }
            
            const result = jsQR(rgba, scaledSize, scaledSize);
            console.log(`${layerName} decode result:`, result ? `"${result.data}"` : 'null');
            return result ? result.data : null;
        };
        
        const baseResult = decodeLayer(baseLayer, 'Base layer');
        const redResult = decodeLayer(redLayer, 'Red layer');
        
        const results = [baseResult, redResult].filter(Boolean);
        const combined = results.join('');
        
        return {
            base: baseResult || 'Base layer decode failed',
            red: redResult || 'Red layer decode failed', 
            combined: combined || 'No layers decoded successfully'
        };
        
    } catch (error) {
        console.error('SPQR direct decode error:', error);
        return {
            base: 'Decode error: ' + error.message,
            red: null,
            combined: null
        };
    }
}

async function testColorDecoder() {
    console.log('=== Color-Aware SPQR Decoder Test ===');
    
    const testText = 'This test verifies color decoding works correctly with SPQR multi-layer encoding!';
    console.log(`Test text (${testText.length} chars): "${testText}"`);
    
    try {
        // Generate SPQR
        console.log('\n1. Generating SPQR...');
        const spqrResult = await generateColourQr(testText, {
            layers: 3,
            colours: ['bwrg'],
            modulePx: 8,
            marginModules: 4
        });
        
        // Convert to image data
        const pngBuffer = await sharp(Buffer.from(spqrResult.svg))
            .resize(spqrResult.width, spqrResult.height, { kernel: 'nearest' })
            .png()
            .toBuffer();
        
        fs.writeFileSync('/tmp/color_test_spqr.png', pngBuffer);
        console.log(`Generated and saved: ${spqrResult.width}x${spqrResult.height}px`);
        
        // Load as ImageData
        const image = sharp(pngBuffer);
        const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        
        const imageData = {
            data: new Uint8ClampedArray(data),
            width: info.width,
            height: info.height
        };
        
        // Test color decoder
        console.log('\n2. Testing color-aware decoder...');
        const result = decodeSPQRDirect(imageData);
        
        console.log('\n3. Results:');
        console.log('Base layer:', result.base);
        console.log('Red layer:', result.red);
        console.log('Combined:', result.combined);
        
        // Check for success
        const success = result.combined && typeof result.combined === 'string' && (
            result.combined.includes(testText) ||
            result.combined.includes('This test verifies') ||
            (result.base && result.base.includes('This test')) ||
            (result.red && result.red.includes('color decoding'))
        );
        
        if (success) {
            console.log('\n✅ SUCCESS: Color-aware decoder working!');
            return true;
        } else {
            console.log('\n❌ FAILURE: Color-aware decoder failed');
            console.log('Expected:', testText);
            console.log('Got pieces:', [result.base, result.red]);
            return false;
        }
        
    } catch (error) {
        console.error('\n❌ ERROR in color decoder test:', error);
        return false;
    }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
    testColorDecoder().catch(err => {
        console.error('Test failed:', err);
        process.exit(1);
    });
}

export { testColorDecoder };
