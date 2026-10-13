# Deployment, Operations & Recovery Runbook
**Version:** 0.1 | Provider and hosting selection deferred.

## 1. Environments
- Separate local development, test/CI, staging and production environments.
- Separate credentials, storage and databases for each environment.
- Never copy production secrets into local/dev configuration.
- Use least-privilege service accounts and secret manager/environment injection.

## 2. Deployment pipeline
1. Review code and required tests.
2. Run formatter, static checks, unit/integration/security tests and dependency scans.
3. Build immutable artifact/container.
4. Apply backward-compatible database migrations with a documented rollback/forward-fix plan.
5. Deploy to staging and run smoke tests.
6. Take/verify pre-deployment backup when schema/data risk warrants it.
7. Deploy production with health checks and rollback criteria.
8. Verify login, approval queue, inventory read, transaction posting in safe test scope, background jobs and backup status.

## 3. Backups & Data Protection
- Data loss tolerance: as close to zero as practically achievable for confirmed transactions.
- Strict atomic transactions: every approved inventory movement must commit atomically; partial updates are not allowed.
- Continuous transaction-log protection / Point-in-Time Recovery (PITR) designed to prevent inter-day data loss between scheduled snapshots.
- Daily automatic backups retained for 90 days.
- Backup isolation: independent backup copies protected from accidental deletion, unauthorized access, and failures affecting the primary database.
- Encrypt backups in transit and at rest; enforce strict access controls.
- Automated integrity checks and scheduled restoration drills; a backup is not considered reliable until restore has been successfully tested.
- On failure: automatic retry, notify Super Admin, persistent dashboard warning until successful backup.

## 4. Recovery & Integrity
- RPO target: near-zero for confirmed transactions (via continuous log protection); RTO defined before production launch.
- Inventory integrity: immutable stock ledger, automated reconciliation checks, and unbroken audit history.
- Recovery testing: restore to an isolated environment first; verify database integrity, ledger-to-balance reconciliation, attachment availability, and audit continuity.
- Document who authorizes production recovery and how users are notified.
- Never manually patch stock balances to hide ledger inconsistency; use a reviewed reconciliation procedure.

## 5. Monitoring and incident response
Monitor API errors/latency, failed login/lockout patterns, authorization denials, duplicate/idempotency conflicts, failed jobs, import failures, backup status, storage capacity and unusual stock adjustments.
Incident procedure: detect → contain → preserve evidence/audit → assess scope → recover → validate inventory integrity → document root cause and prevention.

## 6. Security operations
- Rotate/revoke credentials when staff or providers change.
- Patch dependencies and base images.
- Review privileged account activity and exports.
- Ensure file access is authorized and time-limited.
- Test session revocation after account reset/disable.
- Never log passwords, session tokens, API keys or document secrets.

## 7. Launch checklist
- Hosting/provider and region selected.
- Domain/TLS and secure headers configured.
- Secrets stored outside source control.
- Database backups and restore drill passed.
- Monitoring and alert routing tested.
- RPO/RTO and expected capacity approved.
- Security review and user acceptance testing signed off.
- Data retention/privacy/legal obligations reviewed.
