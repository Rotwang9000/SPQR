import { createRequire } from 'node:module';
import { createSpqr } from '../docs/spqr-core.js';
const require = createRequire(import.meta.url);
export const qrcode = require('../docs/vendor/qrcodegen.min.js');
export const jsQR = require('../docs/vendor/jsQR.js');
export const spqr = createSpqr({ qrcode, jsQR });
