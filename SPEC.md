# SPQR Encoding/Decoding Specification (Brief)

## Goals
- Increase information density using colour layers while preserving compatibility with standard QR readers.
- Provide deterministic placement for calibration keys.
- Support both generation and decoding on Node.js.

## Terminology
- Base layer: Standard black/white QR matrix.
- Colour layers: Additional matrices rendered in colours (default red, green).
- Finder key: Calibration mark inside the 3×3 inner square of each finder pattern (TL, TR, BL).

## Encoding (client-side)
- Mode: square QR only.
- Layers: 1–3. Default 3 (base, red, green).
- Composition: discrete colour mapping:
  - 4-colour BWRG palette: `['#FFFFFF', '#FF0000', '#00FF00', '#000000']`.
  - 8-colour mode (optional) uses CMYRGB+BW.
  - Mapping uses 3-bit code `(base<<2)|(green<<1)|red` → colour index.
- Layering strategy:
  - split (default): payload is split across layers; 8-colour may split into 3 parts.
- ECC: default M; fallback to L if needed.
- Version selection: compute required version per layer, pick max, re-encode each layer at that version for matched dimensions.
- Finder rings: draw standard 7×7 black finder rings; colour keys are painted only inside the inner 3×3 (TL=red, TR=green, BL=black for 4-colour).
- Capacity-aware module sizing: module size scaled by `sqrt(bitsPerModule)` and floored to integer pixels.

### SVG Output
- Pure geometric `<rect>` painting; no metadata reliance.
- Background white; modules are exact squares; finder rings are not overpainted by colour keys.

### PNG Export
- SVG is rasterised with nearest-neighbour.

## Decoding (client-side)
1. Input image loaded to canvas; resized with nearest-neighbour so module size ≈ 18 px (integer multiples only).
2. Detect SPQR by measuring coloured pixel ratio (non-grey → red/green).
3. Sample finder key inner squares (TL/TR/BL) to get reference colours for black, red, green.
4. Build binary masks:
   - Black layer: pixels nearest to black or green.
   - Red layer: pixels nearest to red or green.
5. Try jsQR in two ways for each layer:
   - Raw mask (RGBA, black=0, white=255).
   - Grid-quantised mask snapping to estimated module size; overlay synthetic finder rings (TL, TR, BL).
6. If any layer decodes, concatenate layer texts in order (base, red, green).
7. Debug: extracted masks and quantised layers can be displayed in the UI.

## Defaults
- Layers: 3
- ECC: M (fallback to L)
- Colours: BWRG (4-colour)
- Layering: split
- Keys: TL red, TR green, BL black
