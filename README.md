# Labco Warehouse & Stock

Warehouse, client manufacturing, and inventory management application. The repository contains a NestJS API, Next.js web application, and Prisma migrations for PostgreSQL.

## Runtime

- Node.js 22.18+ or 24.11+ (Node 24 is used by CI).
- npm workspaces, PostgreSQL, and Prisma.
- Neon PostgreSQL is the intended production database. The application uses pooled `DATABASE_URL` for runtime traffic and `DIRECT_URL` for migrations.
- Production file uploads require durable S3-compatible object storage. Local disk storage is for development only.

## Local development

1. Install dependencies from the repository root: `npm ci`.
2. Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env.local`.
3. Set local PostgreSQL URLs, a unique local `JWT_SECRET`, `STORAGE_DRIVER=local`, and the local frontend API URL. The backend example includes a localhost CORS allowlist.
4. Generate Prisma Client and apply migrations to your development database:

   ```bash
   npm run prisma:generate
   npm run prisma:migrate:deploy --workspace backend
   ```

5. In separate terminals, run `npm run dev:backend` and `npm run dev:frontend`.

Demo data is available only for local/test environments. Never run the demo seed against production; production startup explicitly refuses it.

## Quality checks

Run the same checks as the CI quality gate:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

`npm test` currently runs the backend Vitest suite; the frontend does not yet have an automated test suite. CI also checks dependency advisories and applies all migrations to a temporary PostgreSQL database.

## Production release

Production configuration and launch gates are documented in [10_DEPLOYMENT_RUNBOOK.md](10_DEPLOYMENT_RUNBOOK.md). Hosting provider, region, and public domain are not selected yet. Production requires HTTPS, explicit CORS origins, strong JWT and database credentials, durable object storage, backups with a verified restore, and monitoring.

The first Super Admin can be provisioned once on an empty production database with `npm run bootstrap:super-admin --workspace backend`; use temporary secret-manager values for `BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PASSWORD`, then remove them immediately. The command refuses to run outside production or when any user already exists.
