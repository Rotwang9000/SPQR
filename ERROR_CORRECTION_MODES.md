# SPQR Error Correction Modes

This document explains the three error correction strategies available for CMYRGB (8-color, 3-layer) SPQR codes.

## Overview

All modes use QR code error correction levels combined with cross-layer strategies to improve reliability over standard QR codes while maximizing data capacity.

---

## Mode 1: Standard (Default)
**Priority: Maximum Capacity**

### Configuration:
- Base layer: EC 'L' (7% redundancy)
- Red layer: EC 'L' (7% redundancy)
- Green layer: EC 'L' (7% redundancy)

### Characteristics:
- **Capacity**: ~8.8KB (2953 bytes × 3 layers)
- **Module count**: Smallest for given data
- **Reliability**: Each layer has basic EC
- **Recovery**: Can recover from minor damage to individual layers

### Best for:
- Maximum data storage
- Clean printing conditions
- Digital displays
- Known good scanning environments

---

## Mode 2: Hybrid
**Priority: Balanced Reliability + Capacity**

### Configuration:
- Base layer: EC 'M' (15% redundancy) ← CRITICAL DATA
- Red layer: EC 'L' (7% redundancy)
- Green layer: EC 'L' (7% redundancy)

### Characteristics:
- **Capacity**: ~7.5KB (1850 + 2953 + 2953 bytes)
- **Module count**: Slightly larger than standard
- **Reliability**: Base layer ~2× more resilient
- **Recovery**: Critical first portion better protected

### Best for:
- Important data where first chunk is critical
- Headers, checksums, metadata
- Moderate environmental challenges
- When first bytes matter most

---

## Mode 3: Parity
**Priority: Maximum Reliability**

### Configuration:
- Base layer: EC 'L' + CRC32 checksum
- Red layer: EC 'L' + CRC32 checksum  
- Green layer: **Parity data** (not user data)

### Parity Layer Contents:
```
SPQRv1|LEN1|LEN2|CRC1|CRC2|XORDATA
```
- Format identifier
- Length of each data layer (hex)
- CRC32 checksums for verification
- XOR parity bytes (up to 200 bytes)

### Characteristics:
- **Capacity**: ~5.9KB (2 × 2953 bytes)
- **Module count**: Larger (parity overhead)
- **Reliability**: Can detect corruption + recover 1 layer
- **Recovery**: XOR recovery if one layer fails

### Recovery Scenarios:
1. **Both layers intact**: Verified via CRC32 ✅
2. **One layer corrupt**: Recovered via XOR with good layer + parity ✅
3. **Both layers corrupt**: Cannot recover ❌

### Best for:
- Critical data that must not be lost
- Harsh scanning conditions
- Poor lighting/angles
- Physical damage scenarios
- When reliability > capacity

---

## Comparison Table

| Feature | Standard | Hybrid | Parity |
|---------|----------|--------|--------|
| Capacity | ~8.8KB | ~7.5KB | ~5.9KB |
| Module Size | Smallest | Medium | Largest |
| Base Layer EC | L (7%) | M (15%) | L + CRC |
| Other Layers EC | L (7%) | L (7%) | L + CRC |
| Cross-Layer | No | No | Yes |
| Can Recover Corrupt Layer | No | No | Yes (1 layer) |
| Verification | None | None | CRC32 checksums |

---

## Camera Scanning Test Protocol

To compare reliability under real-world conditions:

### Test Setup:
1. Generate same data in all 3 modes
2. Print each at same physical size
3. Test scenarios:
   - Perfect conditions (control)
   - Poor lighting
   - Angled (15°, 30°, 45°)
   - Partial occlusion (10%, 20%, 30%)
   - Distance variations
   - Motion blur

### Success Criteria:
- **Decode Rate**: % of successful scans (10 attempts each)
- **Partial Recovery**: Parity mode recovering 1 corrupt layer
- **Speed**: Time to first successful decode
- **Angle Tolerance**: Maximum angle still readable

### Implementation:
Use the built-in camera scanner on the SPQR web app:
1. Click "📷 Use Camera"
2. Point at printed QR code
3. Note which modes decode successfully

---

## Recommendations

### Use **Standard** when:
- Data fits comfortably (~3-4KB)
- Clean digital display
- Short reading distance
- Controlled environment

### Use **Hybrid** when:
- Have critical headers/metadata
- Medium data size (~3-6KB)
- Moderate environmental challenges
- First portion most important

### Use **Parity** when:
- Data is critical (must not lose)
- Harsh conditions expected
- Physical damage possible
- Reliability > capacity
- Have camera/mobile scanning

---

## Technical Notes

### Why Parity Works:
```
For any two values A and B:
  A ⊕ B = P (parity)
  A ⊕ P = B (recover B from A and P)
  B ⊕ P = A (recover A from B and P)
```

If one layer is corrupted but the other and parity are intact, XOR recovery reconstructs the missing data perfectly.

### CRC32 Detection:
- **False positive rate**: < 0.0001% (1 in 4 billion)
- **Detects**: Single bit errors, burst errors, most multi-bit errors
- **Overhead**: 8 bytes per layer (negligible)

---

## Future Enhancements

Potential additions:
- Reed-Solomon across layers (more robust than XOR)
- Adaptive EC (auto-select based on data importance)
- Multi-level parity (2/3 voting)
- Compressed parity (more recovery data in same space)

