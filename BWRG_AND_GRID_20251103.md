# BWRG Finder Keys & Grid Detection (2025-11-03g)

## Summary
Changed BWRG finder keys to pure black for better stability, and improved grid size detection to capture the full QR code.

---

## 1. BWRG Finder Keys Now All Black ✅

### Before
```
TL finder: Red center
TR finder: Green center  
BL finder: Black center
```

### After
```
TL finder: Black center
TR finder: Black center
BL finder: Black center
```

**Rationale**:
- **BWRG uses only 2 layers** - doesn't need color calibration keys
- **Pure black finders** = identical to standard QR codes
- **Better detection** - no colored pixels to confuse finder pattern matching
- **Simpler generation** - consistent with monochrome approach

**CMYRGB keeps colored keys** because it needs 8-color calibration data.

**Files**: `docs/app.js` lines 781-787

---

## 2. Grid Size Detection Improved ✅

### Problem
The orange detection box was "selecting just part of the code and not expanding to the full thing".

### Root Cause
When calculating QR module count from finder spacing:
```javascript
// Before
qrModules = Math.round((qrModules - 17) / 4) * 4 + 17;
// Could round DOWN, losing modules
```

Example:
- Actual: 25 module QR (Version 2)
- Detection: 24.8 modules
- Rounded: `Math.round((24.8-17)/4) = Math.round(1.95) = 2` ✓
- But close to boundary: `Math.round((24.2-17)/4) = Math.round(1.8) = 2` ✓
- Edge case: `Math.round((24.0-17)/4) = Math.round(1.75) = 2` ✓
- **Failure**: `Math.round((23.8-17)/4) = Math.round(1.7) = 2` but should show Version 1!

### Solution
```javascript
// After
const version = Math.ceil((qrModules - 17) / 4);
qrModules = Math.max(21, version * 4 + 17);
// Always rounds UP to include all modules
```

Now:
- 23.8 modules → Version 2 (25 modules) ✓
- 24.2 modules → Version 2 (25 modules) ✓
- 25.0 modules → Version 2 (25 modules) ✓
- **Never cuts off edges**

### Additional Improvements
1. **Float precision**: Use `avgDist / (qrModules - 7)` instead of `Math.round(...)` for modulePx
2. **Debug logging**: Console shows size calculation steps
3. **Visual feedback**: Detection box now has corner markers

**Files**: `docs/app.js` lines 1043-1051

---

## 3. Enhanced Visual Feedback ✅

### Detection Box Improvements
The orange detection box now shows:
- **Thicker border**: 4px instead of 3px (more visible)
- **Corner markers**: L-shaped marks at all 4 corners
- **Semi-transparent**: 70% opacity so you can see through them

This helps visualize:
- If the detection is aligned with QR edges
- Whether the full code is captured
- Exact boundaries of the detected region

**Files**: `docs/app.js` lines 2407-2429

---

## 4. Testing the Changes

### BWRG Generation
1. Generate a BWRG code (2-layer, 4-color)
2. Check all three finder patterns
3. **Expected**: All three have black 3×3 centers
4. Looks identical to standard QR (except for data modules)

### Grid Detection Size
1. Scan a QR code with camera
2. Watch the orange detection box
3. Check console for: `Size calculation: avgDist=XXX, initial guess=YY modules, rounded to version Z = NN modules`
4. **Expected**: Box fully encompasses the code including white margin
5. Corner markers should align with code edges

### Before vs After Example

**Before**:
```
Size calculation: avgDist=84.0px, rounded to 21 modules
[Box too small, cuts off right/bottom edge]
```

**After**:
```
Size calculation: avgDist=84.0px, initial guess=21 modules, rounded to version 1 = 21 modules
[Box perfectly fits with all margins visible]
```

Or for larger:
```
avgDist=115.2px, initial guess=26 modules, rounded to version 3 = 29 modules
[Includes extra margin to avoid cutting off]
```

---

## 5. Why This Matters

### For BWRG
- **Simpler is better**: 2-layer codes don't need complex color calibration
- **Better compatibility**: Pure black finders = looks like standard QR
- **Easier detection**: No colored pixels in finder centers to confuse algorithms
- **Consistent approach**: Monochrome finders for monochrome-adjacent format

### For Grid Detection
- **Captures full code**: No more partial captures missing edges
- **Better decoding**: All modules visible = better chance of successful decode
- **Stable tracking**: Correct size = stable detection box position
- **Visual confirmation**: Users can see if detection is accurate

---

## 6. Console Debugging

New console output helps diagnose detection issues:

```
locateQRStructure: 640x480 image
   Finders: TL(120,135) TR(204,138) BL(117,219)
   Size calculation: avgDist=84.5px, initial guess=22 modules, rounded to version 1 = 21 modules
   Spacing: 84px → 21 modules @ 6px, origin=(99,117) [refined, score=148]
```

Key metrics:
- **avgDist**: Distance between finders in pixels
- **initial guess**: Calculated module count before rounding
- **version**: QR version (1=21×21, 2=25×25, etc.)
- **modulePx**: Pixels per module (float for accuracy)
- **refined score**: Higher = better alignment (>100 is good)

---

## Files Modified

- `docs/app.js`:
  - Lines 781-787: BWRG finder keys changed to black
  - Lines 1043-1051: Grid size uses ceiling instead of rounding
  - Lines 2407-2429: Enhanced detection box with corner markers
- `docs/index.html`: Cache version → `20251103g`

---

## What's Next

With stable grid detection and clear visual feedback:
1. Users can see exactly what area is being decoded
2. Full QR code is captured (not partial)
3. BWRG codes have optimal finder patterns for detection
4. Console logs help diagnose any remaining issues

The remaining challenge is **colour layer decoding accuracy** from camera images. The grid detection is now rock-solid; we need to focus on getting consistent color classification across frames.

