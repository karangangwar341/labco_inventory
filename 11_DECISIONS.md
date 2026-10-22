# Decision Register & Open Questions
**Version:** 1.0 | Use this file as the single source of truth for decisions not yet finalized.

## Confirmed baseline decisions & architecture
- **D-016 (Catalog ownership and product kind):** The company catalog is for raw materials; each project owns a separate catalog for manufactured products and categories. Project Admins create manufactured products only; Super Admins create raw materials. Existing products default to raw material. Manufacturing inputs must be approved raw materials with current or historical stock at that project; outputs must belong to that project’s approved manufactured-product catalog. Product kind is immutable after creation.
- **D-017 (Configurable approvals and daily department issues, 2026-10-18):** Super Admin may configure approval requirement for each supported stock request type, shipment receipt, manufacturing, department issue/return, and stock-in/stock-out import. Every setting defaults to required. Existing drafts/pending submissions retain their state when settings change. When approval is disabled, the server validates and posts atomically with idempotency and audit. Each project has one open daily department issue draft, editable through the day and submitted as a single all-or-nothing transaction/decision; submitted lines reserve usable stock until approval or rejection. Physical-count imports remain approval-gated until immediate posting is fully supported.
- **D-018 (Unified project stock-out, 2026-10-18):** Project stock-out to internal departments uses the daily department issue batch as its single entry flow. Each line selects an active department and an approved project-owned manufactured product with project stock. Raw materials are company warehouse inventory for manufacturing inputs and are not issued to departments. Warehouse stock-out and dispatch remain separate Store Admin workflows.
- Design baseline approved; Phase 1 implementation authorized by owner.
- Online-only; no offline mode.
- No barcode scanning.
- No purchase/selling prices, currency or inventory valuation.
- Super Admin approves all inventory-affecting requests.
- Approval policy is configurable per supported workflow by Super Admin. All workflows default to approval required; disabling approval permits immediate validated/atomic posting for new submissions only. This supersedes the previous fixed-approval baseline.
- Company product catalog is managed by Super Admin; project catalog by Project Admin with approval before transactions.
- Project-to-warehouse assignment is many-to-many and Super-Admin-controlled.
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
- Lot, product-batch, and expiry tracking are removed. Damaged items are stock-out lines that require a reason and remain flagged in the immutable ledger; they reduce usable stock after approval.
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
- **D-001 (Receipt confirmation disabled):** When disabled, on Super Admin dispatch approval, warehouse stock decreases and project stock increases atomically in the same database transaction. In-transit tracking is bypassed.
- **D-002 (Shipment discrepancies):** On receipt approval, only confirmed received quantities enter destination usable stock. Any shortage leaves the shipment on `DISCREPANCY_HOLD` until resolved under D-020.
- **D-003 (Product duplicate detection):** Deterministic normalized key: `catalog_scope` + `project_id` (if project product) + `normalized(name)` + `category_id` + `brand` + `canonicalized_attributes`. Exact duplicates blocked; similar products trigger warnings. AI never resolves duplicates autonomously.
- **D-004 (Inventory balance model):** Inventory projections store usable and reserved quantities. Available = Usable − Reserved ≥ 0. Damaged stock is removed through an approved stock-out and recorded as DAMAGED on the append-only ledger; no damaged or expired balance bucket exists.
- **D-008 (Project account model):** One shared account per project organization initially (password reset on staff turnover). Schema supports named individual project staff accounts. Audit trail accurately identifies the account.
- **D-009 (Database & Object Storage Platform):** Neon Serverless PostgreSQL selected for primary relational storage (ACID transactions, continuous WAL, branching); Neon Object Storage selected for S3-compatible file/document storage.
- **D-010 (Runtime & Container Architecture):** Docker container requirements removed. Direct Node.js runtime and serverless deployment models approved for development, CI and production.
- **D-013 & D-014 (Conversion and specification changes):** Historical transactions permanently preserve the snapshot conversion ratio and specification version at transaction time. Material changes require a new version, effective date, and Super Admin approval before applying to future transactions. Never silently recalculate history.

## Confirmed follow-up decisions
- **D-020 (Shipment discrepancy resolution and missing-stock reporting, 2026-10-23):** Following receipt approval, Super Admin resolves all shortage lines on a shipment with exactly one decision: `MISSING` (record an immutable audited missing-stock outcome, without crediting either location) or `CALCULATION_MISTAKE` (post the shortage back to the source warehouse through an idempotent stock-in ledger transaction). Both close the hold; decisions cannot be changed. The Super Admin missing-stock report groups resolved missing quantities by product in base units, filtered by the resolution date range and optional product/location scope. Shipment lines preserve their conversion-to-base snapshot for historical reporting. No separate missing-stock balance is maintained.

## Deferred / Open during development
- **D-019 (No product lot/expiry tracking and Projects terminology, 2026-10-22):** Remove product-level lot and expiry data, validation, alerts, and balance buckets. Preserve workflow groupings for imports, daily department issues, and other atomic operations. Rename the organization domain and administrator role to Project/PROJECT_ADMIN throughout. Damaged stock is recorded as a reason-required stock-out with DAMAGED condition on the immutable transaction.
- **D-005 / D-006 Batch approval semantics — confirmed baseline:** Super Admin may approve selected valid rows or all valid rows in partial mode; invalid rows remain unposted. All-or-nothing batches post all eligible rows atomically or none. Rejection applies to the submitted batch. The UI/API must not imply a decision that is not persisted.
- **D-007 Project Admin permissions — confirmed baseline:** Project Admin access is strictly scoped to its own organization for inventory, reports, audit visibility and import drafts; server authorization is mandatory.
- **D-011 Data retention & legal review:** Configure default retention schedules for audit logs, drafts, and attachments.
- **D-015 Source types & file constraints:** Configure initial source types and upload constraints (MIME, size limits).

The owner authorized implementation on 2026-10-15. Authorization does not resolve D-011 or D-015. See `16_IMPLEMENTATION_AUDIT.md` for implementation status and gaps verified against code.

## Change control
Any new business rule must be recorded with ID, decision, rationale, date, owner and impacted documents. Update all affected documents together. The coding agent must not invent a value for an open decision; it should flag/block affected implementation until resolved.
