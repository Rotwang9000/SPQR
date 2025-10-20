# SPQR Decoder Fixes Summary

## Status: ✅ FIXED - Both Browser & Node.js Working

### Problem
4-colour SPQR decoding was failing in both browser and Node.js implementations because:
1. The generator draws finder patterns as BLACK (to ensure readability)
2. BLACK in BWRG means: base=dark, red=light
3. So the red layer was missing finder patterns
4. jsQR couldn't decode QR codes without proper finder patterns

### Root Cause
The generator skips finder rings during color composition (web/app.js:172) and draws them as BLACK afterwards (web/app.js:198). This is good for readability but means both QR layers don't get their finder patterns from the composite colors.

### Solution
**Enforce finder patterns on BOTH layers before decoding:**

```javascript
// After extracting base and red layer modules from colors,
// force-draw the standard 7×7 finder patterns at:
// - Top-left (0, 0)
// - Top-right (modules-7, 0)
// - Bottom-left (0, modules-7)
// Plus timing patterns on row/column 6
```

### Files Modified

#### 1. web/app.js (Browser)
- **Lines 1996-2035**: Added `enforceFinders()` function that draws finder patterns and timing patterns on both `baseMods` and `redMods` arrays before passing to jsQR
- **Lines 1919-1942**: Improved grid detection to test all common QR sizes and pick the best match by remainder

#### 2. src/spqrDecoder.ts (Node.js)
- **Lines 225-247**: Fixed BWRG color mapping to match browser implementation
- **Lines 251-255**: Disabled `majorityFilter` (was corrupting edge pixels)
- **Lines 254-255**: Kept `enforceFindersAndTiming` which adds patterns to both layers
- **Lines 268-308**: Replaced custom decoder with jsQR (matching browser)
- **Lines 111-137**: Improved grid detection algorithm

### Test Results

**Browser (http://localhost:3017):**
- ✅ "Hello" → "Hel" + "lo"
- ✅ "Hello World!" → "Hello " + "World!"
- ✅ "SPQR Test 123" → "SPQR Te" + "st 123"
- ✅ Long text (62 chars) → Perfect decode

**Node.js:**
- ✅ "Hello" → "Hel" + "lo"
- ✅ "Hello World!" → "Hello " + "World!"
- ✅ "SPQR Test 123" → "SPQR Te" + "st 123"

### Key Insights

1. **Generator design is intentional**: Drawing finders as BLACK ensures the composite SPQR is readable by standard QR readers (they see the base layer structure)

2. **Decoder must compensate**: Since finders aren't encoded in colors, the decoder must synthesize them for both layers

3. **jsQR is reliable**: The custom decoder had issues with byte stream parsing and mask detection. jsQR "just works"

4. **Grid detection matters**: Testing all common QR sizes (21, 25, 29, 33, 37, 41, 45, 49) and picking the best match by remainder is more reliable than trying to detect from image features

### Testing
```bash
# Browser test
# Navigate to http://localhost:3017
# Click "Test Decoder" button
# Or run in console: testSPQRRoundTrip()

# Node.js test (create test file as needed)
node -e "import('./dist/spqrDecoder.js').then(m => console.log('Decoder loaded'))"
```

### Notes
- Module size calculation uses whole image dimensions, not bounding box
- Margin is always 4 modules (QR standard)
- Finders are 7×7 modules each
- Timing patterns alternate dark/light on row 6 and column 6
- Both layers get identical finder/timing patterns

---
**Date**: 2025-10-17  
**Status**: Production Ready ✅

