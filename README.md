# PaymentGateway

A runnable **card-acceptance gateway** for a **US company** on **Node.js**, accepting
**Visa, Mastercard, American Express, and Discover** through an **embedded Adyen Drop-in**
checkout (no redirect — the same processor JD Sports uses), with **Wise / Revolut Business**
as the settlement account behind it.

> Why Adyen and not Stripe/Revolut: **[docs/DECISION.md](docs/DECISION.md)**.
> Full provider research + card matrix: **[docs/RESEARCH.md](docs/RESEARCH.md)**.

---

## Architecture: acquirer ≠ settlement

```
   Customer's card (Visa/MC/Amex/Discover, Apple/Google Pay)
        │
        ▼
┌──────────────────────┐   embedded Drop-in, authorizes + captures + settles,
│   Adyen (ACQUIRER)   │   holds PCI burden, runs 3-D Secure, sends webhooks
└─────────┬────────────┘
          │ payout (USD)  ← the single coupling point (a Dashboard setting)
          ▼
┌──────────────────────────────┐  receives the payout, holds multi-currency,
│ Wise / Revolut Business       │  converts near mid-market, pays out globally
│ (SETTLEMENT / TREASURY)       │
└──────────────────────────────┘
```

You can't pull money off a card without a registered acquirer/PSP — Adyen is that layer.
Wise/Revolut only *receive* the payout; they can't charge cards. Wiring them is the **last**
step (see below), and needs no code.

---

## Quick start

```bash
npm install          # installs server SDK + bundles the Adyen Drop-in frontend
cp .env.example .env # then paste your Adyen TEST credentials (see below)
npm start            # -> http://localhost:4242
```

`npm start` runs the client bundler first (`npm run build`) automatically, then boots the
server. It **boots without keys** (for a smoke test), but the Drop-in needs real TEST
credentials to render.

### Get Adyen TEST credentials (free test account)

From the Adyen **test** Customer Area (`https://ca-test.adyen.com`) put these in `.env`:

| `.env` var | Where in the Customer Area |
|---|---|
| `ADYEN_API_KEY` | Developers → API credentials → your ws user → **API key** |
| `ADYEN_MERCHANT_ACCOUNT` | your merchant account name (e.g. `YourCoECOM`) |
| `ADYEN_CLIENT_KEY` | Developers → API credentials → **Client key** (browser-safe) |
| `ADYEN_HMAC_KEY` | Developers → Webhooks → add a **Standard webhook** → Generate HMAC key |

Also add your app origin (`http://localhost:4242`) under the API credential's **Allowed
origins**, or the browser Drop-in won't initialize.

### Test cards (Adyen test mode)

| Network | Number | Exp | CVC |
|---|---|---|---|
| Visa | `4111 1111 4555 1142` | 03/30 | 737 |
| Mastercard | `5555 3412 4444 1115` | 03/30 | 737 |
| American Express | `3700 0000 0000 002` | 03/30 | 7373 |
| **Discover** | `6011 1111 1111 1117` | 03/30 | 737 |

Full list: <https://docs.adyen.com/development-resources/testing/test-card-numbers/>

### Webhooks (the source of truth for "did they pay?")

Adyen doesn't have a Stripe-CLI equivalent. Two ways to test the `AUTHORISATION` webhook
hitting `POST /api/webhooks`:

1. **Send test notification** button on your webhook in the Customer Area, or
2. Expose your local server with a tunnel and point the webhook URL at it:
   ```bash
   npx cloudflared tunnel --url http://localhost:4242   # or: ngrok http 4242
   # set the webhook URL to  https://<tunnel>/api/webhooks  in the Customer Area
   ```

Watch the server log for `✅ AUTHORISATION …` and see the order flip at
[http://localhost:4242/orders](http://localhost:4242/orders).

---

## Wiring the money into Wise / Revolut (your last step)

No code — a Customer Area setting:

1. In **Wise Business** (or **Revolut Business US**), open a **USD balance** and copy its
   **US account details** (ACH routing + account number).
2. In the **Adyen Customer Area**, set that as your **payout / settlement bank account**.
3. Adyen settles captured funds there; you then hold multi-currency / convert / pay out.

Optional programmatic treasury lives in `src/settlement/wise.js` (stub).

---

## Project structure

```
PaymentGateway/
├─ src/
│  ├─ server.js              Express app (JSON routes + static)
│  ├─ config/adyen.js        Adyen API client (@adyen/api-library)
│  ├─ routes/sessions.js     GET /api/config · POST /api/sessions (Checkout Session)
│  ├─ routes/webhooks.js     POST /api/webhooks (HMAC-validated, returns [accepted])
│  ├─ store/orders.js        toy in-memory order store
│  ├─ client/checkout.js     Adyen Web Drop-in init (bundled by esbuild)
│  └─ settlement/wise.js     Wise/Revolut payout wiring + treasury stub
├─ scripts/build-client.js   esbuild bundler -> public/checkout.bundle.js (+ .css)
├─ public/                   checkout.html, result.html  (+ built bundle, gitignored)
├─ docs/DECISION.md          why Adyen
├─ docs/RESEARCH.md          full provider comparison
├─ .env.example              config template (never commit .env)
└─ package.json
```

## Security (baked in)

- **PCI SAQ-A**: card data is entered inside Adyen's Drop-in (secured iframes) — this
  server never sees a card number.
- **Webhook HMAC verified** with `ADYEN_HMAC_KEY`; only authenticated notifications act.
- Card acceptance runs the acquirer's 3-D Secure automatically via the sessions flow.
- Secrets live in `.env` (git-ignored). Use **test** credentials until go-live; the
  go-live checklist is in `docs/RESEARCH.md`.
