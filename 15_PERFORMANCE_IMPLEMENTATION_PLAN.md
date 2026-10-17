# Performance Optimization Implementation Plan

**Status:** Partially implemented. Startup data bundling and safer client-side caching are in place; latency baselines and database query-plan work remain open.
**Purpose:** Diagnose slow API responses and repeated page-load requests, then improve measured bottlenecks without weakening inventory consistency, tenant isolation, or authorization.

## 1. Problem and current observations

Users report slow backend responses even with small database contents, and revisiting a page repeats its GET requests. Current code evidence:

- The frontend uses TanStack Query, but its former 15-second default freshness caused repeat requests on normal page revisits; several queries also set similarly short 20–30 second windows.
- Login now returns a bounded role-scoped startup payload (profile, approved product/unit references, categories, and permitted locations). `GET /me/bootstrap` supplies the same payload after session restore. Stock request forms reuse this cached payload.
- The shared query cache now keeps read results fresh for five minutes by default and retains inactive entries for 30 minutes; mutation invalidation remains responsible for refreshing changed data.
- Only the per-user bootstrap is persisted across browser reloads. Inventory and operational records stay in memory to reduce stale-data exposure and avoid cross-account reuse.
- Some feature data still loads through component effects or has short per-query overrides; those flows should migrate incrementally when measured, rather than through a broad rewrite.
- The Prisma schema already has several indexes, but index selection and query cost must be evaluated against actual generated SQL and PostgreSQL query plans before adding more.
- Current evidence does not identify a single slow endpoint or prove that PostgreSQL is the cause. Network latency, cold starts, server work, pool waits, and duplicate frontend requests must be measured independently.

### Implemented pass (2026-10-17)

- Combined profile and small role-authorized startup references into the login response to avoid separate setup requests immediately after sign-in.
- Added the protected `/me/bootstrap` refresh endpoint and a bounded Prisma projection that loads the references concurrently.
- Reused startup data in stock request forms and increased React Query freshness; cache entries remain keyed by account and are cleared when the account changes or signs out.
- Removed internal UUIDs from inventory locations, approval rows, shipment fallback labels, and stock request fallback references.
- Backend and frontend production latency have not yet been measured against a representative deployment dataset. Keep database indexing and broad query rewrites out of scope until timings and query plans identify a target.

## 2. Goals and non-goals

### Goals

1. Attribute page-load time to browser/request behavior, API handling, Prisma/database work, and infrastructure.
2. Reuse fresh GET results when a user returns to a page during the same application session.
3. Avoid duplicate in-flight GET calls for the same user and query parameters.
4. Make cache updates and invalidation predictable after mutations.
5. Reduce database round trips, over-fetching, and expensive query plans where profiling confirms a bottleneck.
6. Preserve all existing authorization checks, data scope, privacy redactions, and transaction semantics.

### Non-goals

- No inventory, approval, reservation, ledger, or shipment business-rule changes.
- No browser persistence of inventory balances, transactions, approval queues, or client operational records. The only persisted payload is the bounded, role-scoped bootstrap required to open the user's workspace; it is user-keyed and cleared on account/session changes.
- No server-side response cache for authorization-sensitive endpoints in the initial work.
- No speculative indexes, schema changes, denormalized balances, or database/provider migration without query-plan evidence.
- No production deployment as part of this plan.

## 3. Phase 0 — Establish a trustworthy baseline

### Work

1. Reproduce representative navigation flows with browser network timing: dashboard → inventory → another page → inventory; repeat for requests/approvals and catalog.
2. Record per endpoint and route: request count, duplicate request count, browser total time, TTFB, response bytes, HTTP status, and whether the call follows a cold start or warm request.
3. Add request correlation across frontend and NestJS using the existing request-ID convention from the architecture/API baseline. Capture one server-side duration per request and distinguish controller/service duration from total response time.
4. Add Prisma query event timing in non-production diagnostics or sampled telemetry. Record operation/model, elapsed time, request correlation ID, and query fingerprint; redact parameters and sensitive values. Do not log tokens, credentials, row contents, SQL literals containing user data, or document contents.
5. Measure connection acquisition/pool wait separately if available in the selected Neon/Prisma runtime. Confirm whether slow first requests are cold-start related.
6. For slow query fingerprints, use representative staging data and `EXPLAIN (ANALYZE, BUFFERS)` to identify scans, joins, sorts, repeated queries, and rows returned. Do not run `ANALYZE` diagnostics against production traffic without an approved safe procedure.
7. Define p50/p95/p99 response budgets and page-load budgets only after capturing a baseline and agreeing expected concurrency/data volumes. Record environment, region, deployment mode, dataset size, and warm/cold conditions with every comparison.

