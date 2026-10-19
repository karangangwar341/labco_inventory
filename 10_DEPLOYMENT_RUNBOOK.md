# Deployment, Operations & Recovery Runbook

**Status:** The repository is intended for two separate Vercel projects: one for the NestJS API and one for the Next.js frontend. Vercel project setup, region, public domains, RPO/RTO, monitoring destination, and production credentials still require owner setup. No production deployment has been performed.

## 1. Supported runtime and architecture

- Node.js 22.18+ or 24.11+; CI uses Node 24. Use a currently supported LTS release.
- NestJS API and Next.js app run as Node.js services. Docker is optional; the project does not require it.
- PostgreSQL is the application database. Use Neon or another supported PostgreSQL host. `DATABASE_URL` is the pooled runtime connection; `DIRECT_URL` is the direct connection reserved for migrations.
- File uploads require durable S3-compatible object storage in production. `STORAGE_DRIVER=local` is rejected for production configuration.
- Keep API and frontend origins on HTTPS. Configure the frontend build with the public API URL.
- Deploy `backend/` and `frontend/` as separate Vercel projects from the same repository. Set `NEXT_PUBLIC_API_URL` on the frontend project to the backend's public HTTPS URL ending in `/api/v1`; allow the frontend's exact HTTPS origin in the backend's `CORS_ALLOWED_ORIGINS`.

## 2. CI quality gate

GitHub Actions runs on pushes and pull requests to `main`, `master`, and `develop`. It uses Node 24, an ephemeral PostgreSQL 16 service, and the committed lockfile. The gate checks secret-file hygiene, dependency advisories, Prisma Client generation, migration application, backend and frontend lint, frontend TypeScript, backend tests, and production builds.

Run locally from the repository root:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

The frontend currently has no automated unit or browser test suite. Before launch, manually smoke test the critical workflows in staging: login by role, stock request and approval, dispatch and client receipt approval, manufacturing, department issue, and report visibility across clients.

## 3. Production environment

Inject these values through the selected platform's secret manager or runtime environment. Do not commit production `.env` files.

### API runtime

Required:

- `NODE_ENV=production`
- `PORT` (provided by the host when applicable)
- `DATABASE_URL` (pooled PostgreSQL URL)
- `DIRECT_URL` (direct PostgreSQL URL for release migrations)
- `JWT_SECRET` (unique random value of at least 32 characters)
- `CORS_ALLOWED_ORIGINS` (comma-separated HTTPS origins only, without paths or trailing slashes)
- `STORAGE_DRIVER=neon_s3` or `s3`
- `AWS_ACCESS_KEY_ID` or `NEON_STORAGE_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY` or `NEON_STORAGE_SECRET_ACCESS_KEY`
- `AWS_ENDPOINT_URL_S3` or `NEON_STORAGE_ENDPOINT`
- `STORAGE_BUCKET_NAME` or `NEON_STORAGE_BUCKET`

Optional:

- On Vercel, set `NODE_OPTIONS=--experimental-require-module` for the backend project. Vercel disables Node's `require(esm)` compatibility by default, and NestJS 12 packages are ESM-only.
- `TRUST_PROXY_HOPS`: set to the exact number of trusted reverse-proxy hops. Leave unset when the API receives direct client connections. Do not accept arbitrary forwarded-IP headers as trusted.
- `ENABLE_API_DOCS=true`: explicitly exposes Swagger documentation. Documentation is disabled by default in production.
- `GEMINI_API_KEY`: enables Gemini document extraction; deterministic fallback remains available if it is omitted.

Production configuration validation fails startup for missing/placeholder database or JWT values, non-HTTPS CORS origins, and non-durable or incomplete object storage. The health probe at `/api/v1/health` returns only readiness and timestamp; detailed health requires Super Admin authorization at `/api/v1/backups/health`.

### Frontend build/runtime

- `NEXT_PUBLIC_API_URL`: required for separate Vercel projects. Set it at build time to the backend's public HTTPS URL including `/api/v1` (for example, `https://<backend-project>.vercel.app/api/v1`).
- Build and run the frontend as a Node.js server using `npm run build:frontend` and `npm run start --workspace frontend`.

