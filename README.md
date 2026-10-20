# SPQR: Stacked Polychromatic QR

**Live:** https://rotwang9000.github.io/SPQR/

SPQR stacks two or three ordinary QR codes into one colour image, one per RGB channel. Each layer carries only half or a third of the message, so it can use a smaller QR version: fewer, bigger squares for the same data. That means a code can be printed or shown smaller, or scanned from further away.

| Plain QR | SPQR, 2 layers | SPQR, 3 layers |
| --- | --- | --- |
| black & white | white / red / green / black | white, cyan, magenta, yellow, red, green, blue, black |
| 1 bit per square | 2 bits per square | 3 bits per square |

## How it works

**Encoding.** The text's UTF-8 bytes are split into 2 or 3 chunks. Each chunk becomes a standard QR code, and all of them are forced to the same version so they line up square for square. Each square's colour is then picked so that **layer *i* is dark exactly where colour channel *i* is low**:

| layers dark | 2-layer colour | 3-layer colour |
| --- | --- | --- |
| none | white | white |
| 1 | green | cyan |
| 2 | red | magenta |
| 1 + 2 | black | blue |
| 3 | | yellow |
| 1 + 3 | | green |
| 2 + 3 | | red |
| all | | black |

Finder squares, timing lines and alignment marks are identical in every layer and dark in all of them, so they come out **black**, just as in a normal QR.

**Decoding.** The photo is split into its R, G and B channels. Each channel *is* a plain black-and-white QR code, so it goes straight to a standard decoder ([jsQR](https://github.com/cozmo/jsQR)), which handles finding the code, perspective, and Reed–Solomon error correction for us. The decoded chunks are joined in channel order. If a channel won't read cleanly, two more ways of pulling it out of the colour image are tried: one undoes colour bleed between channels, the other divides out brightness to cope with glare. On a live camera, layers read in different frames are combined, so they don't all have to come out in the same frame.

To work out how many layers a code has:

- **Plain QR:** reads identically in all three channels. The encoder makes sure split chunks are never identical, so an SPQR code can't be mistaken for one.
- **3 layers:** has blue-ish squares (cyan, magenta, blue), where blue is high but red or green is low.
- **2 layers:** has no blue-ish squares, since white is the only colour with blue high.

### Does it actually help?

`npm run bench` photographs codes in simulation (perspective, lens blur, 10% colour crosstalk, white-balance shift, washed-out contrast, sensor noise, JPEG 4:2:0) and finds the smallest size, in camera pixels, at which each code still decodes 80% of the time:

| Message | Plain QR | SPQR 2 layers | SPQR 3 layers |
| --- | --- | --- | --- |
| 60 bytes | 134 px (v5) | 134 px, 100% (v3) | 117 px, 87% (v2) |
| 200 bytes | 245 px (v10) | 175 px, 71% (v6) | 164 px, 67% (v5) |
| 500 bytes | ~550 px (v18) | ~400 px, ~73% (v12) | ~280 px, ~51% (v9) |

(The 500-byte row comes from a coarser sweep with 10 trials per size.)

For short messages, a plain QR is already small and the advantage mostly goes away: the black/white contrast is more robust than colour, especially once chroma subsampling halves the colour resolution. The gain grows with message length. These numbers come from a simulation, not real phones and printers, so treat them as a guide.

## Using it

The web app in `docs/` is static: no build, no CDN, and nothing leaves the browser. It can:

- generate plain, 2-layer and 3-layer codes side by side at the same width, with SVG and PNG download;
- scan from the camera, an uploaded image, or a pasted image.

```bash
npm install      # dev only: sharp, used by the camera simulator
npm test         # round trips, edge cases, multi-frame aggregation, simulated photos
npm run bench    # size-vs-reliability comparison (slow; --trials=, --lengths=, --blur=, ...)
npm run serve    # http://localhost:3017
```

`docs/spqr-core.js` is the whole format: one dependency-injected ES module that runs in the browser and in Node:

```js
import { createSpqr } from './docs/spqr-core.js';
const spqr = createSpqr({ qrcode, jsQR });           // qrcode-generator + jsQR
const code = spqr.encode('hello', { layers: 3, ecc: 'M' });
const svg = spqr.toSvg(code, { modulePx: 8 });
const result = spqr.decode({ data, width, height }); // RGBA pixels
// → { status: 'ok', layers: 3, version, text, bytes, location }
```

## Limits

- You need an SPQR-aware reader (this page or the library). A normal QR app will see garbage, or nothing at all.
- Colour fidelity matters. Very warm or dim light, faded prints and heavy JPEG compression hurt the colour layers before they hurt a plain QR.
- Custom brand colours aren't supported: the format relies on the colours being separable by RGB channel.

## History

v1 (the `Broke` and `Better` branches, and git history before v2) classified each square's colour against a palette with a growing pile of heuristics. It never decoded reliably from a camera. v2 replaced it with the channel-separable format above, which lets a standard QR decoder do the hard work.

MIT licence.
