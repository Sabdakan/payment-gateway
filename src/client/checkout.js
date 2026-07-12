// Frontend entry — bundled by esbuild into public/checkout.bundle.js (+ .css).
// Uses Adyen Web (Drop-in) with the sessions flow: one embedded widget that
// renders card (Visa/MC/Amex/Discover), Apple Pay, Google Pay — no redirect.
import { AdyenCheckout, Dropin } from '@adyen/adyen-web';
import '@adyen/adyen-web/styles/adyen.css';

const setStatus = (msg) => {
  const el = document.getElementById('status');
  if (el) el.textContent = msg;
};

async function start() {
  try {
    const cfg = await fetch('/api/config').then((r) => r.json());
    if (!cfg.clientKey) {
      setStatus('Add ADYEN_CLIENT_KEY (+ API key + merchant account) to .env, then restart.');
      return;
    }

    const session = await fetch('/api/sessions', { method: 'POST' }).then((r) => r.json());
    if (session.error) {
      setStatus('Session error: ' + (session.detail || session.error));
      return;
    }

    const checkout = await AdyenCheckout({
      clientKey: cfg.clientKey,
      environment: cfg.environment, // 'test'
      session: { id: session.id, sessionData: session.sessionData },
      onPaymentCompleted: (result) => {
        window.location = '/result.html?status=' + encodeURIComponent(result.resultCode || 'unknown');
      },
      onPaymentFailed: (result) => {
        setStatus('Payment not completed: ' + (result.resultCode || 'failed'));
      },
      onError: (error) => {
        if (error && error.name === 'CANCEL') return;
        console.error(error);
        setStatus('Error: ' + (error && error.message ? error.message : 'unknown'));
      },
    });

    // Drop-in automatically shows the methods your Adyen account has enabled.
    const dropin = new Dropin(checkout);
    dropin.mount('#dropin-container');
    setStatus('');
  } catch (e) {
    console.error(e);
    setStatus('Failed to start checkout — is the server running with valid Adyen keys?');
  }
}

start();
