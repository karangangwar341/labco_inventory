# Product Requirements Document (PRD)
## Warehouse, Project Manufacturing & Inventory Management System
**Version:** 1.0 | **Status:** Implementation authorized by owner on 2026-10-15; implementation audit and open decisions tracked in `16_IMPLEMENTATION_AUDIT.md` and `11_DECISIONS.md`.

## 1. Product purpose
Provide an online system for a company to manage warehouse inventory, project supply, project-side manufacturing, department issues/returns, approvals, bulk imports and reporting. Stock changes must be controlled, auditable and concurrency-safe.

## 2. Users and organizational model
- **Super Admin:** company-wide administrator; creates/disables/resets accounts; manages warehouse/project assignments; manages company catalog and global settings; reviews and approves all inventory-affecting operations; can view company and project data.
- **Store Admin:** operates their assigned warehouse; views stock/history/reports; submits stock-in/out, transfer and correction requests. Cannot create/edit product catalog or categories.
- **Project Admin:** operates their project account; manages project products, manufacturing records, departments, project inventory transactions and daily reports as permitted by the approved workflow.
- Accounts are provisioned only by Super Admin. A project account may be handed over to new personnel by resetting the same account's password. This shared-account model does not prove which individual used it; consider named accounts before production.

## 3. Scope
### In scope
- Company warehouses and Super-Admin-controlled project-to-warehouse assignments (many-to-many).
- Company product catalog and separate project product catalog.
- Stock-in/out, transfers, dispatch/in-transit/receipt, opening stock, physical adjustments and transaction corrections.
- Reservations for pending stock-out requests.
- Project manufacturing, department issue history, usable returns, and damaged stock-out requests.
- Bulk CSV and image/scanned-document extraction with editable human review.
- Approval queue, notifications, audit, reports and exports.
- Online-only operation; no offline mode.
### Out of scope unless separately approved
- Purchase/selling cost, currency, inventory valuation.
- Barcode scanning.
- Offline transactions.
- AI-driven duplicate decisions or natural-language command execution.
- Email/SMS/push notifications.
- Automated warehouse selection/allocation.

## 4. Core requirements
**REQ-001** Super Admin approval is required by default for supported inventory-changing workflows. Super Admin may configure each supported workflow to post immediately after server validation; immediate posting must be atomic, idempotent, and audited. Policy changes apply only to new submissions; pending items retain their submitted policy/state.
**REQ-002** Upload/import must never alter finalized inventory. Extracted rows must be reviewed, validated, submitted and approved.
**REQ-003** Inventory movements must use an append-only ledger; corrections create compensating/reversal entries rather than editing historical movements.
**REQ-004** No negative usable stock. Reservation and posting checks must be atomic under concurrent requests.
**REQ-005** Pending stock-out requests reserve available stock immediately. Reservations are released on rejection or requester cancellation; approval converts reservation into a posted deduction without double-deduction.
**REQ-006** A pending request can be edited only after revalidating availability and atomically recalculating reservations. Failed edits preserve the original request and reservation.
**REQ-007** Only the original requester may cancel their own pending request.
**REQ-008** Company products are managed by Super Admin; project products by Project Admin, with Super Admin approval before they become transaction-eligible.
**REQ-009** Project-to-warehouse assignments are controlled by Super Admin. Removing an assignment blocks new requests but does not interrupt already approved/in-transit movements.
**REQ-010** Units and conversions are explicit. Conversion edits are audited; historical transactions preserve the conversion rule used at transaction time.
**REQ-011** Quantity precision is configurable per product up to two decimal places. Whole-unit products reject fractions.
**REQ-012** Products and stock movements have no lot, batch, or expiry tracking fields or rules.
**REQ-013** Damaged stock is reported through the normal approval-gated stock-out workflow. Approval deducts usable inventory once and records the DAMAGED condition and reason on the immutable ledger transaction; no damaged balance is maintained.
**REQ-014** Manufacturing linked mode posts raw material consumption and finished product output atomically after approval. Separate stock-out and stock-in mode is also supported.
**REQ-015** Departments have issue/return history only; no separate department stock balance.
**REQ-016** Every approval/rejection captures actor, timestamp, decision and reason where applicable. Duplicate approval clicks must not post twice.
**REQ-017** User/account, catalog, assignment, security, export and transaction events are audited.
**REQ-018** Low-stock alerts remain visible until recovered; notify once when crossing below threshold and again only after recovery then a new crossing.
**REQ-019** Daily automatic backups are retained 90 days. Backup failure retries automatically and alerts Super Admin persistently until success.
**REQ-020** All workflows and data access are server-authorized; frontend visibility is not an authorization boundary.
**REQ-021** Project Admins can maintain one open daily department-issue draft per project, containing multiple departments and products, and submit the complete set as one all-or-nothing decision.

## 5. Product catalog
- The company catalog contains raw materials; each project has a separate catalog for manufactured products. Project Admins can create manufactured products only, using categories owned by their project. Super Admins create company raw materials. Existing products default to raw material. Product type is fixed after creation to preserve clear stock and production history.
- Manufacturing input choices are limited to approved raw materials with current project balances or stock-ledger history at that project. Output choices are approved manufactured products from that same project’s catalog. Project stock-out is recorded through the daily department issue workflow; each line selects an active department and an approved manufactured product from that project’s catalog with available stock.
- No SKU/product-code field.
- Optional image, description and batch details.
- Flexible physical attributes (e.g. weight, length, breadth, thickness, diameter) are distinct from inventory unit/quantity.
- Category → subcategory → optional brand → product name/grade → specifications.
- Product units/conversion ratios can include e.g. 1 box = 12 pieces.
- Duplicate detection is deterministic: block exact normalized duplicates unless Super Admin explicitly reuses/resolves; warn on similar names; same base name with different specifications can be distinct. Final duplicate key remains an open schema decision.
- Project-created products are pending until approved; stock transactions are blocked while pending.

## 6. Approval and priority
- Super Admin may approve any eligible request in any order; dependencies must be enforced.
- Priority values: Low, Normal, High/Urgent. Default Normal. Requester may suggest priority and explain; Super Admin confirms/changes it. Priority affects visibility/sorting only.
- In-app notifications and persistent request bar. Sound off by default but configurable. No email/SMS/push.
- Approval is click-to-approve; no password re-entry. Session and server permissions must be checked.

## 7. Reports and exports
- Current stock by warehouse/product.
- Stock-in/out history with filters.
- Low-stock/shortage reports.
- Project-wise dispatch, inbound and receipt reports.
- Manufacturing input/output/wastage and department issue/return history.
- Export PDF, XLSX, CSV and print-friendly reports. Export/download events are audited.

## 8. Non-functional requirements
- Strong transactional consistency for stock ledger, reservations and balances.
- Server-side authorization and input validation.
- Secure password hashing; no plaintext passwords or secrets in logs.
- Search/filter/pagination for large lists; bulk imports should support row-level error correction.
- Accessible, responsive web UI.
- Observability for application errors, background jobs, failed backups and security events.
- Recovery objectives (RPO/RTO), hosting, scale targets and applicable regulatory requirements remain open.

## 9. Acceptance baseline
Use `07_TEST_PLAN.md` for detailed scenarios. Release must be blocked by any test that permits negative stock, duplicate posting, unauthorized approvals, unapproved inventory changes, or silent historical mutation.
