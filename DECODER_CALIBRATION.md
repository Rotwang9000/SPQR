# SPQR Decoder Color Calibration

## Overview

With the updated finder patterns, all 8 CMYRGB colors now appear in known positions, enabling automatic color calibration for camera scanning.

## Finder Pattern Color Layout

### Top-Left (TL) Finder - Data Colors 0-3:
```
┌─────────┐
│ W │ R   │  White (#ffffff)
├───┼─────┤  Red    (#ff0000)
│ G │ Y   │  Green  (#00ff00)
└─────────┘  Yellow (#ffff00)
```

### Top-Right (TR) Finder - Data Colors 4-7:
```
┌─────────┐
│ K │ M   │  Black   (#000000)
├───┼─────┤  Magenta (#ff00ff)
│ C │ B   │  Cyan    (#00ffff)
└─────────┘  Blue    (#0000ff)
```

### Bottom-Left (BL) Finder - Redundancy:
```
┌─────────┐
│ R │ C   │  Red/Cyan checker
├───┼─────┤  for verification
│ C │ R   │
└─────────┘
```

## Auto-Calibration Strategy

### 1. Finder Pattern Sampling
When decoding an SPQR image:

```javascript
// Pseudo-code for calibration
function calibrateFromFinders(imageData, gridInfo) {
    const { modulePx, modules } = gridInfo;
    
    // Sample center of each finder pattern quadrant
    const sampledColors = {
        // TL finder (modules 2-4, 2-4)
        white:   sampleModule(imageData, 3, 3, modulePx),
        red:     sampleModule(imageData, 4, 3, modulePx),
        green:   sampleModule(imageData, 3, 4, modulePx),
        yellow:  sampleModule(imageData, 4, 4, modulePx),
        
        // TR finder  
        black:   sampleModule(imageData, modules-4, 3, modulePx),
        magenta: sampleModule(imageData, modules-3, 3, modulePx),
        cyan:    sampleModule(imageData, modules-4, 4, modulePx),
        blue:    sampleModule(imageData, modules-3, 4, modulePx)
    };
    
    return sampledColors;
}
```

### 2. Color Mapping
Build a lookup table from expected to actual colors:

```javascript
const expectedColors = {
    W: [255, 255, 255],
    R: [255, 0, 0],
    G: [0, 255, 0],
    Y: [255, 255, 0],
    K: [0, 0, 0],
    M: [255, 0, 255],
    C: [0, 255, 255],
    B: [0, 0, 255]
};

const actualColors = {
    W: sampledColors.white,   // e.g. [248, 252, 250] - slightly off-white
    R: sampledColors.red,      // e.g. [240, 10, 5]   - camera red
    // ... etc
};
```

### 3. Nearest-Neighbor Classification
Classify each pixel by finding closest match in actual color space:

```javascript
function classifyPixelCalibrated(r, g, b, actualColors) {
    let minDist = Infinity;
    let bestMatch = 'W';
    
    for (const [colorName, [ar, ag, ab]] of Object.entries(actualColors)) {
        const dist = Math.sqrt(
            (r - ar) ** 2 +
            (g - ag) ** 2 +
            (b - ab) ** 2
        );
        
        if (dist < minDist) {
            minDist = dist;
            bestMatch = colorName;
        }
    }
    
    return bestMatch;
}
```

## Benefits

### Without Calibration (Current):
- Fixed thresholds: `r >= 250` for red detection
- Fails if lighting shifts colors
- Camera white balance affects all colors
- Print/display color reproduction varies

### With Calibration:
- ✅ Adapts to actual colors in image
- ✅ Handles lighting variations
- ✅ Compensates for camera color shifts
- ✅ Works with non-standard color profiles
- ✅ More tolerant to print/display differences

## Implementation Status

### ✅ Completed:
1. **All 8 colors in finder patterns** - enabling calibration
2. **Custom color support** - user can set brand colors
3. **Color-blind safe presets** - deuteranopia & protanopia palettes

### 🚧 Future Enhancements:
1. **Auto-calibration in decoder** - sample finders & build color map
2. **Adaptive thresholds** - adjust based on detected color distribution
3. **Machine learning classifier** - train on sample images
4. **Color space conversion** - LAB/LUV for perceptual uniformity
5. **Sub-pixel sampling** - average multiple pixels per module for noise reduction

## Testing Recommendations

### Camera Scan Test Protocol:
1. Generate SPQR with known text
2. Print at 300 DPI
3. Scan with various devices:
   - iPhone/Android cameras
   - Webcams (different brands)
   - Document scanners
4. Test lighting conditions:
   - Bright sunlight
   - Indoor LED
   - Fluorescent
   - Low light
5. Test angles: 0°, 15°, 30°, 45°
6. Measure decode success rate

### Expected Results:
- **Without calibration**: 60-70% success rate
- **With calibration**: 85-95% success rate (projected)

## Integration Points

External tools/apps can leverage the finder patterns:

### Mobile App Integration:
```swift
// iOS example
func extractCalibrationColors(from image: UIImage) -> ColorPalette {
    // 1. Detect QR code bounds
    // 2. Locate finder patterns
    // 3. Sample 3x3 center modules of each finder
    // 4. Return ColorPalette for classification
}
```

### Web Worker Processing:
```javascript
// Offload calibration to worker thread
const worker = new Worker('spqr-decoder-worker.js');
worker.postMessage({ imageData, calibrate: true });
worker.onmessage = (e) => {
    const { text, calibrationQuality } = e.data;
    console.log(`Decoded with ${calibrationQuality}% confidence`);
};
```

## References

- **Color Difference Formulas**: CIEDE2000 for perceptual color matching
- **QR Code Spec**: ISO/IEC 18004:2015 - finder pattern structure
- **Color Vision Deficiency**: Simulate with CVD simulators before deployment
- **Camera Color Science**: Understanding Auto White Balance (AWB) effects

---

**Note**: The current decoder uses fixed thresholds, but the foundation for calibration (all 8 colors in finders) is now in place. Future PRs can implement the auto-calibration logic described above.

