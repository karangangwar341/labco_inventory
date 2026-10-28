# UI/UX Specification
**Version:** 0.1 | Wireframes are not yet approved; use this as screen inventory and behavior contract.

## 1. UX principles
- Clear role-specific navigation and data scoping.
- Approval and stock status always visible.
- No action that changes finalized stock from a draft/import screen.
- Show usable, reserved, and in-transit quantities. Damaged items are represented in stock-out request and ledger history, not as a balance.
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
- Company dashboard: pending counts, age, requester, project/warehouse, priority.
- Approval queue with tabs: warehouse stock-in/out/transfers; project stock-in/out; manufacturing; departments/issues/returns; corrections; daily grouped workflows; product approvals.
- Request detail: original values, attachments, reservations, stock availability, history, approve/reject, reason, priority controls.
- Company product/category catalog; product units/conversions; threshold configuration.
- Project product approval and product-change review.
- Project operations overview: Super Admin can open a separate, project-scoped view of posted stock, manufacturing runs, and department issue/return reports. Department and manufacturing workspaces remain in the Project Admin navigation; Super Admin reviews their pending inventory changes through Approvals.
- Project Production Jobs page: show run counts and clear draft, waiting approval, approved, and rejected states. Project Admin can save, reopen, edit, or delete their own draft, then submit it for Super Admin approval from its details. Submitted and approved runs are retained. State clearly that drafts and pending approval do not change inventory; approval posts raw-material deductions and finished output atomically. Capture planned output, actual output when complete, wastage, and optional reference/notes.
- Department issue page: provide one open daily draft per Project Admin, with editable/removable lines across multiple active departments and manufactured products. Issues are tracked by physical Indent Form Number, capturing both requested quantity (from the paper form) and supplied quantity (from usable stock). Issues are presented grouped by Indent Form Number in a tabular layout with fulfillment badges (Full/Partial). Show the reserved quantities only after submission, and present the batch as a single approval outcome. Super Admin settings expose a clear approval-required toggle for every supported workflow; all toggles default on.
- Project/warehouse assignment management with effective history.
- Warehouse management allows Super Admin to register, edit, and assign any warehouse to any Store Admin via a Store Admin selector. Warehouse cards display assigned Store Admin badges (`👤 {username}`) or `Unassigned`. Each warehouse has at most one Store Admin; Store Admins can manage multiple warehouses. User management displays all managed warehouses for each Store Admin.
- User account management: create, disable, reset password; sessions revoked on reset/disable.
- Import review: extracted field mapping, confidence/uncertainty indicators, duplicate warnings, row-level edit, validation, approval-mode selection.
- Global settings: receipt-confirmation toggle, notification sound, per-workflow approval requirements, quantity settings, source types.
- Audit/security log, reports, backup health.

## 4. Store Admin screens
- Own warehouse dashboard and stock availability.
- Catalog, stock balances, stock movement history, and warehouse reports show approved company raw materials only; never expose project-manufactured products to a Store Admin.
- Stock-in request form.
- Stock-out/dispatch request form with project assignment validation.
- When a product is selected for stock-out, show the available quantity at the assigned warehouse in the selected unit beside the quantity field.
- Warehouse transfer request form.
- Physical count/correction request.
- Pending requests and editable/cancellable requests submitted by the current account.
- In-transit transfers and receipt/discrepancy handling where assigned.
- Shipment discrepancy hold presents exactly two Super Admin decisions: “Mark as missing” or “Calculation mistake — return to warehouse”; show the affected quantity, optional audit note, and final recorded decision.
- Reports include a Super Admin-only Missing Stock dataset grouped by product and base unit, filterable by resolution date range and product/location.
- Inventory history and scoped reports/exports.
- No catalog creation or category management.

