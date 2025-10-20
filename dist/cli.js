#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { generateColourQr, parseColourList } from './generator.js';
import { decodeImageToText, decodeRasterTwoLayer } from './decoder.js';
import { decodeSPQRIntegrated } from './spqrDecoder.js';
import sharp from 'sharp';
function parseArgs(argv) {
    const [, , cmd = 'help', ...rest] = argv;
    const args = {};
    for (let i = 0; i < rest.length; i++) {
        const token = rest[i];
        if (token.startsWith('--')) {
            const key = token.slice(2);
            if (key === 'colours') {
                // Collect all following non-flag tokens as colours
                const values = [];
                let j = i + 1;
                while (j < rest.length && !rest[j].startsWith('--')) {
                    values.push(rest[j]);
                    j++;
                }
                if (values.length > 0) {
                    args[key] = values.join(' ');
                    i = j - 1;
                }
                else {
                    args[key] = true;
                }
            }
            else {
                const next = rest[i + 1];
                if (next && !next.startsWith('--')) {
                    args[key] = next;
                    i++;
                }
                else {
                    args[key] = true;
                }
            }
        }
    }
    return { cmd, args };
}
function normaliseColoursArg(arg) {
    if (!arg || typeof arg === 'boolean')
        return undefined; // default
    // Allow tokens without quotes: r,g,b,k or hex without commas but separated by spaces
    if (arg.includes(','))
        return arg.split(',');
    return arg.split(/\s+/);
}
async function main() {
    const { cmd, args } = parseArgs(process.argv);
    if (cmd === 'help' || args.help) {
        console.log(`Usage:\n  ${basename(process.argv[1])} generate --data "..." [--layers 3] [--colours r g b k] [--mode square|rmqr] [--composition discrete|overlay] [--ecc L|M|Q|H] [--modulePx 8] [--marginModules 4] [--layering split|duplicate] [--out qr.svg|qr.png|qr.jpg] [--format svg|png|jpeg] [--quality 90]\n  ${basename(process.argv[1])} decode --in qr.svg|qr.png|qr.jpg\n  ${basename(process.argv[1])} convert --in input.png --layers 3 [--colours k r g] --out colour.svg`);
        if (cmd === 'convert') {
            const input = String(args.in ?? args.input ?? '');
            if (!input)
                throw new Error('--in required');
            const res = await decodeImageToText(input);
            if (!res.text)
                throw new Error('No QR code found in input');
            const layers = Number(args.layers ?? 3);
            const colours = parseColourList(normaliseColoursArg(args.colours));
            const out = String(args.out ?? 'colour.svg');
            const { svg } = await generateColourQr(res.text, { layers, colours, mode: 'square', composition: 'discrete', addKey: true, layering: 'split' });
            await writeFile(out, svg, 'utf8');
            console.log(`Converted ${input} -> ${out}`);
            return;
        }
        process.exit(0);
    }
    if (cmd === 'generate') {
        const data = String(args.data ?? '');
        const layers = Number(args.layers ?? 3);
        const colours = parseColourList(normaliseColoursArg(args.colours));
        const mode = args.mode ?? 'square';
        const composition = args.composition ?? 'discrete';
        const ecc = args.ecc ?? 'M';
        const out = String(args.out ?? 'qr.svg');
        const format = args.format ?? (out.toLowerCase().endsWith('.png') ? 'png' : out.toLowerCase().endsWith('.jpg') || out.toLowerCase().endsWith('.jpeg') ? 'jpeg' : 'svg');
        const quality = args.quality ? Number(args.quality) : 90;
        const modulePx = args.modulePx ? Number(args.modulePx) : undefined;
        const marginModules = args.marginModules ? Number(args.marginModules) : undefined;
        const layering = args.layering ?? 'split';
        const finderKeyStyle = args.finderKeyStyle ?? 'finderFill';
        if (!data)
            throw new Error('--data required');
        const { svg } = await generateColourQr(data, {
            layers,
            colours,
            mode: mode === 'rmqr' ? 'rmqr' : 'square',
            composition: composition === 'overlay' ? 'overlay' : 'discrete',
            addKey: true,
            modulePx,
            marginModules,
            eccLevel: (ecc === 'L' || ecc === 'M' || ecc === 'Q' || ecc === 'H') ? ecc : 'M',
            layering: layering === 'duplicate' ? 'duplicate' : 'split',
            finderKeyStyle: finderKeyStyle === 'none' ? 'none' : 'finderFill'
        });
        if (format === 'png') {
            // Parse SVG dimensions for correct rasterization  
            const widthMatch = svg.match(/width="(\d+)"/);
            const heightMatch = svg.match(/height="(\d+)"/);
            const width = widthMatch ? parseInt(widthMatch[1]) : 512;
            const height = heightMatch ? parseInt(heightMatch[1]) : 512;
            const png = await sharp(Buffer.from(svg))
                .resize(width, height, { kernel: 'nearest' })
                .png()
                .toBuffer();
            await writeFile(out, png);
        }
        else if (format === 'jpeg' || format === 'jpg') {
            // Parse SVG dimensions for correct rasterization
            const widthMatch = svg.match(/width="(\d+)"/);
            const heightMatch = svg.match(/height="(\d+)"/);
            const width = widthMatch ? parseInt(widthMatch[1]) : 512;
            const height = heightMatch ? parseInt(heightMatch[1]) : 512;
            const jpg = await sharp(Buffer.from(svg))
                .resize(width, height, { kernel: 'nearest' })
                .jpeg({ quality: Number.isFinite(quality) ? quality : 90 })
                .toBuffer();
            await writeFile(out, jpg);
        }
        else {
            await writeFile(out, svg, 'utf8');
        }
        console.log(`Wrote ${out}`);
        return;
    }
    if (cmd === 'decode') {
        const input = String(args.in ?? args.input ?? '');
        if (!input)
            throw new Error('--in required');
        // First try standard QR decoding
        console.log('=== Trying standard QR decode ===');
        const standardResult = await decodeImageToText(input);
        if (standardResult.text) {
            console.log(`Standard QR: "${standardResult.text}"`);
            console.log({ standard: standardResult.text, spqr: null });
            return;
        }
        // If standard QR fails, try legacy two-layer SPQR decode first
        if (process.env.SPQR_DEBUG)
            console.log('=== Trying SPQR two-layer decode ===');
        const spqrResult = await decodeRasterTwoLayer(input);
        if (spqrResult.combined) {
            console.log({ standard: null, spqr: spqrResult });
            return;
        }
        // Fallback to integrated color-aware decode if two-layer fails
        if (process.env.SPQR_DEBUG)
            console.log('=== SPQR two-layer decode failed, trying integrated color-aware decode ===');
        const spqrIntegrated = await decodeSPQRIntegrated(input);
        console.log({ standard: null, spqr: spqrIntegrated });
        return;
    }
    throw new Error(`Unknown command: ${cmd}`);
}
main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map