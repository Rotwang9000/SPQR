// Camera and image-file scanning, shared by the main page and the scan page.

const CORNERS = ['topLeftCorner', 'topRightCorner', 'bottomRightCorner', 'bottomLeftCorner'];

export function createScanner(spqr, { video, overlay, onProgress = () => {}, onResult = () => {}, onError = () => {} }) {
	const work = document.createElement('canvas');
	const ctx = work.getContext('2d', { willReadFrequently: true });
	let stream = null;
	let frame = 0;
	let aggregator = null;

	function grab(source, sw, sh, crop = 1, maxDim = 800) {
		const cw = sw * crop;
		const ch = sh * crop;
		const scale = Math.min(1, maxDim / Math.max(cw, ch));
		work.width = Math.round(cw * scale);
		work.height = Math.round(ch * scale);
		ctx.drawImage(source, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, work.width, work.height);
		return { img: ctx.getImageData(0, 0, work.width, work.height), scale, ox: (sw - cw) / 2, oy: (sh - ch) / 2 };
	}

	async function start() {
		if (stream) return true;
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
				audio: false,
			});
		} catch (e) {
			onError(`Couldn't open the camera: ${e.message}`);
			return false;
		}
		video.srcObject = stream;
		await video.play();
		aggregator = spqr.createAggregator();
		frame = 0;
		onProgress({ locked: [false, false, false], layers: null });
		requestAnimationFrame(tick);
		return true;
	}

	function stop() {
		stream?.getTracks().forEach((t) => t.stop());
		stream = null;
		if (overlay) overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height);
	}

	function tick() {
		if (!stream) return;
		scanFrame();
		if (stream) setTimeout(() => requestAnimationFrame(tick), 30);
	}

	function scanFrame() {
		const vw = video.videoWidth;
		const vh = video.videoHeight;
		if (!vw) return;
		frame++;
		// Alternate between the whole frame and a sharper centre crop (for small or
		// distant codes), and rotate through the channel extractors so each frame
		// stays quick.
		const crop = frame % 2 === 0 ? 1 : 0.55;
		const { img, scale, ox, oy } = grab(video, vw, vh, crop, 800);
		const extractors = [[0], [1], [2]][Math.floor(frame / 2) % 3];
		const res = aggregator.push(img, { extractors });
		onProgress({ locked: aggregator.locked, layers: res.layers ?? null });
		drawOverlay(res.location ?? null, scale, ox, oy, vw, vh);
		if (res.status === 'ok') {
			stop();
			onResult(res);
		}
	}

	function drawOverlay(location, scale, ox, oy, vw, vh) {
		if (!overlay) return;
		overlay.width = vw;
		overlay.height = vh;
		const g = overlay.getContext('2d');
		g.clearRect(0, 0, vw, vh);
		if (!location) return;
		g.strokeStyle = '#22c55e';
		g.lineWidth = Math.max(3, vw / 200);
		g.beginPath();
		CORNERS.forEach((k, i) => {
			const x = location[k].x / scale + ox;
			const y = location[k].y / scale + oy;
			if (i) g.lineTo(x, y);
			else g.moveTo(x, y);
		});
		g.closePath();
		g.stroke();
	}

	/** Decode a File/Blob. Tries several scales and crops, combining layers across them. */
	async function scanFile(file) {
		let bitmap;
		try {
			bitmap = await createImageBitmap(file);
		} catch {
			onError("That file couldn't be opened as an image.");
			return null;
		}
		const agg = spqr.createAggregator({ maxAgeMs: Infinity });
		let res = null;
		for (const [crop, maxDim] of [[1, 1000], [1, 1600], [1, 640], [0.6, 1000], [1, 2400]]) {
			const { img } = grab(bitmap, bitmap.width, bitmap.height, crop, maxDim);
			res = agg.push(img);
			if (res.status === 'ok') break;
		}
		if (res.status === 'ok') onResult(res);
		else if (agg.locked.some(Boolean)) {
			const got = agg.locked.map((ok, i) => (ok ? `layer ${i + 1}` : null)).filter(Boolean).join(' and ');
			onError(`Found ${got}, but couldn't read the rest. Try a sharper or closer photo.`);
		} else onError('No QR or SPQR code found in that image.');
		return res;
	}

	return {
		start,
		stop,
		scanFile,
		get running() {
			return Boolean(stream);
		},
	};
}

/** A link we're willing to offer as a button: http(s) only, nothing else on the line. */
export function asLink(text) {
	const t = text.trim();
	if (!/^https?:\/\/\S+$/i.test(t)) return null;
	try {
		return new URL(t).href;
	} catch {
		return null;
	}
}
