'use strict';

const express = require('express');
const { checkout } = require('../config/adyen');
const { recordOrder } = require('../store/orders');

const router = express.Router();

// The browser needs the (public) client key + environment to init Adyen Web.
router.get('/api/config', (req, res) => {
  res.json({
    clientKey: process.env.ADYEN_CLIENT_KEY && process.env.ADYEN_CLIENT_KEY !== 'YOUR_CLIENT_KEY'
      ? process.env.ADYEN_CLIENT_KEY
      : '',
    environment: (process.env.ADYEN_ENVIRONMENT || 'test').toLowerCase(),
  });
});

/**
 * POST /api/sessions
 * Creates an Adyen Checkout Session (the "sessions flow"). The frontend Drop-in
 * takes the returned { id, sessionData } and renders every payment method your
 * account supports — card (Visa/MC/Amex/Discover), Apple Pay, Google Pay — with
 * 3-D Secure handled automatically. Card data never touches this server.
 */
router.post('/api/sessions', async (req, res) => {
  try {
    const amountValue = 1999; // $19.99 in minor units
    const currency = process.env.CURRENCY || 'USD';
    const countryCode = process.env.COUNTRY || 'US';
    const domain = process.env.DOMAIN || `http://localhost:${process.env.PORT || 4242}`;
    const reference = 'ORDER-' + Date.now();

    const session = await checkout.PaymentsApi.sessions({
      merchantAccount: process.env.ADYEN_MERCHANT_ACCOUNT,
      reference,
      amount: { currency, value: amountValue },
      countryCode,
      returnUrl: `${domain}/result.html`, // used for 3DS/redirect return
    });

    // Record intent. The webhook (not this call) is the truth of payment.
    recordOrder(reference, {
      reference,
      sessionId: session.id,
      status: 'created',
      amount: amountValue,
      currency,
    });

    res.json(session); // includes id + sessionData for Drop-in
  } catch (err) {
    console.error('[sessions] error creating Adyen session:', err.message);
    res.status(500).json({ error: 'Unable to create Adyen session', detail: err.message });
  }
});

module.exports = router;
