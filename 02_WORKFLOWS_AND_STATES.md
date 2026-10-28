# Workflow & State-Machine Specification
**Version:** 1.0 | **Purpose:** Define allowed state transitions and stock effects.

## 1. General transaction lifecycle
States: `DRAFT → SUBMITTED/PENDING_APPROVAL → APPROVED → POSTED/COMPLETED`; alternatives: `REJECTED`, `CANCELLED`, and workflow-specific `IN_TRANSIT`, `AWAITING_RECEIPT`, `DISCREPANCY_HOLD`.
- Draft/imported data does not affect stock.
- Submission validates authorization, product status, units, assignment, quantity and required attachments.
- Approval is recorded before the ledger posting, in the same database transaction as the stock effect.
- A request may not transition out of a terminal state by ordinary editing.
- Reversal/correction is a new linked transaction.

## 2. Stock-out request and reservations
1. Requester chooses product, quantity/unit, source warehouse and destination/purpose.
2. Server calculates available = usable stock − active reservations.
3. On submit, reservation is created atomically if available quantity is sufficient.
4. Pending edit recalculates reservation atomically. If increased quantity is unavailable, preserve old values and reservation. If product changes, reserve replacement first, then release old reservation in one transaction.
5. Requester can cancel only their own pending request. Cancellation releases reservation.
6. Super Admin rejection releases reservation immediately.
7. Approval converts reservation to actual stock deduction once; idempotency prevents duplicate posting.
8. Reservation does not expire automatically.

## 3. Concurrency example
If 100 usable units exist, request A reserves 90, leaving 10 available. A second request for 20 fails. A pending stock-in does not count until approved and posted. Once 50 units of stock-in is approved, up to 50 additional units become available, subject to other reservations and stock conditions.

## 4. Stock-in
- Submit quantity, source type, product/unit, and optional note/attachment. Product lot and expiry data are not collected.
- Opening stock, direct project stock-in, corrections and other stock-in types require approval.
- Stock is increased only on approval/posting.
- Define source types in configurable master data; initial suggested types: direct purchase, opening stock, department return, donation, other.

## 5. Warehouse-to-project dispatch
### Warehouse assignment and Store Admin scoping
- Super Admin assigns warehouses to Store Admins.
- Cardinality: One Store Admin may manage one or more warehouses (`1 Store Admin : N Warehouses`). Each warehouse has at most one Store Admin assigned (`1 Warehouse : 0..1 Store Admin`).
- Store Admin queries, balance views, stock requests, shipments, and inventory movements are strictly scoped to all warehouses assigned to the authenticated Store Admin.

1. Store Admin requests dispatch from their own warehouse to an assigned project.
2. Super Admin approves dispatch.
3. Approval deducts warehouse stock and creates shipment/in-transit record atomically.
4. Project-facing receipt behavior is controlled by a Super Admin setting.
5. If receipt confirmation is enabled: destination records received quantities; Super Admin approves them into destination usable stock. A short receipt remains on `DISCREPANCY_HOLD` until the Super Admin makes one final decision: mark the short quantity missing, or classify it as a calculation mistake and return it to the source warehouse.
6. If receipt confirmation is disabled: a separately approved configuration decision must define whether project stock is credited on dispatch approval or through an automatic completion event. Do not infer silently.
7. Project Admin must not see source warehouse identity on inbound UI.
8. Assignment removal blocks new dispatch requests but existing approved/in-transit shipments finish under their original authorization.

## 6. Warehouse transfer
- One source warehouse per request/batch; no automatic allocation across warehouses.
- Source dispatch approval deducts source stock and creates in-transit quantity.
- Destination receipt is recorded and approved before destination usable stock increases.
- Example: 20 dispatched, 18 received. Super Admin approves 18 into destination usable stock. The shipment stays on hold until Super Admin either marks 2 missing (audited, reportable loss; no balance credit) or classifies the count as a calculation mistake (idempotent stock-in of 2 to source warehouse). A shipment decision applies to all discrepancy lines and cannot be changed.

## 7. Physical count vs historical correction
- **Physical count adjustment:** record system quantity, counted quantity, variance, reason and evidence; approval posts the difference as a new adjustment.
- **Historical transaction correction:** reference original entry and create reversal/corrected replacement ledger entries. Never edit/delete the original posted ledger entry.

