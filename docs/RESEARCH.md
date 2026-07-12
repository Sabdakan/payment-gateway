# Payment Architecture for a US Node.js Company: Accepting Visa, Mastercard, Amex & Discover, Settling into Wise / Revolut Business

**Audience:** US-registered company owner, Node.js backend, must accept Visa, Mastercard, American Express, **and Discover** online, originally asking how to connect "Wise Business or Revolut Business" via API.

---

## 1. TL;DR & Recommendation

**Use Stripe as your PRIMARY payment gateway / card acquirer.** It is the only provider in your candidate set that is (a) fully available to a US-registered company, (b) accepts **all four required networks including Discover**, (c) carries the PCI-DSS Level 1 burden so your Node server never touches a card number, (d) runs 3-D Secure / SCA automatically, and (e) ships a first-party Node SDK with signed webhooks.

Two corrections to the original question, stated plainly:

- **Wise Business = settlement / treasury only. It cannot charge cards.** Wise is a multi-currency e-money account you *receive money into* (via ACH, domestic wire, or SWIFT) and *convert/pay out from* at near mid-market rates. It has no card-acquiring product — there is no way to run a Visa/Mastercard/Amex/Discover authorization "into" a Wise account. It sits **after** settlement, never at the point of sale.

- **Revolut is the nuance, and for a US entity it is still not your acquirer.** Revolut genuinely has a real card-acquiring product — the **Merchant API** — which is separate from its Business banking/payments API. But two hard facts rule it out here: (1) **Merchant-account eligibility excludes the United States.** A US company can open a Revolut *Business* (banking) account in all 50 states, but that does *not* unlock acquiring; the Merchant account requires a Business account domiciled in one of 32 listed UK/EEA/APAC countries, and the US is not on that list (verified against Revolut's own eligibility page, high confidence). (2) **Revolut does not support Discover** on any product. So even a workaround via a foreign entity would still fail your Discover requirement.

**The binding constraint is Discover.** It is the single requirement that eliminates Revolut outright and forces the choice toward the major full-network acquirers (Stripe, Braintree, Checkout.com, Adyen). Stripe is the recommended default; the architecture below is identical if you later pick another of those.

**Recommended stack:**

| Layer | Product | Role |
|---|---|---|
| Card acquiring / gateway / PCI / 3DS | **Stripe** (Checkout or Payment Element) | Accepts Visa/MC/Amex/**Discover**; tokenizes the card; runs SCA; holds PCI burden; settles funds; emits webhooks |
| App / orchestration | **Node.js + official `stripe` SDK** | Creates PaymentIntents/Checkout Sessions, verifies webhooks, records orders, reconciles |
| Settlement / treasury / FX | **Wise Business** and/or **Revolut Business** | Receives Stripe's USD payout via ACH into US account details; holds multi-currency; converts near mid-market; pays out globally |

---

## 2. The Core Correction: Acquirer vs. Settlement Layer

The original question conflates two distinct financial functions. Keeping them separate is the whole mental model.

### Layer A — Card acquiring / gateway (this is what actually "accepts a card")

Pulling money off a Visa/Mastercard/Amex/Discover card is a **regulated card-network function**. To do it you must be — or ride on top of — a **registered acquirer / payment facilitator** that has:

- Direct membership or sponsorship on the *acquiring* side of each card network,
- A **Merchant ID (MID)**, network licensing, scheme-fee handling, and chargeback/dispute machinery,
- **PCI-DSS Level 1** certified infrastructure that is allowed to touch the raw card number (PAN).

Stripe (and Braintree, Checkout.com, Adyen, and Revolut's Merchant product) are this layer. This layer authorizes, captures, and **settles** the transaction, then holds a balance for you and pays it out on a schedule.

### Layer B — Settlement / treasury / FX (where the money lands and gets moved)

Wise Business and Revolut Business are **e-money / banking-style accounts**. They excel at *receiving* an incoming bank transfer, *holding* many currencies in one place, *converting* at near mid-market rates, and *paying out* globally. They are the **destination** for the acquirer's payout — not the thing that accepts the card.

### Why Wise/Revolut can't be the acquiring layer

- **Wise has no card-acquiring product at all.** It is reached by ACH bank debit, domestic wire, or SWIFT. There is no merchant card-authorization path into it.
- **Revolut *does* have an acquirer (Merchant API), but it's a different product from the Business API, it excludes US-domiciled merchants, and it doesn't do Discover.** The Business API handles outgoing payments, accounts, counterparties, and FX — not card acceptance.
- **You *want* the PCI Level 1 obligation to live with the acquirer**, not with a bank account never designed to hold card data.

**The handoff between the two layers is a single, deliberately boring coupling point: a plain USD ACH deposit** from the acquirer into the US account details Wise/Revolut give you.

---

## 3. Provider-by-Provider Findings

### 3.1 Revolut Business — Merchant API (the user's original candidate for acquiring)

- **Role:** Payment gateway + merchant acquirer (regulated EMI), *not* merchant-of-record. Acquiring runs through a Merchant account that is a sub-account of a Revolut *Business* account; funds settle into "Pockets" you sweep to the Business account.
- **US eligibility: NO (for acquiring).** *Confirmed, high confidence.* A US company can open a Revolut **Business (banking)** account (live in all 50 states), but the **Merchant account** — the thing that unlocks the Merchant API and online card acceptance — requires a Business account domiciled in one of 32 countries: Australia, Austria, Belgium, Bulgaria, Croatia, Cyprus, Czech Republic, Denmark, Estonia, Finland, France, Germany, Greece, Hungary, Iceland, Ireland, Italy, Latvia, Lithuania, Luxembourg, Malta, Netherlands, Norway, Poland, Portugal, Romania, Slovakia, Slovenia, Singapore, Spain, Sweden, and the UK. **The US is not listed.** Corroborating signal: the en-US help center's "Getting started with a Merchant account" section is a near-empty shell whose only article is "I was denied a Merchant account, can I appeal?" *Residual unknown (honest):* a private/invite-only US acquiring pilot cannot be positively disproven from public docs — treat as undocumented, not confirmed-absent. Confirm in-app if you want certainty.
- **Card coverage:** Visa ✅, Mastercard ✅, Amex ✅ (online; excluded only on the in-person Revolut Reader, and separately/higher-priced), **Discover ❌.** *Discover is confirmed unsupported by absence* — it appears nowhere on Revolut's accepted-networks list (which names only Visa, Mastercard, Amex, and Maestro). No affirmative "Discover not supported" statement exists; the absence is the evidence.
- **API model:** Order-based REST Merchant API. `POST /api/orders` (amount + currency) → returns order with `id`, `token`, and a hosted `checkout_url` → then `/capture`, `/cancel`, `/refund`, plus customers, subscriptions, payouts, disputes, webhooks. Auth via `Authorization: Bearer <secret_api_key>` server-side; a required dated `Revolut-Api-Version` header.
- **Node support:** **Client-side SDK only** — `@revolut/checkout` on npm (Apache-2.0, TypeScript, browser widget loader for card field / hosted checkout / Apple Pay / Google Pay / Revolut Pay). **No official server-side Node SDK** — order/capture/refund/webhook calls are hand-rolled REST with the Bearer secret key.
- **Sandbox:** Yes. Separate Sandbox account + Sandbox keys; base host `https://sandbox-merchant.revolut.com`. Test cards: Visa `4929420573595709`, Mastercard `5281438801804148` (success); several error-path cards. **No Amex/Discover test cards provided.**
- **Fees:** UK/GBP-centric — online from **1% + £0.20** (UK Visa/MC consumer), UK Amex 1.7% + £0.20, non-UK/commercial 2.8% + £0.20. **No US price list exists** because US acquiring isn't offered.
- **PCI scope:** Marketed as a "PCI-compliant solution"; hosted checkout / iframe card field means the merchant sees only last-4. **No explicit SAQ level is assigned** by Revolut — you self-determine it (plausibly SAQ-A for both the hosted page and the vendor iframe; the researcher's earlier "iframe = SAQ-A-EP" guess is *corrected* — a fully outsourced iframe posting directly to a compliant vendor is generally SAQ-A-eligible).
- **Verdict:** Deal-breaker on two independent grounds for this use case — **not available to a US entity for acquiring, and no Discover.**

### 3.2 Stripe — RECOMMENDED PRIMARY

- **Role:** Payment processor / acquirer + settlement. In a standard direct integration **you are the merchant of record**; Stripe authorizes, captures, and settles into your Stripe balance, then pays out to your bank. (Not a merchant-of-record reseller like Paddle — Stripe does not resell your product or assume your sales-tax liability.)
- **US eligibility: YES, fully.** Requires a US legal entity (or SSN/EIN for sole prop), US business address, and US bank account for payouts. KYC collects EIN/legal name, a representative's details, and the payout bank account before payouts are enabled. Test/sandbox accounts work without real identity verification.
- **Card coverage:** Visa ✅, Mastercard ✅, Amex ✅, **Discover ✅** (plus Diners/JCB/UnionPay on a US account). **This is the decisive advantage — full four-network coverage including the binding Discover requirement.**
- **API model:** All paths sit on the **PaymentIntents** API. (1) **Stripe Checkout** — Stripe-hosted redirect/embeddable page, least code, SAQ-A. (2) **Payment Element / Elements** — card inputs rendered inside Stripe-origin iframes on your page, SAQ-A. (3) **PaymentIntents + custom UI** — lower-level. **Recommended:** server-side create a Checkout Session (or PaymentIntent) with the `stripe` Node SDK, render Checkout or the Payment Element client-side, confirm/fulfill via webhooks. Payment Links also available (no-code).
- **Node support:** First-party npm package **`stripe`**. Webhook signature verification via `stripe.webhooks.constructEvent(rawBody, sigHeader, endpointSecret)` — **must use the RAW body** (do not JSON-parse first) and the `whsec_...` signing secret; the `Stripe-Signature` header carries `t=` timestamp + `v1=` HMAC-SHA256 with a default 5-minute replay tolerance. Idempotency keys passed as `{ idempotencyKey: '<uuid-v4>' }` on POSTs.
- **Sandbox:** Yes — full test mode with test cards for every network and 3DS path (see §7).
- **Fees:** Standard US online pricing is transparent/published (commonly ~2.9% + $0.30 for domestic cards; Amex parity; confirm current rate card at integration time). No monthly minimum on standard.
- **PCI scope:** **SAQ-A** when using Checkout/Payment Links (full redirect) or Elements/Payment Element (Stripe-origin iframes). Stripe returns only card brand, last-4, and expiry — data that "isn't subject to PCI compliance." Stripe assists with the PCI validation form in the Dashboard.
- **Verdict:** Best fit. Meets every hard requirement; simplest PCI path; strongest Node story.

### 3.3 Wise Business — settlement/treasury, NOT an acquirer

- **Role:** Multi-currency e-money account. **Cannot accept card payments as a merchant.**
- **US eligibility:** Yes as an *account* — a US company can hold a Wise Business account and receive USD via issued US ACH/wire account details.
- **Card coverage:** **None as an acquirer** — N/A across all networks.
- **API model:** Wise has a Transfers/Balances API for *moving* money (payouts, FX, balance management), reached via ACH/wire/SWIFT — not a card-acceptance API.
- **Role in your architecture:** The **destination** for Stripe's USD payout; holds/convert/pays out globally at near mid-market rates. Excellent treasury layer, zero acquiring capability.

### 3.4 Alternatives (all full four-network, all US-eligible, all viable second quotes)

- **Braintree (a PayPal service):** US-eligible; **Visa/MC/Amex/Discover ✅** plus PayPal/Venmo; official `braintree` Node SDK; hosted fields / Drop-in UI keep you at SAQ-A; sandbox with per-network test cards. Strong, mature alternative; you become merchant of record. Good if you also want native PayPal/Venmo.
- **Checkout.com:** US-eligible enterprise acquirer; **all four networks ✅**; official Node SDK; Frames.js hosted iframe fields for SAQ-A; robust 3DS. Aimed at higher-volume/negotiated pricing — more onboarding friction than Stripe for a small company.
- **Adyen:** US-eligible enterprise acquirer/processor; **all four networks ✅**; official Node library; Web Components (Drop-in/Components) for reduced PCI scope; excellent for scale and unified global acquiring. Heavier onboarding; best when volume justifies it.
- **Paddle (merchant-of-record):** Different model — **Paddle becomes the seller of record and handles global sales tax/VAT for you.** US-eligible, accepts all four networks. Trade-off: you outsource tax/compliance and checkout, but give up direct control and pay a higher effective rate; payouts arrive as periodic MoR remittances (which can still land in Wise/Revolut). Consider only if you want tax handled for you rather than a direct acquirer.

---

## 4. Card Coverage Matrix

| Provider | Visa | Mastercard | Amex | Discover | US-eligible | Node SDK |
|---|---|---|---|---|---|---|
| **Stripe** (recommended) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ official `stripe` (server) |
| **Braintree / PayPal** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ official `braintree` |
| **Checkout.com** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ official SDK |
| **Adyen** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ official SDK |
| **Paddle** (merchant-of-record) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (MoR; Node/REST) |
| **Revolut Merchant API** | ✅ | ✅ | ✅ (online only) | ❌ | ❌ (Merchant acct excludes US) | ⚠️ client-side `@revolut/checkout` only |
| **Wise Business** | ❌ | ❌ | ❌ | ❌ | ✅ (as an account, not acquiring) | ⚠️ transfers API only (no acquiring) |

**Reading the matrix:** the Discover column and the US-eligible column together eliminate Revolut. Wise is on the table only as a settlement destination. Every remaining acquirer covers all four networks.

---

## 5. Recommended Architecture

Acquirer (Stripe) charges the card, carries PCI/3DS, settles USD, and pays out to the US ACH details issued by Wise/Revolut, which then serve as the treasury/FX layer.

```
                         BROWSER (customer)
                               │
             card data entered in Stripe-hosted
             page / Stripe-origin iframe (PAN never
             touches your server)
                               │  PAN ──────────────► Stripe (PCI L1)
                               │
                               ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  LAYER A — ACQUIRER: STRIPE                                    │
   │  • Authorize / capture Visa · MC · Amex · Discover            │
   │  • 3-D Secure / SCA challenge (auto)                          │
   │  • Fraud (Radar), disputes, chargebacks                      │
   │  • Holds USD balance → scheduled payout                      │
   └──────────────────────────────────────────────────────────────┘
        │  (1) tokens only: pm_… / pi_…            ▲
        │      + webhook events                    │  create PaymentIntent /
        ▼                                          │  Checkout Session (server SDK)
   ┌──────────────────────────────────────────────────────────────┐
   │  YOUR NODE.js APP                                              │
   │  • POST /create-checkout  → Stripe Checkout Session/PI        │
   │  • POST /webhook (raw body, verified) → fulfill order         │
   │  • Orders DB, reconciliation, idempotency                    │
   │  • NEVER sees a raw PAN                                        │
   └──────────────────────────────────────────────────────────────┘
                               │
              (2) Stripe USD payout via ACH  ── the ONE coupling point
                               │
                               ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  LAYER B — TREASURY / FX: WISE BUSINESS and/or REVOLUT BIZ     │
   │  • Receives payout into issued US ACH/wire account details   │
   │  • Holds USD + 30+ currencies                                │
   │  • Converts near mid-market; pays suppliers/staff globally   │
   │  • NOT an acquirer — never touches the card                  │
   └──────────────────────────────────────────────────────────────┘
```

**Coupling point:** in the Stripe Dashboard (or via API), set the external payout bank account to the **US ACH account & routing numbers Wise Business (or Revolut Business US) issue you.** Stripe then pays USD to Wise/Revolut on its normal rolling schedule (~2 business days for US). Everything downstream (holding, FX, global payouts) is Wise/Revolut's job.

---

## 6. PCI / SCA / Webhook Security Essentials

### PCI-DSS scope — stay SAQ-A
- **The raw PAN must never hit your Node server, logs, or database.** If it does, you fall into SAQ-D (300+ controls). Design goal: card data stays inside Stripe-hosted pages / Stripe-origin iframes; your server sees only tokens (`pm_…`, `pi_…`) and non-sensitive metadata (brand, last4, exp).
- **Use Stripe Checkout / Payment Links** (full redirect, cleanest SAQ-A) **or Payment Element / Elements** (Stripe-origin iframes). Both qualify you for SAQ-A and Stripe pre-fills your PCI validation form.
- **PCI DSS v4.0.1 caveat for embedded fields:** even SAQ-A now includes payment-page integrity controls — **Req 6.4.3** (authorize/inventory every script on the payment page) and **Req 11.6.1** (change-detection on the payment page/HTTP headers) to defend against Magecart-style skimming. Full-redirect Checkout sidesteps most of this; if you embed Elements, budget for script-integrity controls.
- **Node implication:** your only card-touching server code is `stripe.paymentIntents.create(...)` / `stripe.checkout.sessions.create(...)` with a token — you never receive `card[number]`. Add a CI/lint rule and log scrubber that fail the build on any 13–19 digit PAN-like pattern.

### 3-D Secure / SCA — when it fires, who handles it
- **EU/EEA/UK:** SCA is **mandatory** under PSD2 when issuer + acquirer are both in the region; 3DS is the primary way to satisfy it. Expect frequent challenges unless an exemption applies.
- **US:** **No SCA mandate.** 3DS is optional and risk-based — used selectively to fight fraud and gain the **liability shift**. US issuer 3DS2 support is uneven, so blanket-forcing 3DS on US cards can cost conversion.
- **Let the acquirer handle it.** Use PaymentIntents with automatic authentication. Stripe decides per-transaction; the PaymentIntent returns `requires_action` + `next_action`, and `stripe.confirmPayment()` / `stripe.handleNextAction()` render the challenge client-side. Learn the **final** result from the webhook, not the browser. Request 3DS explicitly (`payment_method_options.card.request_three_d_secure = 'any'`) when you want the liability shift; otherwise leave it `automatic`. Force it for EEA cards, keep it risk-based for US cards.

### Webhook security & idempotency — the webhook is the source of truth
- **Verify every event.** Use the RAW request body with `stripe.webhooks.constructEvent(rawBody, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET)`; reject on failure with HTTP 400. In Express, mount `express.raw({ type: 'application/json' })` on the webhook route only (do NOT let a global JSON body-parser consume it first).
- **Idempotency:** webhooks can be delivered more than once — key fulfillment on the Stripe event `id` (or the PaymentIntent id) and make the handler idempotent (upsert, not blind insert). Pass an `idempotencyKey` on the create call to make retries safe.
- **Async settlement:** treat the browser response as a hint; only mark orders paid/fulfilled on `checkout.session.completed` / `payment_intent.succeeded`. Reconcile Stripe payouts against Wise/Revolut incoming ACH by payout id for a clean audit trail.
- **Return fast:** acknowledge the webhook with 2xx quickly and do heavy work async, or Stripe will retry.

---

## 7. Implementation Plan — Node.js Sandbox Scaffold (Stripe primary)

A minimal, runnable test-mode scaffold. Primary integration = Stripe Checkout (hosted, SAQ-A). Secondary = a stubbed Wise payout-destination note and an optional Revolut sandbox stub, clearly marked non-US for acquiring.

### Files
- `package.json` — deps: `stripe`, `express`, `dotenv`.
- `.env.example` — env var template (below).
- `src/server.js` — Express app; JSON parser for normal routes, **raw** parser for the webhook route; mounts routers.
- `src/config/stripe.js` — instantiates `new Stripe(process.env.STRIPE_SECRET_KEY)`.
- `src/routes/checkout.js` — `POST /create-checkout` → creates a Checkout Session (line items, success/cancel URLs) and returns the session URL/id.
- `src/routes/webhook.js` — `POST /webhook` → `constructEvent` on raw body, handles `checkout.session.completed` / `payment_intent.succeeded` / `payment_intent.payment_failed`, idempotent fulfillment.
- `public/checkout.html` — a "Pay" button that calls `/create-checkout` and redirects to the returned Stripe URL.
- `src/settlement/wise.js` — **stub/comment file** documenting how Stripe's payout destination is set to Wise/Revolut US ACH details (no card logic; treasury only).
- `src/integrations/revolut.sandbox.js` — **optional stub** showing the Revolut Orders REST shape (`POST /api/orders` → `checkout_url`) against `sandbox-merchant.revolut.com`, with a prominent comment: *not available to US-domiciled acquiring; no Discover; for reference only.*
- `README.md` — run steps, test cards, how to point Stripe payout at Wise/Revolut.

### Endpoints
- `POST /create-checkout` — body: amount, currency, product; returns `{ url, id }` for redirect to Stripe-hosted Checkout.
- `POST /webhook` — Stripe events; raw body + signature verification; idempotent order fulfillment.
- (optional) `GET /` — serves `public/checkout.html`.

### Env vars
- `STRIPE_SECRET_KEY` (`sk_test_...`)
- `STRIPE_PUBLISHABLE_KEY` (`pk_test_...`)
- `STRIPE_WEBHOOK_SECRET` (`whsec_...`)
- `PORT` (e.g. 4242)
- `DOMAIN` (for success/cancel URLs, e.g. http://localhost:4242)
- `CURRENCY` (e.g. usd)
- `WISE_API_TOKEN` (optional, treasury stub)
- `WISE_PROFILE_ID` (optional, treasury stub)
- `REVOLUT_SANDBOX_SECRET_KEY` (optional, reference stub only)

### Test cards (Stripe test mode — all four networks + 3DS)
- Visa success: `4242 4242 4242 4242`
- Mastercard success: `5555 5555 5555 4444`
- Amex success: `3782 822463 10005`
- **Discover success: `6011 1111 1111 1117`** (the network that decided the whole choice)
- 3DS authentication required: `4000 0025 0000 3155`
- Declined (generic): `4000 0000 0000 0002`
- Insufficient funds: `4000 0000 0000 9995`
- Any future expiry, any CVV, any postal code.

*Revolut sandbox reference (not usable for US acquiring, no Discover):* Visa `4929420573595709`, Mastercard `5281438801804148`.

### Local webhook testing
Use the Stripe CLI: `stripe listen --forward-to localhost:4242/webhook` (prints the `whsec_...` to use as `STRIPE_WEBHOOK_SECRET`), then `stripe trigger payment_intent.succeeded`.

---

## 8. Go-Live Checklist

1. **Legal/KYC:** US entity registered; EIN in hand; Stripe account verified (legal name, representative, business address).
2. **Payout destination set:** Stripe external account = US ACH/routing numbers issued by Wise Business (and/or Revolut Business US). Send a $1 test payout and confirm it lands in Wise/Revolut.
3. **Networks enabled:** confirm Visa, MC, Amex, **and Discover** are all active on the live account (Amex/Discover are sometimes surfaced separately in Dashboard settings).
4. **Swap to live keys:** `sk_live_`/`pk_live_`; create a **live** webhook endpoint and use its `whsec_` secret (test and live secrets differ).
5. **Webhook hardening:** signature verification on raw body; idempotent handler keyed on event id; endpoint returns 2xx fast; retries handled.
6. **PCI attestation:** complete the SAQ-A questionnaire in the Stripe Dashboard; if using embedded Elements, implement v4.0.1 Req 6.4.3 / 11.6.1 script-integrity controls; schedule any required ASV scans of your public site.
7. **3DS policy:** force 3DS for EEA/UK cards (SCA), risk-based for US cards; verify the challenge flow end-to-end with `4000 0025 0000 3155`.
8. **Reconciliation:** map Stripe payout ids → Wise/Revolut incoming ACH; automate a daily match.
9. **Ops:** enable Radar rules; set up dispute/chargeback alerts; confirm refund flow; log/monitor failed webhooks; add the PAN-pattern log scrubber + CI rule.
10. **Fees confirmed:** verify current Stripe US rate card (incl. Amex) and Wise/Revolut FX/receive fees for your currencies.
11. **Fallback documented:** note Braintree/Checkout.com/Adyen as pre-vetted secondary acquirers (all four-network) in case of onboarding or pricing issues.

---

## 9. Sources

**Revolut (acquiring eligibility, cards, API, Node SDK, sandbox, fees, PCI):**
- https://help.revolut.com/business/help/merchant-accounts/setting-up-a-merchant-account/who-can-apply-for-a-merchant-account/
- https://help.revolut.com/en-US/business/help/merchant-accounts/
- https://help.revolut.com/en-US/business/help/merchant-accounts/setting-up-a-merchant-account/
- https://www.revolut.com/business/open-account-online/us-business-account/
- https://help.revolut.com/business/help/merchant-accounts/payments/in-which-currencies-can-i-accept-payments/
- https://developer.revolut.com/docs/guides/merchant/get-started
- https://developer.revolut.com/docs/api/merchant
- https://developer.revolut.com/docs/guides/accept-payments/get-started/apply-for-a-merchant-account
- https://developer.revolut.com/docs/guides/merchant/test-and-go-live/testing/test-cards
- https://developer.revolut.com/docs/guides/merchant/test-and-go-live/set-up-sandbox
- https://developer.revolut.com/docs/sdks/merchant-web-sdk/introduction
- https://developer.revolut.com/docs/sdks/merchant-web-sdk/payment-methods/card-field
- https://www.npmjs.com/package/@revolut/checkout
- https://help.revolut.com/business/help/merchant-accounts/fees/how-much-does-it-cost-to-accept-card-payments/
- https://help.revolut.com/en-IE/business/help/merchant-accounts/payments/are-merchant-accounts-pci-compliant
- https://www.revolut.com/business/blog/post/american-express-acceptance/
- https://developer.revolut.com/docs/business/business-api
- https://developer.revolut.com/docs/guides/accept-payments/online-payments/hosted-checkout-page/api

**Stripe (Node SDK, testing, security/PCI, payouts):**
- https://www.npmjs.com/package/stripe
- https://docs.stripe.com/testing
- https://docs.stripe.com/security
- https://docs.stripe.com/security/guide
- https://docs.stripe.com/payouts
- https://stripe.com/guides/pci-compliance

**Wise (settlement / receiving USD):**
- https://wise.com/help/articles/2827506/how-do-i-receive-money-with-my-usd-account-details

**PCI SSC (SAQ / v4.0.1):**
- https://www.pcisecuritystandards.org/document_library/

---

*Honest caveats restated: (1) **Discover is the binding constraint** — it eliminates Revolut and steers you to a full-network acquirer. (2) **Revolut's Merchant API is not available to a US-domiciled entity**, and Revolut supports no Discover, so it fails your requirements on two independent counts; a US-only residual unknown (a possible undocumented invite-only US pilot) can't be positively disproven but has no public evidence. (3) **Wise cannot accept cards** at all — treasury only.*