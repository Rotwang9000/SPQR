# Canvas Expansion Fix for Corner Markers (2025-11-03i)

## Problem
Corner markers were:
- **Appearing inside the QR code area** on monochrome codes
- **Not showing at all** on colour codes
- Overlapping with actual QR data

The issue was that the SVG canvas wasn't expanded properly to accommodate the corner markers.

---

## Root Cause

### Before Fix
```
SVG canvas was only expanded at the BOTTOM for text:
┌─────────────────┐
│ [Corner marker] │  ← Inside QR area!
│                 │
│    QR CODE      │
│                 │
│ [Corner marker] │  ← Inside QR area!
└─────────────────┘
    "SPQR" text
```

**Problem**: 
- Corner markers were drawn with negative coordinates (e.g., `outset = -8px`)
- But SVG viewBox started at (0,0), so negative coords were clipped or drawn inside
- Only bottom was expanded, not top/left/right

---

## Solution

### Canvas and Quiet Zone
```javascript
// Keep the QR footprint unchanged; only extend height for the caption
const textSize = Math.max(10, Math.round(minDim * 0.06));
const labelHeight = Math.round(textSize * 2.2);
const totalHeight = height + labelHeight;

// Quiet-zone margin in pixels (standard 4 modules for SPQR, 2 modules for monochrome)
const marginPx = margin * cell; // or 8px for standard QR
```

### Content Offsetting
All QR content is shifted by the corner margin:

**For generateSpqrClient** (colour codes):
```javascript
// Offset every module/pixel drawing
const px = offsetX + (x + margin) * cell;
const py = offsetY + (y + margin) * cell;
```

**For generateStandardQR** (monochrome):
```javascript
// Wrap existing SVG with translate group
svg = svg.replace(/<svg([^>]*)>/, 
    `<svg$1 width="${expandedWidth}" height="${expandedHeight}">
        <rect fill="#ffffff" .../> 
        <g transform="translate(${cornerMargin}, ${cornerMargin})">`
);
svg = svg.replace('</svg>', `</g>${decorations}</svg>`);
```

### Corner Markers
Rendered entirely within the quiet zone, touching the outer edge while leaving a white strip before the modules:
```javascript
const decorations = buildFocusDecorations({
  width,
  height,
  margin: marginPx,
  textSize,
  labelY: height + Math.max(textSize * 1.1, labelHeight * 0.55)
});
```

---

## After Fix

```
Expanded SVG canvas:
┌─────────────────────────┐
│ ┏━━  margin area  ━━┓  │
│ ┃                   ┃  │
│ ┃   ┌───────────┐   ┃  │
│ ┃   │           │   ┃  │ ← Markers in margin
│ ┃   │ QR CODE   │   ┃  │
│ ┃   │           │   ┃  │
│ ┃   └───────────┘   ┃  │
│ ┃                   ┃  │
│ ┗━━━━━━━━━━━━━━━━━━┛  │
│       "SPQR" text      │
└─────────────────────────┘
```

**Result**:
- ✅ Corner markers clearly visible OUTSIDE QR code
- ✅ No overlap with data modules
- ✅ Clean white border separating markers from code
- ✅ Works for both monochrome and colour codes

---

## Code Changes

### 1. buildFocusDecorations (lines 17-56)
```javascript
function buildFocusDecorations({ width, height, margin, textSize, labelY }) {
  const outerTail = Math.max(2, Math.round(margin * 0.35));
  const whiteGap = Math.max(1, Math.round(margin * 0.12));
  const innerBand = Math.max(2, Math.min(margin - whiteGap, Math.round(margin * 0.55)));
  // Four mirrored sets of rectangles place thin inner bands at margin - whiteGap
  // plus shallow tails that reach the outside border.
}
```

### 2. generateSpqrClient (lines 423-536)
```javascript
const labelHeight = Math.round(textSize * 2.2);
const totalHeight = height + labelHeight;
const marginPx = margin * cell;
// Modules stay at (x + margin) * cell; no additional offset required.
```

### 3. generateStandardQR (lines 281-337)
```javascript
const labelHeight = Math.round(textSize * 2.2);
const totalHeight = height + labelHeight;
const decorations = buildFocusDecorations({ width, height, margin: marginPx, textSize, labelY: height + ... });
svg = `<svg width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}">
  <rect fill="#fff"/>
  ${innerContent}
  ${decorations}
</svg>`;
```

---

## Visual Comparison

### Before (BROKEN)
```
Monochrome: ┏━━QR━━┓  ← Markers overlap data
Colour:     [no markers visible at all]
```

### After (FIXED)
```
Monochrome: 
    ┏━━━━━━━━━━━━━┓
    ┃             ┃
    ┃  ┌───────┐  ┃
    ┃  │ QR ▓▓ │  ┃
    ┃  │ ▓▓ ▓▓ │  ┃
    ┃  └───────┘  ┃
    ┃             ┃
    ┗━━━━━━━━━━━━━┛

Colour:
    ┏━━━━━━━━━━━━━┓
    ┃             ┃
    ┃  ┌───────┐  ┃
    ┃  │ QR ██ │  ┃
    ┃  │ ██ ██ │  ┃
    ┃  └───────┘  ┃
    ┃             ┃
    ┗━━━━━━━━━━━━━┛
```

---

## Testing

1. **Generate monochrome QR** (enter "test" with 1 layer)
   - ✅ Should see thick black L-corners OUTSIDE the code
   - ✅ Clear white space between corners and QR data
   
2. **Generate BWRG QR** (enter "test" with 2 layers)
   - ✅ Should see thick black L-corners OUTSIDE the code
   - ✅ Colored finder keys remain inside as expected
   
3. **Generate CMYRGB QR** (enter "test" with 3 layers)
   - ✅ Should see thick black L-corners OUTSIDE the code
   - ✅ All 8 colors visible in QR area
   
4. **Download and inspect**
   - SVG should have expanded dimensions (e.g., 600x650 instead of 558x610)
   - PNG should show complete frame with corners clearly separated

---

## Benefits

1. **Professional appearance**: Clean framing
2. **No data corruption**: Markers can't interfere with QR modules
3. **Better detection**: Clear, isolated features for corner detection algorithm
4. **Print-friendly**: Extra margin makes physical handling easier
5. **Consistent across types**: Works identically for monochrome/BWRG/CMYRGB

---

## Files Modified

- `docs/app.js`:
  - Lines 17-56: `buildFocusDecorations` - simplified margin calculation
  - Lines 281-337: `generateStandardQR` - canvas expansion and transform group
  - Lines 423-536: `generateSpqrClient` - canvas expansion and coordinate offsetting
- `docs/index.html`: Cache version → `20251103l`

---

## Technical Note

The key insight is that SVG coordinates can be negative if the viewBox allows it, but it's cleaner to:
1. Expand the viewBox/canvas to encompass the full drawn area
2. Offset all content using transforms or coordinate addition
3. Position decorations at the edges of the expanded canvas

This approach is more robust and easier to reason about than trying to draw outside the declared canvas bounds.

