import { generateColourQr } from './dist/generator.js';
import sharp from 'sharp';

// Debug the SPQR decoder color mapping
async function debugDecoder() {
    console.log('🧪 Debugging SPQR decoder color mapping...');

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

        // Test color classification thresholds
        console.log('\n=== Color Classification Test ===');

        // Test the specific RGB values we're seeing
        const testPixels = [
            { r: 85, g: 85, b: 85, desc: 'Dark gray (85,85,85)' },
            { r: 255, g: 255, b: 255, desc: 'White (255,255,255)' },
            { r: 0, g: 255, b: 0, desc: 'Green (0,255,0)' },
            { r: 255, g: 0, b: 0, desc: 'Red (255,0,0)' },
            { r: 0, g: 0, b: 0, desc: 'Black (0,0,0)' }
        ];

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

        testPixels.forEach(pixel => {
            const tag = classifyTag(pixel.r, pixel.g, pixel.b);
            console.log(`${pixel.desc} → ${tag}`);
        });

        console.log('\n✅ Debug complete');

    } catch (error) {
        console.error('❌ Debug failed:', error.message);
    }
}

debugDecoder();
