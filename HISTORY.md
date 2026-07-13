# PaymentGateway — session history

## 2026-07-13 — Project created, Adyen gateway built, hardened, published, architecture researched

**Headline:** New standalone project `D:\ClaudeData\PaymentGateway` — a self-hosted card-acceptance
gateway for a **US-registered** company on **Node.js**, built on **Adyen** (embedded Drop-in), with
**Wise/Revolut Business** as the settlement (payout) layer. Public repo live, hardened, and pushed.

### What was built
- Node/Express backend + **Adyen** integration (sessions flow): `POST /api/sessions`
  (`checkout.PaymentsApi.sessions`), HMAC-verified `POST /api/webhooks` returning `[accepted]`,
  `GET /api/config`, `/health`, dev-only `/orders`.
- Embedded **Adyen Web Drop-in** frontend bundled locally with **esbuild** (no CDN guesswork):
  wallet-first (Apple Pay / Google Pay express buttons via `instantPaymentTypes`), loading skeleton,
  order summary from server amount, accessible status, 3-way result page.
- `.env.example`, hardened `.gitignore` (blocks `.env`/keys/bundle), README, docs.
- Deps: `@adyen/api-library@31`, `@adyen/adyen-web@6.40`, `esbuild@0.28`, `express`, `helmet`,
  `express-rate-limit`. Node engines `>=20`.
- Verified: `npm install` + esbuild build + boot tests all pass; `/api/sessions` reaches Adyen and
  returns 401 without keys (SDK wired correctly); webhook idempotency + helmet headers confirmed.

### Commits shipped (public repo github.com/Sabdakan/payment-gateway, branch main)
- `78d97f9` — Initial commit: Adyen-based embedded payment gateway (Node.js)
- `86f4ff1` — Harden security + wallet-first checkout UX (audit fixes): webhook **fails closed**
  (401 on invalid HMAC, refuses boot in prod without key), idempotency on `pspReference:eventCode`,
  rate-limit `/api/sessions`, helmet, same-origin guard, UUID order refs, generic prod errors,
  dev-only `/orders`, memory-capped store; wallet-first UX, skeleton, parallel fetch, `channel`+`lineItems`.
- `9a0dba7` — docs: how Sephora & JD Sports architect their commerce + payments systems (RETAILER-ARCHITECTURE.md)
- **Repo HEAD = 9a0dba7, PUSHED, clean, no secrets tracked (only `.env.example`).**

### Key decisions
- **NO Stripe** (Al's hard rule). Chosen acquirer = **Adyen** (US-eligible, supports Discover, same
  processor as JD Sports). Discover is the binding constraint that ruled out Revolut-as-acquirer.
- **Wise ≠ payment gateway** — no card acquiring; settlement/treasury only. **Revolut Merchant API**
  ruled out (not available to US entities + no Discover).
- **Stay single-merchant Adyen** — no migration to composable/commercetools (growth ladder saved in
  docs/RETAILER-ARCHITECTURE.md).
- **Fundamental reality clarified for Al:** no software can charge a card without a licensed acquirer;
  card commissions (~2–3%) are structural (interchange to card networks + scheme fees), not the
  gateway's margin, and cannot be removed by "building your own." Wise/Revolut connect only as the
  **payout destination**.

### Reference-system research (what the big retailers actually run)
- **Sephora → J.P. Morgan Payments** (consolidated processor, network-token vaulting incl. Paze) on
  **commercetools** (MACH) + in-house Java/Spring microservices + GraphQL + React + Akamai + Google
  Cloud + Constructor.io search.
- **JD Sports → Adyen** (online + US in-store via Jumpmind) on **commercetools** (US live, UK/EU 2026,
  replacing Salesforce Commerce Cloud/Demandware) + Algolia + Fluent Commerce OMS + Vue.js; Stripe for
  agentic/AI-channel checkout.
- Both use commercial building blocks (commercetools, Adyen, Algolia, Fluent) — nothing to "clone";
  same vendors are licensable by anyone.

### Outstanding work + NEXT ACTION
- **NEXT ACTION (Al's last decision, 2026-07-13):** Al chose **"Both: cards + a cheap bank-transfer
  option."** → Build a **Pay-by-Bank / open-banking (bank transfer)** checkout path ALONGSIDE the
  Adyen card flow, settling directly into Wise/Revolut (~0% fees, no card networks). NOT yet started.
  (Adyen supports Pay by Bank / open banking as a payment method; can also be a direct bank-transfer
  instruction to the Wise/Revolut account details.)
- Al's manual steps (cannot be done for him): (1) create a FREE Adyen **test** account at
  `ca-test.adyen.com`, put 4 values in `.env` (API key, merchant account, client key, HMAC key) —
  test mode is $0/no commission; (2) add his friend as a GitHub collaborator himself (I can't modify
  repo permissions); (3) add allowed origin `http://localhost:4242` on the Adyen API credential.
- Offered but not yet built: a no-account **mock mode** so Al can develop with zero signups.

### Docs on disk
- `README.md` (setup, test cards, webhook + payout wiring, go-live checklist)
- `docs/DECISION.md` (why Adyen), `docs/RESEARCH.md` (provider comparison),
  `docs/RETAILER-ARCHITECTURE.md` (Sephora/JD architecture + 7-layer reference), `HISTORY.md` (this file)
