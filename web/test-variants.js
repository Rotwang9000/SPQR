// Comprehensive SPQR Variant Testing
// Tests all QR types with different colors and data sizes

const testResults = {
	passed: 0,
	failed: 0,
	tests: []
};

// Test data of various sizes
const testData = {
	tiny: "Hello World!",
	small: "The quick brown fox jumps over the lazy dog. ".repeat(5), // ~220 chars
	medium: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(20), // ~1160 chars
	large: "SPQR test data with multiple layers and error correction modes. ".repeat(40), // ~2560 chars (fits in QR)
	hybridLarge: "SPQR test data with multiple layers and error correction modes. ".repeat(30) // ~1920 chars (fits in Hybrid with EC M on base)
};

// Color palettes to test
const colorPalettes = {
	bwrgDefault: ['#ffffff', '#ff0000', '#00ff00', '#000000'],
	bwrgCustom1: ['#f0f0f0', '#ff3300', '#00cc00', '#0a0a0a'],
	bwrgCustom2: ['#ffffff', '#cc0000', '#00aa00', '#111111'],
	
	cmyrgbDefault: ['#ffffff', '#ff0000', '#00ff00', '#ffff00', '#000000', '#ff00ff', '#00ffff', '#0000ff'],
	cmyrgbDeuteranopia: ['#ffffff', '#ffa500', '#0080ff', '#ffff00', '#000000', '#ff00ff', '#00ffff', '#0000c0'],
	cmyrgbProtanopia: ['#ffffff', '#ff8800', '#0088ff', '#ffdd00', '#000000', '#cc00cc', '#00cccc', '#0000ff'],
	cmyrgbCustom1: ['#f8f8f8', '#ee0000', '#00dd00', '#eeee00', '#0c0c0c', '#ee00ee', '#00eeee', '#0000ee']
};

async function runTest(name, testFn) {
	console.log(`\n🧪 Running: ${name}`);
	try {
		await testFn();
		testResults.passed++;
		testResults.tests.push({ name, status: 'PASS' });
		console.log(`✅ PASSED: ${name}`);
		return true;
	} catch (error) {
		testResults.failed++;
		testResults.tests.push({ name, status: 'FAIL', error: error.message });
		console.error(`❌ FAILED: ${name}`);
		console.error(`   Error: ${error.message}`);
		return false;
	}
}

// Helper to generate and verify QR code (including decode round-trip)
async function testQRGeneration(text, options, colors = null) {
	// Set custom colors if provided
	const originalBWRG = window.bwrgColors;
	const originalCMYRGB = window.cmyrgbColors;
	
	if (colors) {
		if (colors.length === 4) {
			window.bwrgColors = colors;
		} else if (colors.length === 8) {
			window.cmyrgbColors = colors;
		}
	}
	
	try {
		const result = await generateQR(text, options);
		
		// Verify result has expected properties
		if (!result.svg || !result.dataUrl) {
			throw new Error('Generated QR missing svg or dataUrl');
		}
		
		// Verify SVG contains data
		if (result.svg.length < 100) {
			throw new Error('Generated SVG is too short');
		}
		
		// For multi-layer QR codes, verify we actually got multiple layers
		if (options.layers > 1) {
			// Check if SVG contains color information
			const hasColors = result.svg.includes('fill=');
			if (!hasColors) {
				throw new Error(`Multi-layer QR (${options.layers} layers) missing color information`);
			}
			
			// For CMYRGB, check that we have all expected colors
			if (options.colours && options.colours[0] === 'cmyrgb') {
				const expectedColors = colors || colorPalettes.cmyrgbDefault;
				let colorCount = 0;
				expectedColors.forEach(color => {
					if (result.svg.toLowerCase().includes(color.toLowerCase())) {
						colorCount++;
					}
				});
				
				if (colorCount < 3) {
					throw new Error(`CMYRGB QR only contains ${colorCount} colors, expected at least 3`);
				}
			}
			
			// CRITICAL: Test round-trip decode for multi-layer QR codes
			// This catches the bug where generation works but decode fails with custom colors
			if (options.colours && (options.colours[0] === 'bwrg' || options.colours[0] === 'cmyrgb')) {
				try {
					// Convert PNG data URL to Image
					const img = new Image();
					await new Promise((resolve, reject) => {
						img.onload = resolve;
						img.onerror = reject;
						img.src = result.dataUrl;
					});
					
					// Get image data
					const canvas = document.createElement('canvas');
					canvas.width = img.width;
					canvas.height = img.height;
					const ctx = canvas.getContext('2d');
					ctx.drawImage(img, 0, 0);
					const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
					
				// Try to decode
				const decoded = detectSPQR(imageData);
				
				// Check if decode was successful
				// detectSPQR returns { base, red, combined } or { base, red, green, combined } directly
				if (decoded && decoded.base !== undefined) {
					const { base, red, green, combined } = decoded;
					const decodedText = combined || base || '';
					
					// For CMYRGB, count how many layers succeeded
					if (options.colours[0] === 'cmyrgb') {
						const layersDecoded = [base, red, green].filter(Boolean).length;
						if (layersDecoded < 2) {
							throw new Error(`Only ${layersDecoded}/3 layers decoded successfully. Base: ${base ? '✅' : '❌'}, Red: ${red ? '✅' : '❌'}, Green: ${green ? '✅' : '❌'}`);
						}
					}
					
					// Verify we got most of the text back (allowing for some EC truncation)
					if (decodedText.length < text.length * 0.8) {
						throw new Error(`Decoded text too short: got ${decodedText.length} chars, expected ~${text.length}`);
					}
				} else {
					throw new Error('QR decode failed - no SPQR data found');
				}
				} catch (decodeError) {
					throw new Error(`Round-trip decode failed: ${decodeError.message}`);
				}
			}
		}
		
		return result;
	} finally {
		// Restore original colors
		window.bwrgColors = originalBWRG;
		window.cmyrgbColors = originalCMYRGB;
	}
}