## 4. Release procedure

1. Select hosting provider/region and create separate staging and production environments.
2. Configure HTTPS, DNS, API and frontend origins, trusted proxy hops (if applicable), and environment secrets. Keep staging and production database/storage credentials separate.
3. Provision Neon PostgreSQL and S3-compatible storage. Verify the API credentials have only the access required by the application.
4. Apply schema migrations to staging, deploy the CI-built application, and run the critical-workflow smoke test.
5. Take and verify a production database recovery point before the first migration. Apply migrations with the direct database URL:

   ```bash
   npm run prisma:migrate:deploy --workspace backend
   ```

   For Render, run `npx prisma migrate deploy --schema prisma/schema.prisma` from the backend service root as a pre-deploy/release command, with `DIRECT_URL` set to the direct database connection. If the Render plan does not provide a pre-deploy command, run it once as a controlled release operation before deploying the new backend. A successful application build does not apply migrations; do not run schema migrations in the ordinary build command.

6. For Vercel, create two projects from the same repository. Set the backend project's Root Directory to `backend` and use the NestJS framework preset; set the frontend project's Root Directory to `frontend` and use the Next.js preset. Configure each project's environment variables. Set `NEXT_PUBLIC_API_URL` on the frontend to the backend deployment URL plus `/api/v1`, and set the backend's `CORS_ALLOWED_ORIGINS` to the exact frontend HTTPS origin. For other hosts, deploy the API and frontend separately and apply the same URL and CORS settings.
7. If the production database is empty, provision the first Super Admin exactly once using temporary `BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PASSWORD` secret values, then run:

   ```bash
   npm run bootstrap:super-admin --workspace backend
   ```

   Use a unique username and a password of at least 12 characters. The command requires `NODE_ENV=production`, serializes concurrent attempts, refuses to run if any user already exists, hashes the password, and never prints it. Remove both bootstrap values immediately after the command succeeds. Never use the demo seed to provision a production account.

8. Verify the public readiness probe, authenticated Super Admin health page, login, scoped inventory, approval queues, uploads, and audit history. Watch application and database errors during the initial rollout.

## 5. Backups and recovery

- Configure provider-managed point-in-time recovery and scheduled backups. The target daily retention is 90 days, but the provider settings must be verified in the selected account.
- Restore a recent backup to an isolated environment before launch. Validate database integrity, ledger-to-balance reconciliation, audit continuity, and attachment availability.
- The owner must set and document RPO/RTO and name the recovery approver before production use.
- Prisma migrations are forward-applied. Do not rely on `prisma migrate rollback`; for a faulty schema change, stop rollout and use a reviewed forward-fix. Restore a database snapshot only under the approved recovery procedure because restoration can discard newer transactions.

## 6. Monitoring and incident response

Configure an external log and error-monitoring destination with alerts for API error rate and latency, failed logins, authorization denials, migration failures, backup failures, storage errors, and database pool exhaustion. Logs include request IDs, method, path (without query parameters), status, and duration; never log credentials, tokens, uploaded document contents, or user passwords.

For an incident: detect → contain → preserve audit evidence → assess affected tenants and inventory → restore service → reconcile the ledger and balances → document root cause and prevention. Do not manually edit stock balances to hide discrepancies.

## 7. Rollback and rollout

- Deploy first to staging and then to production. Start with a controlled internal user group and monitor error rate, latency, failed transactions, and client data isolation before expanding access.
- Roll back the application artifact if errors materially increase or inventory integrity is at risk. Preserve the database and append-only audit history.
- For database incompatibilities, halt rollout and apply a forward-fix. Restore from a verified recovery point only with the recovery approver's authorization and a documented data-loss assessment.

## 8. Remaining launch gates

- Hosting provider, region, domain, and TLS setup are selected and verified.
- Production secrets are generated and installed in the platform secret manager.
- Staging smoke tests pass for all role workflows.
- Dependency audit and full CI pipeline pass on the remote runner.
- Backup retention and an isolated restore drill are verified.
- External monitoring and alert routing are tested.
- RPO/RTO, data retention/privacy obligations, and recovery ownership are approved.
