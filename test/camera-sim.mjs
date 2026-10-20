// Simulates photographing a code: perspective, lens blur, colour crosstalk,
// white balance, washed-out contrast, sensor noise and JPEG compression.
import sharp from 'sharp';

export function rng(seed) {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function gauss(rand) {
	const u = 1 - rand();
	const v = rand();
	return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Homography mapping unit square corners to the given quad (x0,y0..x3,y3 in TL,TR,BR,BL order).
function squareToQuad(q) {
	const [x0, y0, x1, y1, x2, y2, x3, y3] = q;
	const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
	const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
	const den = dx1 * dy2 - dx2 * dy1;
	const a13 = (dx3 * dy2 - dx2 * dy3) / den;
	const a23 = (dx1 * dy3 - dx3 * dy1) / den;
	return [x1 - x0 + a13 * x1, x3 - x0 + a23 * x3, x0, y1 - y0 + a13 * y1, y3 - y0 + a23 * y3, y0, a13, a23, 1];
}

function invert3(m) {
	const [a, b, c, d, e, f, g, h, i] = m;
	const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
	const det = a * A + b * B + c * C;
	return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

function blurChannelPlanes(buf, w, h, sigma) {
	if (sigma <= 0.05) return buf;
	const r = Math.ceil(sigma * 3);
	const k = [];
	let sum = 0;
	for (let i = -r; i <= r; i++) {
		const v = Math.exp(-(i * i) / (2 * sigma * sigma));
		k.push(v);
		sum += v;
	}
	for (let i = 0; i < k.length; i++) k[i] /= sum;
	const tmp = new Float32Array(buf.length);
	const out = new Float32Array(buf.length);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			for (let c = 0; c < 3; c++) {
				let acc = 0;
				for (let j = -r; j <= r; j++) {
					const xx = Math.min(w - 1, Math.max(0, x + j));
					acc += buf[(y * w + xx) * 3 + c] * k[j + r];
				}
				tmp[(y * w + x) * 3 + c] = acc;
			}
		}
	}
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			for (let c = 0; c < 3; c++) {
				let acc = 0;
				for (let j = -r; j <= r; j++) {
					const yy = Math.min(h - 1, Math.max(0, y + j));
					acc += tmp[(yy * w + x) * 3 + c] * k[j + r];
				}
				out[(y * w + x) * 3 + c] = acc;
			}
		}
	}
	return out;
}

/**
 * @param src  {data,width,height} RGBA, the rendered code incl. quiet zone
 * @param o.codePx     how many output pixels wide the code (incl. quiet zone) appears
 * @param o.blur       defocus sigma in output pixels
 * @param o.skew       max corner jitter as a fraction of codePx
 * @param o.crosstalk  fraction of each channel leaking into the others
 * @param o.noise      sensor noise sigma (0-255 scale)
 * @param o.jpeg       JPEG quality, or 0 for none
 */
export async function photograph(src, o, rand) {
	const ss = 2; // supersample
	const outW = Math.round(o.codePx * 1.6);
	const W = outW * ss;
	const side = o.codePx * ss;
	const cx = W / 2 + (rand() - 0.5) * side * 0.1;
	const cy = W / 2 + (rand() - 0.5) * side * 0.1;
	const ang = (rand() - 0.5) * 0.6;
	const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([u, v]) => {
		const x = u * side, y = v * side;
		const jx = (rand() - 0.5) * 2 * o.skew * side;
		const jy = (rand() - 0.5) * 2 * o.skew * side;
		return [cx + x * Math.cos(ang) - y * Math.sin(ang) + jx, cy + x * Math.sin(ang) + y * Math.cos(ang) + jy];
	});
	const Hm = invert3(squareToQuad(corners.flat()));
	const bg = [110 + rand() * 60, 110 + rand() * 60, 110 + rand() * 60];
	const big = new Float32Array(W * W * 3);
	const sw = src.width;
	for (let y = 0; y < W; y++) {
		for (let x = 0; x < W; x++) {
			const X = x + 0.5, Y = y + 0.5;
			const den = Hm[6] * X + Hm[7] * Y + Hm[8];
			const u = (Hm[0] * X + Hm[1] * Y + Hm[2]) / den;
			const v = (Hm[3] * X + Hm[4] * Y + Hm[5]) / den;
			const i = (y * W + x) * 3;
			if (u < 0 || u >= 1 || v < 0 || v >= 1) {
				big[i] = bg[0]; big[i + 1] = bg[1]; big[i + 2] = bg[2];
				continue;
			}
			const sx = Math.floor(u * sw), sy = Math.floor(v * src.height);
			const j = (sy * sw + sx) * 4;
			big[i] = src.data[j]; big[i + 1] = src.data[j + 1]; big[i + 2] = src.data[j + 2];
		}
	}
	// Box downsample.
	let img = new Float32Array(outW * outW * 3);
	for (let y = 0; y < outW; y++) {
		for (let x = 0; x < outW; x++) {
			for (let c = 0; c < 3; c++) {
				let acc = 0;
				for (let dy = 0; dy < ss; dy++) for (let dx = 0; dx < ss; dx++) acc += big[((y * ss + dy) * W + x * ss + dx) * 3 + c];
				img[(y * outW + x) * 3 + c] = acc / (ss * ss);
			}
		}
	}
	img = blurChannelPlanes(img, outW, outW, o.blur);
	// Colour pipeline: crosstalk, white balance, contrast, noise.
	const ct = o.crosstalk;
	const wb = [1 - rand() * 0.15, 1 - rand() * 0.05, 1 - rand() * 0.2];
	const black = 20 + rand() * 25;
	const white = 215 + rand() * 30;
	const data = new Uint8ClampedArray(outW * outW * 4);
	for (let p = 0; p < outW * outW; p++) {
		const r = img[p * 3], g = img[p * 3 + 1], b = img[p * 3 + 2];
		const mixed = [(1 - 2 * ct) * r + ct * g + ct * b, ct * r + (1 - 2 * ct) * g + ct * b, ct * r + ct * g + (1 - 2 * ct) * b];
		for (let c = 0; c < 3; c++) {
			const v = black + (mixed[c] / 255) * (white - black);
			data[p * 4 + c] = v * wb[c] + gauss(rand) * o.noise;
		}
		data[p * 4 + 3] = 255;
	}
	if (!o.jpeg) return { data, width: outW, height: outW };
	const jpg = await sharp(Buffer.from(data.buffer), { raw: { width: outW, height: outW, channels: 4 } }).jpeg({ quality: o.jpeg }).toBuffer();
	const { data: raw, info } = await sharp(jpg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	return { data: new Uint8ClampedArray(raw.buffer, raw.byteOffset, raw.length), width: info.width, height: info.height };
}
