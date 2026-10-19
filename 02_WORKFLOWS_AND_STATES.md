# Workflow & State-Machine Specification
**Version:** 1.0 | **Purpose:** Define allowed state transitions and stock effects.

## 1. General transaction lifecycle
States: `DRAFT → SUBMITTED/PENDING_APPROVAL → APPROVED → POSTED/COMPLETED`; alternatives: `REJECTED`, `CANCELLED`, and workflow-specific `IN_TRANSIT`, `AWAITING_RECEIPT`, `DISCREPANCY_HOLD`.
- Draft/imported data does not affect stock.
- Submission validates authorization, product status, units, tracking fields, assignment, quantity and required attachments.
- Approval is recorded before the ledger posting, in the same database transaction as the stock effect.
- A request may not transition out of a terminal state by ordinary editing.
- Reversal/correction is a new linked transaction.

## 2. Stock-out request and reservations
1. Requester chooses product, quantity/unit, source warehouse and destination/purpose.
2. Server calculates available = eligible physical stock − active reservations; excludes expired/damaged stock.
3. On submit, reservation is created atomically if available quantity is sufficient.
4. Pending edit recalculates reservation atomically. If increased quantity is unavailable, preserve old values and reservation. If product changes, reserve replacement first, then release old reservation in one transaction.
5. Requester can cancel only their own pending request. Cancellation releases reservation.
6. Super Admin rejection releases reservation immediately.
7. Approval converts reservation to actual stock deduction once; idempotency prevents duplicate posting.
8. Reservation does not expire automatically.

## 3. Concurrency example
If 100 usable units exist, request A reserves 90, leaving 10 available. A second request for 20 fails. A pending stock-in does not count until approved and posted. Once 50 units of stock-in is approved, up to 50 additional units become available, subject to other reservations and stock conditions.

## 4. Stock-in
- Submit quantity, source type, product/unit, optional note/attachment, and a lot number only when batch tracking is configured. Expiry date is always optional.
- Opening stock, direct client stock-in, corrections and other stock-in types require approval.
- Stock is increased only on approval/posting.
- Define source types in configurable master data; initial suggested types: direct purchase, opening stock, department return, donation, other.

## 5. Warehouse-to-client dispatch
1. Store Admin requests dispatch from their own warehouse to an assigned client.
2. Super Admin approves dispatch.
3. Approval deducts warehouse stock and creates shipment/in-transit record atomically.
4. Client-facing receipt behavior is controlled by a Super Admin setting.
5. If receipt confirmation is enabled: client records received quantity; Super Admin makes final receipt decision; approved received quantity updates client usable stock and shipment closes.
6. If receipt confirmation is disabled: a separately approved configuration decision must define whether client stock is credited on dispatch approval or through an automatic completion event. Do not infer silently.
7. Client Admin must not see source warehouse identity on inbound UI.
8. Assignment removal blocks new dispatch requests but existing approved/in-transit shipments finish under their original authorization.

## 6. Warehouse transfer
- One source warehouse per request/batch; no automatic allocation across warehouses.
- Source dispatch approval deducts source stock and creates in-transit quantity.
- Destination receipt is recorded and approved before destination usable stock increases.
- Example: 100 dispatched, 95 received. System records 95 at destination only after approval and records 5 as discrepancy. Do not silently write off the missing 5. Super Admin may approve received quantity, hold for investigation, or request correction; loss adjustment is a separate approved transaction.

## 7. Physical count vs historical correction
- **Physical count adjustment:** record system quantity, counted quantity, variance, reason and evidence; approval posts the difference as a new adjustment.
- **Historical transaction correction:** reference original entry and create reversal/corrected replacement ledger entries. Never edit/delete the original posted ledger entry.

