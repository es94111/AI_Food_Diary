# Encryption Migration Runbook

Stage C migrates legacy plaintext columns into encrypted JSON columns and clears
the legacy plaintext values. This is destructive and must only run after a
database backup.

## Order

1. Deploy code with the new `enc*` columns.
2. Apply schema changes:
   ```bash
   npx prisma db push
   ```
3. Back up the database. For PostgreSQL:
   ```bash
   pg_dump "$DATABASE_URL" --format=custom --file "backup-before-encryption.dump"
   ```
4. Inspect pending plaintext:
   ```bash
   npm run encryption:migrate:status
   ```
5. Apply the migration:
   ```bash
   DB_BACKUP_CONFIRMED=yes npm run encryption:migrate:apply
   ```
6. Verify all encrypted fields are readable and no plaintext remains:
   ```bash
   npm run encryption:migrate:verify
   ```

## Verify Output

`pending` means plaintext still exists without encrypted data. `dual` means both
plaintext and encrypted data exist; applying the migration clears plaintext.
`malformed` means an encrypted column has non-payload JSON. `unreadable` means
the payload exists but cannot decrypt with the configured key ring.

After a successful Stage C migration, `verify` should report:

```text
Totals: pending=0 dual=0 malformed=0 unreadable=0
```

## Stage D

Stage D prevents plaintext from being written back after Stage C succeeds. It
adds PostgreSQL `CHECK (... IS NULL)` constraints to the legacy plaintext columns.
The legacy columns stay in place, so the app remains rollback-compatible, but the
database rejects accidental plaintext writes.

Check readiness:

```bash
npm run encryption:stage-d:status
```

Apply the constraints only after `encryption:migrate:verify` reports zero
`pending`, `dual`, `malformed`, and `unreadable` values:

```bash
ENCRYPTION_STAGE_D_CONFIRMED=yes npm run encryption:stage-d:apply
```

Rollback removes only these constraints, not any data:

```bash
ENCRYPTION_STAGE_D_CONFIRMED=yes npm run encryption:stage-d:rollback
```
