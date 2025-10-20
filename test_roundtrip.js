#!/usr/bin/env node
import { generateColourQr } from './dist/generator.js';
import { decodeSPQRIntegrated } from './dist/spqrDecoder.js';
import sharp from 'sharp';
import { writeFile } from 'fs/promises';

const testCases = ['Hello', 'Hello World!', 'SPQR Test 123'];

console.log('🧪 Testing SPQR Round-Trip\n');

let allPassed = true;

for (const testText of testCases) {
	console.log(`Testing: "${testText}"`);
	
	const result = await generateColourQr(testText, {
		layers: 2,
		colours: ['#ffffff', '#ff0000', '#00ff00', '#000000'],
		modulePx: 6,
		marginModules: 4
	});
	
	const png = await sharp(Buffer.from(result.svg)).png().toBuffer();
	const tempFile = `/tmp/test_${Date.now()}.png`;
	await writeFile(tempFile, png);
	
	const decoded = await decodeSPQRIntegrated(tempFile);
	
	if (decoded.combined === testText) {
		console.log(`  ✅ PASS: "${decoded.combined}"`);
	} else {
		console.log(`  ❌ FAIL: Expected "${testText}", got "${decoded.combined}"`);
		allPassed = false;
	}
}

console.log(allPassed ? '\n✅ All tests passed!' : '\n❌ Some tests failed!');
process.exit(allPassed ? 0 : 1);

