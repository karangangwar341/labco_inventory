# Database Schema & Data Dictionary (Logical Draft)
**Version:** 0.1 | **Status:** Conceptual model, not executable migration SQL. Finalize after the open decisions in `DECISIONS.md`.

## 1. Design principles
- Relational database using Neon Serverless PostgreSQL with foreign keys and transactional writes.
- Concurrency control via explicit row-level locking (`FOR UPDATE`) and PgBouncer connection pooling.
- Ledger entries are append-only; current balance tables are derived/maintained transactionally.
- Store quantities as fixed-precision decimals, not binary floating point.
- Snapshot unit conversion and relevant product specifications on each transaction line.
- Use UTC timestamps internally; render in user locale.
- Soft-disable master records where history references them; do not cascade-delete ledger/audit history.

## 2. Core entities
| Entity | Purpose | Key fields (illustrative) |
|---|---|---|
| users | Login accounts | id, username, password_hash, role, status, created_at, disabled_at |
| sessions | Active session control & device binding | id, user_id, session_token_hash, device_id, user_agent_hash, ip_address, created_at, last_activity_at, revoked_at |
| login_events | Security audit | id, username_attempted, user_id nullable, outcome, ip_hash/policy-approved metadata, occurred_at |
| projects | Project organizations | id, name, status, created_at |
| warehouses | Company warehouses | id, name, location_description, status, store_admin_id nullable |
| project_warehouse_assignments | Many-to-many scope | id, project_id, warehouse_id, active_from, inactive_from, changed_by |
  | categories | Product taxonomy; one main category level with brand/subcategory children | id, parent_id nullable, name, owner_scope |
| products | Company/project catalog | id, owner_scope, project_id nullable, category_id, kind (RAW_MATERIAL or MANUFACTURED_PRODUCT), name, description, image_ref, status, quantity_precision, allow_fractional, min_quantity |
| product_versions | Immutable proposed/approved product specification snapshots | id, product_id, version_number, status, specification_json, change_reason, submitted_by, reviewed_by, effective_from |
| product_attributes | Flexible physical specs | id, product_id, attribute_name, value, unit, sort_order |
| product_units | Units/conversions | id, product_id, unit_name, is_base_unit, conversion_to_base, effective_from, effective_to, status |
| stock_locations | Inventory scope | id, location_type, warehouse_id nullable, project_id nullable |
| inventory_balances | Fast current view | id, stock_location_id, product_id, usable_qty, reserved_qty, updated_at, version |
| stock_requests | Workflow header | id, request_type, requester_id, source_location_id nullable, destination_location_id nullable, project_id nullable, status, priority, reason, parent_batch_id nullable, idempotency_key, submitted_at |
| stock_request_lines | Workflow details | id, request_id, product_id, quantity, unit_id, conversion_snapshot, base_quantity, condition, line_status |
| reservations | Active stock holds | id, request_line_id nullable, department_issue_id nullable, stock_location_id, product_id, quantity_base, status, created_at, released_at; exactly one owner reference is required |
| shipments | Dispatch/in-transit tracking and one-time discrepancy resolution | id, request_id, shipment_type, source_location_id, destination_location_id, status, dispatched_at, received_at, discrepancy_resolution, discrepancy_resolved_at, discrepancy_resolved_by_id, discrepancy_resolution_note |
| shipment_lines | Dispatch/receipt quantities and historical unit conversion | id, shipment_id, product_id, unit_name, conversion_to_base_snapshot, dispatched_qty, received_qty nullable, discrepancy_qty nullable |
| production_runs | Manufacturing header | id, project_id, mode, status, planned_output, actual_output, wastage, submitted_by, approved_by |
| production_inputs | Material consumed | id, production_run_id, product_id, quantity, unit_id, conversion_snapshot, base_quantity |
| production_outputs | Finished products | id, production_run_id, product_id, quantity, unit_id, conversion_snapshot, base_quantity |
| departments | Project department master | id, project_id, name, status, pending_change_id nullable |
| department_issues | Issue history | id, project_id, department_id, product_id, quantity_base, requested_quantity, indent_number, batch_id nullable, request_id nullable, issued_at |
| department_issue_batches | Daily department issue decision | id, project_id, created_by_id, status, rejection_reason, approved_by_id, submitted_at, approved_at; one open DRAFT per project |
| department_returns | Return history | id, department_issue_id nullable, product_id, quantity_base, condition, reason, request_id |
| ledger_transactions | Posted movement header | id, transaction_type, source_ref_type, source_ref_id, posted_at, posted_by, idempotency_key |
| ledger_entries | Immutable movement lines | id, transaction_id, location_id, product_id, qty_delta_base, condition, unit_snapshot, conversion_snapshot, reversal_of_entry_id nullable |
| approvals | Decision history | id, request_id, decision, approver_id, reason, decided_at |
| import_batches | Import metadata | id, import_type, source_filename, uploaded_by, status, approval_mode, created_at |
| import_rows | Per-row import details | id, batch_id, row_number, raw_data_json, normalized_data_json, validation_status, request_line_id nullable |
| attachments | File metadata | id, storage_key, original_name, mime_type, size_bytes, uploaded_by, checksum, scan_status |
| audit_events | Append-only audit | id, actor_user_id nullable, action, entity_type, entity_id, before_json, after_json, reason, occurred_at, correlation_id |
| notifications | In-app alerts | id, recipient_user_id, event_type, entity_type, entity_id, read_at, created_at |
| system_settings | Controlled configuration | id, key, value_json, updated_by, updated_at |
| backups | Backup history | id, started_at, completed_at, status, storage_reference, retention_until, error_summary |

