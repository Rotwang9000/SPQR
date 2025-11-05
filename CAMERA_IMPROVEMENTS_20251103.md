# Camera Overlay & Screen Scanning Improvements (2025-11-03d)

## Summary
Enhanced camera overlay readability, adjusted focus thresholds for screen scanning, and improved colour QR detection reliability.

## Changes Made

### 1. Readable Camera Overlay Text ✅
**Problem**: Layer badges and block counts were hard to read on dark camera overlay.

**Solution**:
- Upgraded overlay background opacity: `rgba(0,0,0,0.85)` → `rgba(0,0,0,0.9)`
- Added `text-shadow: 0 1px 2px rgba(0,0,0,0.8)` for better contrast
- Increased font size: `13px` → `14px`, added `font-weight: 500`
- Improved line height: `1.4` for better spacing

**Layer Badges** (inline styles):
- Locked layers: Bright green (`#0f0`) with green background (`rgba(0,200,0,0.25)`)
- Missing layers: Salmon (`#f88`) with red background (`rgba(200,0,0,0.15)`)
- Increased padding, font-weight: 600, better border visibility

**Block Counts**: 
- Styled with `color: #aaddff` (light cyan blue)
- Font weight: 600, size: 13px
- Clearly labelled as "Blocks:" instead of "Chunks locked ·"

**Files**: 
- `docs/index.html` line 22
- `docs/app.js` lines 5088-5117

---

### 2. Screen Scanning Focus Thresholds ✅
**Problem**: "Very soft focus" warnings appeared even when QR codes from screens were sharp, because screens have inherently lower contrast/sharpness than printed codes.

**Solution**: Lowered sharpness thresholds to accommodate screen characteristics:

| Threshold | Old Value | New Value | Message |
|-----------|-----------|-----------|---------|
| Very soft focus | < 800 | < 400 | "Very soft focus — pull back slightly and try tap-to-focus." |
| Slight blur | < 1500 | < 800 | "Slight blur — steady your hand or adjust distance." |
| Low contrast | < 60 | < 40 | "Low contrast — increase screen brightness or try better lighting." |

**Rationale**:
- Screens emit light (not reflect), giving softer edges
- Pixel grid creates dottiness that reduces sharpness metrics
- White on screens is often RGB(240,240,240) not RGB(255,255,255)

**Files**: `docs/app.js` lines 5193-5200

---

### 3. Grid Detection Already Optimised ✅
The `locateQRStructure` function already uses robust black-only detection:
- Threshold: 80 (only pure black: R<80, G<80, B<80)
- This correctly ignores colored finder centers in SPQR codes
- Relaxed finder pattern tolerances for imperfect images
- Multiple refinement passes with adaptive separation thresholds

**Current Status**: Grid detection is working well for both monochrome and SPQR codes. The "orange square" (grid detection box) moving is expected behaviour as the algorithm refines its position based on finder pattern quality.

---

### 4. Contrast Enhancement Already Aggressive ✅
The `enhanceImageContrast` function uses:
- **Histogram equalisation** per RGB channel (CDF normalisation)
- **Gamma correction** (γ=0.8) to boost darker colors
- Applied automatically during ROI extraction
- Additional anti-banding filter for screens with regular pixel grids

**Why it works for monochrome but struggles with colour**:
- Monochrome: Simple black/white threshold after enhancement
- SPQR: Requires precise colour separation across 8 hues
- Screen pixelation affects colour purity more than luminance
- Subpixel rendering (ClearType) creates colour fringing

---

## Known Remaining Challenges

### Colour QR Decoding from Screens
**Issue**: SPQR colour codes are harder to decode from screens than monochrome.

**Root Causes**:
1. **Screen subpixels**: Each "pixel" is actually RGB stripes, causing colour bleeding
2. **Camera sensor**: Bayer filter pattern introduces colour aliasing
3. **Compression**: JPEG/screen rendering adds colour noise
4. **Lighting**: Screen backlight spectrum differs from printed reflectance

**Current Mitigation**:
- `sampleCMYRGBFinderPalette`: Builds per-frame colour calibration from finder keys
- `createCameraCMYClassifier`: Adaptive thresholds based on observed colour separation
- Multi-frame aggregation: Combines data from multiple captures

**Possible Future Improvements**:
1. **Sub-pixel alignment**: Detect screen pixel grid and align sampling
2. **Colour space conversion**: Use HSV/Lab instead of RGB for better separation
3. **Temporal filtering**: Average multiple frames before colour classification
4. **RAW camera access**: Bypass JPEG compression (browser API limitations)
5. **ML colour classifier**: Train on screen-captured SPQR samples

---

## Visual Improvements

### Before
```
scan-progress (hard to read)
├─ Layers locked: 2/3      (generic title)
├─ ⬛ Base ✓ · 🟥 Red ✓     (dim colours)
└─ Chunks locked · Base: 3/5 · Red: 2/5  (confusing label)
```

### After
```
scan-progress (crisp white text on dark overlay)
├─ Layers: 2/3 ⭐          (clear title, larger)
├─ ⬛ Base ✓ 🟥 Red ✓       (bright green/red badges)
└─ Blocks: Base: 3/5 · Red: 2/5  (cyan, readable)
```

---

## Testing Results

✅ **Monochrome QR from screen**: Excellent, decodes reliably
✅ **Large monochrome QR**: Now works with ROI extraction
✅ **Focus warnings**: No longer trigger on sharp screen images
✅ **Overlay text**: Clearly readable over video
⚠️  **SPQR from screen**: Improved but still challenging (grid detection OK, colour layer decoding needs work)

---

## Files Modified

- `docs/index.html`: Enhanced overlay styling (line 22)
- `docs/app.js`: 
  - Focus thresholds adjusted (lines 5193-5200)
  - Layer badge/block styling improved (lines 5088-5117)
- Cache version: `20251103d`

---

## Recommendations for SPQR Screen Scanning

**For users**:
1. Maximise screen brightness
2. Use full-screen display mode
3. Hold camera steady, pull back slightly (capture more context)
4. Use tap-to-focus on the QR code centre
5. Try multiple angles/distances for multi-frame aggregation

**For developers**:
Next iteration should focus on colour classification robustness:
- Experiment with HSV/Lab colour space
- Implement temporal multi-frame colour averaging
- Consider detecting and compensating for screen pixel grid
- Add debug visualisation: show classified colour matrix overlay

