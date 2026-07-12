'use strict';

require('dotenv').config();
const path = require('path');
const express = require('express');

const sessionsRouter = require('./routes/sessions');
const webhooksRouter = require('./routes/webhooks');
const { allOrders } = require('./store/orders');

const app = express();
const PORT = process.env.PORT || 4242;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes.
app.use('/', sessionsRouter);
app.use('/', webhooksRouter);

// Health + a tiny orders view for the sandbox.
app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/orders', (req, res) => res.json(allOrders()));

app.listen(PORT, () => {
  console.log(`\n💳  PaymentGateway (Adyen) sandbox running:  http://localhost:${PORT}`);
  console.log('    Open that URL for the embedded Drop-in checkout. Test cards are in README.md.');
  if (!process.env.ADYEN_API_KEY || process.env.ADYEN_API_KEY === 'YOUR_ADYEN_API_KEY') {
    console.log('    ⚠  Add your Adyen TEST credentials to .env (copy from .env.example).');
  }
  console.log('    Webhooks: point a public URL (ngrok/cloudflared) at /api/webhooks, or use');
  console.log('              "Send test notification" in the Adyen Customer Area.\n');
});

module.exports = app;
