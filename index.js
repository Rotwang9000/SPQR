// Package entry: the SPQR core with its two dependencies already wired in.
import qrcode from 'qrcode-generator';
import jsQR from 'jsqr';
import { createSpqr } from './docs/spqr-core.js';

export { createSpqr, palette, splitBytes, hexToRgb, ECC_LEVELS, CHANNELS } from './docs/spqr-core.js';

const spqr = createSpqr({ qrcode, jsQR });

export const { encode, toSvg, toRgba, decode, decodeChannels, assemble, createAggregator, minVersion } = spqr;
export default spqr;