## 5. Project Admin screens
- Own project dashboard and inventory (available, reserved if applicable, inbound/in-transit).
- Project product catalog and pending product submissions.
- Stock-in form records items already received at the project location; it is not a warehouse replenishment request and remains approval-gated. Stock-out records product leaving project stock.
- Manufacturing run form (linked and separate modes).
- Department list and proposed changes.
- One daily department-issue draft with editable/removable lines across departments and products, grouped by physical Indent Form Number in a tabular layout comparing requested vs supplied quantities; submission reserves all lines and creates one approval decision.
- Department return forms with condition, reason and optional attachment.
- Daily report/batch preparation, per-transaction statuses and row-level corrections.
- Incoming shipment view must hide source warehouse identity.
- Project inventory reports/exports according to final permissions.

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
Loading, empty state, network error, permission denied, session expired/replaced, validation failure, duplicate warning, low stock, pending approval, rejected with reason, cancelled, in transit, discrepancy hold, import partially valid, all-or-nothing validation failure, backup failure warning.

## 8. Interaction safeguards
- Disable repeated submit/approve controls while a request is in progress, but also enforce server-side idempotency.
- Explain why an edit cannot be saved if extra stock cannot be reserved.
- Display usable, reserved and available stock clearly.
- Never imply an uploaded document has changed stock.
- Confirm that all-or-nothing batches will post zero rows if any required validation/approval condition fails.

## 9. Simplified daily-use experience
**Owner-requested UX update: 2026-10-14.** This addendum reduces the amount shown at first glance while retaining the approved workflows and safeguards above.

- Home dashboards lead with the user's next action and a short list of work that needs attention. Remove technical database, ledger, backup-retention, tenant-isolation, and concurrency details from ordinary user views; operational alerts remain visible to Super Admin when action is needed.
- Store Admin and Project Admin dashboards provide two clear entry points: **Stock in** and **Stock out**. Each dashboard shows only relevant pending requests or incoming deliveries; other specialist workflows remain available under the collapsed **More** navigation group.
- Super Admin dashboard leads with the approval queue. Show a backup warning only when a persistent backup failure needs attention.
- Stock request forms show only fields relevant to the selected direction: assigned location, approved product, quantity, unit, and stock condition. A damaged stock-out requires a reason. Warehouse stock-out is a dispatch to an assigned project; Project Admin stock-out is from the project's own location.
- Optional notes remain collapsed. Standard priority is the default. Users can add further product lines without making advanced workflow settings part of the initial view.
- After submission, state whether the configured workflow is awaiting Super Admin approval or posted immediately. Stock-out availability is held while review is pending; stock-in is not added until approved or immediately posted by policy. A saved draft is clearly labeled and can be submitted from its detail page.
- Add a role-neutral **How to use this system** help page with task-first instructions for stock-in, stock-out, request status, and common problems.
- The navigation keeps Home, Stock, and My requests visible. Specialist pages and administration are grouped under **More** and **Administration**; Help stays visible.

## 10. Product catalog management
- Super Admin can create and edit company products and categories. Project Admin can create and edit products in their own project catalog; proposed project product changes remain subject to Super Admin approval. Store Admin has no catalog management controls.
- Product creation starts with product name and a reusable main category. A brand is a reusable subcategory of that main category; do not show a separate free-text Brand field. Let users choose an existing brand/subcategory or add a brand under the selected main category. Category setup must say whether the user is adding a main category or a brand, and use “Category for this brand” instead of the ambiguous “Under category”. Then collect the base unit, additional units with product-specific conversions, and specifications. Existing unit names and specification names are suggestions; a new value can be entered while creating a product.
- Super Admin catalog creation offers “Add raw material”; Project Admin catalog creation offers “Add manufactured product” and “Add project category”. Project categories are private to that project and are not reused from the company catalog. Show product type in catalog and details. Manufacturing inputs show approved raw materials stocked now or recorded in that project’s stock history; outputs show approved manufactured products from that project’s catalog. Department issues use manufactured products.
- Product editing shows the active definition and submits a version proposal. Product specifications and unit conversions only become active after required Super Admin approval; the form explains the pending state and preserves existing transaction snapshots.
- Keep tracking, fractional quantity, precision, and minimum quantity in a collapsed advanced section unless the user opens it. Do not make a user recreate category, brand, unit, or specification values for each product.
- Keep database identifiers, UUIDs, and internal workflow keys out of routine user views. Use product, project, warehouse, department, status, and meaningful business reference labels; retain IDs only inside links and API actions.
