'use strict';

// Toy in-memory persistence so the sandbox runs with zero external deps.
// Replace with a real database (Postgres, etc.) before production.
const orders = new Map(); // key (session/paymentIntent id) -> order record
const processedEvents = new Set(); // Stripe event ids already handled (idempotency)

function alreadyProcessed(eventId) {
  return processedEvents.has(eventId);
}

function markProcessed(eventId) {
  processedEvents.add(eventId);
}

function recordOrder(key, data) {
  const existing = orders.get(key) || {};
  orders.set(key, { ...existing, ...data, updatedAt: new Date().toISOString() });
  return orders.get(key);
}

function getOrder(key) {
  return orders.get(key);
}

function allOrders() {
  return Array.from(orders.values());
}

module.exports = { alreadyProcessed, markProcessed, recordOrder, getOrder, allOrders };
