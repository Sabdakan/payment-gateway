# How Sephora & JD Sports actually architect their systems

> Research synthesis (2026-07-12). Distinguishes **CONFIRMED** (sourced) from **INFERRED**
> (industry-standard deduction). The point of this doc: understand the *system architecture*
> behind these retailers and where your single-merchant Adyen build sits relative to it.

## The one big idea

Neither Sephora nor JD Sports "built a payment gateway," and neither runs a monolith any
more. Both converged on the **same modern shape**:

- a **headless / composable "MACH" commerce platform** (Microservices, API-first,
  Cloud-native SaaS, Headless) — both are **commercetools** customers, and
- a **payments layer that is a separate concern** riding on a full-stack processor
  (Sephora → **J.P. Morgan Payments**; JD Sports → **Adyen**), plus tokenization, fraud,
  OMS, settlement, and an event backbone.

The enterprise architecture is **not a different kind of system** from your build — it is
the *same conceptual flow* (`browser → app → PSP → webhook → order`) **decomposed along ~7
seams** so each seam can scale, fail over, and be swapped independently.

---

## Sephora — confirmed stack

| Layer | What they run | Confidence |
|---|---|---|
| Commerce platform | **commercetools** (MACH / composable), announced Jul 2022 | ✅ High (Sephora press + CTO) |
| Custom services | In-house **Java / Spring Boot microservices**, **REST + GraphQL**, **Kafka**, **Istio** service mesh, MySQL | ✅ High (job reqs) |
| Frontend | **React**; CDN **Akamai** (+ mPulse RUM) | ✅ High |
| Payments | **J.P. Morgan Payments** as a *consolidated* processor (250k txns/day, 99.8% auto-settle); **network-token** vaulting (Paze re-tokenized into Visa/MC network tokens); Tap-to-Pay, Apple Pay, **Paze**, Klarna | ✅ High |
| Cloud / data | **Google Cloud** (BigQuery, Vertex AI) via the LVMH↔Google partnership; Azure present in enterprise IT | ✅ High (GCP) |
| Search | **Constructor.io** (AI search/merchandising) | ✅ High |
| OMS / fulfillment | ship-from-store, BOPIS, cross-channel returns — **vendor not public** | ⚠️ Unconfirmed |
| Fraud | **not public** (plausibly J.P. Morgan Safetech) | ⚠️ Unconfirmed |

Notably Sephora leans on **J.P. Morgan as a single processor that owns the orchestration +
settlement**, rather than running its own multi-PSP router — a deliberate "let the bank do
the payments complexity so we focus on CX" choice.

## JD Sports — confirmed stack

| Layer | What they run | Confidence |
|---|---|---|
| Commerce platform | **commercetools** (US live now; UK/EU rollout **2026**), replacing a **Salesforce Commerce Cloud / Demandware** legacy; explicit **MACH** strategy | ✅ High |
| Search | **Algolia** AI search (composable) | ✅ High |
| OMS | **Fluent Commerce** distributed OMS (Ship-from-Store, Click & Collect, split fulfillment) | ✅ High |
| Payments | **Adyen** (online UK Apple Pay; US in-store on ~2,000 **Adyen** devices via **Jumpmind** POS); **Stripe** Agentic Commerce Suite for AI-channel checkout (Copilot/Gemini/ChatGPT) | ✅ High |
| Frontend | **Vue.js** + jQuery + Node; CDN **Akamai**; Contentsquare analytics | ✅ High (tech-detection) |
| BNPL | Broadest in UK fashion — US: Klarna, Zip, Afterpay, Sezzle; UK: Klarna, Clearpay | ✅ High |
| Per-region stacks | **Jesta Vision Suite** (Canada), **Aptos** merchandising (Finish Line US), **Shopify Plus** (SE Asia) | ✅ High |
| Cloud / fraud | not disclosed (GCP likely via commercetools; Adyen RevenueProtect likely) | ⚠️ Inferred |

JD is also the **first enterprise retailer** on commercetools + **Stripe** agentic checkout —
so their payment layer is *not* exclusively Adyen; it's method/channel-routed.

---

## The 7-layer reference architecture (and where your build sits)

