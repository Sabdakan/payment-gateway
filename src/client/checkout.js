// Frontend entry — bundled by esbuild into public/checkout.bundle.js (+ .css).
// Adyen Web (Drop-in), sessions flow: one embedded widget that renders Apple Pay /
// Google Pay as one-tap buttons ON TOP, then card (Visa/MC/Amex/Discover) — no redirect.
import { AdyenCheckout, Dropin } from '@adyen/adyen-web';
import '@adyen/adyen-web/styles/adyen.css';

const byId = (id) => document.getElementById(id);

const setStatus = (msg, isError = false) => {
  const el = byId('status');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('error', !!isError);
};

const clearSkeleton = () => {
  const c = byId('dropin-container');
  if (!c) return;
  const sk = c.querySelector('.skeleton');
  if (sk) sk.remove();
  c.removeAttribute('aria-busy');
};

const money = (value, currency) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value / 100);

async function getJson(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}

function offerRetry() {
  const el = byId('status');
  if (!el || el.querySelector('button')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'retry';
  btn.textContent = 'Try again';
  btn.addEventListener('click', () => { setStatus(''); start(); });
  el.appendChild(btn);
}

async function start() {
  setStatus('');
  try {
    // Fire config + session in parallel — halves the pre-widget wait.
    const [cfg, session] = await Promise.all([
      getJson('/api/config'),
      getJson('/api/sessions', { method: 'POST' }),
    ]);

    if (!cfg.clientKey) {
      clearSkeleton();
      setStatus('Add ADYEN_CLIENT_KEY (+ API key + merchant account) to .env, then restart.');
      return;
    }

    // Single source of truth for the price: the amount Adyen echoed back.
    if (session.amount) {
      document.querySelectorAll('.js-amount').forEach((el) => {
        el.textContent = money(session.amount.value, session.amount.currency);
      });
    }

    const checkout = await AdyenCheckout({
      clientKey: cfg.clientKey,
      environment: cfg.environment, // 'test'
      session: { id: session.id, sessionData: session.sessionData },
      onPaymentCompleted: (result) => {
        window.location = '/result.html?status=' + encodeURIComponent(result.resultCode || 'unknown');
      },
      onPaymentFailed: (result) => {
        setStatus('Payment not completed: ' + (result?.resultCode || 'failed') + '. ', true);
        offerRetry();
      },
      onError: (error) => {
        if (error && error.name === 'CANCEL') return;
        console.error(error);
        clearSkeleton();
        setStatus('Error: ' + (error?.message || 'unknown'), true);
      },
    });

    const dropin = new Dropin(checkout, {
      // Wallet-first: Apple Pay / Google Pay render as express buttons on top
      // (auto-hidden on unsupported devices or when not enabled on the account).
      instantPaymentTypes: ['applepay', 'googlepay'],
      paymentMethodsConfiguration: { card: { holderNameRequired: false } },
      onReady: clearSkeleton, // swap the shimmer for the real widget once interactive
    });
    dropin.mount('#dropin-container');
  } catch (e) {
    console.error(e);
    clearSkeleton();
    setStatus('Failed to start checkout (' + e.message + ').', true);
  }
}

start();
