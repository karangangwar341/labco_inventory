# Role & Permission Matrix
**Version:** 1.0 | Enforce on the server for every API and data query.

Legend: **A** = allowed; **R** = request/submit only; **V** = view; **—** = not allowed; **A\*** = allowed within own client/assigned warehouse scope.

| Capability | Super Admin | Store Admin | Client Admin |
|---|---:|---:|---:|
| View company-wide warehouse/client data | A | — | — |
| View own warehouse stock/history | A | V/A* | — |
| View own client inventory/history | A | — | V/A* |
| Create/disable/reset accounts | A | — | — |
| Manage warehouses | A | — | — |
| Assign clients to warehouses | A | — | — |
| Create/edit company product catalog/categories | A | — | — |
| Create/edit client product catalog | V/approve | — | R/A* |
| Approve/reject client product creation | A | — | — |
| Submit warehouse stock-in/out | V/approve | R/A* | — |
| Submit warehouse transfer | V/approve | R/A* | — |
| Submit stock corrections/counts | V/approve | R/A* | R/A* |
| Submit direct client stock-in | V/approve | — | R/A* |
| Submit client stock-out/department issue | V/approve | — | R/A* |
| Manage departments | V/approve | — | R/A* |
| Submit department returns | V/approve | — | R/A* |
| Submit manufacturing runs | V/approve | — | R/A* |
| Approve any inventory-affecting request | A | — | — |
| View source warehouse identity for inbound client shipment | A | A* | — |
| View inbound shipment details without source identity | A | — | V/A* |
| View/export inventory reports | A | A* | A* (own client) |
| Manage global system settings | A | — | — |
| View security/audit logs | A | limited own relevant history only | limited own relevant history only |
| View low-stock notifications | All company/client alerts | — under current policy | Own client alerts |
| Import bulk data / prepare drafts | A | R/A* for permitted warehouse drafts | R/A* for permitted client drafts |
| Approve import-generated stock changes | A | — | — |

## Enforcement rules
1. Every object lookup is scoped by role and organization, not only by UI filters.
2. Store Admin requests may only originate from that Store Admin's warehouse.
3. Client Admin cannot see source warehouse identity for inbound shipments.
4. Client Admin cannot transact with pending/rejected products.
5. Only Super Admin may approve or reject requests.
6. Super Admin account-management actions are audited and revoke sessions when disabling/resetting.
7. Report exports and attachment access are authorized and audited.
8. Store Admin does not create products/categories and does not receive low-stock notifications under current policy.
9. Shared client credentials identify the account, not a named human; audit should not falsely claim otherwise.
10. Some Client Admin permissions (e.g. exact report/export and draft import scope) must be confirmed before production.