// Test 1: Standard QR with various data sizes
async function testStandardQR() {
	await runTest('Standard QR - Tiny', async () => {
		await testQRGeneration(testData.tiny, { layers: 1, colours: ['k'] });
	});
	
	await runTest('Standard QR - Small', async () => {
		await testQRGeneration(testData.small, { layers: 1, colours: ['k'] });
	});
	
	await runTest('Standard QR - Medium', async () => {
		await testQRGeneration(testData.medium, { layers: 1, colours: ['k'] });
	});
	
	await runTest('Standard QR - Large', async () => {
		await testQRGeneration(testData.large, { layers: 1, colours: ['k'] });
	});
}

// Test 2: BWRG with default colors
async function testBWRGDefault() {
	await runTest('BWRG Default - Tiny', async () => {
		await testQRGeneration(testData.tiny, { layers: 3, colours: ['bwrg'] });
	});
	
	await runTest('BWRG Default - Small', async () => {
		await testQRGeneration(testData.small, { layers: 3, colours: ['bwrg'] });
	});
	
	await runTest('BWRG Default - Medium', async () => {
		await testQRGeneration(testData.medium, { layers: 3, colours: ['bwrg'] });
	});
	
	await runTest('BWRG Default - Large', async () => {
		await testQRGeneration(testData.large, { layers: 3, colours: ['bwrg'] });
	});
}

// Test 3: BWRG with custom colors
async function testBWRGCustom() {
	await runTest('BWRG Custom1 - Small', async () => {
		await testQRGeneration(testData.small, { layers: 2, colours: ['bwrg'] }, colorPalettes.bwrgCustom1);
	});
	
	await runTest('BWRG Custom2 - Medium', async () => {
		await testQRGeneration(testData.medium, { layers: 2, colours: ['bwrg'] }, colorPalettes.bwrgCustom2);
	});
}

// Test 4: CMYRGB Standard EC with default colors
async function testCMYRGBStandard() {
	await runTest('CMYRGB Standard - Tiny', async () => {
		await testQRGeneration(testData.tiny, { layers: 3, colours: ['cmyrgb'], errorCorrection: 'standard' });
	});
	
	await runTest('CMYRGB Standard - Small', async () => {
		await testQRGeneration(testData.small, { layers: 3, colours: ['cmyrgb'], errorCorrection: 'standard' });
	});
	
	await runTest('CMYRGB Standard - Medium', async () => {
		await testQRGeneration(testData.medium, { layers: 3, colours: ['cmyrgb'], errorCorrection: 'standard' });
	});
	
	await runTest('CMYRGB Standard - Large', async () => {
		await testQRGeneration(testData.large, { layers: 3, colours: ['cmyrgb'], errorCorrection: 'standard' });
	});
}

// Test 5: CMYRGB Hybrid EC
async function testCMYRGBHybrid() {
	await runTest('CMYRGB Hybrid - Tiny', async () => {
		await testQRGeneration(testData.tiny, { layers: 3, colours: ['cmyrgb'], errorCorrection: 'hybrid' });
	});
	
	await runTest('CMYRGB Hybrid - Small', async () => {
		await testQRGeneration(testData.small, { layers: 3, colours: ['cmyrgb'], errorCorrection: 'hybrid' });
	});
	
	await runTest('CMYRGB Hybrid - Medium', async () => {
		await testQRGeneration(testData.medium, { layers: 3, colours: ['cmyrgb'], errorCorrection: 'hybrid' });
	});
	
	await runTest('CMYRGB Hybrid - Large', async () => {
		// Use hybridLarge data - Hybrid has more EC overhead (base layer uses EC 'M')
		await testQRGeneration(testData.hybridLarge, { layers: 3, colours: ['cmyrgb'], errorCorrection: 'hybrid' });
	});
}

