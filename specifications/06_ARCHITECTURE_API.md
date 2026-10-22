# Technical Architecture & API Contract (Draft)
**Version:** 0.1 | Stack and hosting are intentionally not selected yet.

## 1. Recommended logical architecture
- Responsive web frontend.
- Backend API as the authoritative business-rule boundary.
- Neon Serverless PostgreSQL database with ACID transactions and connection pooling.
- Neon Object Storage (branch-aware, S3-compatible) for attachments and import files.
- Background worker for extraction, report generation and backup monitoring.
- In-app notification service.
- AI document/image extraction adapter that returns structured suggestions only.
- Central structured logging, metrics and error monitoring.

Keep the application modular: identity/access; organization; catalog; inventory ledger; reservations; approvals; shipments/transfers; manufacturing; departments; imports; reports; audit; settings; backups.

## 2. Required backend rules
- Stock-changing workflows must be transactional.
- Lock affected balance rows or use an equivalent serializable/concurrency-safe strategy.
- Revalidate stock and authorization at posting time.
- Use idempotency keys for retries and duplicate clicks.
- The backend derives user identity from the authenticated session; never trust actor IDs supplied by projects.
- Each new authenticated request checks the current session record in PostgreSQL so revocation, account disablement, and role changes take effect without a stale positive cache. Concurrent requests for the same session share an in-flight validation query. Database errors fail closed; authentication does not fall back to a previously accepted session.
- Do not accept project-computed base quantity, balance or permission as authoritative.
- Enforce organization/warehouse/project scope in every query.
- AI output is untrusted input and must pass normal validation.
- Do not expose source warehouse identity in Project Admin API responses.

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
| GET/POST | `/api/v1/projects` | List/create project (Super Admin only for writes) |
| GET/POST | `/api/v1/warehouses` | List/create warehouse |
| POST | `/api/v1/projects/{id}/warehouses` | Assign project to warehouse |
| GET/POST | `/api/v1/products` | Scoped catalog; Store Admin receives approved company raw materials only |
| GET | `/api/v1/products/manufacturing-options` | Project-only approved outputs and raw materials with current or historical stock at that project |
| POST | `/api/v1/products/{id}/submit` | Submit product draft |
| GET/POST | `/api/v1/stock-requests` | Create/list permitted requests |
| PATCH | `/api/v1/stock-requests/{id}` | Edit pending request with version |
| POST | `/api/v1/stock-requests/{id}/submit` | Submit/reserve |
| POST | `/api/v1/stock-requests/{id}/cancel` | Requester cancels pending request |
| POST | `/api/v1/stock-requests/{id}/approve` | Super Admin approval/posting |
| POST | `/api/v1/stock-requests/{id}/reject` | Super Admin rejection/release reservation |
| POST | `/api/v1/departments/issues/draft` | Get or create the Project Admin's one open daily issue draft |
| GET | `/api/v1/departments/issues/batches` | List issue batches, scoped to the caller's project where applicable |
| PATCH | `/api/v1/departments/issues/batches/{id}/lines` | Replace draft lines after full validation |
| POST | `/api/v1/departments/issues/batches/{id}/submit` | Atomically validate/reserve and submit or immediately post by configured policy |
| POST | `/api/v1/departments/issues/batches/{id}/approve` | Super Admin approves/rejects the whole batch; posts all lines or none |
| POST | `/api/v1/shipments/{id}/receive` | Record receipt |
| POST | `/api/v1/shipments/{id}/resolve-discrepancy` | Super Admin resolves all held shortages as `MISSING` or `CALCULATION_MISTAKE` |
| GET | `/api/v1/reports/MISSING_STOCK` | Super Admin missing-stock totals by product, filtered by resolution date and optional product/location |
| POST | `/api/v1/production-runs` | Create production draft |
| PATCH | `/api/v1/production-runs/{id}` | Edit the caller’s own draft; no inventory effect |
| DELETE | `/api/v1/production-runs/{id}` | Delete the Project Admin caller’s own draft; submitted runs are retained |
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
3. Lock/revalidate stock, reservations and unit snapshots.
4. Insert approval decision and immutable ledger entries.
5. Update balance projection and reservation states.
6. Mark request/lines posted or completed.
7. Commit; emit notifications after commit through reliable outbox/job pattern.

For workflows configured without approval, the same checks and ledger/projection/state/audit writes execute in one transaction without an approval record. Approval policy is read at submission time and does not retroactively alter drafts or pending items.

## 7. AI import contract
AI extraction response should include proposed field values, source snippets/coordinates where available, confidence/uncertainty, warnings and raw extraction references. It must not call stock-posting endpoints or approve requests. A human reviews and submits; the configured workflow approval policy then governs posting.

## 8. Selected infrastructure and open decisions
- Selected: NestJS + TypeScript backend, Next.js frontend, Neon Serverless PostgreSQL, Neon Object Storage, Google Gemini extraction adapter. Zero Docker requirements.
- Open: Production CDN routing, domain/TLS certs, and scheduled backup retention policy enforcement.
