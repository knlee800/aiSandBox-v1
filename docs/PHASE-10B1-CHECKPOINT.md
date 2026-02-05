# Phase 10B1 Checkpoint: Invoice Drafting Complete (No Charging)

**Status**: ✅ COMPLETE
**Date**: 2026-01-27
**Scope**: Phase 10B1 - Invoice draft creation in api-gateway

---

## Phase Overview

Phase 10B1 introduces **invoice drafts** as the first financial primitives in the AI Sandbox Platform. This phase persists billing data to the database but implements **ZERO payment operations**—no charging, no capture, no payment provider integration.

### Phase 10B1 Purpose

- **Persist invoice drafts** to SQLite for future billing workflows
- **Idempotent draft creation** using invoice_key (userId + period)
- **Consume billing exports** from Phase 10A (container-manager)
- **Fail-soft on export failures** (create draft with zeros)
- **Enable future finalization** without modifying draft creation logic
- **NO financial risk** - drafts only, no payment processing

### Design Philosophy

1. **Request-driven draft creation**: No background jobs, no schedulers
2. **Idempotent by design**: Same (userId, period) → same invoice
3. **Fail-soft on upstream errors**: Billing export failures create drafts with zeros
4. **Immutable totals**: Once created, totals never change (draft remains draft)
5. **Internal-only access**: Protected by `InternalServiceAuthGuard`
6. **Financial primitives only**: Drafts are data structures, not transactions

---

## Completed Tasks

### Task 10B1: Invoice Drafting in api-gateway

**Status**: ✅ COMPLETE

**What Was Built**:
- `InvoicesService` for idempotent invoice draft creation
- `InvoicesController` with three internal API endpoints:
  - `POST /api/internal/invoices/draft` - Create invoice draft (idempotent)
  - `GET /api/internal/invoices/:invoiceId` - Get invoice by ID
  - `GET /api/internal/invoices/by-key/:invoiceKey` - Get invoice by key
- Database schema: `invoices` table with unique `invoice_key` constraint
- Integration with `ContainerManagerHttpClient` for billing export
- Graceful failure handling (zeros on export failure, race-safe inserts)

**Database Changes**:
- Added `invoices` table to `schema-sqlite.sql`
- Added indexes: `(user_id, period_start, period_end)`, `(status)`, `(invoice_key)`
- No foreign keys (simplicity, no cascade complexity)

**Integration**:
- Calls container-manager billing export API (Phase 10A)
- Protected by `InternalServiceAuthGuard` (existing global guard)
- Registered in `AppModule` as `InvoicesModule`

---

## Database Changes (LOCKED)

### Invoices Table Schema

