'use strict';

const { Client, CheckoutAPI, EnvironmentEnum } = require('@adyen/api-library');

const apiKey = process.env.ADYEN_API_KEY;
if (!apiKey || apiKey === 'YOUR_ADYEN_API_KEY') {
  console.warn(
    '[adyen] ADYEN_API_KEY not set — copy .env.example to .env and add your TEST credentials.\n' +
    '        The server still boots, but /api/sessions will fail until keys are present.'
  );
}

const environment =
  (process.env.ADYEN_ENVIRONMENT || 'test').toLowerCase() === 'live'
    ? EnvironmentEnum.LIVE
    : EnvironmentEnum.TEST;

const client = new Client({
  apiKey: apiKey || 'MISSING_API_KEY',
  environment,
  // For LIVE you must also set liveEndpointUrlPrefix from your Adyen Customer Area.
  ...(environment === EnvironmentEnum.LIVE && process.env.ADYEN_LIVE_PREFIX
    ? { liveEndpointUrlPrefix: process.env.ADYEN_LIVE_PREFIX }
    : {}),
});
client.setApplicationName('PaymentGateway sandbox');

const checkout = new CheckoutAPI(client);

module.exports = { client, checkout };
