export type Colour = string;
export type Mode = 'square' | 'rmqr';
export type Composition = 'overlay' | 'discrete';
export type KeyPlacement = 'quietZone' | 'finderCenter';
export type FinderCorner = 'tr' | 'tl' | 'bl';
export type GeneratorOptions = {
    mode?: Mode;
    layers?: number;
    colours?: Colour[];
    addKey?: boolean;
    composition?: Composition;
    zeroIsBlack?: boolean;
    keyPlacement?: KeyPlacement;
    keyFinderCorner?: FinderCorner;
    keyFinderCorners?: FinderCorner[];
    modulePx?: number;
    marginModules?: number;
    /** ECC level for square QR. Defaults to 'M' to maximise capacity. */
    eccLevel?: 'L' | 'M' | 'Q' | 'H';
    /** Layering strategy: 'split' (default) splits payload across layers; 'duplicate' encodes full payload in all layers */
    layering?: 'split' | 'duplicate';
    /** Finder key style: fill inner finder squares ('finderFill') or omit keys ('none'). */
    finderKeyStyle?: 'finderFill' | 'none';
};
export type SvgResult = {
    svg: string;
    width: number;
    height: number;
};
export declare function parseColourList(input?: string | string[]): Colour[];
export declare function splitPayload(payload: string, splits: number): string[];
export declare function generateColourQr(payload: string, opts?: GeneratorOptions): Promise<SvgResult>;