### Deliverables and gate

- Baseline report mapping each slow route to network, application, query/pool, or cold-start contributors.
- Ranked bottleneck list with evidence, estimated impact, and owner.
- Agreed measurable targets. Do not proceed to speculative database changes if the data does not show database/query latency as a material contributor.

## 4. Phase 1 — Add a user-scoped React Query cache

Use TanStack Query (React Query) in the Next.js client application. Keep `apiClient` as the transport and authentication boundary; feature service functions remain the query functions.

### Provider and defaults

1. Add a single `QueryClientProvider` in `frontend/src/app/providers.tsx` alongside the existing `AuthProvider`.
2. Create the `QueryClient` once per browser application instance; avoid a module-global client shared across server-rendered requests.
3. Start with conservative defaults: `retry` only transient network/5xx failures with a small bounded count; do not retry 401/403/validation/conflict errors. Use no focus-triggered refetch for stable lists by default; tune freshness by data type below. Preserve explicit refresh and retry controls.
4. Keep cache in memory only. Clear the entire query cache on logout, session replacement/revocation, or account switch. Ensure the cache cannot be reused between authenticated identities.
5. Include a stable authenticated identity/scope discriminator in query keys (user ID and client/warehouse scope where relevant). Never put bearer tokens in keys, logs, or persisted state. Refetch `/me` as part of session initialization; do not treat frontend cache keys as an authorization boundary.
6. Pass `AbortSignal` from query functions through `apiClient.request` to `fetch` so abandoned page requests can be cancelled.

### Query keys and freshness policy

Create centralized, typed query-key factories grouped by domain. Every filter, page, sort, and relevant scope parameter must be represented in the key. Example shape:

```ts
['inventory', 'balances', { identityScope, locationId, productId, page, limit }]
```

Initial tuning values are starting points only and must be validated with owners and usage patterns:

| Data | Initial `staleTime` | Refetch behavior | Rationale |
|---|---:|---|---|
| Product/catalog and categories | 2 minutes | Reuse while fresh; invalidate after catalog mutation | Changes infrequently relative to navigation |
| Departments, warehouses, clients, users/settings | 1–2 minutes | Reuse while fresh; invalidate on corresponding edit | Master data, but role/scope changes need prompt refresh |
| Inventory balances and stock transactions | 15–30 seconds | Refresh after inventory-changing success; manual refresh available | Sensitive to approved postings; never treat cache as authoritative for posting |
| Requests, shipments, production runs, imports | 15–30 seconds | Invalidate after create/edit/submit/approve/reject/receive | Workflow state can change during a session |
| Approval queue and notifications | 5–15 seconds | Invalidate after decisions and read-state mutations; optional bounded polling only if needed | Freshness has higher operational value |
| Health and backup status | 15–30 seconds | Refresh after action; short stale window | Operational status may change independently |
| Reports and audit history | 1–5 minutes for identical filter key | Refresh on explicit request or relevant mutation; exports remain audited | Potentially expensive and often revisited with same filters |

Tune `gcTime` to avoid retaining inactive pages indefinitely. Do not use a long stale time to hide changes from other users. For queue data requiring near-live behavior, agree on bounded polling or a later push mechanism; no new notification channel is implied here.

### Gradual page migration

Migrate one route/domain at a time, beginning with inventory and catalog, then requests/shipments, approval queue, dashboards, and remaining list/detail screens. Replace duplicated `useEffect` fetch/loading/error state with `useQuery` while retaining existing page layouts, permission guards, retry controls, and empty states. Use `enabled` for scope-dependent queries so a request cannot run before identity/scope is known. Keep pagination and filters in the URL or component state and include them in query keys.

### Mutation and invalidation map

Use `useMutation` for writes. After a successful server response, invalidate only affected query families (or update a detail cache from the returned authoritative response where safe):