## 8. Manufacturing
### Linked production
- Project records production run, inputs consumed, planned/actual output, wastage and optional notes.
- The submitting Project Admin may delete their own `DRAFT` run; it has no inventory effect. Submitted and approved runs cannot be deleted through ordinary actions and remain available for approval and audit history.
- Validate input stock and product/unit rules.
- Super Admin approval posts all input deductions and output additions atomically. No partial posting.
### Separate transactions
- Raw material consumption is a stock-out request; finished product creation is a stock-in request. Each independently requires approval.
- Manufacturing runs accept only approved raw materials currently or historically stocked at the requesting project and approved manufactured-product outputs owned by that project. Product type, project ownership, and stock availability are validated on the server.
- Preserve links where the user supplies a common production reference.

## 9. Department issue and return
- Project Admin maintains department list; create/edit/deactivate requires Super Admin approval.
- Issue to internal departments is conducted on the basis of physical indent forms provided to departments.
- Each department fills out a physical indent form with an Indent Form Number, receiving department name, required products, and requested quantities.
- Project Admin receives the physical indent form and inputs the lines into the daily department-issue draft, recording the physical `indent_number`, `requested_quantity` (written on paper), and `quantity` (supplied quantity to be deducted from usable project stock).
- Project Admin maintains one open daily department-issue draft per project and can add/edit/remove lines across departments and approved manufactured products with project stock throughout the day. This is the project stock-out flow; each line selects its department and associated Indent Form Number. Saving the draft has no inventory effect.
- All draft and posted department issues are presented grouped by Indent Form Number in a tabular layout, displaying requested quantity vs supplied quantity, unit, fulfillment status (`Full` if supplied >= requested, `Partial` if supplied < requested), notes, and line actions.
- Submitting the daily draft revalidates every line and reserves all required usable stock atomically. If any line fails validation or availability, nothing is submitted or reserved.
- If department-issue approval is enabled (default), the entire submitted draft is one Super Admin decision. Rejection releases all reservations; approval consumes all reservations and posts every line in one transaction. No department stock balance is maintained.
- If approval is disabled in Super Admin settings, submission validates and posts every line atomically, marks the batch `POSTED`, and records an audit event. It never creates an unreviewed partial posting.
- Return records only usable product quantities, unit, reason, optional attachment and original issue link where available.
- Department returns require Super Admin approval by default; the per-workflow setting may allow validated immediate posting. Approved usable returns restore project usable stock. Damaged items are submitted as stock-out requests, flagged DAMAGED, and deducted from usable stock on approval.

## 10. Inventory condition and damage
- Stock balances contain usable and reserved quantities only. Available = usable − reserved; no negative available quantity is permitted.
- Damaged stock is a stock-out request with condition DAMAGED and a required reason. Approval deducts usable stock and writes the condition/reason to the append-only ledger; there is no damaged or expired balance bucket.
- Lot, batch, and expiry tracking, alerts, and rules are removed.

## 11. Bulk batches
- Import creates an editable draft with row-level errors; no stock effect.
- Duplicate rows are flagged; user chooses keep separate or explicitly merge. Never silently merge. Preserve original row details in audit.
- Each batch has one batch ID; Super Admin chooses partial approval or all-or-nothing where supported.
- For all-or-nothing, validate every row and commit all approved movements in one DB transaction or none. For partial mode, approved rows post; rejected/pending rows do not.
- Stock-out rows in one batch must all use the same source warehouse.
- Each row keeps independent status and traceability to the batch.

## 12. Daily closing
- Project Admin can submit operations individually or group day's transactions into a daily report.
- Transactions retain their own states. A transaction cannot be approved twice or belong to multiple active batches.
- Super Admin can reject selected transactions or reject the entire batch. Only approved transactions post.
- Report separates approved, pending and rejected items.

## 13. Cancellation and editing
- Only original requester cancels own pending request.
- Pending edit uses atomic validation and reservation recalculation.
- Approved/rejected requests are locked to ordinary editing; use new correction/reversal workflow.
- Every edit records old/new values, editor, timestamp and reservation delta.

## 14. Open workflow decisions
1. Receipt-disabled shipment completion and project stock-credit timing.
3. Whether stock-in batches need the same all-or-nothing options as product creation and stock-out batches in every workflow.
4. Whether non-department daily reports should become approval units (department issue batches are resolved by D-017).

## 15. Configurable approval policy
- Super Admin controls approval requirements per stock-request type, shipment receipt, manufacturing, department issue, department return, and stock-in/stock-out import.
- Every setting defaults to approval required. Physical-count imports remain approval-gated because immediate posting is not supported for that workflow.
- Disabling approval affects only submissions made after the setting change. Existing drafts and pending approvals retain their current workflow and status.
- For any no-approval workflow, all server-side validation, concurrency checks, ledger writes, balance projections, reservation transitions, state updates, and audit records must commit atomically. A failed transaction changes none of them.
