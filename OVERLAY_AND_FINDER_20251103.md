# Camera Overlay & Finder Improvements (2025-11-03f)

## Summary
Enhanced camera overlay to show all critical information without scrolling, and improved grid origin detection for more stable tracking.

---

## 1. Camera Overlay Now Shows Everything ✅

### Before
```
scan-progress overlay:
├─ Base Red Green  ← Generic, unhelpful
└─ (user has to scroll down to see mode and progress)
```

### After
```
scan-progress overlay (all visible without scrolling):
├─ CMYRGB Standard  ← Shows actual mode!
├─ ⬛ Base ✓ · 🟥 Red ✓ · 🟩 Green …  ← Layer status
├─ Locked: 2 of 3 layers  ← Clear progress
└─ Blocks: ⬛: 3/5 · 🟥: 2/5 · 🟩: 0/5  ← Block counts
```

**Changes Made**:
- **Title**: Shows mode type (CMYRGB/BWRG) and error correction mode (Standard/Hybrid/Parity)
- **Layer badges**: Increased size (15px), clearer colors
- **Progress summary**: "Locked: X of Y layers" in plain language
- **Block counts**: Always visible if multi-frame aggregation is active

**User Benefit**: 
All information needed to guide scanning is now on-screen. Users know:
- What type of code they're scanning
- Which layers are decoded
- How many blocks are captured
- What to do next (keep scanning if incomplete)

**Files**: `docs/app.js` lines 5117-5141

---

## 2. Grid Origin Detection Refined ✅

### Problem
The orange detection box was "darting around" and "often sitting in the middle" because:
1. Finder center detection could be offset by colored pixels
2. Origin calculation was based purely on geometric center
3. No verification of quiet zone or finder ring structure

### Solution
Added **origin refinement** step after initial detection:

```javascript
// After detecting finder centers geometrically:
1. Calculate nominal origin from TL finder center
2. Search ±2 module pixels around nominal origin
3. Score each candidate origin by:
   - White pixels in quiet zone (+1 each)
   - Black pixels in finder ring outer edges (+2 each)
4. Select origin with best score
```

**Key Points**:
- **Ignores colored center**: Only scores the black ring structure
- **Verifies quiet zone**: Ensures white margin exists
- **Small search radius**: ±2 modules prevents wild jumps
- **Logs refinement score**: Console shows quality of detection

**Example Console Output**:
```
Spacing: 84px → 21 modules @ 6px, origin=(48,52) [refined, score=142]
```

Higher scores = better alignment with QR structure.

**Files**: `docs/app.js` lines 1055-1121

---

## 3. About Colored Finder Centers

### Your Question
> "do we need to change this .. like our corners can be a black square with a black plus inside, then we overlay our colours as now?"

### Current Approach (Why It Works)
Our SPQR codes use **standard QR finder patterns**:
- 7×7 black outer square
- 5×5 white inner square  
- 3×3 black center square
- **Then overlay colored pixels in the 3×3 center**

The black rings (1:1:3:1:1 pattern) remain intact for detection.

### Detection Strategy
1. **Finder detection**: Uses black pixels only (R<80, G<80, B<80)
   - Detects the black rings, ignores colored centers ✅
   
2. **Origin refinement**: Scores quiet zone (white) and ring (black)
   - Colored centers don't interfere ✅

3. **Module sampling**: Takes 3×3 samples per module
   - Majority vote handles mixed colors in finder centers ✅

### Why Not Change the Design?
**Pros of current approach**:
- Standard QR readers see normal finders
- Colored keys provide calibration data
- Backward compatible with monochrome decoders

**Cons of black-plus design**:
- Would require different finder structure
- Loses calibration information
- Non-standard (breaks compatibility)

**Verdict**: Keep current design. The detection improvements (origin refinement) solve the stability issue without breaking compatibility.

---

## 4. Why Grid Might Still Move

### Expected Behavior
Some movement is **normal**:
- Camera micro-movements
- Focus hunting
- Frame-to-frame lighting changes
- Refinement adjusting for better alignment

### Problematic Movement
If the box **jumps wildly** or **locks to wrong position**:

**Check Console For**:
```
⚠️  Found only X finder candidates, need at least 6
```
→ Poor lighting or focus, not enough contrast

```
origin=(X,Y) [refined, score=LOW_NUMBER]
```
→ If score < 50, detection is weak

**Solutions**:
1. Increase screen brightness
2. Hold camera steadier
3. Try different angle/distance
4. Ensure QR code fills ~50% of frame
5. Check focus (tap-to-focus on QR center)

---

## 5. Testing the Improvements

### Camera Overlay
1. Open camera scanner
2. Point at any SPQR code
3. **Look only at top overlay** (don't scroll!)
4. You should see:
   - Mode type (CMYRGB/BWRG + Standard/Hybrid/Parity)
   - All layer statuses
   - Lock progress
   - Block counts

### Grid Stability
1. Watch the orange detection box
2. Check console for `[refined, score=XXX]`
3. Higher scores = more stable detection
4. Box should "settle" within 1-2 seconds

### Multi-Frame Aggregation
1. Scan a code with poor quality
2. Watch block counts increase
3. See individual blocks lock (change to 🟩)
4. Observe "Locked: X of Y" increase

---

## Files Modified

- `docs/app.js`:
  - Lines 5117-5141: Enhanced camera overlay display
  - Lines 1055-1121: Origin refinement algorithm
- `docs/index.html`: Cache version → `20251103f`

---

## Next Steps for Color Decoding

The remaining issue is **color classification accuracy**. With stable grid detection and comprehensive overlay feedback, users can now:

1. **See what's being detected**: Mode, layers, blocks
2. **Monitor progress**: Block counts show aggregation working
3. **Know when it's complete**: "Locked: 3 of 3 layers"

The bottleneck is getting **consistent color layer data** across frames. The aggregator needs to see the *same* decoded text multiple times to lock blocks. If color classification produces different garbage each frame, blocks won't lock even though the grid is stable.

**Focus areas for next iteration**:
- Improve color palette calibration from finder keys
- Add temporal color averaging (blend multiple frames before classification)
- Implement sub-pixel alignment detection
- Consider HSV/Lab color space instead of RGB

