Third-party code, vendored so the site has no build step and no CDN dependency.

- `jsQR.js`: [jsQR](https://github.com/cozmo/jsQR) 1.4.0, Apache-2.0 (see `jsQR.LICENSE`).
- `qrcodegen.min.js`: [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) by Kazuhiko Arase, MIT.

`package.json` here only marks these UMD files as CommonJS so Node tests can `require()` them.