| Mutation | Invalidate/refetch |
|---|---|
| Create/edit/submit/cancel request | Request detail/list, approval queue where applicable, relevant dashboard counts |
| Approve/reject inventory-affecting request | Request detail/list, approval queue, inventory balances/transactions, affected shipment or client/warehouse summary, relevant notifications/reports |
| Create/edit/approve catalog item/category/unit | Catalog list/detail and transaction-form lookup data |
| Receive/approve shipment | Shipment detail/list, inventory balances/transactions for affected authorized view, dashboard/notifications |
| Manufacturing approve/complete | Production detail/list, inventory balances/transactions, dashboard/notifications |
| Mark notification read | Notification list/count only |
| Backup create/restore drill/settings change | Backup list/summary/health only |

Do not optimistically change stock balances, reservation totals, shipment receipt quantities, approval state, or ledger-derived figures. Those values are authoritative only after the server transaction commits. If optimistic updates are later proposed for non-inventory data, implement rollback on failure and verify authorization scope first.

### Phase 1 acceptance criteria

- Returning to a route within its freshness window renders cached data immediately and makes no duplicate GET request for the same key unless an explicit refresh is requested.
- Concurrent components requesting the same key share one in-flight GET.
- Different users, clients, warehouses, pages, or filters cannot reuse each other's cache entries.
- Logout/session replacement/account change clears prior data before another identity is shown.
- Successful mutations invalidate all documented affected domains; failed mutations do not leave optimistic state behind.
- Inventory mutation responses remain server-authoritative, and no pending/draft action is represented as posted stock.
- Existing role/tenant tests and UI loading/error/empty behavior continue to pass.

## 5. Phase 2 — Remove avoidable frontend and API work

1. Use the baseline to identify screens making serial calls that are independent. Where useful, run independent reads concurrently with `Promise.all`; keep dependent requests sequential.
2. Prefer one purpose-built, authorized dashboard summary endpoint over several repeated count/list calls only if the trace proves the current page is materially slowed by round trips. Keep each role's scope and client/warehouse redaction enforced in the service layer.
3. Request only fields the screen displays using Prisma `select`; avoid large nested `include` payloads and unnecessary history/attachment content.
4. Add or complete server-side pagination/filtering for list and history endpoints. Set bounded maximum page size and stable sort order; prefer cursor pagination for large or frequently changing history if offset scans are measured as costly.
5. Avoid N+1 query patterns by using appropriately bounded relation queries, batched lookups, or aggregate queries. Do not combine unrelated data in ways that bypass service-level authorization.
6. Return compact DTOs; do not serialize internal fields or large nested records that the page does not need.
7. Consider HTTP compression only where response size and runtime support show benefit; avoid compressing already-compressed attachments.

Acceptance: fewer measured round trips/bytes and improved route timings with identical authorized results and stable pagination behavior.

## 6. Phase 3 — Optimize Prisma/PostgreSQL queries from evidence

### Query audit

For the top slow fingerprints, map the endpoint → controller → service → Prisma calls → SQL plan. Check for sequential awaits, repeated counts, N+1 access, broad `include`, unbounded reads, non-sargable filters, sort without supporting index, and unnecessary transaction scope. Keep critical locking/posting paths transactionally correct; performance changes must not weaken row locks, idempotency, revalidation, or atomic posting.

### Index changes

1. Compare actual predicates, joins, ordering, cardinality, and selectivity against current `@@index`/`@@unique` declarations in `backend/prisma/schema.prisma`.
2. Add only indexes that improve an observed query plan and justify their write/storage cost. Consider composite indexes in actual filter-then-sort order; account for existing unique indexes and leftmost-prefix coverage to avoid redundant indexes.
3. Add indexes using a Prisma schema change plus a reviewed SQL migration. For large production tables, choose an operationally safe PostgreSQL index rollout (e.g. concurrent index creation where supported by migration procedure); document that such DDL may be non-transactional and define forward-fix behavior.
4. Compare before/after query plans, buffers, latency, and write overhead with representative staging data. Remove any candidate index that does not improve the target query or creates unnecessary overlap.

### Query shape and connection behavior

- Reduce selected columns and relation fan-out first; preserve indexes and constraints that uphold correctness.
- Verify Neon pooled connection configuration and Prisma connection behavior in the actual deployment runtime. Do not increase pool sizes blindly; serverless concurrency can exhaust database connections.
- Keep read-only work outside critical write transactions when safe; do not move approval checks, reservation recalculation, balance locking, ledger posting, or audit writes outside their required atomic transaction.
- Cache immutable or slowly changing server reference data only after a separate authorization and invalidation design. Initial rollout is client-side cache only.

