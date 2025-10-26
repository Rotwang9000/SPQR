# SPQR Decoder - Current Status & Action Plan

## Date: October 26, 2025

## Current State

### What Works
1. ✅ **Generator**: Successfully creates CMYRGB (8-color, 3-layer) QR codes with parity mode
   - Base layer: "SP" (2 bytes)
   - Red layer: "QR" (2 bytes)
   - Green layer: Parity data (37 bytes = XOR of base + red + CRC32)
   - Correctly encodes colors using CMY encoding (C=bit2, M=bit1, Y=bit0)

2. ✅ **Standard QR Decoding**: Works perfectly for monochrome QR codes using jsQR and ZXing

3. ✅ **BWRG (4-color) Decoding**: Works for 2-layer codes

4. ✅ **Image Preprocessing**: Aggressive histogram equalization and gamma correction for degraded images

5. ✅ **Grid Hint Management**: Properly clears stale grid hints between camera and file uploads

### What's Broken

#### CRITICAL ISSUE: Finder Detection for Colored QR Codes
The `locateQRStructure()` function is **incorrectly detecting finder patterns** for colored CMYRGB QR codes:

**Example from Testing:**
- **Actual Image**: 174×174 pixels, 21 modules, 6px/module, 4-module margin
- **Expected Origin**: (24, 24) = (4 modules × 6px, 4 modules × 6px)
- **Detected Origin**: (34, 101) ❌ COMPLETELY WRONG

**Root Cause:**
- The finder detection algorithm looks for 1:1:3:1:1 black/white patterns
- Colored QR codes have **colored finder keys** (2×2 grids of WRGYKMC B colors) inside the finder patterns
- These colored keys confuse the pattern detection, causing it to find wrong patterns or patterns in wrong locations

**Impact:**
- Wrong origin → Wrong ROI extraction → Wrong color sampling → Decoding fails
- Even with correct color classification logic, the system samples from wrong pixel locations

### Recent Fixes Applied

1. ✅ **Generator Green Layer**: Fixed to create proper parity layer instead of hardcoding `gBit = 0`
2. ✅ **Color-to-Bit Mapping**: Corrected CMY encoding (C=bit2, M=bit1, Y=bit0)
3. ✅ **Grid Hint Clearing**: Prevents stale camera calibrations from interfering with file uploads
4. ✅ **Sampling from Original Image**: Changed to sample CMYRGB palette from original image before ROI resampling
5. ✅ **Sampling Coordinate Calculation**: Removed incorrect +0.5 offset in center calculation

### Test Results

**Generated CMYRGB Code Upload (174×174 px):**
```
locateQRStructure: 174x174 image
   Finders: TL(55,122) TR(126,56) BL(111,106)  ← WRONG POSITIONS
   Spacing: 77px → 21 modules @ 6px, origin=(34,101)  ← WRONG ORIGIN
   
Expected:
   TL should be at ~(45, 45)
   Origin should be at (24, 24)
```

**Color Sampling Results:**
```
TL distinctiveness: 4/6 pairs > 30px distance (0, 275, 275, 275, 275, 0)
                                                ↑                         ↑
                                          W=R (identical)            G=Y (identical)
```
This proves the sampling is happening at wrong locations due to incorrect origin.

## What We're Trying to Do

**Primary Goal**: Enable robust decoding of CMYRGB (8-color, 3-layer) SPQR codes, especially for:
1. Clean generated codes (should work 100%)
2. Degraded camera images (should work with parity recovery)
3. Provided test images (1576.png, 1577.png, screenshot2)

**Approach**: Multi-layer decoding strategy:
1. Extract 3 binary layers from colored image (Base, Green, Red)
2. Decode each layer independently using jsQR/ZXing
3. Combine results: "SP" + "QR" = "SPQR"
4. If any layer fails, use parity recovery (Green layer = XOR of Base + Red)

## What Needs to Be Done

### Immediate Priority: Fix Finder Detection

**Option 1: Fix `locateQRStructure()` for Colored Codes** (Recommended)
- Modify the brightness-based classification to ignore colored pixels in finder centers
- The finder pattern itself (7×7 black/white rings) should still be detectable
- Only the inner 3×3 area has colored keys, outer rings are still black/white