```sql
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_key TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  plan_type TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  total_tokens INTEGER NOT NULL,
  total_cost_usd REAL NOT NULL,
  governance_events_total INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'finalized', 'void')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Field Semantics**:

| Field | Type | Constraint | Description |
|-------|------|------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique invoice ID |
| `invoice_key` | TEXT | NOT NULL UNIQUE | Idempotency key: `user:<userId>\|start:<periodStart>\|end:<periodEnd>` |
| `user_id` | TEXT | NOT NULL | User UUID (no foreign key) |
| `plan_type` | TEXT | NOT NULL | User's plan type at draft creation (free/pro/enterprise) |
| `period_start` | TEXT | NOT NULL | Billing period start (ISO 8601) |
| `period_end` | TEXT | NOT NULL | Billing period end (ISO 8601) |
| `currency` | TEXT | NOT NULL DEFAULT 'USD' | Currency code (currently USD only) |
| `total_tokens` | INTEGER | NOT NULL | Total tokens consumed (may be 0 on export failure) |
| `total_cost_usd` | REAL | NOT NULL | Total cost in USD (may be 0.0 on export failure) |
| `governance_events_total` | INTEGER | NOT NULL | Total governance events (may be 0 on export failure) |
| `status` | TEXT | NOT NULL CHECK | Status: `draft` (Task 10B1), `finalized` (future), `void` (future) |
| `created_at` | TEXT | NOT NULL DEFAULT | Timestamp of draft creation (ISO 8601) |

### Indexes (LOCKED)

```sql
CREATE INDEX IF NOT EXISTS idx_invoices_user_period ON invoices(user_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_key ON invoices(invoice_key);
```

**Rationale**:
- `(user_id, period_start, period_end)`: Fast lookups for user billing history
- `(status)`: Fast filtering by draft/finalized/void status
- `(invoice_key)`: Fast idempotency checks (unique constraint also creates implicit index)

### No Foreign Keys

**Decision**: Invoice table has **NO foreign keys** to `users` table.

**Rationale**:
1. **Billing isolation**: Invoice records must survive user deletions (audit/compliance)
2. **Simplicity**: No cascade complexity, no referential integrity checks
3. **Performance**: No FK constraint overhead on inserts
4. **Phase 9 pattern**: Mirrors `governance_events` design (best-effort logging)

**Trade-off**: Orphaned invoice records possible if user deleted. Acceptable for billing audit trail.

---

## Invoice Draft Semantics

### Idempotency Guarantees

**Invariant**: Invoice draft creation is idempotent based on `invoice_key`.

**Invoice Key Format**:
```
user:<userId>|start:<periodStart>|end:<periodEnd>
```

**Example**:
```
user:test-user-001|start:2026-01-01T00:00:00.000Z|end:2026-01-31T23:59:59.999Z
```

**Behavior**:
1. **First call**: Generates invoice_key, fetches billing export, inserts invoice, returns created invoice
2. **Subsequent calls**: Finds existing invoice by invoice_key, returns existing invoice (no duplicate)
3. **Race condition**: Two concurrent calls → one inserts, other catches UNIQUE constraint error and returns existing

**Guarantees**:
- ✅ Same (userId, periodStart, periodEnd) → same invoice (same ID)
- ✅ No duplicate invoices for same period
- ✅ Race-safe (concurrent calls handled gracefully)
- ✅ Totals never change after creation (immutable)

### Immutable Totals

**Invariant**: Once invoice draft is created, totals (`total_tokens`, `total_cost_usd`, `governance_events_total`) never change.

**Rationale**:
1. **Audit trail**: Invoice drafts are snapshots of usage at draft creation time
2. **Billing consistency**: Prevents retroactive changes to billing amounts
3. **Simplicity**: No update logic, no version tracking

**Future Work**: If usage data changes after draft creation, a new draft must be created (different period or manual override).

### Draft Status Lifecycle

**Phase 10B1 Status**: `draft` (only status currently used)

**Future Statuses**:
- `finalized`: Invoice finalized and sent to user (Phase 10B2+)
- `void`: Invoice cancelled/voided (future refund/correction workflow)

**Invariant**: Phase 10B1 creates **ONLY `draft` status** invoices. No finalization, no voiding.

### Zeros on Export Failure

**Invariant**: If billing export fails, invoice draft is still created with **zero totals**.

**Rationale**:
1. **Availability-first**: Invoice drafting should not crash on upstream errors
2. **Audit trail**: Record that draft was attempted (even if export failed)
3. **Manual correction**: Zero-total drafts can be manually corrected later

**Fields on Export Failure**:
- `plan_type`: `'free'` (fallback)
- `total_tokens`: `0`
- `total_cost_usd`: `0.0`
- `governance_events_total`: `0`
- `status`: `'draft'` (normal status)

**Detection**: Zero totals + `created_at` timestamp indicates export failure at that time.

---

## Internal API Summary

### Base Path

```
/api/internal/invoices
```

### Authentication

**Required**: `InternalServiceAuthGuard` (global guard)
- Requires `X-Internal-Service-Key` header
- Returns 401 Unauthorized if missing/invalid
- Internal services only (NOT public API)

### Endpoint 1: Create Invoice Draft (Idempotent)

**Route**: `POST /api/internal/invoices/draft`

**Request Body**:
```json
{
  "userId": "test-user-001",
  "periodStart": "2026-01-01T00:00:00.000Z",
  "periodEnd": "2026-01-31T23:59:59.999Z"
}
```

**Example Request**:
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-Internal-Service-Key: <key>" \
  -d '{
    "userId": "test-user-001",
    "periodStart": "2026-01-01T00:00:00.000Z",
    "periodEnd": "2026-01-31T23:59:59.999Z"
  }' \
  http://localhost:3000/api/internal/invoices/draft
```

**Response (Success)**:
```json
{
  "id": 1,
  "invoiceKey": "user:test-user-001|start:2026-01-01T00:00:00.000Z|end:2026-01-31T23:59:59.999Z",
  "userId": "test-user-001",
  "planType": "enterprise",
  "periodStart": "2026-01-01T00:00:00.000Z",
  "periodEnd": "2026-01-31T23:59:59.999Z",
  "currency": "USD",
  "totalTokens": 1300000,
  "totalCostUsd": 65.5,
  "governanceEventsTotal": 15,
  "status": "draft",
  "createdAt": "2026-01-27 13:30:00"
}
```

**Response (Export Failed - Zeros)**:
```json
{
  "id": 2,
  "invoiceKey": "user:test-user-002|start:2026-01-01T00:00:00.000Z|end:2026-01-31T23:59:59.999Z",
  "userId": "test-user-002",
  "planType": "free",
  "periodStart": "2026-01-01T00:00:00.000Z",
  "periodEnd": "2026-01-31T23:59:59.999Z",
  "currency": "USD",
  "totalTokens": 0,
  "totalCostUsd": 0.0,
  "governanceEventsTotal": 0,
  "status": "draft",
  "createdAt": "2026-01-27 13:35:00"
}
```

**Idempotency Example**:
```bash
# First call - creates invoice
curl -X POST ... # Returns { "id": 1, ... }

# Second call - returns existing invoice (no duplicate)
curl -X POST ... # Returns { "id": 1, ... } (SAME ID)
```

**Use Case**: Monthly invoice generation, billing cycle automation

### Endpoint 2: Get Invoice by ID

**Route**: `GET /api/internal/invoices/:invoiceId`

**Example Request**:
```bash
curl -H "X-Internal-Service-Key: <key>" \
  http://localhost:3000/api/internal/invoices/1
```

**Response (Success)**: Same structure as POST response

**Response (Not Found)**:
```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "Invoice with ID 999 not found"
}
```

**Use Case**: Invoice lookup, billing history display

### Endpoint 3: Get Invoice by Invoice Key

**Route**: `GET /api/internal/invoices/by-key/:invoiceKey`

**Example Request**:
```bash
curl -H "X-Internal-Service-Key: <key>" \
  "http://localhost:3000/api/internal/invoices/by-key/user:test-user-001|start:2026-01-01T00:00:00.000Z|end:2026-01-31T23:59:59.999Z"
```

**Response (Success)**: Same structure as POST response

**Use Case**: Idempotency debugging, duplicate detection

---

## Failure & Availability Guarantees

### 1. Fail-Soft on Billing Export Failure

**Scenario**: Container-manager billing export API is unreachable or returns error.

**Behavior**:
1. `ContainerManagerHttpClient.getBillingUsageExport()` returns `null`
2. Log error to console (no crash)
3. Create invoice draft with zeros (`totalTokens: 0`, `totalCostUsd: 0.0`, etc.)
4. Return invoice draft (HTTP 200 OK)

**Guarantees**:
- ❌ No 5xx errors for upstream export failures
- ✅ Invoice draft creation always succeeds (with zeros as fallback)
- ✅ Audit trail preserved (draft record exists with timestamp)
- ✅ Manual correction possible (identify zero-total drafts and re-generate)

**Rationale**: **Availability over consistency**. Better to have incomplete draft than no draft at all.

### 2. Race-Safe Idempotency Handling

**Scenario**: Two concurrent requests create invoice draft for same (userId, periodStart, periodEnd).

**Behavior**:
1. Request A generates invoice_key, checks DB → not found, inserts invoice
2. Request B generates invoice_key, checks DB → not found, attempts insert
3. Request B hits UNIQUE constraint violation on `invoice_key`
4. Request B catches error, reads existing invoice by invoice_key, returns it
5. Both requests return same invoice (same ID)

**Guarantees**:
- ✅ No duplicate invoice rows
- ✅ No 5xx errors (constraint error handled gracefully)
- ✅ Both requests succeed (HTTP 200 OK)
- ✅ Both requests return same invoice

**Implementation**:
```typescript
try {
  // Insert invoice
} catch (error) {
  if (error.message.includes('UNIQUE constraint failed')) {
    // Read existing invoice and return it
    return this.getInvoiceByKey(invoiceKey);
  }
  throw error; // Re-throw other errors
}
```

### 3. No 5xx for Missing Users

**Scenario**: Create invoice draft for non-existent userId.

**Behavior**:
1. No validation of user existence (no foreign key)
2. Invoice draft created successfully
3. `user_id` stored as-is (orphaned reference acceptable)

**Guarantees**:
- ✅ Invoice draft creation succeeds (HTTP 200 OK)
- ❌ No user validation (intentional trade-off)

**Rationale**: **Billing isolation**. Invoice records must survive user deletions for audit/compliance.

---

## Architecture Guarantees (LOCKED)

### 1. No Charging

**Invariant**: Phase 10B1 does NOT charge users or process payments.

**Guarantees**:
- ❌ No payment gateway integration (no Stripe, PayPal, etc.)
- ❌ No credit card charges
- ❌ No bank transfers
- ❌ No subscription billing
- ❌ No overage charges

**Verification**: `InvoicesService` has ZERO payment provider dependencies.

### 2. No Payment Providers

**Invariant**: Phase 10B1 does NOT integrate with payment providers.

**Guarantees**:
- ❌ No Stripe SDK
- ❌ No PayPal SDK
- ❌ No payment webhooks
- ❌ No payment retries
- ❌ No payment reconciliation

**Verification**: `package.json` has ZERO payment provider dependencies.

### 3. No Invoice Finalization

**Invariant**: Phase 10B1 does NOT finalize invoices.

**Guarantees**:
- ❌ No status transitions (`draft` → `finalized`)
- ❌ No invoice PDF generation
- ❌ No invoice email delivery
- ❌ No invoice numbering (sequential invoice numbers)

**Verification**: All created invoices have `status: 'draft'` (no other status).

### 4. No Background Jobs

**Invariant**: Phase 10B1 does NOT introduce background jobs or schedulers.

**Guarantees**:
- ❌ No monthly invoice generation cron jobs
- ❌ No billing cycle automation
- ❌ No payment retry workers
- ❌ No email notification schedulers

**Verification**: All endpoints are request-driven, synchronous.

### 5. No Mutations Outside Invoices Table

**Invariant**: Phase 10B1 ONLY writes to `invoices` table.

**Guarantees**:
- ❌ No writes to `users` table
- ❌ No writes to `token_usage` table
- ❌ No writes to `governance_events` table
- ✅ ONLY writes to `invoices` table (INSERTs only, no UPDATEs)

**Verification**: `InvoicesService` has ONE write operation (`INSERT INTO invoices`).

### 6. Phase 9 Enforcement Untouched

**Invariant**: Phase 10B1 does NOT modify Phase 9 governance or quota enforcement.

**Guarantees**:
- ❌ No changes to quota limits
- ❌ No changes to enforcement thresholds
- ❌ No changes to HTTP 429 blocking
- ❌ No changes to HTTP 410 terminations

**Verification**: No files modified in `container-manager/src/usage/*` or `container-manager/src/sessions/*`.

### 7. Request-Driven Creation Only

**Invariant**: Invoice drafts are created ONLY via explicit API calls.

**Guarantees**:
- ✅ All invoice drafts created via `POST /api/internal/invoices/draft`
- ❌ No automatic draft generation
- ❌ No scheduled draft creation
- ❌ No event-driven draft creation

**Verification**: No background workers, no event listeners, no cron jobs.

---

## What Is Explicitly NOT Done

### ❌ NOT Implemented in Phase 10B1

1. **Payment Capture**
   - No charging users
   - No credit card processing
   - No payment gateway integration
   - No payment webhooks
   - No payment retries

2. **Invoice Finalization**
   - No status transitions (draft → finalized)
   - No invoice PDF generation
   - No invoice email delivery
   - No sequential invoice numbering
   - No invoice locking (totals remain mutable in DB)

3. **Refunds & Credits**
   - No refund processing
   - No credit notes
   - No prorated refunds
   - No overage credits

4. **Tax & Compliance**
   - No tax calculation (VAT, sales tax)
   - No tax reporting
   - No tax compliance checks
   - No multi-currency support (USD only)

5. **Billing Automation**
   - No monthly invoice generation cron jobs
   - No billing cycle automation
   - No subscription renewals
   - No payment reminders

6. **Notifications**
   - No invoice email delivery
   - No payment failure notifications
   - No payment success notifications
   - No webhook calls to external systems

7. **Admin Features**
   - No invoice management UI
   - No manual invoice editing
   - No invoice voiding
   - No invoice correction workflows

8. **Advanced Features**
   - No prorated billing
   - No usage-based billing tiers
   - No custom billing cycles
   - No multi-tenant billing
   - No billing forecasting

### Rationale for Deferral

These features require:
- **Payment gateway** (Stripe, PayPal, etc.) - Phase 10B2+
- **Invoice finalization service** (PDF generation, email delivery) - Phase 10B3+
- **Billing cron jobs** (monthly automation) - Phase 10B4+
- **Tax compliance** (VAT calculation, tax reporting) - Phase 11+
- **Admin UI** (invoice management dashboard) - Phase 11+

Phase 10B1 provides the **data persistence foundation** for these future features without introducing financial risk.

---

## Relationship to Phase 10A

### Phase 10A Remains LOCKED

**Critical**: Phase 10B1 does **NOT reopen** Phase 10A (billing export).

**Unchanged Systems**:
1. ✅ `BillingExportController` (container-manager) - Frozen
2. ✅ Billing export endpoints (read-only) - Frozen
3. ✅ `UsageAggregationService` - Frozen
4. ✅ `QuotaEvaluationService` - Frozen

**What Phase 10B1 Adds**:
- ✅ Invoice draft persistence (`invoices` table)
- ✅ Invoice draft API (api-gateway)
- ✅ Integration with billing export API (consumer only)
- ✅ No changes to billing export behavior

### Division of Responsibilities

**Phase 10A (Container-Manager)**:
- **Role**: Billing data aggregation and export
- **Endpoints**: `GET /api/internal/billing-export/user/:userId/usage`
- **Database**: Reads from `token_usage`, `governance_events`, `sessions` tables
- **Mutations**: ZERO (read-only)

**Phase 10B1 (API-Gateway)**:
- **Role**: Invoice draft persistence
- **Endpoints**: `POST /api/internal/invoices/draft`, `GET /api/internal/invoices/:id`
- **Database**: Writes to `invoices` table ONLY
- **Mutations**: INSERT invoices (idempotent)
- **Consumer**: Calls Phase 10A billing export API

**Separation of Concerns**:
- **Container-manager**: Knows about containers, sessions, usage → exports billing data
- **API-gateway**: Knows about users, invoices, financial workflows → persists invoices

---

## Safe Resume Point

✅ **Phase 10B1 is COMPLETE and STABLE**.

The invoice draft persistence layer is fully implemented and tested:

1. ✅ **Task 10B1** - Invoice draft creation with idempotency
2. ✅ **Database schema** - `invoices` table with unique `invoice_key`
3. ✅ **Internal API** - Three endpoints (draft, get by ID, get by key)
4. ✅ **Fail-soft behavior** - Zeros on billing export failure
5. ✅ **Race-safe idempotency** - Concurrent calls handled gracefully
6. ✅ **NO financial risk** - Drafts only, no charging

### Next Phase Options

**Option 1: Task 10B2 - Payment Provider Adapter (NO capture)**
- Objective: Integrate Stripe SDK (read-only, no charges)
- Scope:
  - Add Stripe SDK dependency
  - Create `PaymentProviderService` stub
  - Add customer creation (no charges)
  - Add payment method attachment (no charges)
  - No payment capture, no invoicing
- Why Next: Foundation for future payment processing
- **WARNING**: Introduces payment provider dependency (financial risk increases)

**Option 2: Task 10B3 - Invoice Finalization (NO charging)**
- Objective: Implement status transitions (draft → finalized)
- Scope:
  - Add invoice finalization API (`POST /api/internal/invoices/:id/finalize`)
  - Add sequential invoice numbering
  - Add invoice PDF generation (optional)
  - Add invoice email delivery (optional)
  - No payment capture, no charging
- Why Next: Complete invoice workflow before adding payments

**Option 3: Task 10C - Billing Dashboard (UI)**
- Objective: Build admin UI for invoice management
- Scope:
  - Invoice list view (filter by status, user, period)
  - Invoice detail view
  - Manual draft creation form
  - Export invoices to CSV
  - No payment processing UI
- Why Next: Enable manual invoice review before automation

**Option 4: Hold / Pause**
- Objective: Stabilize current system, no new features
- Rationale: Phase 10B1 provides invoice draft persistence without financial risk
- Next Step: Deploy, monitor, test draft creation before Phase 10B2

---

## Deployment Verification

### Pre-Deployment Checklist

- [ ] `invoices` table created in SQLite database
- [ ] Indexes created: `(user_id, period_start, period_end)`, `(status)`, `(invoice_key)`
- [ ] `InvoicesModule` registered in `AppModule`
- [ ] `INTERNAL_SERVICE_KEY` environment variable configured
- [ ] Container-manager billing export endpoint accessible from api-gateway
- [ ] No payment provider credentials present (Phase 10B1 is draft-only)

### Post-Deployment Verification

1. **Endpoint 1 - Create Invoice Draft**:
   ```bash
   curl -X POST \
     -H "Content-Type: application/json" \
     -H "X-Internal-Service-Key: <key>" \
     -d '{
       "userId": "test-user-001",
       "periodStart": "2026-01-01T00:00:00.000Z",
       "periodEnd": "2026-01-31T23:59:59.999Z"
     }' \
     http://localhost:3000/api/internal/invoices/draft
   ```
   - Verify returns JSON with `id`, `invoiceKey`, `userId`, `status: "draft"`, etc.

2. **Endpoint 2 - Get Invoice by ID**:
   ```bash
   curl -H "X-Internal-Service-Key: <key>" \
     http://localhost:3000/api/internal/invoices/1
   ```
   - Verify returns invoice details

3. **Endpoint 3 - Get Invoice by Key**:
   ```bash
   curl -H "X-Internal-Service-Key: <key>" \
     "http://localhost:3000/api/internal/invoices/by-key/user:test-user-001|start:2026-01-01T00:00:00.000Z|end:2026-01-31T23:59:59.999Z"
   ```
   - Verify returns invoice details

4. **Idempotency Test**:
   ```bash
   # Call POST draft twice with same parameters
   curl -X POST ... # Returns id: 1
   curl -X POST ... # Returns id: 1 (SAME ID, no duplicate)
   ```
   - Verify both calls return same invoice ID

5. **Export Failure Test**:
   - Temporarily stop container-manager service
   - Call POST draft endpoint
   - Verify invoice created with zeros (`totalTokens: 0`, `totalCostUsd: 0.0`)
   - Verify no 5xx error (HTTP 200 OK)

6. **Internal Auth Test**:
   ```bash
   curl -X POST ... # (no X-Internal-Service-Key header)
   ```
   - Verify returns 401 Unauthorized

### Monitoring Recommendations

1. **Draft Creation Success Rate**: Measure HTTP 200 vs 4xx/5xx ratio
2. **Zero-Total Drafts**: Count invoices with `total_cost_usd = 0` (indicates export failures)
3. **Idempotency Hits**: Count `invoice_key` conflicts (indicates duplicate draft attempts)
4. **Export API Latency**: Measure container-manager billing export response time
5. **Database Insert Latency**: Measure invoice INSERT duration

---

## Phase Status

### Phase 10B1: COMPLETE ✅

**Started**: 2026-01-27 (Task 10B1)
**Completed**: 2026-01-27 (Task 10B1)

**Deliverables**:
- ✅ Invoice draft persistence (`invoices` table)
- ✅ Idempotent draft creation API
- ✅ Three internal endpoints (draft, get by ID, get by key)
- ✅ Billing export integration (Phase 10A consumer)
- ✅ Fail-soft on export failures (zeros fallback)
- ✅ Race-safe idempotency (constraint conflict handling)

**Locked Invariants**:
- Request-driven draft creation
- SQLite as source of truth
- Idempotency via `invoice_key`
- Immutable totals (no updates)
- No charging, no payment providers
- No invoice finalization
- No background jobs
- No mutations outside `invoices` table

**New Capabilities** (Additive Only):
- Invoice draft persistence in api-gateway
- Idempotent draft creation via internal API
- Billing export consumption from container-manager
- No breaking changes

**Safe to Proceed**: ✅ YES

Phase 10B1 is **production-ready** and **stable**. All invoice draft operations are locked and tested. Future phases (payment providers, finalization, automation) can build on this foundation without modifying draft creation behavior.

**CRITICAL**: Phase 10B1 has **ZERO financial risk** - drafts only, no charging, no payment processing.

---

## Rollback Plan

If critical issues arise in production:

### Option 1: Disable Invoice Draft Endpoints (Keep Exports)

**Change**:
```typescript
// In InvoicesController
@Controller('api/internal/invoices')
export class InvoicesController {
  // TEMPORARY: Disable all endpoints for rollback
  @Post('draft')
  createInvoiceDraft() {
    throw new HttpException('Service Unavailable', HttpStatus.SERVICE_UNAVAILABLE);
  }
  // ... disable other endpoints
}
```

**Result**: Billing exports continue, invoice drafts disabled. No impact on Phase 10A or Phase 9 governance.

### Option 2: Remove InvoicesModule Registration

**Change**: Remove `InvoicesModule` from `AppModule.imports` array.

**Result**: Invoice draft endpoints return 404 Not Found. No impact on billing exports or governance.

### Option 3: Full Rollback

**Change**: Revert to commit before Phase 10B1.

**Result**: Invoice draft APIs removed, `invoices` table remains (no data loss). Billing exports continue unchanged.

**Critical**: Phase 10B1 rollback does **NOT affect**:
- Phase 10A billing exports (container-manager)
- Phase 9 governance and quota enforcement
- Existing invoice draft data (persisted in `invoices` table)

---

## Summary

Phase 10B1 successfully implemented **invoice draft persistence** with the following properties:

1. ✅ **Idempotent draft creation**: Same (userId, period) → same invoice
2. ✅ **Fail-soft on export failures**: Zeros fallback, no crashes
3. ✅ **Race-safe idempotency**: Concurrent calls handled gracefully
4. ✅ **Immutable totals**: Once created, totals never change
5. ✅ **Internal-only access**: `InternalServiceAuthGuard` enforced
6. ✅ **Zero financial risk**: Drafts only, no charging
7. ✅ **Production-ready**: Complete endpoint coverage, error handling

**Phase 10B1 is COMPLETE**. The invoice draft persistence layer is in place. External systems can create invoice drafts without risk of payment processing. Future work (payment providers, finalization, automation) can build on this foundation.

**Next Step**: Choose Phase 10B2 (Payment Provider Adapter - MEDIUM RISK), Phase 10B3 (Invoice Finalization), Phase 10C (Billing Dashboard), or Hold

**CRITICAL WARNING**: Phase 10B2 (Payment Provider Adapter) introduces payment provider dependency and increases financial risk:
- Stripe SDK integration (requires API keys)
- Customer creation in Stripe
- Payment method attachment
- Potential for accidental charges (even without explicit capture calls)

**Recommendation**: Deploy Phase 10B1 to production, validate invoice draft creation, review zero-total drafts, THEN proceed to Phase 10B2.
