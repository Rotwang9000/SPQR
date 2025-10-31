# SPQR - Stacked Polychromatic QR Codes

**🌐 Live Demo: [spqr.codes](https://spqr.codes)**

Enhanced multi-layer QR code generator with bigger, more scannable modules for the same data.

## Overview

SPQR (Stacked Polychromatic QR) uses multiple colour channels to create QR codes with larger modules for the same amount of data, making them easier to scan from a distance or on small screens. The technology splits data across colour layers while maintaining standard QR code structure.

## ✨ Features

### Web Application (Recommended)
- 📱 **Browser-based**: No installation required
- 🎨 **3 QR Variants**: Standard, BWRG (4-color), CMYRGB (8-color)
- 🎯 **1.4-1.5× Bigger Modules**: Same data, larger squares, easier scanning
- 🛡️ **Advanced Error Correction**: Standard, Hybrid, and Parity modes
- 🌈 **Custom Colors**: Brand colors, accessibility presets (Deuteranopia, Protanopia)
- 📷 **Camera Scanning**: Upload images or use your camera
- 💾 **Download**: Export as SVG or PNG
- 🧪 **Automated Testing**: 29 comprehensive tests ensure reliability

### CLI and Node.js Library
- Command-line tools for batch processing
- Programmatic API for integration

## 🚀 Quick Start

### Option 1: Use the Web App (Easiest)
Visit **[spqr.codes](https://spqr.codes)** and start generating codes immediately!

### Option 2: Local Development

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/SPQR.git
cd SPQR

# Install dependencies
npm install

# Build TypeScript
npm run build

# Start local server
npm run dev
```

Visit `http://localhost:3017` in your browser.

## 📊 How It Works

SPQR creates multi-layer QR codes by encoding data across different colour channels:

### BWRG (4-Color SPQR)
- **2 layers**: Base (black/white) + Red layer
- **Colours**: White, Black, Red, Green (green = overlap)
- **Benefit**: 1.4× bigger modules for same data
- **Best for**: High contrast needs, 2-layer data

### CMYRGB (8-Color SPQR)
- **3 layers**: Base + Red + Green (or Parity)
- **Colours**: 8 total (White, Red, Green, Yellow, Black, Magenta, Cyan, Blue)
- **Benefit**: 1.5× bigger modules for same data
- **Error Correction Modes**:
  - **Standard**: All layers EC 'L' (maximum capacity)
  - **Hybrid**: Base EC 'M', others EC 'L' (balanced)
  - **Parity**: 2 data layers + 1 parity layer (maximum reliability)

### Adaptive Color Decoder
The decoder uses **nearest-neighbour colour matching**, so it works with:
- ✅ Default colours
- ✅ Custom brand colours
- ✅ Accessibility-safe palettes
- ✅ Any valid colour combination

## 🧪 Testing

### Web Interface
Open the browser console at [spqr.codes](https://spqr.codes) and run:
```javascript
runAllTests()
```

All 29 tests should pass:
- Standard QR (4 tests)
- BWRG Default (4 tests)
- BWRG Custom (2 tests)
- CMYRGB Standard, Hybrid, Parity (12 tests)
- CMYRGB Custom Colors (7 tests)

### Decoder Testing
For decoder development and debugging, use the test page:
```
docs/test-upload.html
```

This provides:
- Generate test QR codes
- Upload and decode test
- Real-time console output
- Isolated testing environment

### Node.js Tests
```bash
npm test
```

## 📈 Capacity Limits

The generator enforces practical limits for reliable decoding:

| Type | Max Version | Max Modules | Approx. Capacity |
|------|-------------|-------------|------------------|
| BWRG | 30 | 141×141 | ~3,600 bytes total |
| CMYRGB Standard | 25 | 121×121 | ~2,800 bytes total |
| CMYRGB Hybrid | 22 | 109×109 | ~1,900 bytes total |
| CMYRGB Parity | 25 | 121×121 | ~2,000 bytes data |

## 🌐 Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for GitHub Pages setup instructions.

## 📚 Documentation

- [ADAPTIVE_COLOR_DECODER.md](./ADAPTIVE_COLOR_DECODER.md) - How the decoder works
- [DECODER_CALIBRATION.md](./DECODER_CALIBRATION.md) - Future enhancement plans
- [TEST_GUIDE.md](./TEST_GUIDE.md) - Testing instructions

## 🤝 Contributing

Contributions are welcome! Please ensure all tests pass before submitting a pull request.

## 📄 License

MIT License - see LICENSE file for details


