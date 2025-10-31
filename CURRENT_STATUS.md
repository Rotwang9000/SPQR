# SPQR Decoder - Current Status

## Date: 2025-10-28 (CRITICAL FIXES)

## Where We Are

We are working on fixing the decoder for SPQR codes, specifically 3-layer CMYRGB codes. The system can generate these codes correctly, but decoding them (especially from file uploads) is failing.

### Recent Progress

1. **Finder Detection Rewrite**: The `locateQRStructure` function has been rewritten multiple times to correctly detect finder patterns in colored QR codes.
   
2. **Latest Issue**: The finder detection is now correctly identifying that it cannot find enough finder patterns (only 2 out of 6 needed) when the threshold for "black" pixels is set to 80. This is actually GOOD because it means the function is falling back to grid estimation, which correctly calculates `21×21, 6px/module`.

3. **Error Handling Enhancement (2025-10-28)**: Added comprehensive try-catch error handling to `detectSPQR` function to catch and log any exceptions that might be stopping execution. Added explicit logging at every major step to trace execution flow.

4. **Current Problem**: After the grid is estimated, the decoding process appears to stop or fail silently. The console logs end abruptly after "Estimated grid: 21×21, 6px/module". The new error handling should help identify if this is due to an exception being thrown.

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

**🔥 SECOND CRITICAL BUG FIXED (2025-10-28d)**: 

The third layer (green) wasn't being used in standard and hybrid modes! The code was splitting the payload into 3 parts but only using 2:
```javascript
greenText = (isEightColour && parts[2]) ? parts[2] : null;
```

In standard/hybrid modes, `greenQr` was always `null`, meaning the middle bit was always 0. This resulted in only 4 colors being used instead of 8, and the third of the data was lost!

**Fixed by**:
- Properly assigning `greenText` from `parts[2]` in standard/hybrid modes
- Creating `greenQr` from `greenText` when not in parity mode
- Now all three layers are properly encoded with actual data

This explains why the generated codes only showed yellow, green, cyan (limited color palette) - only 2 of the 3 bits were varying!

---

**🔥 CRITICAL ENCODER BUG FIXED (2025-10-28c)**: 

The encoder had an incorrect colour mapping array (line 196):
```javascript
const idxMap = [0,1,2,3,4,5,6,7];  // WRONG!
```

This was causing the encoder to produce QR codes with incorrect colours. The CMY bit pattern wasn't mapping to the correct palette indices [W,R,G,Y,K,M,C,B].

**Fixed to**:
```javascript
const idxMap = [0, 3, 5, 1, 6, 2, 7, 4];  // CORRECT
```

This maps:
- code 0 (000) = W → palette[0] = White
- code 1 (001) = Y → palette[3] = Yellow
- code 2 (010) = M → palette[5] = Magenta
- code 3 (011) = R → palette[1] = Red
- code 4 (100) = C → palette[6] = Cyan
- code 5 (101) = G → palette[2] = Green
- code 6 (110) = B → palette[7] = Blue
- code 7 (111) = K → palette[4] = Black

**⚠️ IMPORTANT**: Any CMYRGB codes generated before these fixes will NOT work correctly. They must be regenerated with the fixed encoder.

**Testing Required**:
1. Hard refresh browser (Ctrl+Shift+R)
2. **Generate a NEW CMYRGB QR code** (type "SPQR" and generate)
3. You should now see ALL 8 colors being used (W, R, G, Y, K, M, C, B)
4. Download the PNG
5. Upload it back and verify it decodes correctly
6. The decoded text should match exactly

**Version**: Updated to `v=20251028d`
