'use strict';

// Bundles the Adyen Web frontend (src/client/checkout.js) into a single browser
// file so there is no CDN/global-name guesswork and `npm start` just works.
// esbuild also emits the imported CSS to public/checkout.bundle.css.
const esbuild = require('esbuild');

esbuild
  .build({
    entryPoints: ['src/client/checkout.js'],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2019'],
    outfile: 'public/checkout.bundle.js',
    minify: true,
    sourcemap: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'info',
  })
  .then(() => console.log('[build] wrote public/checkout.bundle.js (+ .css)'))
  .catch((e) => {
    console.error('[build] failed:', e.message);
    process.exit(1);
  });
