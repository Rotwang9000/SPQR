# SPQR Automated Testing Guide

## Running the Comprehensive Test Suite

The automated test suite verifies all QR variants work correctly with different colors, EC modes, and data sizes.

### How to Run Tests

1. Open the SPQR web interface: `http://localhost:3017`

2. Open your browser's Developer Console (F12)

3. Run the comprehensive test suite:
   ```javascript
   runAllTests()
   ```

4. Wait for all tests to complete (30-60 seconds)

5. Review the test summary printed to the console

### What Gets Tested

The test suite includes **~40 tests** covering:

#### 1. Standard QR Generation (4 tests)
- Tiny, Small, Medium, and Large data sizes
- Verifies basic QR generation works

#### 2. BWRG (4-color) with Default Colors (4 tests)
- All data sizes with default white/black/red/green colors
- Verifies 2-layer SPQR generation

#### 3. BWRG with Custom Colors (2 tests)
- Custom color palettes to ensure color customization works
- Tests with Small and Medium data

#### 4. CMYRGB Standard EC Mode (4 tests)
- All 8-color SPQR codes with EC 'L' on all layers
- All data sizes

#### 5. CMYRGB Hybrid EC Mode (4 tests)
- Base layer EC 'M', others EC 'L'
- All data sizes
- **This tests the bug you reported**

#### 6. CMYRGB Parity EC Mode (4 tests)
- 2 data layers + 1 parity layer
- All data sizes

#### 7. CMYRGB with Custom Colors - All EC Modes (7 tests)
- Deuteranopia-safe palette (Standard, Hybrid, Parity)
- Protanopia-safe palette (Standard, Hybrid, Parity)
- Custom palette (Hybrid)
- **This specifically tests custom colors with Hybrid mode**

### Test Data Sizes

- **Tiny**: 12 chars ("Hello World!")
- **Small**: ~220 chars
- **Medium**: ~1,160 chars
- **Large**: ~3,200 chars

### Understanding Test Output

#### Success:
```
✅ PASSED: CMYRGB Hybrid - Small
```

#### Failure:
```
❌ FAILED: CMYRGB Hybrid - Medium
   Error: Multi-layer QR (3 layers) missing color information
```

### Test Summary

After all tests complete, you'll see:

```
📊 TEST SUMMARY
================================================================================
Total Tests: 39
✅ Passed: 38
❌ Failed: 1
⏱️  Duration: 45.3s
📈 Success Rate: 97.4%
```

### Debugging Failed Tests

If tests fail, the error messages will indicate:

1. **"Generated QR missing svg or dataUrl"** - Generation completely failed
2. **"Generated SVG is too short"** - SVG was created but is invalid
3. **"Multi-layer QR (X layers) missing color information"** - Colors weren't applied correctly
4. **"CMYRGB QR only contains X colors, expected at least 3"** - Not enough color layers generated

### Manual Verification

For any failed test, you can manually verify:

1. Enter the test data in the text area
2. Set custom colors (if the test used custom colors)
3. Select the appropriate EC mode
4. Download the generated QR code
5. Visually inspect it - you should see multiple colors

For example, to manually test "CMYRGB Hybrid with Deuteranopia colors":
1. Enter some test text
2. Click "🎨 Customize Colors" on the CMYRGB section
3. Click "Deuteranopia Safe"
4. Select "Hybrid" EC mode
5. Download and inspect the QR code - it should have orange, blue, yellow, magenta, cyan colors

### Performance Notes

- The test suite generates ~40 QR codes
- Each generation includes both SVG and PNG conversion
- Expected runtime: 30-60 seconds depending on your machine
- Tests run sequentially to avoid race conditions

### Adding Custom Tests

You can run individual tests or custom scenarios:

```javascript
// Test a specific variant with custom data
await testQRGeneration("Your custom text here", {
    layers: 3,
    colours: ['cmyrgb'],
    errorCorrection: 'hybrid'
}, ['#ffffff', '#ffa500', '#0080ff', '#ffff00', '#000000', '#ff00ff', '#00ffff', '#0000c0']);
```

### Troubleshooting

**Tests don't start:**
- Ensure the page is fully loaded
- Check console for errors
- Refresh the page and try again

**All tests fail:**
- Check that `generateQR` function is available
- Ensure `qrcode-generator` library loaded successfully
- Look for JavaScript errors in the console

**Specific tests fail consistently:**
- This indicates a real bug - please report it with:
  - Test name
  - Error message
  - Data size being tested
  - Colors being used (default or custom)

### Expected Behavior

For the issue you reported ("hybrid only got one layer with custom colors"):

The test **"CMYRGB Deuteranopia Hybrid - Small"** specifically tests this scenario and should:
- ✅ Generate 3 layers
- ✅ Apply custom deuteranopia colors
- ✅ Use EC 'M' for base layer, 'L' for others
- ✅ Produce a valid multi-color QR code

If this test passes, the bug may be in the UI layer (color pickers, display) rather than the generation logic.

