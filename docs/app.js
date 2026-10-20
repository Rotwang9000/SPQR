import { createSpqr, palette, CHANNELS } from './spqr-core.js';
import { createScanner, asLink } from './scanner.js';

const spqr = createSpqr({ qrcode: window.qrcode, jsQR: window.jsQR });

const $ = (id) => document.getElementById(id);
const QUIET = 4;
const VARIANTS = [
	{ layers: 1, title: 'Plain QR' },
	{ layers: 2, title: 'SPQR · 2 layers' },
	{ layers: 3, title: 'SPQR · 3 layers' },
];
const CHANNEL_NAMES = ['red', 'green', 'blue'];

// --- generator ---------------------------------------------------------------

let genTimer = 0;

function generate() {
	const text = $('text').value;
	const ecc = $('ecc').value;
	const variants = $('variants');
	const err = $('gen-error');
	const n = new TextEncoder().encode(text).length;
	$('bytes').textContent = `${n} byte${n === 1 ? '' : 's'}`;
	variants.replaceChildren();
	err.hidden = true;
	if (!n) return;

	let plainSide = null;
	for (const v of VARIANTS) {
		const card = document.createElement('figure');
		card.className = 'variant';
		let code;
		try {
			code = spqr.encode(text, { layers: v.layers, ecc });
		} catch (e) {
			card.innerHTML = `<figcaption><strong>${v.title}</strong><span>Too long</span></figcaption>`;
			variants.append(card);
			continue;
		}
		const side = code.size + QUIET * 2;
		plainSide ??= side;
		const gain = plainSide / side;
		const svg = spqr.toSvg(code, { modulePx: 8, quietZone: QUIET });
		const holder = document.createElement('div');
		holder.className = 'code';
		holder.innerHTML = svg;
		const cap = document.createElement('figcaption');
		cap.innerHTML = `<strong>${v.title}</strong>` +
			`<span>${code.size}×${code.size} squares · version ${code.version}</span>` +
			(v.layers > 1 ? `<span class="gain">${gain > 1.005 ? `Squares ${gain.toFixed(2)}× bigger` : 'No size gain at this length'}</span>` : '<span class="gain muted">Reference size</span>');
		const actions = document.createElement('div');
		actions.className = 'actions';
		actions.append(
			button('SVG', () => download(new Blob([svg], { type: 'image/svg+xml' }), `spqr-${v.layers}.svg`)),
			button('PNG', () => downloadPng(code, `spqr-${v.layers}.png`)),
		);
		cap.append(actions);
		card.append(holder, cap);
		variants.append(card);
	}
	if (!variants.querySelector('.code')) {
		err.textContent = 'That is too long to fit in a QR code at this error correction level.';
		err.hidden = false;
	}
}

function button(label, onClick) {
	const b = document.createElement('button');
	b.type = 'button';
	b.className = 'small secondary';
	b.textContent = label;
	b.addEventListener('click', onClick);
	return b;
}

function download(blob, name) {
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = name;
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function downloadPng(code, name) {
	const modulePx = Math.max(4, Math.ceil(1024 / (code.size + QUIET * 2)));
	const { data, width, height } = spqr.toRgba(code, { modulePx, quietZone: QUIET });
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	canvas.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0);
	canvas.toBlob((blob) => download(blob, name), 'image/png');
}

function renderLegend() {
	const pal = palette(3);
	$('legend').innerHTML = pal.map((hex, mask) => {
		const dark = [0, 1, 2].filter((l) => mask & (1 << l)).map((l) => l + 1);
		const label = dark.length === 0 ? 'no layer dark' : dark.length === 3 ? 'all layers dark' : `layer ${dark.join(' + ')} dark`;
		return `<div class="swatch"><span style="background:${hex}"></span>${label}</div>`;
	}).join('');
}

$('text').addEventListener('input', () => {
	clearTimeout(genTimer);
	genTimer = setTimeout(generate, 120);
});
$('ecc').addEventListener('change', generate);

// --- scanner -------------------------------------------------------------------

const scanner = createScanner(spqr, {
	video: $('video'),
	overlay: $('overlay'),
	onProgress: ({ locked, layers }) => renderChips(locked, layers),
	onResult: (res) => {
		setCameraUi(false);
		showResult(res);
	},
	onError: (msg) => {
		setCameraUi(false);
		showError(msg);
	},
});

function renderChips(found, layers) {
	const n = layers ?? 3;
	$('layerChips').innerHTML = [0, 1, 2].slice(0, n).map((c) => {
		const ok = found[c];
		const tentative = layers === null && c === 2 ? ' tentative' : '';
		return `<span class="chip ch-${CHANNELS[c]}${ok ? ' ok' : ''}${tentative}">${ok ? '✓' : '…'} Layer ${c + 1} <small>${CHANNEL_NAMES[c]}</small></span>`;
	}).join('');
}

function setCameraUi(on) {
	$('camera').hidden = !on;
	$('cameraBtn').textContent = on ? 'Stop camera' : 'Use camera';
}

async function toggleCamera() {
	if (scanner.running) {
		scanner.stop();
		setCameraUi(false);
		return;
	}
	$('scanResult').replaceChildren();
	setCameraUi(true);
	if (await scanner.start()) $('camera').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function scanFile(file) {
	scanner.stop();
	setCameraUi(false);
	$('scanResult').innerHTML = '<p class="hint">Reading…</p>';
	// Give the browser a moment to paint the "Reading…" message.
	await new Promise((r) => setTimeout(r, 20));
	await scanner.scanFile(file);
}

function showResult(res) {
	const box = document.createElement('div');
	box.className = 'result';
	const kind = res.layers === 1 ? 'Standard QR code' : `SPQR code, ${res.layers} layers`;
	const head = document.createElement('p');
	head.className = 'result-kind';
	head.textContent = `✓ ${kind} · version ${res.version}`;
	const text = document.createElement('pre');
	text.textContent = res.text;
	const actions = document.createElement('div');
	actions.className = 'actions';
	const link = asLink(res.text);
	if (link) {
		const a = document.createElement('a');
		a.href = link;
		a.rel = 'noopener noreferrer';
		a.target = '_blank';
		a.className = 'button small';
		a.textContent = 'Open link';
		actions.append(a);
	}
	actions.append(
		button('Copy', async () => {
			await navigator.clipboard.writeText(res.text);
		}),
		button('Make codes from this', () => {
			$('text').value = res.text;
			generate();
			$('gen-h').scrollIntoView({ behavior: 'smooth' });
		}),
	);
	box.append(head, text, actions);
	$('scanResult').replaceChildren(box);
}

function showError(msg) {
	const p = document.createElement('p');
	p.className = 'error';
	p.textContent = msg;
	$('scanResult').replaceChildren(p);
}

$('cameraBtn').addEventListener('click', toggleCamera);
$('uploadBtn').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', (e) => {
	const f = e.target.files?.[0];
	if (f) scanFile(f);
	e.target.value = '';
});
document.addEventListener('paste', (e) => {
	const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'));
	if (f) scanFile(f);
});

renderLegend();
generate();
