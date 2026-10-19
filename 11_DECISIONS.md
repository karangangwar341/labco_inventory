# Decision Register & Open Questions
**Version:** 1.0 | Use this file as the single source of truth for decisions not yet finalized.

## Confirmed baseline decisions & architecture
- **D-016 (Catalog ownership and product kind):** The company catalog is for raw materials; each client owns a separate catalog for manufactured products and categories. Client Admins create manufactured products only; Super Admins create raw materials. Existing products default to raw material. Manufacturing inputs must be approved raw materials with current or historical stock at that client; outputs must belong to that client’s approved manufactured-product catalog. Product kind is immutable after creation.
- **D-017 (Configurable approvals and daily department issues, 2026-10-18):** Super Admin may configure approval requirement for each supported stock request type, shipment receipt, manufacturing, department issue/return, and stock-in/stock-out import. Every setting defaults to required. Existing drafts/pending submissions retain their state when settings change. When approval is disabled, the server validates and posts atomically with idempotency and audit. Each client has one open daily department issue draft, editable through the day and submitted as a single all-or-nothing transaction/decision; submitted lines reserve usable stock until approval or rejection. Physical-count imports remain approval-gated until immediate posting is fully supported.
- **D-018 (Unified client stock-out, 2026-10-18):** Client stock-out to internal departments uses the daily department issue batch as its single entry flow. Each line selects an active department and an approved client-owned manufactured product with client stock. Raw materials are company warehouse inventory for manufacturing inputs and are not issued to departments. Warehouse stock-out and dispatch remain separate Store Admin workflows.
- Design baseline approved; Phase 1 implementation authorized by owner.
- Online-only; no offline mode.
- No barcode scanning.
- No purchase/selling prices, currency or inventory valuation.
- Super Admin approves all inventory-affecting requests.
- Approval policy is configurable per supported workflow by Super Admin. All workflows default to approval required; disabling approval permits immediate validated/atomic posting for new submissions only. This supersedes the previous fixed-approval baseline.
- Company product catalog is managed by Super Admin; client catalog by Client Admin with approval before transactions.
- Client-to-warehouse assignment is many-to-many and Super-Admin-controlled.
- No product SKU/code field.
- Quantity precision configurable per product, maximum two decimal places.
- Pending stock-out reserves available stock; no auto-expiry; reject/cancel releases reservation.
- Posted ledger immutable; corrections use reversal/corrected entries.
- Pending requests editable only with atomic revalidation and reservation recalculation.
- One active session per account; new login invalidates prior session; seven-day inactivity timeout.
- Five consecutive failed logins → 15-minute lockout; repeated lockouts require Super Admin intervention.
- Password minimum 12 characters and strength/compromised-password checks.
- Daily backups retained 90 days; failures retry and alert Super Admin persistently.
- Continuous transaction-log protection / Point-in-Time Recovery (PITR) requirement: target near-zero data loss for confirmed transactions (daily backups alone are insufficient for inter-day failure protection).
- Strict atomic database transactions: every approved inventory movement must commit atomically; partial updates are strictly prohibited.
- Backup isolation: independent backup copies protected from accidental deletion, unauthorized access, and primary database failures.
- Backup verification & restoration: automated backup-integrity checks and scheduled restoration tests; backups are not considered reliable until restoration has been tested.
- Inventory integrity: immutable stock ledger, automated reconciliation checks, and complete audit history.
- In-app notifications and persistent request bar; sound off by default. No email/SMS/push.
- Expiry warning defaults 90/30/7 days; expired stock excluded from usable stock and routine issue/dispatch.
- Linked and separate manufacturing workflows both supported.
- Department tracking is issue/return history only, with no department stock balance.
- Store Admin does not create products/categories and does not receive low-stock alerts under current policy.
- AI only extracts/classifies/maps uploaded documents/images for human review; no AI duplicate decision or transaction execution.
- Bulk duplicates are flagged and never silently merged.
- Priority default Normal; requester can suggest, Super Admin controls final priority.