## 3. Important constraints
- `users.username` unique after normalization.
- Every product must belong to exactly one catalog scope: company or a specific project; company products have no project_id, project products must have project_id.
- Project warehouse assignment has a unique active pair; preserve historical assignment changes.
- A request has one source warehouse for stock-out batches.
- Product units/conversion ratios must be positive and valid; effective-dated conversion rules preserve historical interpretation.
- Existing products migrate as `RAW_MATERIAL`; product kind cannot be changed after creation.
- Company catalog products are raw materials. Project catalog products created after this rule are manufactured products and must use categories owned by the same project.
- Product specification edits are stored as version snapshots and remain pending until Super Admin approval; approval sets the effective date and updates future catalog use. Historical request and ledger snapshots remain unchanged.
- `quantity_precision` is 0–2; quantity must conform to product precision.
- Reservations cannot exceed eligible available stock; enforce under row lock/serializable or equivalent concurrency-safe strategy.
- Idempotency keys unique within an appropriate actor/operation scope.
- Posted ledger entries cannot be updated/deleted by application roles.
- Use checks/foreign keys to prevent impossible states and orphan records.
- All-or-nothing batches must be committed in one DB transaction.
- Department issue batch submission reserves every line in one transaction; approval consumes every reservation and posts every line atomically, while rejection releases all holds. Immediate-post policy uses the same atomicity and creates an audit event.
- Approval requirements are stored in the `system_settings` JSON value and default to required; only new submissions use the current setting.
- Never use floating-point types for inventory quantities or conversion factors.
- `warehouses.store_admin_id` is a foreign key referencing `users(id)` with ON DELETE SET NULL. Each warehouse has at most one Store Admin assigned (1:0..1); one Store Admin may manage multiple warehouses (1:N). Indexed on `store_admin_id`.
- `department_issues.indent_number` records the physical indent form number provided by requesting departments (default 'N/A', indexed).
- `department_issues.requested_quantity` records the paper requested quantity (DECIMAL(18, 4), default 0) distinct from `quantity_base` which records the actual supplied and deducted quantity.

## 4. Inventory definitions
- `usable_qty`: inventory available before active reservations.
- `reserved_qty`: quantity held for active pending stock-out requests.
- `available_qty`: usable quantity less active reservations; must remain non-negative.
- Damaged stock is removed from usable inventory by an approved stock-out. The immutable ledger stores DAMAGED and the reason; no damaged or expired balance is maintained.
- Lot, batch, and expiry fields are not part of the schema. Operational import batches and department issue batches remain workflow grouping records.

## 5. Ledger conventions
- Movement entries use signed base-unit quantities; a movement between locations is paired source/destination entries where appropriate.
- Manufacturing linked posting groups all input/output lines in one transaction.
- Reversal references original entry; original remains unchanged.
- Store original entered quantity/unit plus conversion snapshot and calculated base quantity.
- All posting happens in a single database transaction with balance update and idempotency record.

## 6. Schema decisions still open
- Exact normalized duplicate key and product-specification identity.
- Inventory balances are maintained per location and product; no lot-level balances exist.
- Damaged condition is retained on immutable ledger entries; it does not create a balance bucket.
- Idempotency key scope and retry semantics.
- Whether department change approval uses versioned proposed changes or separate change-request entities.
- Attachment retention and malware-scanning provider.
