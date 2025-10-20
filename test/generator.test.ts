import { describe, it, expect } from 'vitest';
import { splitPayload, generateColourQr, parseColourList } from '../src/generator.js';

describe('parseColourList', () => {
	it('defaults to 4-colour high-contrast white-first palette', () => {
		const c = parseColourList();
		expect(c).toEqual(['#ffffff', '#ff0000', '#00ff00', '#ffff00']);
	});
	it('parses tokens r,g,b,k', () => {
		const c = parseColourList('r,g,b,k');
		expect(c).toEqual(['#ff0000','#00ff00','#0000ff','#000000']);
	});
});

describe('splitPayload', () => {
	it('splits and preserves order', () => {
		const parts = splitPayload('abcdefghij', 3);
		expect(parts.join('')).toBe('abcdefghij');
	});
});

describe('generateColourQr (square, discrete)', () => {
    it('produces SVG with rectangles and key', async () => {
        const { svg, width, height } = await generateColourQr('hello world', { layers: 3, mode: 'square', composition: 'discrete' });
        expect(svg.includes('<svg')).toBe(true);
        expect(svg.includes('<rect')).toBe(true);
        expect(width).toBeGreaterThan(0);
        expect(height).toBeGreaterThan(0);
    });
});


