import { createSpqr, CHANNELS } from '../spqr-core.js';
import { createScanner, asLink } from '../scanner.js';

const spqr = createSpqr({ qrcode: window.qrcode, jsQR: window.jsQR });
const $ = (id) => document.getElementById(id);
const CHANNEL_NAMES = ['red', 'green', 'blue'];

const scanner = createScanner(spqr, {
	video: $('video'),
	overlay: $('overlay'),
	onProgress: ({ locked, layers }) => {
		const n = layers ?? 3;
		$('chips').innerHTML = locked.some(Boolean)
			? [0, 1, 2].slice(0, n).map((c) => {
				const tentative = layers === null && c === 2 ? ' tentative' : '';
				return `<span class="chip ${CHANNELS[c]}${locked[c] ? ' ok' : ''}${tentative}">${locked[c] ? '✓' : '…'} ${CHANNEL_NAMES[c]}</span>`;
			}).join('')
			: '';
		$('status').textContent = locked.some(Boolean) ? 'Got part of it, hold steady…' : 'Point your camera at an SPQR or QR code';
	},
	onResult: showResult,
	onError: (msg) => {
		if (scanner.running) return;
		showNotice(msg);
	},
});

function showNotice(msg) {
	$('noticeText').textContent = msg;
	$('notice').hidden = false;
	$('bottom').hidden = true;
	$('frame').hidden = true;
	$('sheet').hidden = true;
}

function showResult(res) {
	if (navigator.vibrate && navigator.userActivation?.hasBeenActive) navigator.vibrate(40);
	$('kind').textContent = res.layers === 1 ? '✓ Standard QR code' : `✓ SPQR code · ${res.layers} layers`;
	$('text').textContent = res.text;
	const actions = $('actions');
	actions.replaceChildren();
	const link = asLink(res.text);
	if (link) {
		const a = document.createElement('a');
		a.href = link;
		a.rel = 'noopener noreferrer';
		a.className = 'button primary';
		// Show where the link goes, since the code itself gives no hint.
		a.textContent = `Open ${new URL(link).host}`;
		actions.append(a);
	}
	actions.append(
		btn('Copy', async (b) => {
			try {
				await navigator.clipboard.writeText(res.text);
				b.textContent = 'Copied';
			} catch {
				b.textContent = 'Copy failed';
			}
		}),
		btn('Scan again', startCamera),
	);
	$('sheet').hidden = false;
	$('bottom').hidden = true;
	$('frame').hidden = true;
}

function btn(label, onClick) {
	const b = document.createElement('button');
	b.type = 'button';
	b.textContent = label;
	b.addEventListener('click', () => onClick(b));
	return b;
}

async function startCamera() {
	$('sheet').hidden = true;
	$('notice').hidden = true;
	$('bottom').hidden = false;
	$('frame').hidden = false;
	$('chips').replaceChildren();
	if (!navigator.mediaDevices?.getUserMedia) {
		showNotice('This browser can’t use the camera here. You can still choose a photo of a code.');
		return;
	}
	await scanner.start();
}

async function scanFile(file) {
	scanner.stop();
	$('sheet').hidden = true;
	$('notice').hidden = true;
	$('bottom').hidden = false;
	$('status').textContent = 'Reading photo…';
	await new Promise((r) => setTimeout(r, 20));
	await scanner.scanFile(file);
}

for (const id of ['uploadBtn', 'uploadBtn2']) $(id).addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', (e) => {
	const f = e.target.files?.[0];
	if (f) scanFile(f);
	e.target.value = '';
});
$('retryBtn').addEventListener('click', startCamera);
document.addEventListener('visibilitychange', () => {
	// Release the camera when the tab is hidden; pick it up again on return.
	if (document.hidden) scanner.stop();
	else if ($('sheet').hidden && $('notice').hidden) startCamera();
});

startCamera();
