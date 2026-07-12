'use strict';

// Toy in-memory persistence so the sandbox runs with zero external deps.
// Replace with a real database (Postgres, etc.) before production.
const MAX_ORDERS = 10000;
const orders = new Map(); // merchantReference -> order record
const processedEvents = new Set(); // Adyen "pspReference:eventCode" pairs already handled (webhook idempotency)

function alreadyProcessed(eventKey) {
  return processedEvents.has(eventKey);
}

function markProcessed(eventKey) {
  processedEvents.add(eventKey);
}

function recordOrder(key, data) {
  const existing = orders.get(key) || {};
  orders.set(key, { ...existing, ...data, updatedAt: new Date().toISOString() });
  // Bound memory (Map preserves insertion order): evict the oldest beyond the cap.
  if (orders.size > MAX_ORDERS) {
    orders.delete(orders.keys().next().value);
  }
  return orders.get(key);
}

function getOrder(key) {
  return orders.get(key);
}

function allOrders() {
  return Array.from(orders.values());
}

module.exports = { alreadyProcessed, markProcessed, recordOrder, getOrder, allOrders };
