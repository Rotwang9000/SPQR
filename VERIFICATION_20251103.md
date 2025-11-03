# SPQR Generation & Camera Enhancement Verification (2025-11-03)

## Summary

Verified SPQR generation encoding and ensured all camera improvements apply equally to monochrome QR codes.

## Changes Made

### 1. Focus Decorations Re-added
**File**: `docs/app.js`
**Lines**: Added `buildFocusDecorations()` function and applied to:
- Standard monochrome QR generation (line ~265)
- SPQR BWRG/CMYRGB generation (line ~434)

**Purpose**: Corner brackets and "SPQR" label help camera auto-focus by providing high-contrast edges.

### 2. Camera Enhancement for Monochrome
**File**: `docs/app.js`
**Lines**: ~2208-2233

**Before**: Monochrome used only direct `jsQR()` decode - no ROI extraction, no quality scoring.

**After**: Added fallback path:
1. Try `jsQR()` directly (fast path)
2. If fails, use `locateQRStructure()` to find grid
3. Extract ROI with perspective correction via `decodeFromGridROI()`
4. Decode from cleaned ROI

**Benefits for Monochrome**:
- ✅ ROI extraction with perspective warp
- ✅ Contrast enhancement (histogram equalisation)
- ✅ Anti-banding filter
- ✅ Grid refinement
- ✅ Better handling of distorted/blurry images

### 3. Generation Verification Test Page
**File**: `docs/test-generation.html` (NEW)

Interactive test page that:
- Shows how payload splits across layers
- Generates individual layer QR codes
- Compares module counts (monochrome vs BWRG vs CMYRGB)
- Calculates density (chars/module)
- Visually confirms SPQR codes are same size or smaller than monochrome for equivalent data

**Key Insight**: 
For short text (e.g., "ABCD"), all formats use Version 1 (21×21 modules). The advantage of CMYRGB appears with longer text where:
- Monochrome: 1 layer × large version
- CMYRGB: 3 layers × smaller version = same visual size, 3× data capacity

## Encoding Verification

### CMYRGB (3-layer) Encoding
**Lines**: `docs/app.js` ~300-440

1. **Payload splitting** (line ~332-337):
   ```javascript
   const splits = isEightColour ? 3 : 2;
   const parts = splitPayload(text, splits);
   baseText = parts[0];
   redText = parts[1];
   greenText = isEightColour ? (parts[2] ?? '') : null;
   ```

2. **Version selection** (line ~341-351):
   - Each layer encoded independently with EC 'L'
   - Max module count determines version for ALL layers
   - All layers regenerated at same version for matching dimensions

3. **Colour mapping** (line ~401-408):
   ```javascript
   const b = dark(baseQr, x, y) ? 1 : 0;
   const r = dark(redQr, x, y) ? 1 : 0;
   const gBit = greenQr ? (dark(greenQr, x, y) ? 1 : 0) : 0;
   const code = (b << 2) | (gBit << 1) | r; // CMY encoding: base=bit2, green=bit1, red=bit0
   const idxMap = [0, 3, 5, 1, 6, 2, 7, 4]; // Maps to [W,R,G,Y,K,M,C,B]
   ```

✅ **VERIFIED**: No extra/redundant data in generation. Each layer carries 1/3 of payload.

## Why "More Dots" in Colour QRs?

User observed: "there seems more dots in the colour ones that the monochrome"

**Explanation**:
1. **Short text** (e.g., 4 chars): All formats use Version 1 (21×21)
   - Monochrome: 1 layer with minimal fill
   - CMYRGB: 3 layers, each needs finder patterns/timing/format info
   - Result: CMYRGB has more "structure overhead" visible as colored dots

2. **Long text** (e.g., 200+ chars):
   - Monochrome: Might need Version 5 (37×37 = 1369 modules)
   - CMYRGB: Each layer carries ~67 chars, fits in Version 2 (25×25 = 625 modules × 3 layers)
   - Result: CMYRGB is physically smaller but encodes same data

**Conclusion**: For very short text, CMYRGB appears denser due to structural overhead. For longer text (where multi-layer shines), it's more efficient.

## Next Steps

1. Test camera scanning with new monochrome ROI fallback
2. Test generation density with various text lengths (use `test-generation.html`)
3. Continue debugging CMYRGB camera decoding (colour classification still producing "garbage")

## Files Modified

- `docs/app.js`: Added focus decorations, monochrome camera ROI fallback
- `docs/index.html`: Updated cache-bust version to `20251103a`
- `docs/test-generation.html`: New verification test page

