import { mkdir, writeFile } from 'node:fs/promises';
import { generateColourQr } from './generator.js';
function extractModulesW(svg) {
    const m = svg.match(/data-modules-w=\"(\d+)\"/);
    if (!m)
        throw new Error('modules-w not found');
    return parseInt(m[1], 10);
}
function computeVersion(modules) {
    return Math.max(1, Math.round((modules - 17) / 4));
}
async function measureVersion(payload, layers, ecc, layering) {
    const { svg } = await generateColourQr(payload, {
        layers,
        mode: 'square',
        composition: 'discrete',
        addKey: true,
        eccLevel: ecc,
        layering,
        modulePx: 8,
        marginModules: 4
    });
    await mkdir('out/sweep_versions', { recursive: true });
    await writeFile(`out/sweep_versions/${layers}_${layering}_${ecc}.svg`, svg, 'utf8');
    const modules = extractModulesW(svg);
    return computeVersion(modules);
}
async function main() {
    const payload = process.argv.slice(2).join(' ') || 'This is a fixed test payload to compare QR versions across layering modes.';
    const ecc = 'M';
    const results = {};
    for (const layers of [1, 2, 3]) {
        const vSplit = await measureVersion(payload, layers, ecc, 'split');
        results[`${layers} layers (split)`] = vSplit;
    }
    for (const layers of [1, 2, 3]) {
        const vDup = await measureVersion(payload, layers, ecc, 'duplicate');
        results[`${layers} layers (duplicate)`] = vDup;
    }
    console.table(results);
}
main().catch((e) => { console.error(e); process.exit(1); });
//# sourceMappingURL=sweep_versions.js.map