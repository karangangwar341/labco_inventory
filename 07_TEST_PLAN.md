# Test Plan & Release Acceptance Criteria
**Version:** 1.0

## 1. Release-blocking invariants
- No negative usable stock.
- No stock change from upload, draft or pending request.
- No unauthorized approval or cross-project/warehouse data access.
- No duplicate ledger posting on retries or repeated clicks.
- No silent modification/deletion of posted ledger entries.
- Reservation and balance changes are atomic.
- Historical transactions preserve original unit/conversion snapshots.

## 2. Functional scenarios
1. Super Admin creates and disables a user; disabled user cannot log in and active sessions are revoked.
2. Password reset revokes all sessions for the account.
3. Store Admin cannot create products/categories, even through direct API calls.
4. Project Admin cannot see another project's data or source warehouse identity for inbound shipments.
5. Project-to-warehouse assignment blocks unassigned dispatch; removing assignment does not cancel existing in-transit shipments.
6. Receipt discrepancy resolution: 20 dispatched / 18 received credits 18 to destination; `MISSING` records 2 as reportable loss without balance credit; `CALCULATION_MISTAKE` credits 2 back to source exactly once.
7. Only Super Admin can resolve discrepancies or generate `MISSING_STOCK`; resolution is immutable, shipment date filtering uses resolution date, and totals aggregate using historical base-unit conversion snapshots.
6. Pending project product cannot be used in inventory transactions.
7. Unit conversion 1 box = 12 pieces; 10 boxes converts to 120 pieces and the conversion snapshot is retained.
8. Whole-unit product rejects 1.5; decimal-enabled product accepts only configured precision up to two decimals.
9. Product threshold changes flag low stock but do not alter quantity.
10. No product lot, batch, or expiry fields, endpoints, alerts, or balance buckets exist.
11. A DAMAGED stock-out requires approval by default, reduces usable quantity once, and records DAMAGED and the reason in the immutable ledger.
13. Physical count adjustment and historical correction follow separate workflows.
14. Linked manufacturing posts all inputs/outputs atomically; simulated failure posts none.
14a. A manufacturing draft can be reopened and edited by its original Project Admin; edits do not change stock, other projects cannot edit it, and non-draft runs are locked.
14b. A production run cannot be submitted until actual output is recorded; submission rechecks available raw materials and leaves all balances unchanged pending Super Admin approval.
15. Department issue reduces central project stock only after approval; no department balance is created.
16. Usable return restores central stock after approval; damaged items use the flagged stock-out workflow.
17. Low-stock alert triggers on downward crossing, persists while low, and triggers again only after recovery and a new crossing.
18. Backup failure retries, alerts Super Admin and clears persistent warning only after successful backup.
19. Approval policy defaults to required for all supported workflows; partial settings preserve unspecified defaults and reject malformed values.
20. A Project Admin can maintain one project-scoped daily issue draft with multiple lines; other tenants and Store Admins cannot read or edit it.
21. Daily issue submission reserves all lines or none; concurrent submissions cannot over-reserve available stock.
22. Batch approval/rejection is atomic across all lines, and rejection releases every reservation.
23. With department-issue approval disabled, submit posts all lines, marks `POSTED`, emits an audit event, and retries cannot duplicate ledger posting.
24. Changing approval settings does not alter already-pending submissions.

## 3. Reservation and concurrency tests
1. 100 available; submit request for 90 → reserved 90, available 10.
2. Submit another request for 20 → rejected for insufficient available stock.
3. Reject first request → its 90 reservation releases; second request can be retried.
4. Two concurrent requests whose total exceeds availability: at most the available total can reserve.
5. Pending stock-in does not increase available stock; approved/posted stock-in does.
6. Edit request from 90 to 95 with only 10 free: fail and preserve original reservation.
7. Reduce request from 90 to 60: release 30.
8. Change product: reserve replacement product before releasing original; failed replacement leaves original intact.
9. Cancelled request cannot later be approved.
10. Repeat approval call / retry with same idempotency key → one posting only.

## 4. Bulk import tests
- Unsupported file type/oversize/malicious file rejected safely.
- Low-confidence extraction and missing required fields flagged.
- Correcting a row does not require re-upload and does not change stock.
- Duplicate rows are flagged and never silently merged.
- All-or-nothing batch with one invalid row posts zero rows.
- Partial batch posts only approved rows and preserves rejected/pending row states.
- Stock-out batch with mixed source warehouses is rejected.
- Raw file and extracted content are access-controlled and retention-managed.

## 5. Security tests
- Five consecutive failed logins → 15-minute lockout; successful login resets consecutive-failure count.
- Repeated lockouts require Super Admin intervention.
- Session inactivity limit is seven days; a new login invalidates the prior active session.
- Direct API attempts to bypass role/tenant scope fail.
- Attachment URLs cannot be guessed or accessed without authorization.
- CSV export formula injection is neutralized.
- Audit logs do not include passwords, tokens or secrets.
- SQL injection, XSS, CSRF (where applicable), IDOR and unsafe file-upload tests pass.
- Rate limits and password strength/common/compromised-password checks work.

## 6. Performance/recovery tests to define before production
- Define expected user count, data volume, p95 response-time targets and import sizes.
- Restore a backup into an isolated environment and verify ledger/balance consistency.
- Define and test RPO/RTO before production.
- Verify migrations can be rolled back or safely forward-fixed.
