'use strict';

const { randomUUID } = require('crypto');
const express = require('express');
const { checkout } = require('../config/adyen');
const { recordOrder } = require('../store/orders');

const router = express.Router();
const isProd = process.env.NODE_ENV === 'production';

// The browser needs the (public) client key + environment to init Adyen Web.
router.get('/api/config', (req, res) => {
  res.json({
    clientKey: process.env.ADYEN_CLIENT_KEY && process.env.ADYEN_CLIENT_KEY !== 'YOUR_CLIENT_KEY'
      ? process.env.ADYEN_CLIENT_KEY
      : '',
    environment: (process.env.ADYEN_ENVIRONMENT || 'test').toLowerCase(),
  });
});

// Cheap CSRF/abuse guard: reject state-changing session creation from foreign origins.
function sameOriginOnly(req, res, next) {
  const allowed = process.env.DOMAIN || `http://localhost:${process.env.PORT || 4242}`;
  const origin = req.get('origin') || '';
  if (origin && !origin.startsWith(allowed)) {
    return res.status(403).json({ error: 'forbidden origin' });
  }
  next();
}

/**
 * POST /api/sessions
 * Creates an Adyen Checkout Session (the "sessions flow"). The frontend Drop-in
 * takes the returned { id, sessionData } and renders every payment method your
 * account supports — card (Visa/MC/Amex/Discover), Apple Pay, Google Pay, and
 * BNPL where enabled — with 3-D Secure handled automatically. The SERVER is the
 * source of truth for the price; the browser never sets the amount.
 */
router.post('/api/sessions', sameOriginOnly, async (req, res) => {
  try {
    const amountValue = 1999; // $19.99 in minor units
    const currency = process.env.CURRENCY || 'USD';
    const countryCode = process.env.COUNTRY || 'US';
    const domain = process.env.DOMAIN || `http://localhost:${process.env.PORT || 4242}`;
    const reference = 'ORDER-' + randomUUID(); // unique + non-enumerable

    const session = await checkout.PaymentsApi.sessions({
      merchantAccount: process.env.ADYEN_MERCHANT_ACCOUNT,
      reference,
      amount: { currency, value: amountValue },
      countryCode,
      channel: 'Web',
      returnUrl: `${domain}/result.html`, // used for 3DS/redirect return
      // lineItems power BNPL methods (Klarna/Afterpay) that big retailers offer.
      lineItems: [{ quantity: 1, amountIncludingTax: amountValue, description: 'Demo product' }],
    });

    // Record intent. The webhook (not this call) is the truth of payment.
    recordOrder(reference, {
      reference,
      sessionId: session.id,
      status: 'created',
      amount: amountValue,
      currency,
    });

    res.json(session); // includes id + sessionData + amount for Drop-in
  } catch (err) {
    // Log full detail server-side; never leak Adyen internals to the client in prod.
    console.error('[sessions] error creating Adyen session:', err);
    res.status(500).json({
      error: 'Unable to create Adyen session',
      ...(isProd ? {} : { detail: err.message }),
    });
  }
});

module.exports = router;
