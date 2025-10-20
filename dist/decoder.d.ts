export type DecodeResult = {
    text: string | null;
    format: 'qr' | 'none';
};
export declare function decodeImageToText(inputPath: string): Promise<DecodeResult>;
export declare function decodeRasterTwoLayer(inputPath: string): Promise<{
    base: string | null;
    red: string | null;
    combined: string | null;
}>;
export declare function decodeSvgMultiLayer(inputPath: string): Promise<{
    base: string | null;
    red: string | null;
    green: string | null;
    combined: string | null;
    twoLayerA?: string | null;
    twoLayerB?: string | null;
}>;
