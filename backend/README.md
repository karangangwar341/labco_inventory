# Backend API

NestJS API backed by Prisma and PostgreSQL.

## Local setup

From the repository root, run `npm ci`. Copy `.env.example` to `.env`, configure a development PostgreSQL database and a local JWT secret, then run:

```bash
npm run prisma:generate --workspace backend
npm run prisma:migrate:deploy --workspace backend
npm run dev:backend
```

Swagger is available at `/api/v1/docs` outside production. Production disables it by default.

## Production

Use `DATABASE_URL` for the pooled application connection and `DIRECT_URL` for migrations. Set `NODE_ENV=production`, a strong `JWT_SECRET`, explicit HTTPS `CORS_ALLOWED_ORIGINS`, and durable S3-compatible storage credentials. Startup validates these settings and rejects local disk storage in production.

Build with `npm run build:backend`. Apply migrations as a release step with `npm run prisma:migrate:deploy --workspace backend`. Do not run `npm run seed` in production; the demo seed refuses to run there. For a new empty production database, see the root runbook for one-time Super Admin provisioning.

`GET /api/v1/health` is a minimal platform readiness probe. Detailed health is available to Super Admins at `/api/v1/backups/health`.