**Implementation:**
```javascript
// In locateQRStructure(), modify isQRPixel to:
const isQRPixel = (x, y) => {
    const i = (y * width + x) * 4;
    const r = data[i], g = data[i+1], b = data[i+2];
    const brightness = Math.max(r, g, b);
    const minBright = Math.min(r, g, b);
    
    // White pixels: very bright and low chroma
    if (brightness > 230 && minBright > 200) return false;
    
    // Colored pixels (high chroma): treat as "not dark" for finder detection
    const chroma = brightness - minBright;
    if (chroma > 80) return false;  // Skip colored pixels
    
    // Everything else (black or low-chroma) counts as "dark"
    return true;
};
```

**Option 2: Simple Grid Calculation for Clean Generated Codes**
- For file uploads of clean generated codes, calculate grid directly from image dimensions
- Formula: `modulePx = (imageWidth - 2*marginPx) / qrModules`
- Requires knowing or detecting the QR version (21, 25, 29, etc.)

**Option 3: Hybrid Approach** (Best)
- Try Option 1 first (improved finder detection)
- If that fails, fall back to Option 2 (calculated grid for clean codes)
- For camera images, use more aggressive preprocessing before finder detection

### Secondary Priorities

1. **Test with Provided Images**: Once finder detection works, test with:
   - `test/1576.png`
   - `test/1577.png`
   - `test/Skärmbild 2025-10-23 133414.png`

2. **Parity Recovery**: Implement the "nuclear option" for degraded images:
   - When one layer fails to decode, use parity layer to reconstruct it
   - Formula: `Base = Green XOR Red` (or `Red = Green XOR Base`)

3. **Raw Bit Extraction**: Already implemented but not working due to wrong grid:
   - Extract raw bits following QR zigzag pattern
   - Decode alphanumeric mode manually
   - Use for very short messages when jsQR/ZXing fail

## Technical Details

### CMYRGB Color Encoding
```
Color   CMY Bits    RGB Value
W       000         (255,255,255)
C       100         (0,255,255)
M       010         (255,0,255)
Y       001         (255,255,0)
R       011         (255,0,0)
G       101         (0,255,0)
B       110         (0,0,255)
K       111         (0,0,0)
```

### Finder Key Layout
```
TL Finder (modules 2-5):        TR Finder (modules 16-19):
┌─────┬─────┐                   ┌─────┬─────┐
│  W  │  R  │                   │  K  │  M  │
├─────┼─────┤                   ├─────┼─────┤
│  G  │  Y  │                   │  C  │  B  │
└─────┴─────┘                   └─────┴─────┘
```

### File Locations
- **Main decoder**: `docs/app.js` (4403 lines)
  - `locateQRStructure()`: Lines 517-715 ← **NEEDS FIXING**
  - `decodeCMYRGBLayers()`: Lines 3231-3870
  - `sampleCMYRGBFinderPalette()`: Lines 4367-4399
- **HTML**: `docs/index.html`
- **Test images**: `test/*.png`

## Current Issue (Updated)

The chroma-based filtering is still not working correctly. Even with adjusted thresholds (chroma > 120 && brightness > 100), only 2 finder candidates are being found instead of 6.

**Problem**: The colored keys (CMYRGB) have varying brightness levels:
- Cyan (0,255,255): brightness=255, chroma=255
- Magenta (255,0,255): brightness=255, chroma=255
- Yellow (255,255,0): brightness=255, chroma=255
- White (255,255,255): brightness=255, chroma=0
- Black (0,0,0): brightness=0, chroma=0

The current filter `chroma > 120 && brightness > 100` should skip CMY colors but it's still not finding enough finders.

**New Approach**: Instead of chroma-based filtering, explicitly check if a pixel is one of the 8 CMYRGB colors and skip those for finder detection.

## Next Steps

1. **Implement explicit CMYRGB color detection**: Check if pixel matches any of the 8 colors (with tolerance)
2. **Test with generated code**: Verify origin is now correct (24, 24)
3. **Test color sampling**: Verify all 8 colors are distinct
4. **Test decoding**: Verify "SPQR" is decoded correctly
5. **Test with provided images**: Verify real-world images decode
6. **Implement parity recovery**: Handle degraded images with one corrupted layer

## Success Criteria

- [ ] Clean generated CMYRGB code uploads decode correctly
- [ ] Origin calculation is accurate (within 1-2 pixels)
- [ ] All 8 CMYRGB colors are sampled distinctly (distance > 30px)
- [ ] "SPQR" text is decoded from 3-layer code
- [ ] Provided test images decode successfully
- [ ] Parity recovery works for single-layer corruption

## Estimated Effort

- Fix finder detection: 1-2 hours
- Test and debug: 1-2 hours
- Parity recovery: 2-3 hours
- **Total**: 4-7 hours of focused work

