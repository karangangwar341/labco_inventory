# Role & Permission Matrix
**Version:** 1.0 | Enforce on the server for every API and data query.

Legend: **A** = allowed; **R** = request/submit only; **V** = view; **—** = not allowed; **A\*** = allowed within own project/assigned warehouse scope.

| Capability | Super Admin | Store Admin | Project Admin |
|---|---:|---:|---:|
| View company-wide warehouse/project data | A | — | — |
| View own warehouse stock/history | A | V/A* | — |
| View own project inventory/history | A | — | V/A* |
| Create/disable/reset accounts | A | — | — |
| Manage warehouses and assign Store Admins | A | — | — |
| Assign projects to warehouses | A | — | — |
| Create/edit company product catalog/categories | A | — | — |
| Create/edit project product catalog | V/approve | — | R/A* |
| Approve/reject project product creation | A | — | — |
| Submit warehouse stock-in/out | V/approve | R/A* | — |
| Submit warehouse transfer | V/approve | R/A* | — |
| Submit stock corrections/counts | V/approve | R/A* | R/A* |
| Submit direct project stock-in | V/approve | — | R/A* |
| Submit project stock-out/department issue | V/approve | — | R/A* (department issues tracked by Indent Form # and accumulated in daily draft) |
| Manage departments | V/approve | — | R/A* |
| Submit department returns | V/approve | — | R/A* |
| Submit manufacturing runs | V/approve | — | R/A* |
| Approve any inventory-affecting request | A | — | — |
| View source warehouse identity for inbound project shipment | A | A* | — |
| View inbound shipment details without source identity | A | — | V/A* |
| Resolve shipment discrepancy as missing or calculation mistake | A | — | — |
| View/export missing-stock report | A | — | — |
| View/export inventory reports | A | A* | A* (own project) |
| Manage global system settings | A | — | — |
| Configure approval requirements per supported workflow | A | — | — |
| View security/audit logs | A | limited own relevant history only | limited own relevant history only |
| View low-stock notifications | All company/project alerts | — under current policy | Own project alerts |
| Import bulk data / prepare drafts | A | R/A* for permitted warehouse drafts | R/A* for permitted project drafts |
| Approve import-generated stock changes | A | — | — |

## Enforcement rules
1. Every object lookup is scoped by role and organization, not only by UI filters.
2. Store Admin requests and queries are scoped to all warehouses assigned to that Store Admin (via warehouses.store_admin_id or legacy user.warehouse_id). A warehouse may have at most one Store Admin; a Store Admin may manage multiple warehouses.
3. Project Admin cannot see source warehouse identity for inbound shipments.
4. Project Admin cannot transact with pending/rejected products.
5. Only Super Admin may approve or reject requests.
6. Super Admin account-management actions are audited and revoke sessions when disabling/resetting.
7. Report exports and attachment access are authorized and audited.
8. Store Admin does not create products/categories and does not receive low-stock notifications under current policy.
9. Shared project credentials identify the account, not a named human; audit should not falsely claim otherwise.
10. Some Project Admin permissions (e.g. exact report/export and draft import scope) must be confirmed before production.
11. Issues to internal departments are conducted against physical indent forms, tracking Indent Form Number and comparing requested vs supplied quantities in a grouped tabular format.
