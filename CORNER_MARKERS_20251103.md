# Thick Corner Markers for Detection (2025-11-03h)

## Summary
Added prominent L-shaped corner markers that are both visible to users AND usable by the detection algorithm for improved grid location.

---

## 1. Thick, Visible Corner Markers ✅

### SVG Generation
**Corner markers on generated codes** are now:
- **Thick black L-shapes**: 4-6px stroke width (was 2px)
- **Much larger**: 12% of image size (was 8%)
- **High opacity**: 85% (was 55%)
- **Filled paths**: Solid black, not just strokes
- **Positioned outside QR quiet zone**

**Example**:
```
┌─────────────────────┐
│ ┏━━━          ━━━┓ │
│ ┃                ┃ │
│ ┃   [QR CODE]   ┃ │
│ ┃                ┃ │
│ ┗━━━          ━━━┛ │
└─────────────────────┘
```

**Files**: `docs/app.js` lines 17-56

---

## 2. Camera Overlay Detection Box ✅

**Orange detection box** now shows:
- **Thick border**: 4px (very visible)
- **L-shaped corner markers**: 
  - 20px long arms
  - 6px thick
  - 90% opacity
  - Pointing into the detected region
- **Clear visual feedback**: Users can see exactly where detection thinks the code is

**Files**: `docs/app.js` lines 2552-2581

---

## 3. Corner Marker Detection Algorithm ✅

### New Detection Flow
```
1. detectCornerMarkers(data, width, height)
   ├─ Scan each corner quadrant (25% of image)
   ├─ Look for L-shaped black patterns
   ├─ Score based on arm continuity
   └─ Return markers with positions and scores

2. gridFromCornerMarkers(markers, width, height)
   ├─ Calculate spacing between markers
   ├─ Estimate QR size from marker positions
   ├─ Match to nearest valid QR version (21, 25, 29...)
   └─ Return grid with modulePx and origin

3. locateQRStructure(data, width, height)
   ├─ Try corner marker detection FIRST ⭐
   ├─ If found (≥3 markers) → use that grid
   └─ Otherwise → fallback to finder pattern detection
```

### Why This Works
**Corner markers are easier to detect than finder patterns**:
- ✅ Larger area (thick L-shapes vs thin rings)
- ✅ Simpler shape (just black vs 1:1:3:1:1 ratio)
- ✅ Clear position (exact corners vs center estimation)
- ✅ High contrast (solid black on white margin)
- ✅ No color confusion (pure black, not affected by CMYRGB keys)

**Files**: `docs/app.js` lines 857-974, 886-895

---

## 4. Detection Algorithm Details

### Corner Scanning
```javascript
scanCorner(startX, startY, endX, endY, cornerType)
  - Scan corner quadrant with step size
  - For each black pixel:
    * Test horizontal arm (30px)
    * Test vertical arm (30px)
    * Score = number of black pixels found
  - Return best position if score > 20
```

### Grid Estimation
```javascript
gridFromCornerMarkers(markers)
  - Calculate spacing: widthPx = TR.x - TL.x
  - Estimate QR size: ~87% of marker spacing
  - Try QR versions: 21, 25, 29, 33, 37...
  - Pick version with best fit
  - Calculate modulePx and origin
```

### Console Output
```
📐 Detected 4 corner markers, using for grid estimation
✨ Grid from corner markers: 21×21, 6px/module, origin=(48,52)
```

---

## 5. Benefits

### For Users
- **Visible alignment aid**: Can see where to position code
- **Clear feedback**: Orange L-corners show detection accuracy
- **Better first-time experience**: Easier to understand what's being scanned

### For Detection
- **Higher success rate**: Corners are easier to find than finders
- **More stable**: Large solid shapes vs small patterns
- **Faster**: Scan corners first, only 4 areas vs whole image
- **Robust to blur**: Thick lines survive focal issues better

### For Generated Codes
- **Professional appearance**: Clear framing
- **Print-friendly**: Thick markers survive low-res printing
- **Dual-purpose**: Both aesthetic AND functional

---

## 6. Fallback Behavior

If corner markers aren't found (e.g., scanning a code without them):
1. Detection reports: `No corner markers or insufficient (found X)`
2. Falls back to standard finder pattern detection
3. Works exactly as before for non-SPQR codes

**This means**: ✅ Backward compatible, ✅ Doesn't break existing codes

---

## 7. Testing

### Generate a Code
1. Create any SPQR code
2. **Check corners**: Should see thick black L-shapes
3. **Verify they're outside the white margin**
4. **Screenshot or save**: Print it to test real-world detection

### Scan with Camera
1. Point camera at generated code
2. **Watch console**: Should see "📐 Detected 4 corner markers"
3. **Orange box**: Should show thick L-corners at all 4 corners
4. **Compare methods**: 
   - With markers: Fast, stable detection
   - Without markers (cover corners): Slower, may struggle

### Expected Console
```
locateQRStructure: 640x480 image
📐 Detected 4 corner markers, using for grid estimation
✨ Grid from corner markers: 21×21, 6px/module, origin=(48,52)
```

vs without markers:
```
locateQRStructure: 640x480 image
[long finder pattern scanning logs]
   Finders: TL(120,135) TR(204,138) BL(117,219)
   Spacing: 84px → 21 modules @ 6px, origin=(99,117)
```

---

## 8. Why Corner Markers Beat Finder Patterns

| Aspect | Corner Markers | Finder Patterns |
|--------|---------------|-----------------|
| **Size** | ~10% of image | ~5% of code area |
| **Shape complexity** | Simple L (2 lines) | 1:1:3:1:1 ratio |
| **Search area** | 4 small corners | Entire image |
| **Color sensitivity** | Pure black | Can have colored centers |
| **Blur tolerance** | High (thick lines) | Low (precise ratios) |
| **Speed** | Very fast | Moderate |
| **Uniqueness** | High (positioned) | Lower (many false positives) |

---

## Files Modified

- `docs/app.js`:
  - Lines 17-56: Thick SVG corner markers on generated codes
  - Lines 857-974: Corner marker detection and grid estimation
  - Lines 886-895: Priority check in `locateQRStructure`
  - Lines 2552-2581: Thick L-corners on camera overlay
- `docs/index.html`: Cache version → `20251103h`

---

## Future Enhancements

Potential improvements for corner marker detection:
1. **Adaptive threshold**: Adjust black threshold based on image histogram
2. **Sub-pixel refinement**: Use edge detection for exact corner position
3. **Rotation correction**: Calculate and correct image rotation
4. **Scale estimation**: Use marker size to estimate camera distance
5. **Multiple attempts**: Try different black thresholds if first attempt fails

---

## Conclusion

The thick corner markers serve **three purposes**:
1. 📷 **Visual aid** for users positioning codes
2. 🎯 **Detection target** for fast, reliable grid location
3. 🎨 **Professional aesthetic** that clearly frames the QR code

They make SPQR codes **easier to scan** while looking more professional!

