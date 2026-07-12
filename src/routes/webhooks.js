'use strict';

const express = require('express');
const { hmacValidator } = require('@adyen/api-library');
const { recordOrder } = require('../store/orders');

const router = express.Router();
const validator = new hmacValidator();

/**
 * POST /api/webhooks  — Adyen standard webhook notifications.
 *
 * Adyen posts a batch: { live, notificationItems: [{ NotificationRequestItem }] }.
 * For standard notifications the HMAC is computed from the item's FIELDS (not the
 * raw body), so ordinary JSON parsing is fine — no raw-body handling needed.
 *
 * The webhook is the SOURCE OF TRUTH for "did they pay?" — never trust the
 * browser result page alone. You MUST respond with the literal "[accepted]".
 */
router.post('/api/webhooks', (req, res) => {
  const hmacKey = process.env.ADYEN_HMAC_KEY;
  const body = req.body;

  if (!body || !Array.isArray(body.notificationItems)) {
    return res.status(400).send('invalid payload');
  }

  for (const wrapper of body.notificationItems) {
    const nri = wrapper && wrapper.NotificationRequestItem;
    if (!nri) continue;

    try {
      if (hmacKey && hmacKey !== 'YOUR_ADYEN_HMAC_KEY') {
        if (!validator.validateHMAC(nri, hmacKey)) {
          console.error('[webhook] ❌ HMAC INVALID — ignoring', nri.pspReference);
          continue; // tampered / misconfigured: do not act on it
        }
      } else {
        console.warn('[webhook] ADYEN_HMAC_KEY not set — skipping signature check (DEV ONLY).');
      }

      const success = String(nri.success) === 'true';
      if (nri.eventCode === 'AUTHORISATION') {
        recordOrder(nri.merchantReference, {
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
        // TODO: on success, fulfill the order (idempotent on pspReference).
      } else {
        console.log(`[webhook] event ${nri.eventCode} for ${nri.merchantReference}`);
      }
    } catch (e) {
      console.error('[webhook] handler error:', e.message);
    }
  }

  // REQUIRED by Adyen so it marks the notification consumed.
  res.set('Content-Type', 'text/plain');
  res.send('[accepted]');
});

module.exports = router;
