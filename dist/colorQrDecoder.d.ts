export interface ColorMapping {
    white: number;
    red: number;
    green: number;
    black: number;
}
export interface SPQRDecodeResult {
    layers: string[];
    combined: string;
    colorScheme: string;
}
export interface ColorBitMatrix {
    width: number;
    height: number;
    get: (x: number, y: number) => number;
}
export declare function classifyPixelColor(r: number, g: number, b: number, colorScheme?: 'bwrg' | 'cmyrgb'): number;
export declare function createColorBitMatrix(imageData: ImageData, qrLocation?: any): ColorBitMatrix;
export declare function decodeColorQR(colorMatrix: ColorBitMatrix): SPQRDecodeResult;
export declare function decodeSPQRImage(imageData: ImageData): Promise<SPQRDecodeResult>;