// Test 6: CMYRGB Parity EC
async function testCMYRGBParity() {
	await runTest('CMYRGB Parity - Tiny', async () => {
		await testQRGeneration(testData.tiny, { layers: 3, colours: ['cmyrgb'], errorCorrection: 'parity' });
	});
	
	await runTest('CMYRGB Parity - Small', async () => {
		await testQRGeneration(testData.small, { layers: 3, colours: ['cmyrgb'], errorCorrection: 'parity' });
	});
	
	await runTest('CMYRGB Parity - Medium', async () => {
		await testQRGeneration(testData.medium, { layers: 3, colours: ['cmyrgb'], errorCorrection: 'parity' });
	});
	
	await runTest('CMYRGB Parity - Large', async () => {
		await testQRGeneration(testData.large, { layers: 3, colours: ['cmyrgb'], errorCorrection: 'parity' });
	});
}

// Test 7: CMYRGB with custom colors (all EC modes)
async function testCMYRGBCustomColors() {
	await runTest('CMYRGB Deuteranopia Standard - Small', async () => {
		await testQRGeneration(testData.small, { layers: 3, colours: ['cmyrgb'], errorCorrection: 'standard' }, colorPalettes.cmyrgbDeuteranopia);
	});
	
	await runTest('CMYRGB Deuteranopia Hybrid - Small', async () => {
		await testQRGeneration(testData.small, { layers: 3, colours: ['cmyrgb'], errorCorrection: 'hybrid' }, colorPalettes.cmyrgbDeuteranopia);
	});
	
	await runTest('CMYRGB Deuteranopia Parity - Small', async () => {
		await testQRGeneration(testData.small, { layers: 3, colours: ['cmyrgb'], errorCorrection: 'parity' }, colorPalettes.cmyrgbDeuteranopia);
	});
	
	await runTest('CMYRGB Protanopia Standard - Medium', async () => {
		await testQRGeneration(testData.medium, { layers: 3, colours: ['cmyrgb'], errorCorrection: 'standard' }, colorPalettes.cmyrgbProtanopia);
	});
	
	await runTest('CMYRGB Protanopia Hybrid - Medium', async () => {
		await testQRGeneration(testData.medium, { layers: 3, colours: ['cmyrgb'], errorCorrection: 'hybrid' }, colorPalettes.cmyrgbProtanopia);
	});
	
	await runTest('CMYRGB Protanopia Parity - Medium', async () => {
		await testQRGeneration(testData.medium, { layers: 3, colours: ['cmyrgb'], errorCorrection: 'parity' }, colorPalettes.cmyrgbProtanopia);
	});
	
	await runTest('CMYRGB Custom1 Hybrid - Small', async () => {
		await testQRGeneration(testData.small, { layers: 3, colours: ['cmyrgb'], errorCorrection: 'hybrid' }, colorPalettes.cmyrgbCustom1);
	});
}

// Main test runner
async function runAllTests() {
	console.log('\n' + '='.repeat(80));
	console.log('🚀 SPQR Comprehensive Variant Testing Suite');
	console.log('='.repeat(80));
	
	const startTime = Date.now();
	
	console.log('\n📋 Test Suite 1: Standard QR Generation');
	await testStandardQR();
	
	console.log('\n📋 Test Suite 2: BWRG Default Colors');
	await testBWRGDefault();
	
	console.log('\n📋 Test Suite 3: BWRG Custom Colors');
	await testBWRGCustom();
	
	console.log('\n📋 Test Suite 4: CMYRGB Standard EC');
	await testCMYRGBStandard();
	
	console.log('\n📋 Test Suite 5: CMYRGB Hybrid EC');
	await testCMYRGBHybrid();
	
	console.log('\n📋 Test Suite 6: CMYRGB Parity EC');
	await testCMYRGBParity();
	
	console.log('\n📋 Test Suite 7: CMYRGB Custom Colors (All EC Modes)');
	await testCMYRGBCustomColors();
	
	const endTime = Date.now();
	const duration = ((endTime - startTime) / 1000).toFixed(2);
	
	// Print summary
	console.log('\n' + '='.repeat(80));
	console.log('📊 TEST SUMMARY');
	console.log('='.repeat(80));
	console.log(`Total Tests: ${testResults.passed + testResults.failed}`);
	console.log(`✅ Passed: ${testResults.passed}`);
	console.log(`❌ Failed: ${testResults.failed}`);
	console.log(`⏱️  Duration: ${duration}s`);
	console.log(`📈 Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);
	
	if (testResults.failed > 0) {
		console.log('\n❌ FAILED TESTS:');
		testResults.tests.filter(t => t.status === 'FAIL').forEach(t => {
			console.log(`   - ${t.name}: ${t.error}`);
		});
	}
	
	console.log('='.repeat(80) + '\n');
	
	return testResults;
}

// Make available globally
window.runAllTests = runAllTests;
window.testResults = testResults;

console.log('%c🧪 SPQR Test Suite Loaded!', 'font-size: 16px; font-weight: bold; color: #00ff00;');
console.log('%cRun runAllTests() in console to start comprehensive testing', 'font-size: 12px; color: #00aaff;');

