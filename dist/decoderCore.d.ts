export interface BitMatrix {
    width: number;
    height: number;
    get(x: number, y: number): boolean;
}
export interface DecodeResult {
    text: string;
    mask: number;
    version: number;
}
export declare function decodeMatrixGuessMask(matrix: BitMatrix): DecodeResult | null;
export declare function decodeMatrixWithParams(matrix: BitMatrix, params?: {
    mask?: number;
    version?: number;
}): DecodeResult | null;
export declare function matrixFromModules(modules: boolean[][]): BitMatrix;
