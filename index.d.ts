export type Layers = 1 | 2 | 3;
export type Ecc = 'L' | 'M' | 'Q' | 'H';

/** RGBA pixels, as from canvas getImageData() or sharp(...).raw(). */
export interface RgbaImage {
	data: Uint8ClampedArray | Uint8Array;
	width: number;
	height: number;
}

export interface Point { x: number; y: number }

export interface Location {
	topLeftCorner: Point;
	topRightCorner: Point;
	bottomRightCorner: Point;
	bottomLeftCorner: Point;
	[key: string]: Point;
}

export interface SpqrCode {
	layers: Layers;
	ecc: Ecc;
	/** QR version (1-40) shared by every layer. */
	version: number;
	/** Modules per side. */
	size: number;
	/** cells[y * size + x] is a bitmask of which layers are dark at that module. */
	cells: Uint8Array;
	/** The bytes carried by each layer, in order. */
	layerBytes: Uint8Array[];
}

export interface RenderOptions {
	/** Pixels per module. Default 10. */
	modulePx?: number;
	/** Quiet zone in modules. Default 4. */
	quietZone?: number;
}

export interface ChannelResult {
	bytes: Uint8Array;
	version: number;
	location: Location;
	extractor: 'raw' | 'unmix' | 'chroma';
}

export type DecodeResult =
	| { status: 'ok'; layers: Layers; version: number; text: string; bytes: Uint8Array; location: Location; found: boolean[] }
	| { status: 'none' | 'partial' | 'mixed'; layers: Layers | null; found: boolean[] };

export interface DecodeOptions {
	/** Channels (R, G, B) not to attempt. */
	skip?: [boolean, boolean, boolean];
	/** Which channel extractors to try: 0 raw, 1 unmix, 2 chroma. Default all. */
	extractors?: number[];
}

export interface Aggregator {
	/** Which channels have been read so far. */
	readonly locked: boolean[];
	reset(): void;
	/** Add a frame; returns the combined result so far. */
	push(image: RgbaImage, opts?: { now?: number; extractors?: number[] }): DecodeResult;
}

export interface Spqr {
	encode(text: string | Uint8Array, opts?: { layers?: Layers; ecc?: Ecc }): SpqrCode;
	toSvg(code: SpqrCode, opts?: RenderOptions): string;
	toRgba(code: SpqrCode, opts?: RenderOptions): { data: Uint8ClampedArray; width: number; height: number };
	decode(image: RgbaImage, opts?: DecodeOptions): DecodeResult;
	decodeChannels(image: RgbaImage, opts?: DecodeOptions): { results: (ChannelResult | null)[]; threeLayerHint: boolean | null };
	assemble(results: (ChannelResult | null)[], threeLayerHint: boolean | null): DecodeResult;
	/** Combine layers read from different camera frames. maxAgeMs defaults to 4000. */
	createAggregator(opts?: { maxAgeMs?: number }): Aggregator;
	minVersion(bytes: Uint8Array, ecc: Ecc): number | null;
}

/** Build an instance from your own copies of qrcode-generator and jsQR (e.g. browser globals). */
export function createSpqr(deps: { qrcode: unknown; jsQR: unknown }): Spqr;
export function palette(layers: Layers): string[];
export function splitBytes(bytes: Uint8Array, parts: number): Uint8Array[];
export function hexToRgb(hex: string): [number, number, number];
export const ECC_LEVELS: Ecc[];
export const CHANNELS: ['R', 'G', 'B'];

export const encode: Spqr['encode'];
export const toSvg: Spqr['toSvg'];
export const toRgba: Spqr['toRgba'];
export const decode: Spqr['decode'];
export const decodeChannels: Spqr['decodeChannels'];
export const assemble: Spqr['assemble'];
export const createAggregator: Spqr['createAggregator'];
export const minVersion: Spqr['minVersion'];

declare const spqr: Spqr;
export default spqr;
