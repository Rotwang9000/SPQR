# CRITICAL ENCODER BUG FIX - 2025-10-28c

## Summary

A critical bug was discovered in the CMYRGB encoder that was causing all generated QR codes to use incorrect colours. This made it impossible for the decoder to work correctly.

## The Problem

In `docs/app.js` at line 196, the encoder was using a straight-through identity mapping:

```javascript
const idxMap = [0,1,2,3,4,5,6,7];
```

However, this was incorrect because:

### How the Encoding Works

The encoder creates a 3-bit code from three binary layers:
```javascript
const code = (b << 2) | (gBit << 1) | r; // 0..7
```

This produces codes 0-7 representing CMY combinations:
- 0 = 000 = W (White) - no CMY
- 1 = 001 = Y (Yellow) - Y only
- 2 = 010 = M (Magenta) - M only
- 3 = 011 = R (Red) - M+Y
- 4 = 100 = C (Cyan) - C only
- 5 = 101 = G (Green) - C+Y
- 6 = 110 = B (Blue) - C+M
- 7 = 111 = K (Black) - C+M+Y

### The Palette Order

The CMYRGB palette is defined as (line 246):
```javascript
['#ffffff','#ff0000','#00ff00','#ffff00','#000000','#ff00ff','#00ffff','#0000ff']
```

Which corresponds to:
```
[W, R, G, Y, K, M, C, B]
 0  1  2  3  4  5  6  7
```

### The Mismatch

With the old identity mapping `[0,1,2,3,4,5,6,7]`:
- code 0 (W) → palette[0] (W) ✓ Correct
- code 1 (Y) → palette[1] (R) ✗ Wrong! Should be palette[3]
- code 2 (M) → palette[2] (G) ✗ Wrong! Should be palette[5]
- code 3 (R) → palette[3] (Y) ✗ Wrong! Should be palette[1]
- code 4 (C) → palette[4] (K) ✗ Wrong! Should be palette[6]
- code 5 (G) → palette[5] (M) ✗ Wrong! Should be palette[2]
- code 6 (B) → palette[6] (C) ✗ Wrong! Should be palette[7]
- code 7 (K) → palette[7] (B) ✗ Wrong! Should be palette[4]

**Only White (code 0) was being encoded correctly!**

## The Fix

Changed the mapping to correctly translate CMY codes to palette indices:

```javascript
const idxMap = [0, 3, 5, 1, 6, 2, 7, 4];
```

Now:
- code 0 (W) → palette[0] (W) ✓
- code 1 (Y) → palette[3] (Y) ✓
- code 2 (M) → palette[5] (M) ✓
- code 3 (R) → palette[1] (R) ✓
- code 4 (C) → palette[6] (C) ✓
- code 5 (G) → palette[2] (G) ✓
- code 6 (B) → palette[7] (B) ✓
- code 7 (K) → palette[4] (K) ✓

## Impact

### Before the Fix
- CMYRGB QR codes were being generated with wrong colours
- Decoder could not possibly work because the colour-to-bit mapping was scrambled
- All three layers would fail to decode, producing gibberish or errors

### After the Fix
- CMYRGB QR codes are now generated with correct colours
- Decoder can properly extract the three binary layers
- Encoding and decoding are now consistent

## Action Required

**⚠️ All existing CMYRGB QR codes must be regenerated!**

Any CMYRGB codes generated before this fix will NOT decode correctly with the fixed decoder, because they were created with the wrong colour mapping.

## Testing

To verify the fix works:

1. Hard refresh browser to load `app.js?v=20251028c`
2. Generate a new CMYRGB QR code with test text (e.g., "SPQR")
3. Download the generated PNG
4. Upload it back to the decoder
5. Verify the decoded text matches exactly

## Files Changed

- `docs/app.js` line 196-199: Fixed idxMap
- `docs/index.html` line 50: Updated version to v=20251028c
- `CURRENT_STATUS.md`: Documented the fix

## Date

2025-10-28

