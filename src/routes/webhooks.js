'use strict';

const express = require('express');
const { hmacValidator } = require('@adyen/api-library');
const { recordOrder, alreadyProcessed, markProcessed } = require('../store/orders');

const router = express.Router();
const validator = new hmacValidator();
const isProd = process.env.NODE_ENV === 'production';

function hmacKeyIsReal() {
  const k = process.env.ADYEN_HMAC_KEY;
  return !!k && k !== 'YOUR_ADYEN_HMAC_KEY';
}

/**
 * POST /api/webhooks — Adyen standard webhook notifications.
 *
 * Adyen posts a batch: { live, notificationItems: [{ NotificationRequestItem }] }.
 * The HMAC is computed from each item's FIELDS (not the raw body), so normal JSON
 * parsing is fine. The webhook is the SOURCE OF TRUTH for "did they pay?".
 *
 * Security posture:
 *  - FAIL CLOSED: outside local test we refuse unauthenticated webhooks.
 *  - On an invalid signature we return 401 (NOT "[accepted]") so Adyen retries
 *    and the misconfiguration surfaces instead of silently dropping real payments.
 *  - Idempotent on pspReference:eventCode (Adyen can redeliver notifications).
 */
router.post('/api/webhooks', (req, res) => {
  const body = req.body;
  if (!body || !Array.isArray(body.notificationItems)) {
    return res.status(400).send('invalid payload');
  }

  const devBypass = !isProd && (process.env.ADYEN_ENVIRONMENT || 'test').toLowerCase() === 'test';
  if (!hmacKeyIsReal()) {
    if (!devBypass) return res.status(401).send('HMAC key not configured');
    console.warn('[webhook] ADYEN_HMAC_KEY not set — signatures UNVERIFIED (local test only).');
  }

  for (const wrapper of body.notificationItems) {
    const nri = wrapper && wrapper.NotificationRequestItem;
    if (!nri) continue;

    // Verify signature; reject the batch on failure so Adyen retries.
    if (hmacKeyIsReal() && !validator.validateHMAC(nri, process.env.ADYEN_HMAC_KEY)) {
      console.error('[webhook] ❌ HMAC INVALID —', nri.pspReference);
      return res.status(401).send('Invalid HMAC signature');
    }

    // Idempotency: skip anything we've already handled.
    const eventKey = `${nri.pspReference}:${nri.eventCode}`;
    if (alreadyProcessed(eventKey)) continue;

    try {
      const success = String(nri.success) === 'true';
      if (nri.eventCode === 'AUTHORISATION') {
        recordOrder(nri.merchantReference, {
          reference: nri.merchantReference,
          status: success ? 'authorised' : 'refused',
          pspReference: nri.pspReference,
          paymentMethod: nri.paymentMethod,
          amount: nri.amount && nri.amount.value,
          currency: nri.amount && nri.amount.currency,
        });
        console.log(
          `[webhook] ${success ? '✅' : '⚠️ '} AUTHORISATION ${nri.merchantReference} ` +
          `(${nri.paymentMethod}) success=${success}`
        );
        // TODO: on success, fulfill the order — now safe to do once (idempotent above).
      } else {
        console.log(`[webhook] event ${nri.eventCode} for ${nri.merchantReference}`);
      }
      markProcessed(eventKey);
    } catch (e) {
      console.error('[webhook] handler error:', e.message);
    }
  }

  // REQUIRED by Adyen so it marks the notification consumed.
  res.set('Content-Type', 'text/plain');
  res.send('[accepted]');
});

module.exports = router;
