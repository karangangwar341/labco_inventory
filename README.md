# Warehouse AI Agent Handover Package

This is a design/handover package for the Warehouse, Client Manufacturing & Inventory Management System.

## Platform Architecture & Cloud Stack
- **Database:** Neon Serverless PostgreSQL with ACID transactions, pessimistic row locking (`FOR UPDATE`), connection pooling (`DATABASE_URL`), direct migrations (`DIRECT_URL`), and continuous WAL / PITR.
- **Object Storage:** Neon Object Storage (branch-aware, S3-compatible blob storage).
- **Backend:** NestJS + TypeScript + Prisma ORM.
- **Frontend:** Next.js + React + TypeScript.
- **Docker Requirement:** **Zero**. Docker is not required for development, testing, or deployment.

## Start here
1. `01_PRD.md` — Product requirements document.
2. `02_WORKFLOWS_AND_STATES.md` — Inventory lifecycle and state machines.
3. `03_DATABASE_SCHEMA.md` — Schema and relational data model.
4. `04_ROLE_PERMISSION_MATRIX.md` — RBAC permissions.
5. `05_UI_UX_SPEC.md` — Frontend screen layouts and flows.
6. `06_ARCHITECTURE_API.md` — System architecture and REST endpoints.
7. `07_TEST_PLAN.md` — Invariant testing scenarios.
8. `08_IMPLEMENTATION_ROADMAP.md` — Phased engineering roadmap.
9. `09_AI_IMPORT_SPEC.md` — Google Gemini document extraction spec.
10. `10_DEPLOYMENT_RUNBOOK.md` — Operations, backups and deployment runbook.
11. `11_DECISIONS.md` — Architecture decisions and decision records.
12. `AGENTS.md`, `13_TASKS.md`, `14_API_SPEC.yaml`.

## Quick Start
1. Configure environment:
   ```bash
   cp .env.example .env
   # Add your Neon DATABASE_URL, DIRECT_URL, and Neon Object Storage credentials
   ```
2. Run tests:
   ```bash
   npm run test:backend
   ```
3. Start development server:
   ```bash
   npm run dev:backend
   ```
