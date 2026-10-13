# UI/UX Specification
**Version:** 0.1 | Wireframes are not yet approved; use this as screen inventory and behavior contract.

## 1. UX principles
- Clear role-specific navigation and data scoping.
- Approval and stock status always visible.
- No action that changes finalized stock from a draft/import screen.
- Show usable, reserved, in-transit, damaged and expired quantities distinctly.
- Confirm destructive/irreversible workflow actions; provide reason fields for rejection/correction.
- Accessible contrast, keyboard operation, labels, validation messages and responsive layout.
- Use consistent status, priority, date, quantity and unit presentation.

## 2. Shared screens
1. Login / locked account / session replaced.
2. Role dashboard with pending work and notifications.
3. Notification center and persistent pending-request bar.
4. Profile/account session status (no self-service account creation).
5. Searchable transaction history.
6. Report center, export format selection and export audit.

## 3. Super Admin screens
- Company dashboard: pending counts, age, requester, client/warehouse, priority.
- Approval queue with tabs: warehouse stock-in/out/transfers; client stock-in/out; manufacturing; departments/issues; returns/damage/expiry; corrections; daily batches; product approvals.
- Request detail: original values, attachments, reservations, stock availability, history, approve/reject, reason, priority controls.
- Company product/category catalog; product units/conversions; threshold and tracking configuration.
- Client product approval and product-change review.
- Client/warehouse assignment management with effective history.
- User account management: create, disable, reset password; sessions revoked on reset/disable.
- Import review: extracted field mapping, confidence/uncertainty indicators, duplicate warnings, row-level edit, validation, approval-mode selection.
- Global settings: expiry warnings, receipt-confirmation toggle, notification sound, quantity settings, source types.
- Audit/security log, reports, backup health.

## 4. Store Admin screens
- Own warehouse dashboard and stock availability.
- Stock-in request form.
- Stock-out/dispatch request form with client assignment validation.
- Warehouse transfer request form.
- Physical count/correction request.
- Pending requests and editable/cancellable requests submitted by the current account.
- In-transit transfers and receipt/discrepancy handling where assigned.
- Inventory history and scoped reports/exports.
- No catalog creation or category management.

## 5. Client Admin screens
- Own client dashboard and inventory (available, reserved if applicable, inbound/in-transit, damaged, expired).
- Client product catalog and pending product submissions.
- Direct stock-in and stock-out request forms.
- Manufacturing run form (linked and separate modes).
- Department list and proposed changes.
- Department issue and return forms with condition, reason and optional attachment.
- Daily report/batch preparation, per-transaction statuses and row-level corrections.
- Incoming shipment view must hide source warehouse identity.
- Client inventory reports/exports according to final permissions.

## 6. Bulk import experience
1. Upload file/image/document.
2. Show processing state and file security scan status.
3. Extract/map fields to known system fields.
4. Display editable table with confidence warnings and row/field validation.
5. Allow add/remove rows, correction without re-upload, duplicate row keep/merge choices.
6. Revalidate before submission.
7. Show batch ID and status; no inventory changes until approval/posting.
8. Show row-by-row final outcome and exportable error report.

## 7. Required UI states
Loading, empty state, network error, permission denied, session expired/replaced, validation failure, duplicate warning, low stock, pending approval, rejected with reason, cancelled, in transit, discrepancy hold, expired batch blocked, import partially valid, all-or-nothing validation failure, backup failure warning.

## 8. Interaction safeguards
- Disable repeated submit/approve controls while a request is in progress, but also enforce server-side idempotency.
- Explain why an edit cannot be saved if extra stock cannot be reserved.
- Display the difference between physical, reserved and usable-available stock.
- Never imply an uploaded document has changed stock.
- Confirm that all-or-nothing batches will post zero rows if any required validation/approval condition fails.
