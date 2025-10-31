# SECOND CRITICAL ENCODER BUG FIX - 2025-10-28d

## Summary

A second critical bug was discovered where the third layer (green/middle bit) was never being encoded with actual data in standard and hybrid modes, resulting in only 4 colors being used instead of 8.

## The Problem

### User Observation
The generated CMYRGB QR codes looked wrong - they only used a few colors (yellow, green, cyan) instead of all 8 colors. However, they did decode successfully, which suggested the data wasn't being split across all three layers.

### Root Cause

In `docs/app.js` lines 114-143, the code was splitting the payload into 3 parts:

```javascript
const splits = isEightColour ? 3 : 2;
const parts = splitPayload(text, splits);
baseText = parts[0] || '';
redText = parts[1] || '';
// parts[2] was never assigned to anything!
```

Then at lines 165-171, `greenQr` was only created in parity mode:

```javascript
// OLD CODE - WRONG!
const greenQr = (ecMode === 'parity' && isEightColour) 
    ? makeQrFixed(targetVersion, 'L', generateParityData(baseText, redText)) 
    : null;
```

In standard and hybrid modes, `greenQr` was `null`, which meant:

1. At line 194, the middle bit was always 0:
   ```javascript
   const gBit = greenQr ? (dark(greenQr, x, y) ? 1 : 0) : 0;
   ```

2. The code `(b << 2) | (gBit << 1) | r` only produced values where bit 1 is 0:
   - 000 (0), 001 (1), 100 (4), 101 (5)
   - Which map to: W, Y, C, G
   - Missing: R (3), M (2), B (6), K (7)

3. Only 4 out of 8 colors were being used!

4. **One third of the data was being lost** - `parts[2]` was split out but never encoded!

## The Fix

### Step 1: Capture `greenText` from split
```javascript
let baseText, redText, greenText;

// In standard/hybrid modes:
greenText = (isEightColour && parts[2]) ? parts[2] : null;
```

### Step 2: Create `greenQr` from `greenText` when not in parity mode
```javascript
let greenQr = null;
if (ecMode === 'parity' && isEightColour) {
    greenQr = makeQrFixed(targetVersion, 'L', generateParityData(baseText, redText));
} else if (greenText) {
    greenQr = makeQrFixed(targetVersion, greenEC, greenText);
}
```

### Step 3: Include `greenText` in version calculation
```javascript
const encodes = [
    makeQrAuto(baseText, baseEC),
    makeQrAuto(redText, redEC),
    greenText ? makeQrAuto(greenText, greenEC) : null
].filter(Boolean);
```

## Impact

### Before the Fix (Standard/Hybrid modes)
- Only 4 colors used (W, Y, C, G)
- Only 2 layers carrying data
- Capacity effectively 2x normal QR instead of 3x
- One third of split data was lost
- Codes looked wrong (limited color palette)

### After the Fix
- All 8 colors used (W, R, G, Y, K, M, C, B)
- All 3 layers carrying unique data
- Full 3x capacity utilized
- Complete data preservation
- Codes look correct (rich, varied colors)

### Parity Mode (Unaffected)
Parity mode was working correctly - it intentionally uses only 2 layers for data and the third for parity data.

## Why It Seemed to Work

The decoder was working fine - it could decode the 2 layers that WERE being used. The issue was that:
1. Only 2/3 of the data capacity was being used
2. The visual appearance was wrong (limited colors)
3. For short messages, 2 layers was enough, so it decoded successfully

But for longer messages, the data wouldn't fit because 1/3 of the capacity was unused!

## Action Required

**⚠️ All existing CMYRGB codes generated in standard/hybrid modes must be regenerated!**

Old codes:
- Use only 4 colors
- Have 1/3 less capacity than they should
- May have truncated data for longer messages

New codes:
- Use all 8 colors
- Have full 3x QR capacity
- Look vibrant and colorful

## Testing

To verify the fix:

1. Hard refresh browser (Ctrl+Shift+R) to load `v=20251028d`
2. Generate a CMYRGB code in standard mode
3. **Visual check**: Should see all 8 colors (W, R, G, Y, K, M, C, B)
4. Download and re-upload the PNG
5. Verify it decodes correctly

## Files Changed

- `docs/app.js` lines 115-171: Fixed layer splitting and greenQr creation
- `docs/index.html` line 50: Updated version to v=20251028d
- `CURRENT_STATUS.md`: Documented both fixes

## Date

2025-10-28


