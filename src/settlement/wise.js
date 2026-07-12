'use strict';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SETTLEMENT / TREASURY LAYER — Wise Business (or Revolut Business)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  This is NOT part of accepting the card. Wise/Revolut cannot charge cards.
 *  Money reaches them like this:
 *
 *     Customer card ──▶ Adyen (acquirer, holds balance) ──payout──▶ Wise/Revolut USD account
 *
 *  ONE-TIME WIRING (this is your LAST step, once the accounts exist — no code needed):
 *    1. In Wise Business (or Revolut Business US), open a USD balance and copy its
 *       US "account details" (ACH routing number + account number).
 *    2. In the Adyen Customer Area, add that bank account as your payout /
 *       settlement bank account for the merchant account.
 *    3. Adyen settles your captured funds into Wise/Revolut on your payout schedule.
 *    4. Hold multi-currency there and convert near mid-market / pay out globally.
 *
 *  The functions below are OPTIONAL treasury automation via the Wise API
 *  (docs.wise.com). They only move money ALREADY in your Wise balance — never
 *  cards. Left as stubs; moving funds out of Wise requires Wise SCA (a request
 *  signed with your private key).
 */

const WISE_BASE = process.env.WISE_API_TOKEN
  ? 'https://api.transferwise.com' // production
  : 'https://api.sandbox.transferwise.tech'; // sandbox

async function getBalances(/* profileId */) {
  throw new Error('Not implemented — treasury stub. See docs.wise.com/api-docs/api-reference/balance');
}

async function createQuoteAndConvert(/* { sourceCurrency, targetCurrency, amount } */) {
  throw new Error('Not implemented — treasury stub. Moving funds requires Wise SCA (signed request).');
}

module.exports = { WISE_BASE, getBalances, createQuoteAndConvert };
