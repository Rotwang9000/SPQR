export type SPQRDecode = {
    base?: string | null;
    red?: string | null;
    green?: string | null;
    combined: string | null;
};
export declare function decodeSPQRIntegrated(inputPath: string): Promise<SPQRDecode>;
