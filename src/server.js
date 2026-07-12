'use strict';

require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const sessionsRouter = require('./routes/sessions');
const webhooksRouter = require('./routes/webhooks');
const { allOrders } = require('./store/orders');

const app = express();
const PORT = process.env.PORT || 4242;
const isProd = process.env.NODE_ENV === 'production';
const isLive = (process.env.ADYEN_ENVIRONMENT || 'test').toLowerCase() === 'live';

// Fail fast: refuse to boot in production/live without a real webhook HMAC key —
// otherwise a forged "AUTHORISATION" webhook could mark orders paid.
if ((isProd || isLive) && (!process.env.ADYEN_HMAC_KEY || process.env.ADYEN_HMAC_KEY === 'YOUR_ADYEN_HMAC_KEY')) {
  throw new Error('Refusing to start: ADYEN_HMAC_KEY must be set in production/live (webhook signature verification).');
}

// Security headers. CSP is intentionally OFF here — a wrong CSP silently breaks
// Drop-in. Enable it deliberately with Adyen's allowed sources before go-live.
app.use(helmet({ contentSecurityPolicy: false }));

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Throttle session creation — blunts card-testing (carding) abuse and memory DoS.
app.use(
  '/api/sessions',
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false })
);

// API routes.
app.use('/', sessionsRouter);
app.use('/', webhooksRouter);

app.get('/health', (req, res) => res.json({ ok: true }));

// Debug-only order view — NEVER expose the order book in production.
if (!isProd) {
  app.get('/orders', (req, res) => res.json(allOrders()));
}

app.listen(PORT, () => {
  console.log(`\n💳  PaymentGateway (Adyen) sandbox running:  http://localhost:${PORT}`);
  console.log('    Open that URL for the embedded Drop-in checkout. Test cards are in README.md.');
  if (!process.env.ADYEN_API_KEY || process.env.ADYEN_API_KEY === 'YOUR_ADYEN_API_KEY') {
    console.log('    ⚠  Add your Adyen TEST credentials to .env (copy from .env.example).');
  }
  if (!process.env.ADYEN_HMAC_KEY || process.env.ADYEN_HMAC_KEY === 'YOUR_ADYEN_HMAC_KEY') {
    console.log('    ⚠  ADYEN_HMAC_KEY unset — webhooks are UNVERIFIED (local test only; blocked in prod/live).');
  }
  console.log('    Webhooks: point a public URL (ngrok/cloudflared) at /api/webhooks, or use');
  console.log('              "Send test notification" in the Adyen Customer Area.\n');
});

module.exports = app;
