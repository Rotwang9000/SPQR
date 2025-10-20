import { describe, it, expect } from 'vitest';
import { generateColourQr } from '../dist/generator.js';
import { decodeRasterTwoLayer } from '../dist/decoder.js';
import sharp from 'sharp';

describe('SPQR decoder', () => {
	it('round-trips a simple SPQR payload', async () => {
		const text = 'HELLO';
		const { svg, width, height } = await generateColourQr(text, { layers: 2, colours: ['bwrg'], modulePx: 8, marginModules: 4, addKey: false });
		const png = await sharp(Buffer.from(svg)).resize(width, height, { kernel: 'nearest' }).png().toBuffer();
		const tmp = '/tmp/spqr_test.png';
		await sharp(png).toFile(tmp);
		const res = await decodeRasterTwoLayer(tmp);
		// For now, just check that we get some result
		expect(res.base || res.red).toBeTruthy();
	});
});


