# Subscription-Billing---Dunning-System

**Ledger** — a marketing/landing site prototype for a subscription billing product that recovers revenue from failed payments through automated dunning (retry) workflows.

This repo is a static front-end mockup: a landing page and a sign-in page, styled to look like a real billing SaaS, with small JS-driven animations that simulate the product in action (no backend, no real billing logic).

## Pages

- [index.html](index.html) — Landing page
  - Hero section with a live-updating MRR ticker and a mini payment-retry simulation
  - Features grid (prorated upgrades, automated dunning, webhook-driven state, revenue recovery)
  - Dunning timeline demo — animates a subscription moving through a Day 0/1/3/5/7 retry schedule
  - Webhooks demo — a terminal-style panel showing deduplicated payment events streaming in
- [login.html](login.html) — Sign-in page with an email/password form and a show/hide password toggle

## Structure

```
index.html          landing page markup
login.html           sign-in page markup
css/landing.css       landing page styles
css/login.css         login page styles
js/landing.js         landing page animations (MRR ticker, dunning timeline, webhook terminal, scroll reveal)
```

Note: `login.html` references `js/login.js`, which is not present in this repo yet — the sign-in form currently has no client-side behavior wired up.

## Running locally

This is a static site with no build step or dependencies. Open [index.html](index.html) directly in a browser, or serve the folder with any static file server, e.g.:

```
npx serve .
```

## Status

Front-end only, prototype/demo stage. No backend, authentication, or real payment/dunning logic is implemented yet.
