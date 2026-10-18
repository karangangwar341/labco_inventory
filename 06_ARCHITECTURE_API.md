# Technical Architecture & API Contract (Draft)
**Version:** 0.1 | Stack and hosting are intentionally not selected yet.

## 1. Recommended logical architecture
- Responsive web frontend.
- Backend API as the authoritative business-rule boundary.
- Neon Serverless PostgreSQL database with ACID transactions and connection pooling.
- Neon Object Storage (branch-aware, S3-compatible) for attachments and import files.
- Background worker for extraction, report generation, expiry checks and backup monitoring.
- In-app notification service.
- AI document/image extraction adapter that returns structured suggestions only.
- Central structured logging, metrics and error monitoring.

Keep the application modular: identity/access; organization; catalog; inventory ledger; reservations; approvals; shipments/transfers; manufacturing; departments; imports; reports; audit; settings; backups.

## 2. Required backend rules
- Stock-changing workflows must be transactional.
- Lock affected balance rows or use an equivalent serializable/concurrency-safe strategy.
- Revalidate stock and authorization at posting time.
- Use idempotency keys for retries and duplicate clicks.
- The backend derives user identity from the authenticated session; never trust actor IDs supplied by clients.
- Each new authenticated request checks the current session record in PostgreSQL so revocation, account disablement, and role changes take effect without a stale positive cache. Concurrent requests for the same session share an in-flight validation query. Database errors fail closed; authentication does not fall back to a previously accepted session.
- Do not accept client-computed base quantity, balance or permission as authoritative.
- Enforce organization/warehouse/client scope in every query.
- AI output is untrusted input and must pass normal validation.
- Do not expose source warehouse identity in Client Admin API responses.

## 3. API conventions
- Version APIs under `/api/v1`.
- JSON requests/responses; consistent error schema.
- Pagination and filtering for list endpoints.
- UTC ISO-8601 timestamps.
- Idempotency key on create/submit/post operations.
- Correlation/request ID in responses and logs.
- Use optimistic version or ETag for editable drafts to prevent lost updates.

## 4. Endpoint inventory (illustrative, not final)
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/auth/login` | Authenticate and return the user's profile plus bounded, role-scoped startup references (products, categories, and permitted stock locations) in the same response |
| POST | `/api/v1/auth/logout` | Revoke current session |
| GET | `/api/v1/me` | Current role and scope |
| GET | `/api/v1/me/bootstrap` | Refresh the same minimal role-scoped startup data after a page reload or session restore |
| GET/POST | `/api/v1/clients` | List/create client (Super Admin only for writes) |
| GET/POST | `/api/v1/warehouses` | List/create warehouse |
| POST | `/api/v1/clients/{id}/warehouses` | Assign client to warehouse |
| GET/POST | `/api/v1/products` | Scoped catalog; Store Admin receives approved company raw materials only |
| GET | `/api/v1/products/manufacturing-options` | Client-only approved outputs and raw materials with current or historical stock at that client |
| POST | `/api/v1/products/{id}/submit` | Submit product draft |
| GET/POST | `/api/v1/stock-requests` | Create/list permitted requests |
| PATCH | `/api/v1/stock-requests/{id}` | Edit pending request with version |
| POST | `/api/v1/stock-requests/{id}/submit` | Submit/reserve |
| POST | `/api/v1/stock-requests/{id}/cancel` | Requester cancels pending request |
| POST | `/api/v1/stock-requests/{id}/approve` | Super Admin approval/posting |
| POST | `/api/v1/stock-requests/{id}/reject` | Super Admin rejection/release reservation |
| POST | `/api/v1/shipments/{id}/receive` | Record receipt |
| POST | `/api/v1/production-runs` | Create production draft |
| PATCH | `/api/v1/production-runs/{id}` | Edit the caller’s own draft; no inventory effect |
| DELETE | `/api/v1/production-runs/{id}` | Delete the Client Admin caller’s own draft; submitted runs are retained |
| POST | `/api/v1/production-runs/{id}/submit` | Submit production for approval |
| POST | `/api/v1/import-batches` | Upload/create import draft |
| PATCH | `/api/v1/import-batches/{id}/rows/{rowId}` | Edit imported row |
| POST | `/api/v1/import-batches/{id}/validate` | Validate batch |
| POST | `/api/v1/import-batches/{id}/submit` | Submit validated batch |
| GET | `/api/v1/reports/{reportType}` | Authorized report |
| GET | `/api/v1/audit-events` | Super Admin audit access |

## 5. Error contract (example)
```json
{
  "error": {
    "code": "INSUFFICIENT_AVAILABLE_STOCK",
    "message": "The requested quantity cannot be reserved.",
    "details": {"requested": "20.00", "available": "10.00"},
    "request_id": "opaque-correlation-id"
  }
}
```
Never return sensitive internal details, secrets, SQL errors or another organization's data.

## 6. Approval/posting atomicity
Within one DB transaction:
1. Verify request is eligible and not terminal.
2. Verify approver role/session and any workflow dependency.
3. Lock/revalidate stock, reservations, expiry and unit snapshots.
4. Insert approval decision and immutable ledger entries.
5. Update balance projection and reservation states.
6. Mark request/lines posted or completed.
7. Commit; emit notifications after commit through reliable outbox/job pattern.

## 7. AI import contract
AI extraction response should include proposed field values, source snippets/coordinates where available, confidence/uncertainty, warnings and raw extraction references. It must not call stock-posting endpoints or approve requests. A human reviews and submits; Super Admin approval remains mandatory.

## 8. Selected infrastructure and open decisions
- Selected: NestJS + TypeScript backend, Next.js frontend, Neon Serverless PostgreSQL, Neon Object Storage, Google Gemini extraction adapter. Zero Docker requirements.
- Open: Production CDN routing, domain/TLS certs, and scheduled backup retention policy enforcement.
