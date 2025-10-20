// Test individual SPQR layer decoding using debug images
import fs from 'fs';
import { decodeMatrixWithParams, matrixFromModules } from '../dist/decoderCore.js';
import jsQR from 'jsqr';
import sharp from 'sharp';

async function testLayerDecoding() {
    console.log('=== Debug Layer Decoding Test ===');
    
    const layers = [
        { name: 'Layer A (black|green)', path: 'out/debug_layer_a_grid.png' },
        { name: 'Layer B (red|green)', path: 'out/debug_layer_b_grid.png' }
    ];
    
    for (const layer of layers) {
        console.log(`\n--- Testing ${layer.name} ---`);
        
        try {
            // Check if file exists
            if (!fs.existsSync(layer.path)) {
                console.log(`❌ File not found: ${layer.path}`);
                continue;
            }
            
            // Load and decode with jsQR directly
            const image = sharp(layer.path);
            const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            
            console.log(`Image: ${info.width}x${info.height}`);
            
            // Try jsQR directly
            const jsqrResult = jsQR(data, info.width, info.height);
            console.log(`jsQR direct: ${jsqrResult ? `"${jsqrResult.data}"` : 'null'}`);
            
            // Try upscaled jsQR
            const scale = 2;
            const bigW = info.width * scale;
            const bigH = info.height * scale;
            const bigData = new Uint8ClampedArray(bigW * bigH * 4);
            
            for (let y = 0; y < bigH; y++) {
                for (let x = 0; x < bigW; x++) {
                    const srcX = Math.floor(x / scale);
                    const srcY = Math.floor(y / scale);
                    const srcI = (srcY * info.width + srcX) * 4;
                    const dstI = (y * bigW + x) * 4;
                    
                    bigData[dstI] = data[srcI];
                    bigData[dstI + 1] = data[srcI + 1];
                    bigData[dstI + 2] = data[srcI + 2];
                    bigData[dstI + 3] = data[srcI + 3];
                }
            }
            
            const jsqrResultBig = jsQR(bigData, bigW, bigH);
            console.log(`jsQR upscaled 2x: ${jsqrResultBig ? `"${jsqrResultBig.data}"` : 'null'}`);
            
            // Try with decoderCore (matrix approach)
            // Convert to boolean matrix
            const modules = [];
            for (let y = 0; y < info.height; y++) {
                const row = [];
                for (let x = 0; x < info.width; x++) {
                    const i = (y * info.width + x) * 4;
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const gray = (r + g + b) / 3;
                    row.push(gray < 128); // true = dark
                }
                modules.push(row);
            }
            
            const matrix = matrixFromModules(modules);
            const decoderResult = decodeMatrixWithParams(matrix);
            console.log(`decoderCore: ${decoderResult ? `"${decoderResult.text}"` : 'null'}`);
            
            // Sample some pixel values for debugging
            const center = Math.floor(info.width / 2);
            const centerI = (center * info.width + center) * 4;
            console.log(`Center pixel: RGB(${data[centerI]}, ${data[centerI+1]}, ${data[centerI+2]})`);
            
            // Count black vs white pixels
            let blackPixels = 0;
            let whitePixels = 0;
            for (let i = 0; i < data.length; i += 4) {
                const gray = (data[i] + data[i+1] + data[i+2]) / 3;
                if (gray < 128) blackPixels++;
                else whitePixels++;
            }
            console.log(`Pixels: ${blackPixels} black, ${whitePixels} white (${(blackPixels/(blackPixels+whitePixels)*100).toFixed(1)}% black)`);
            
        } catch (error) {
            console.error(`❌ Error testing ${layer.name}:`, error.message);
        }
    }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
    testLayerDecoding().catch(err => {
        console.error('Test failed:', err);
        process.exit(1);
    });
}

export { testLayerDecoding };