| # | Layer | Enterprise (Sephora / JD class) | Your Node + Adyen build |
|---|---|---|---|
| 1 | Commerce platform | Headless/composable **MACH**, multi-vendor, a **BFF** (GraphQL) aggregating microservices | One app = the monolith (correct at your scale) |
| 2a | PSP / acquirer | **Multiple** PSPs + regional *local acquiring* for approval-rate/interchange | **One** full-stack PSP (Adyen) |
| 2b | **Payment orchestration** | A router **above** the PSPs: smart routing, least-cost routing, **failover/cascade**, cross-PSP retry (Gr4vy/Spreedly/Primer or in-house) | **None** — nothing to route between (correct) |
| 2c | Tokenization & vault | **Network tokens** (Visa VTS / MC MDES, EMVCo) — portable, survive card reissue; sometimes an independent merchant vault for PSP-portability | PSP tokens in **Adyen Vault**; Adyen auto-upgrades stored cards to **network tokens** → free auth-rate lift |
| 2d | 3-D Secure 2 / SCA | Tuned exemption strategy, A/B by market, liability shift | Adyen dynamic 3DS2 (toggle) |
| 2e | PCI scope | SAQ-D / full ROC; automated client-side script monitoring (PCI 4.0.1 §6.4.3/11.6.1) | **SAQ-A** via hosted Drop-in iframes |
| 3 | Fraud & risk | RevenueProtect **+** chargeback-guarantee vendor (Signifyd/Riskified/Forter) + dispute ops | PSP built-in risk (RevenueProtect/Radar), manual disputes |
| 4 | OMS / inventory | Distributed OMS (Fluent/Manhattan/Sterling), **auth-at-order → capture-at-ship**, multi-capture split shipments | Order table; auth→capture, watch the ~7-day auth-expiry window |
| 5 | Settlement / recon | Multi-PSP reconciliation, canonical ledger, exceptions team | One settlement file, one match job |
| 6 | Event backbone | Kafka/SQS, idempotent consumers, DLQ; **fulfill on webhook, not sync response** | **Same principles**: idempotent HMAC-verified webhook, `processed_events` key ✅ (implemented) |
| 7 | Wallets / BNPL + obs | Wallets & BNPL are *methods behind the orchestration layer*; Apple/Google Pay ride network-token rails; distributed tracing, QSA program | Wallets/BNPL = an Adyen config toggle; Sentry + Adyen dashboard |

**Takeaway:** everything in the enterprise column that you *don't* have — orchestration,
independent vault, distributed OMS, multi-PSP reconciliation — only earns its complexity
once you run *multiple PSPs, distributed inventory, and Level-1 volume*. You are correct to
collapse them. The two enterprise patterns that are **cheap, universal, and worth adopting
now**:
1. **Network tokenization** — let Adyen auto-provision network tokens on stored cards (free
   ~3% auth-rate lift, no integration). Turn it on when you add saved cards.
2. **Idempotent, signature-verified, "webhook-is-source-of-truth" events** — already done in
   this repo (`src/routes/webhooks.js`).

---

## If you ever grow toward the enterprise shape
The realistic ladder (each step only when the prior one hurts):
1. Add **saved cards** → enable Adyen Vault + network tokens.
2. Add a real **OMS**/DB and split auth/capture (capture on ship).
3. Add **wallets + BNPL** (Adyen toggles; the frontend is already wallet-first).
4. Only if you outgrow one PSP: add a **payment orchestration** layer (Gr4vy/Primer/Spreedly)
   and *then* multi-PSP reconciliation.
5. Go **headless/MACH** (commercetools/Medusa + a Next.js storefront) only when catalog/
   traffic/team size makes the monolith the bottleneck — exactly the trigger Sephora and JD hit.

## Sources
Sephora: newsroom.sephora.com (commercetools), uschamber.com (CTO re-platform),
jpmorgan.com (omnichannel payments, Tap-to-Pay), prnewswire.com (Paze network tokens),
constructor.com, cloud.google.com (LVMH/GCP), Sephora job reqs.
JD Sports: jdplc.com (agentic commerce), algolia.com + businesswire.com (Algolia),
fluentcommerce.com (OMS), adyen.com (Apple Pay), jumpmind.com + chainstoreage.com (US POS),
businesswire.com 2012 (Demandware legacy).
Reference architecture: docs.adyen.com (tokenization, network tokenization, risk),
machalliance.org, EMVCo/Stripe 3DS2, PCI SSC (4.0.1 §6.4.3/11.6.1), payment-orchestration
and multi-PSP reconciliation vendor docs (Gr4vy, Spreedly, Primer, NAYA).
