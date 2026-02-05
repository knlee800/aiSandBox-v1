# Billing Tasks

## Task: Billing Usage Endpoints
- GET /api/billing/usage/:userId
- Priority: High
- Acceptance: Usage data returned

## Task: Quota Enforcement
- GET /api/billing/quota/:userId
- Priority: High
- Acceptance: Valid quota info

## Task: Billing Logs Storage
- Store token / cost logs
- Priority: Medium
- Acceptance: Logs retained + queryable

## Task: Stripe Integration (if needed)
- Hooks for payment
- Priority: Low
- Acceptance: Configured
