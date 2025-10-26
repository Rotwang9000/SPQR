# SPQR Decoder - Current Status

## Date: 2025-10-26

## Where We Are

We are working on fixing the decoder for SPQR codes, specifically 3-layer CMYRGB codes. The system can generate these codes correctly, but decoding them (especially from file uploads) is failing.

### Recent Progress

1. **Finder Detection Rewrite**: The `locateQRStructure` function has been rewritten multiple times to correctly detect finder patterns in colored QR codes.
   
2. **Latest Issue**: The finder detection is now correctly identifying that it cannot find enough finder patterns (only 2 out of 6 needed) when the threshold for "black" pixels is set to 80. This is actually GOOD because it means the function is falling back to grid estimation, which correctly calculates `21×21, 6px/module`.

3. **Current Problem**: After the grid is estimated, the decoding process appears to stop or fail silently. The console logs end abruptly after "Estimated grid: 21×21, 6px/module".

## What We Are Trying To Do

**Primary Goal**: Decode clean, generated CMYRGB SPQR codes from file uploads.

**Approach**:
1. Use grid estimation (since finder detection is unreliable for colored codes)
2. Sample the CMYRGB color palette from the finder patterns
3. Extract 3 binary layers (base, green/parity, red) by classifying each module's color
4. Decode each layer independently using jsQR or ZXing
5. Combine the results to get the final decoded text

**Fallback**: If standard decoding fails, use raw bit extraction and parity recovery to decode short messages.

## What Needs To Be Done

### Immediate Next Steps

1. **Debug Why Decoding Stops After Grid Estimation**
   - Add more console logging to trace the execution flow after grid estimation
   - Check if `detectSPQR` is returning early or throwing an error
   - Verify that the CMYRGB detection logic is being triggered

2. **Fix Color Sampling**
   - The `sampleCMYRGBFinderPalette` function was recently fixed to sample from the original image data (not the resampled ROI)
   - The coordinate calculation was fixed to remove the `+0.5` offset
   - Need to verify that the sampled colors are correct

3. **Fix Color Classification**
   - The `classifyPixel` function in `decodeCMYRGBLayers` was updated to use direct Euclidean distance
   - The color-to-bit mapping was corrected to use CMY encoding (Cyan=bit2, Magenta=bit1, Yellow=bit0)
   - Need to verify that the classification is working correctly with the calibrated palette

4. **Test Layer Extraction**
   - Verify that the 3 binary layers are being extracted correctly
   - Check that the layers are being passed to jsQR/ZXing for decoding
   - If jsQR/ZXing fail, ensure the raw bit extraction fallback is working

### Medium-Term Goals

1. **Improve Finder Detection for Colored Codes**
   - Current approach (only considering black pixels with threshold=80) is too strict
   - Consider a hybrid approach: detect the black/white rings while ignoring the colored centers
   - Or: use a different algorithm specifically for colored codes (e.g., template matching)

2. **Implement Robust Parity Recovery**
   - The raw bit extraction is working (extracting 208 bits from each layer)
   - The alphanumeric decoder is failing because the mode bits are wrong (0b0000 or 0b1111)
   - Need to implement bit-level parity recovery to correct errors before decoding

3. **Test with Degraded Images**
   - Once clean code decoding works, test with the provided screenshot images (1576.png, 1577.png, screenshot2)
   - Implement aggressive image preprocessing (contrast enhancement, noise reduction, etc.)
   - Leverage the parity layer to recover from errors

## Key Files and Functions

### `/home/rotwang/SPQR/docs/app.js`

**Main Functions**:
- `locateQRStructure(data, width, height)` (line 517): Detects finder patterns in the image
- `detectSPQR(imageData, width, height)` (line 1699): Main SPQR detection function, estimates grid if finder detection fails
- `decodeCMYRGBLayers(data, width, height, grid, useCalibrated)` (line 3235): Decodes 3-layer CMYRGB codes
- `sampleCMYRGBFinderPalette(data, width, height, modulePx, modules, originX, originY)` (line 4393): Samples colors from finder patterns for palette calibration
- `extractRawBits(binaryMatrix, qrModules)` (line 3656): Extracts raw bits from a binary matrix for parity recovery
- `decodeAlphanumeric(bits)` (line 3703): Decodes alphanumeric data from raw bits

**Recent Changes**:
- `isQRPixel` function (line 523): Now only considers truly BLACK pixels (R,G,B < 80) as "dark" for finder detection
- `sampleCMYRGBFinderPalette`: Fixed coordinate calculation (removed +0.5 offset) and changed to sample from original image data
- `decodeCMYRGBLayers`: Fixed color-to-bit mapping for CMY encoding, added heuristic classifier for clean codes
- Grid hint management: Clear stale grid hints and camera calibrations at the start of `handleFileUpload`

### `/home/rotwang/SPQR/docs/index.html`

**Recent Changes**:
- Version parameter updated to `v=20251026e` to force browser cache refresh

## Known Issues

1. **Finder Detection Fails for Colored Codes**: The current algorithm only finds 2 out of 6 required finder candidates because the colored keys in the finder centers are confusing the pattern detection.

2. **Decoding Stops After Grid Estimation**: The code appears to stop or fail silently after estimating the grid. Need to add more logging to trace the issue.

3. **Mode Bits Are Wrong in Raw Bit Extraction**: When extracting raw bits, the mode bits are coming out as 0b0000 or 0b1111, which are invalid. This suggests the bit extraction or layer classification is incorrect.

4. **Stale Grid Hints**: Grid hints and camera calibrations from previous scans were interfering with file uploads. This has been partially fixed by clearing hints at the start of `handleFileUpload`, but may need more work.

## Success Criteria

1. **Clean Code Decoding**: Upload a freshly generated CMYRGB PNG and successfully decode it to get the original text ("SPQR").

2. **Degraded Image Decoding**: Upload a screenshot or photo of a CMYRGB code and successfully decode it, leveraging the parity layer if needed.

3. **Parity Recovery**: Demonstrate that the parity layer can recover data when one of the data layers is corrupted.

## Next Immediate Action

Add comprehensive console logging to `detectSPQR` after the grid estimation to trace where the execution is stopping or failing. Then continue fixing the issues until clean code decoding works.