Acceptance: each change has an identified slow query, a recorded before/after plan and timing, and no regression in transaction, concurrency, privacy, or authorization tests.

## 7. Phase 4 — Verification, rollout, and monitoring

1. Add focused frontend query-cache tests for deduplication, freshness, mutation invalidation, identity changes, logout/session replacement clearing, and error retry policy.
2. Add backend query/service tests for changed projections, pagination boundaries, role scoping, and response shape. Keep inventory concurrency/idempotency suites as release gates for any write-path change.
3. Run repeatable route benchmarks against a documented seed dataset at multiple sizes and concurrency levels. Include cold and warm requests. Compare p50/p95/p99 and request counts, not a single local timing.
4. Roll out cache adoption by domain behind a reversible feature toggle if the app's configuration approach supports it; otherwise deploy in small reviewed changes with a clear rollback commit.
5. Watch endpoint latency, query latency, pool pressure, errors, response sizes, and cache hit/miss rates. Alert on correctness symptoms (stale approval actions, 401/403 leakage, cache identity mismatch) as well as latency regressions.
6. Roll back a query/index/cache change if it worsens the agreed targets or compromises freshness/correctness. Database index rollback should use a reviewed migration that drops only the introduced index; do not revert unrelated schema state.

## 8. Proposed task breakdown

Each task is a separate reviewable change, with acceptance criteria and relevant tests:

1. **P-001 Baseline and tracing:** browser route/request inventory, NestJS request timings, redacted Prisma query timing, staging query-plan report, agreed SLOs.
2. **P-002 Shared query cache foundation:** TanStack Query dependency/provider, typed key factories, identity isolation, abort signal support, cache clearing, bounded retry defaults.
3. **P-003 Read-only route migration:** inventory/catalog first, then other routes; freshness policy and query-dedup verification.
4. **P-004 Mutation invalidation:** central domain invalidation helpers and migration of write flows; no optimistic inventory changes.
5. **P-005 API/query-shape fixes:** address evidenced serial round trips, over-fetching, N+1, pagination, or dashboard aggregation.
6. **P-006 Database plan fixes:** minimal evidence-backed index/query migrations with before/after plans and rollback/forward-fix notes.
7. **P-007 Performance acceptance:** repeatable benchmark, regression checks, staged rollout and monitoring review.

## 9. Expected file/module scope

Likely frontend scope: `frontend/package.json`/lockfile, `frontend/src/app/providers.tsx`, `frontend/src/lib/api/client.ts`, new query-key/provider utilities under `frontend/src/lib/query/`, feature services/hooks, and data-loading components under `frontend/src/features/**`.

Likely backend scope only where measured: NestJS controllers/services under `backend/src/**`, `backend/src/prisma/prisma.service.ts`, Prisma query instrumentation, `backend/prisma/schema.prisma`, and a new migration under `backend/prisma/migrations/**`.

Documentation scope: this plan plus updates to API/architecture documentation only if response shapes, pagination contracts, or observability conventions change. Update `13_TASKS.md` only when the owner accepts and schedules these follow-up tasks; do not overwrite completed T-016 status.

## 10. Security, business-rule, migration, and rollback implications

- Query cache is a presentation optimization, never authorization. The backend must authorize every request and object as before.
- Scope identity into keys, clear caches on session changes, do not persist sensitive data, and do not log cache contents or tokens.
- Continue response privacy filtering for Client Admin shipment views; cache only the already-authorized/redacted response under the caller's scope.
- Do not cache or trust availability for posting decisions. The backend must revalidate stock and authorization inside the existing transaction.
- No migration is needed for React Query. Backend indexing changes require a migration, storage/write overhead review, and explicit rollback/forward-fix instructions.
- Revert frontend cache adoption by restoring the prior fetch path or disabling the feature; preserve API behavior. Revert database optimization by dropping only new indexes or applying a safe forward fix; never rewrite or delete posted ledger/audit data.

## 11. Required task completion report

For each implementation task, report summary, files changed, business rules preserved, exact tests/benchmarks and outcomes, migration/security implications, remaining limitations, and confirmation that no unrelated changes were made. No test or performance result may be claimed unless it was actually run and recorded.

## 12. Implementation references

- [TanStack Query: Important Defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults) — stale data and automatic refetch behavior.
- [TanStack Query: Query Keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys) — key identity and variable inclusion.
- [TanStack Query: Query Cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation) — forwarding the supplied `AbortSignal` to fetch.