## 8. Manufacturing
### Linked production
- Client records production run, inputs consumed, planned/actual output, wastage and optional notes.
- The submitting Client Admin may delete their own `DRAFT` run; it has no inventory effect. Submitted and approved runs cannot be deleted through ordinary actions and remain available for approval and audit history.
- Validate input stock and product/unit rules.
- Super Admin approval posts all input deductions and output additions atomically. No partial posting.
### Separate transactions
- Raw material consumption is a stock-out request; finished product creation is a stock-in request. Each independently requires approval.
- Manufacturing runs accept only approved raw materials currently or historically stocked at the requesting client and approved manufactured-product outputs owned by that client. Product type, client ownership, and stock availability are validated on the server.
- Preserve links where the user supplies a common production reference.

## 9. Department issue and return
- Client Admin maintains department list; create/edit/deactivate requires Super Admin approval.
- Client Admin maintains one open daily department-issue draft per client and can add/edit/remove lines across departments and approved manufactured products with client stock throughout the day. This is the client stock-out flow; each line selects its department. Saving the draft has no inventory effect.
- Submitting the daily draft revalidates every line and reserves all required usable stock atomically. If any line fails validation or availability, nothing is submitted or reserved.
- If department-issue approval is enabled (default), the entire submitted draft is one Super Admin decision. Rejection releases all reservations; approval consumes all reservations and posts every line in one transaction. No department stock balance is maintained.
- If approval is disabled in Super Admin settings, submission validates and posts every line atomically, marks the batch `POSTED`, and records an audit event. It never creates an unreviewed partial posting.
- Return records product, quantity, unit, condition (usable/damaged/expired), reason, optional attachment and original issue link where available.
- Department returns require Super Admin approval by default; the per-workflow setting may allow validated immediate posting. Usable returns restore client usable stock; damaged/expired return quantities remain excluded from usable stock and may require a separately approved write-off.

## 10. Batch and expiry
- Tracking is configured per product: none, batch, expiry, or both.
- Required fields enforced only when enabled.
- Expiry warnings default to 90, 30 and 7 days before expiry; Super Admin can configure intervals.
- Expired quantity is excluded from usable stock and blocked from routine issue/dispatch. Disposal/write-off is separately approved.
- No separate quarantine workflow is in scope.

## 11. Bulk batches
- Import creates an editable draft with row-level errors; no stock effect.
- Duplicate rows are flagged; user chooses keep separate or explicitly merge. Never silently merge. Preserve original row details in audit.
- Each batch has one batch ID; Super Admin chooses partial approval or all-or-nothing where supported.
- For all-or-nothing, validate every row and commit all approved movements in one DB transaction or none. For partial mode, approved rows post; rejected/pending rows do not.
- Stock-out rows in one batch must all use the same source warehouse.
- Each row keeps independent status and traceability to the batch.

## 12. Daily closing
- Client Admin can submit operations individually or group day's transactions into a daily report.
- Transactions retain their own states. A transaction cannot be approved twice or belong to multiple active batches.
- Super Admin can reject selected transactions or reject the entire batch. Only approved transactions post.
- Report separates approved, pending and rejected items.

## 13. Cancellation and editing
- Only original requester cancels own pending request.
- Pending edit uses atomic validation and reservation recalculation.
- Approved/rejected requests are locked to ordinary editing; use new correction/reversal workflow.
- Every edit records old/new values, editor, timestamp and reservation delta.

## 14. Open workflow decisions
1. Receipt-disabled shipment completion and client stock-credit timing.
2. Missing/damaged shipment quantities and whether separate discrepancy workflow is required for client shipments as well as warehouse transfers.
3. Whether stock-in batches need the same all-or-nothing options as product creation and stock-out batches in every workflow.
4. Whether non-department daily reports should become approval units (department issue batches are resolved by D-017).

## 15. Configurable approval policy
- Super Admin controls approval requirements per stock-request type, shipment receipt, manufacturing, department issue, department return, and stock-in/stock-out import.
- Every setting defaults to approval required. Physical-count imports remain approval-gated because immediate posting is not supported for that workflow.
- Disabling approval affects only submissions made after the setting change. Existing drafts and pending approvals retain their current workflow and status.
- For any no-approval workflow, all server-side validation, concurrency checks, ledger writes, balance projections, reservation transitions, state updates, and audit records must commit atomically. A failed transaction changes none of them.
