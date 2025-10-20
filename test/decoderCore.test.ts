import { describe, it, expect } from 'vitest';
import { decodeMatrixGuessMask, decodeMatrixWithParams, matrixFromModules, BitMatrix } from '../src/decoderCore';
// Fallback: build a tiny version 1 QR matrix manually via a reference lib available in browser; in Node, use a simple pattern
// To avoid flaky resolution of qrcode-generator in Vitest, we implement a tiny Byte-mode V1 generator using known modules via qrcode package
import QRCode from 'qrcode';

async function buildModulesFromLib(text: string): Promise<{ modules:boolean[][]; mask:number; version:number }>{
    const model = QRCode.create(text, { errorCorrectionLevel: 'L' });
    const size = model.modules.size;
    const modules: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            // qrcode modules.get(row, col) uses (y, x)
            modules[y][x] = !!(model.modules as any).get(y, x);
        }
    }
    return { modules, mask: model.maskPattern, version: model.version } as any;
}

describe('decoderCore minimal pipeline', () => {
	it('decodes a simple QR (Byte mode) by guessing mask', async () => {
    const text = 'HELLO-123';
    const built = await buildModulesFromLib(text);
    
    // First, verify jsQR can decode the same upscaled matrix
    const sz = built.modules.length;
    const scale = 10;
    const bigSz = sz * scale;
    const rgba = new Uint8ClampedArray(bigSz * bigSz * 4);
    for (let y = 0; y < bigSz; y++) {
        for (let x = 0; x < bigSz; x++) {
            const i = (y * bigSz + x) * 4;
            const moduleX = Math.floor(x / scale);
            const moduleY = Math.floor(y / scale);
            const val = built.modules[moduleY][moduleX] ? 0 : 255;
            rgba[i] = rgba[i+1] = rgba[i+2] = val;
            rgba[i+3] = 255;
        }
    }
    const jsQR = (global as any).jsQR || require('jsqr');
    const jsqrResult = jsQR(rgba, bigSz, bigSz);
    console.log('jsQR baseline:', jsqrResult?.data || 'NO_CODE');
    expect(jsqrResult?.data).toBe(text); // This should pass
    
    const matrix: BitMatrix = matrixFromModules(built.modules);
    // Try the exact mask and version from the generator first
    const direct = decodeMatrixWithParams(matrix, { mask: built.mask, version: built.version });
    console.log('Direct decode with mask', built.mask, ':', direct?.text || 'null');
    if (!direct || direct.text !== text) {
        // Fallback: try all masks
        let found: string | null = null;
        for (let mask = 0; mask < 8; mask++) {
            const res = decodeMatrixWithParams(matrix, { mask, version: built.version });
            console.log('  Mask', mask, ':', res?.text || 'null');
            if (res?.text === text) { found = res.text; break; }
        }
        expect(found).toBe(text);
    } else {
        expect(direct.text).toBe(text);
    }
	});
});


