# Decision record — which payment stack

**Date:** 2026-07-12

## Context
New project: a **US-registered** company on a **Node.js** stack needs to accept
**Visa, Mastercard, American Express, and Discover** online, with a fast, embedded
checkout "like Sephora / JD Sports", and **without Stripe**.

## What the reference sites actually use
Neither built their own gateway — they ride a large processor:
- **Sephora → J.P. Morgan Payments** (Chase).
- **JD Sports → Adyen.**

The "fast" feel is the **front-end** (embedded fields, saved cards, Apple/Google Pay),
not a bespoke gateway. You cannot accept cards without *some* registered acquirer/PSP.

## Options considered
- **Revolut Merchant API** — rejected: not available to US-domiciled merchants, and no
  Discover support. (Would only work for a UK/EEA entity dropping Discover.)
- **Stripe** — excluded by request ("no Stripe").
- **Adyen** — CHOSEN. Serves the US, supports all four networks **including Discover**,
  has an embedded Drop-in + first-party Node SDK, and is literally JD Sports' processor.
- Braintree/PayPal, Checkout.com — viable alternatives with the same shape if Adyen
  onboarding is ever a blocker.

## Decision
**Adyen** is the acquirer/gateway. **Wise Business and/or Revolut Business** are the
settlement/treasury layer behind it (Adyen pays out to their US account details) — wired
as the final step once those accounts exist.

Full provider research and the card-coverage matrix: **[RESEARCH.md](RESEARCH.md)**
(note: RESEARCH.md's headline recommends Stripe on pure merit; we chose Adyen because
"no Stripe" is a hard requirement, and Adyen is the strongest non-Stripe option that
keeps US + Discover).
