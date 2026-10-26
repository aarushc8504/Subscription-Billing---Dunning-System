# Subscription Billing Dunning System

**Ledger** is a static front-end prototype for a subscription billing product that recovers revenue from failed payments through automated dunning workflows.

## Pages

- [index.html](index.html) - Landing page with a live MRR ticker, payment retry simulation, feature grid, dunning timeline, and webhook event stream.
- [login.html](login.html) - Sign-in page with client-side password visibility and submission feedback.

## Structure

```
index.html          landing page markup
login.html           sign-in page markup
css/landing.css     landing page styles
css/login.css       login page styles
js/landing.js       landing page animations and demos
js/login.js         login form interactions and feedback
```

## Running locally

This is a static site with no build step or dependencies. Open [index.html](index.html) directly in a browser, or serve the folder with any static file server:

```
npx serve .
```

## Status

Front-end only, prototype/demo stage. No backend, authentication, or real payment/dunning logic is implemented yet. The login form intentionally simulates an authentication response and must be connected to a backend before production use.
