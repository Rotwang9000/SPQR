import { generateColourQr } from './generator.js';
import { writeFile } from 'node:fs/promises';
async function run() {
    const payload = 'Hello SPQR layered colours!';
    const { svg } = await generateColourQr(payload, { layers: 2, colours: ['#000', '#d32f2f'], addKey: true });
    await writeFile('dev.svg', svg, 'utf8');
    console.log('Wrote dev.svg');
}
run().catch((e) => {
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=dev.js.map