### Finalized Technology Stack (Approved)
- **Backend:** Node.js + TypeScript + NestJS (modular architecture, dependency injection, guards, validation pipes).
- **Frontend:** Next.js + React + TypeScript (modern responsive UI, accessible, themeable).
- **Database:** Neon Serverless PostgreSQL (ACID transactions, pessimistic row locking `FOR UPDATE`, PgBouncer connection pooling via `DATABASE_URL`, direct connection via `DIRECT_URL` for Prisma migrations, copy-on-write branching, and continuous WAL / PITR).
- **ORM / Data Access:** Prisma ORM, supplemented with explicit raw SQL for pessimistic row locking and serializable ledger transactions.
- **Authentication & Authorization:** Short-lived JWT access tokens with secure refresh, session invalidation on login/password reset, and NestJS RBAC guards + service-level authorization.
- **AI Document Extraction:** Google Gemini API, abstracted behind a provider-independent adapter (multimodal extraction & field mapping only).
- **File Storage:** Neon Object Storage (branch-aware, S3-compatible blob storage) with local directory fallback for offline development.
- **API Standard:** REST API with OpenAPI (Swagger) documentation under `/api/v1`.
- **Infrastructure & Deployment:** Direct Node.js execution and serverless hosting; Docker is explicitly not required.

### Finalized Business Rules & Gates
- **D-001 (Receipt confirmation disabled):** When disabled, on Super Admin dispatch approval, warehouse stock decreases and client stock increases atomically in the same database transaction. In-transit tracking is bypassed.
- **D-002 (Shipment discrepancies):** When receiving with discrepancies (e.g., 100 dispatched, 95 received), the received quantity (95) enters client usable stock only upon Super Admin receipt approval. Discrepancy quantity (5) enters `DISCREPANCY_HOLD`; write-offs or adjustments require separate Super Admin approval.
- **D-003 (Product duplicate detection):** Deterministic normalized key: `catalog_scope` + `client_id` (if client product) + `normalized(name)` + `category_id` + `brand` + `canonicalized_attributes`. Exact duplicates blocked; similar products trigger warnings. AI never resolves duplicates autonomously.
- **D-004 (Inventory condition & balance model):** Mutually exclusive condition buckets: Usable, Damaged, Expired.
  $$\text{Physical Qty} = \text{Usable} + \text{Damaged} + \text{Expired}$$
  $$\text{Available Qty} = \text{Usable} - \text{Reserved} \ge 0$$
  Reservations are an active hold on usable stock, avoiding double-counting.
- **D-008 (Client account model):** One shared account per client organization initially (password reset on staff turnover). Schema designed to cleanly support named individual accounts (`client_users`) in the future. Audit trail accurately identifies the account.
- **D-009 (Database & Object Storage Platform):** Neon Serverless PostgreSQL selected for primary relational storage (ACID transactions, continuous WAL, branching); Neon Object Storage selected for S3-compatible file/document storage.
- **D-010 (Runtime & Container Architecture):** Docker container requirements removed. Direct Node.js runtime and serverless deployment models approved for development, CI and production.
- **D-013 & D-014 (Conversion and specification changes):** Historical transactions permanently preserve the snapshot conversion ratio and specification version at transaction time. Material changes require a new version, effective date, and Super Admin approval before applying to future transactions. Never silently recalculate history.

## Deferred / Open during development
- **D-005 / D-006 Batch approval semantics — confirmed baseline:** Super Admin may approve selected valid rows or all valid rows in partial mode; invalid rows remain unposted. All-or-nothing batches post all eligible rows atomically or none. Rejection applies to the submitted batch. The UI/API must not imply a decision that is not persisted.
- **D-007 Client Admin permissions — confirmed baseline:** Client Admin access is strictly scoped to its own organization for inventory, reports, audit visibility and import drafts; server authorization is mandatory.
- **D-011 Data retention & legal review:** Configure default retention schedules for audit logs, drafts, and attachments.
- **D-015 Source types & file constraints:** Configure initial source types and upload constraints (MIME, size limits).

The owner authorized implementation on 2026-10-15. Authorization does not resolve D-011 or D-015. See `16_IMPLEMENTATION_AUDIT.md` for implementation status and gaps verified against code.

## Change control
Any new business rule must be recorded with ID, decision, rationale, date, owner and impacted documents. Update all affected documents together. The coding agent must not invent a value for an open decision; it should flag/block affected implementation until resolved.
