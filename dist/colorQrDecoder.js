// Color-aware QR decoder that handles multi-layer SPQR codes
import jsQR from 'jsqr';
export function classifyPixelColor(r, g, b, colorScheme = 'bwrg') {
    // For BWRG scheme: 0=white, 1=red, 2=green, 3=black
    if (colorScheme === 'bwrg') {
        const isBlack = r < 80 && g < 80 && b < 80;
        const isRed = r > 150 && r > g + 50 && r > b + 50;
        const isGreen = g > 150 && g > r + 50 && g > b + 50;
        const isWhite = r > 200 && g > 200 && b > 200;
        if (isBlack)
            return 3;
        if (isRed)
            return 1;
        if (isGreen)
            return 2;
        if (isWhite)
            return 0;
        // Fallback: classify by brightness
        const brightness = (r + g + b) / 3;
        return brightness < 128 ? 3 : 0; // black or white
    }
    // For CMYRGB scheme (8 colors): more complex mapping
    // TODO: Implement 8-color classification
    return 0;
}
export function createColorBitMatrix(imageData, qrLocation) {
    const { data, width, height } = imageData;
    // Use jsQR to locate the QR structure first
    const jsqrResult = jsQR(data, width, height);
    if (!jsqrResult || !jsqrResult.location) {
        throw new Error('Could not locate QR structure');
    }
    const location = jsqrResult.location;
    // Calculate QR dimensions from corner positions
    const topLeft = location.topLeftCorner;
    const topRight = location.topRightCorner;
    const bottomLeft = location.bottomLeftCorner;
    // Estimate module size and QR dimensions
    const topDistance = Math.sqrt((topRight.x - topLeft.x) ** 2 + (topRight.y - topLeft.y) ** 2);
    const leftDistance = Math.sqrt((bottomLeft.x - topLeft.x) ** 2 + (bottomLeft.y - topLeft.y) ** 2);
    const avgDistance = (topDistance + leftDistance) / 2;
    // Standard QR: finders are 7 modules apart, so distance represents 14 modules
    const modulePixels = avgDistance / 14;
    const qrModules = Math.round(avgDistance / modulePixels) + 7; // Add 7 for finders
    // Ensure valid QR size (21, 25, 29, 33, etc.)
    let actualModules = 21;
    while (actualModules < qrModules) {
        actualModules += 4;
    }
    console.log(`Color BitMatrix: ${actualModules}x${actualModules} modules, ${modulePixels.toFixed(1)}px per module`);
    // Create the color matrix
    const matrix = [];
    for (let y = 0; y < actualModules; y++) {
        const row = [];
        for (let x = 0; x < actualModules; x++) {
            // Map QR module coordinate to pixel coordinate
            const pixelX = Math.round(topLeft.x + (x - 3.5) * modulePixels); // -3.5 to center on finder
            const pixelY = Math.round(topLeft.y + (y - 3.5) * modulePixels);
            if (pixelX >= 0 && pixelX < width && pixelY >= 0 && pixelY < height) {
                const i = (pixelY * width + pixelX) * 4;
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                row.push(classifyPixelColor(r, g, b));
            }
            else {
                row.push(0); // white/empty outside bounds
            }
        }
        matrix.push(row);
    }
    return {
        width: actualModules,
        height: actualModules,
        get: (x, y) => {
            if (x >= 0 && x < actualModules && y >= 0 && y < actualModules) {
                return matrix[y][x];
            }
            return 0;
        }
    };
}
export function decodeColorQR(colorMatrix) {
    // Extract layer data based on color mapping
    // For BWRG: 0=white, 1=red, 2=green, 3=black/yellow
    // Layer mapping: base layer = colors 0,3 (white,black), red layer = colors 1,2 (red,green)
    const layers = [];
    // Create binary matrices for each layer
    const baseLayer = createBinaryFromColors(colorMatrix, [0, 3]); // white + black
    const redLayer = createBinaryFromColors(colorMatrix, [1, 2]); // red + green
    // Decode each layer using jsQR
    try {
        const baseResult = decodeBinaryMatrix(baseLayer);
        if (baseResult)
            layers.push(baseResult);
    }
    catch (e) {
        console.log('Base layer decode failed:', e.message);
    }
    try {
        const redResult = decodeBinaryMatrix(redLayer);
        if (redResult)
            layers.push(redResult);
    }
    catch (e) {
        console.log('Red layer decode failed:', e.message);
    }
    const combined = layers.join('');
    return {
        layers,
        combined,
        colorScheme: 'BWRG 4-color'
    };
}
function createBinaryFromColors(colorMatrix, darkColors) {
    const binary = [];
    for (let y = 0; y < colorMatrix.height; y++) {
        const row = [];
        for (let x = 0; x < colorMatrix.width; x++) {
            const color = colorMatrix.get(x, y);
            row.push(darkColors.includes(color));
        }
        binary.push(row);
    }
    return binary;
}
function decodeBinaryMatrix(binary) {
    const size = binary.length;
    const scale = 4; // Scale up for better jsQR performance
    const scaledSize = size * scale;
    // Convert to RGBA data
    const rgba = new Uint8ClampedArray(scaledSize * scaledSize * 4);
    for (let y = 0; y < scaledSize; y++) {
        for (let x = 0; x < scaledSize; x++) {
            const sourceX = Math.floor(x / scale);
            const sourceY = Math.floor(y / scale);
            const isDark = binary[sourceY][sourceX];
            const i = (y * scaledSize + x) * 4;
            const value = isDark ? 0 : 255;
            rgba[i] = rgba[i + 1] = rgba[i + 2] = value;
            rgba[i + 3] = 255;
        }
    }
    // Try to decode with jsQR
    const result = jsQR(rgba, scaledSize, scaledSize);
    return result ? result.data : null;
}
export async function decodeSPQRImage(imageData) {
    try {
        // Create color-aware bit matrix
        const colorMatrix = createColorBitMatrix(imageData);
        // Decode layers
        const result = decodeColorQR(colorMatrix);
        console.log(`SPQR decoded: ${result.layers.length} layers, combined: "${result.combined}"`);
        return result;
    }
    catch (error) {
        console.error('SPQR decode error:', error);
        throw error;
    }
}
//# sourceMappingURL=colorQrDecoder.js.map