import { mkdir, writeFile } from 'node:fs/promises';
import { generateColourQr } from './generator.js';
import { decodeSvgMultiLayer } from './decoder.js';
const cases = [
    { name: 'base_only_M', layers: 1, layering: 'duplicate', ecc: 'M' },
    { name: 'base_only_L', layers: 1, layering: 'duplicate', ecc: 'L' },
    { name: 'two_layers_split_M', layers: 2, layering: 'split', ecc: 'M' },
    { name: 'two_layers_split_L', layers: 2, layering: 'split', ecc: 'L' },
    { name: 'three_layers_split_M', layers: 3, layering: 'split', ecc: 'M' },
    { name: 'three_layers_split_L', layers: 3, layering: 'split', ecc: 'L' }
];
function makePayload(n) {
    return 'X'.repeat(n);
}
async function canRoundtrip(payload, c) {
    const { svg } = await generateColourQr(payload, {
        layers: c.layers,
        mode: 'square',
        composition: 'discrete',
        addKey: true,
        layering: c.layering,
        eccLevel: c.ecc,
        modulePx: 8,
        marginModules: 4
    });
    await mkdir('out/sweep', { recursive: true });
    await writeFile(`out/sweep/${c.name}.svg`, svg, 'utf8');
    const res = await decodeSvgMultiLayer(`out/sweep/${c.name}.svg`);
    const decoded = res.combined ?? res.base ?? '';
    return decoded === payload;
}
async function findMax(c) {
    let low = 0;
    let high = 4000; // search up to ~4KB
    while (low < high) {
        const mid = Math.ceil((low + high + 1) / 2);
        const ok = await canRoundtrip(makePayload(mid), c).catch(() => false);
        if (ok)
            low = mid;
        else
            high = mid - 1;
    }
    return low;
}
async function main() {
    const results = {};
    for (const c of cases) {
        const cap = await findMax(c);
        results[c.name] = cap;
        console.log(`${c.name}: ${cap}`);
    }
    await mkdir('out', { recursive: true });
    await writeFile('out/capacity_results.json', JSON.stringify(results, null, 2), 'utf8');
}
main().catch((e) => { console.error(e); process.exit(1); });
//# sourceMappingURL=sweep.js.map