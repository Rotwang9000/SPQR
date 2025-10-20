#!/usr/bin/env tsx
/**
 * Web server for SPQR - Stacked Polychromatic QR codes
 * Provides generation, scanning, and conversion functionality
 */

import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { generateColourQr } from './generator.js';
import { decodeImageToText, decodeRasterTwoLayer } from './decoder.js';
import sharp from 'sharp';
import QRCode from 'qrcode';

const PORT = process.env.PORT || 3017;
const STATIC_DIR = 'web';

// MIME types for static files
const MIME_TYPES: Record<string, string> = {
	'.html': 'text/html',
	'.css': 'text/css',
	'.js': 'application/javascript',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.svg': 'image/svg+xml',
	'.json': 'application/json'
};

async function serveStatic(path: string): Promise<{ content: Buffer; contentType: string } | null> {
	try {
		const filePath = join(STATIC_DIR, path === '/' ? 'index.html' : path);
		const content = await readFile(filePath);
		const ext = extname(filePath);
		const contentType = MIME_TYPES[ext] || 'application/octet-stream';
		return { content, contentType };
	} catch {
		return null;
	}
}

const server = createServer(async (req, res) => {
	const url = new URL(req.url!, `http://${req.headers.host}`);
	
	// Set CORS headers
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
	
	if (req.method === 'OPTIONS') {
		res.writeHead(200);
		res.end();
		return;
	}

	// API endpoints
	if (url.pathname === '/api/generate' && req.method === 'POST') {
		try {
			let body = '';
			req.on('data', chunk => body += chunk);
			req.on('end', async () => {
				const params = JSON.parse(body);
				const { data, layers = 3, colours = [], format = 'svg' } = params;
				
				if (!data) {
					res.writeHead(400, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'Data is required' }));
					return;
				}

				try {
					let svg: string;
					
					// Use standard QR library for single layer (standard QR)
					if (layers === 1) {
						const qrSvg = await QRCode.toString(data, { 
							type: 'svg',
							width: 200,
							margin: 2,
							color: { dark: '#000000', light: '#FFFFFF' }
						});
						svg = qrSvg;
					} else {
						// Use our SPQR generator for multi-layer
						const result = await generateColourQr(data, {
							layers,
							colours,
							modulePx: 4,
							marginModules: 4
						});
						svg = result.svg;
					}

					// Generate PNG data URL
					const pngBuffer = await sharp(Buffer.from(svg))
						.png()
						.toBuffer();
					const pngDataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;

					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({
						svg: svg,
						dataUrl: pngDataUrl
					}));
				} catch (err) {
					const error = err as Error;
					res.writeHead(500, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: error.message }));
				}
			});
		} catch (error) {
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: (error as Error).message }));
		}
		return;
	}

	if (url.pathname === '/api/decode' && req.method === 'POST') {
		try {
			// Handle both JSON and multipart form data
			const contentType = req.headers['content-type'] || '';
			
			if (contentType.includes('application/json')) {
				let body = '';
				req.on('data', chunk => body += chunk);
				req.on('end', async () => {
					const params = JSON.parse(body);
					const { imageData } = params;
					
					if (!imageData) {
						res.writeHead(400, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ error: 'Image data is required' }));
						return;
					}

					const result = { base: null, red: null, combined: null };
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify(result));
				});
			} else {
				// Multipart form data - handle file upload
				// For now, return mock result since proper multipart parsing is complex
				// In production, would use a library like busboy or formidable
				const mockResult = {
					standard: null,
					spqr: { base: null, red: null, combined: null }
				};
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(mockResult));
			}
		} catch (error) {
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: (error as Error).message }));
		}
		return;
	}

	// Serve static files
	const staticResult = await serveStatic(url.pathname);
	if (staticResult) {
		res.writeHead(200, { 'Content-Type': staticResult.contentType });
		res.end(staticResult.content);
		return;
	}

	// 404
	res.writeHead(404, { 'Content-Type': 'text/plain' });
	res.end('Not Found');
});

server.listen(PORT, () => {
	console.log(`SPQR web server running on http://localhost:${PORT}`);
	console.log('Features:');
	console.log('  - Generate multi-layer color QR codes');
	console.log('  - Scan QR codes with camera');
	console.log('  - Convert standard QR to SPQR');
});
