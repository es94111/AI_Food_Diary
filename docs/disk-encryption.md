# Stage E Disk Encryption Runbook

Stage E is an infrastructure control. The application cannot reliably enable it
from inside the repo, so completion requires evidence from the host, cloud
provider, or infrastructure-as-code.

## Scope

Encrypt every persistent layer that can contain user data:

- PostgreSQL data volume.
- Object storage for meal images, APK downloads, and release notes.
- Docker host disks or container volume backing disks.
- Database backups and object-storage backups.
- Swap/pagefile and VM snapshots when applicable.

Field-level AES-GCM encryption remains the application control. Stage E covers
data that still exists on disk: indexes, WAL, database metadata, object bytes,
temporary files, logs, and backups.

## Local Docker Compose

The compose file uses named volumes:

```text
postgres_data -> /var/lib/postgresql/data
minio_data    -> /data
```

Named volumes inherit encryption from the Docker host filesystem. Stage E is
complete locally only if the host volume location is on an encrypted filesystem.

Collect local evidence:

```bash
npm run encryption:disk:check
```

On Windows, verify BitLocker reports `ProtectionStatus: On` for the drive that
stores Docker data. On Linux, verify Docker data is under a LUKS/dm-crypt backed
mount.

## Linux Host With LUKS

Recommended deployment pattern:

1. Create an encrypted LUKS volume for Docker data or for dedicated PostgreSQL
   and object-storage mounts.
2. Mount it before Docker starts, for example at `/var/lib/docker` or at a
   dedicated data path.
3. Ensure `/etc/crypttab` and `/etc/fstab` are configured for boot.
4. Confirm:
   ```bash
   findmnt -no SOURCE,TARGET,FSTYPE,OPTIONS
   lsblk -o NAME,TYPE,FSTYPE,MOUNTPOINTS
   docker volume inspect ai_food_diary_postgres_data
   docker volume inspect ai_food_diary_minio_data
   ```

## Windows Host With BitLocker

Enable BitLocker for the drive that stores Docker Desktop data and project
volumes. Confirm:

```powershell
Get-BitLockerVolume | Select MountPoint,VolumeStatus,ProtectionStatus,EncryptionPercentage
```

Stage E requires `ProtectionStatus` to be on and encryption to be complete for
the relevant drive.

## Cloud Deployment Checklist

Use provider-managed encryption with customer-managed keys where available:

- Database: encrypted storage enabled for the PostgreSQL service or VM disk.
- Object storage: bucket default encryption enabled for image/download/note
  objects.
- Compute: VM root and data disks encrypted.
- Backups/snapshots: encrypted with the same policy class as primary data.
- Key management: rotation policy, access audit logs, and least-privilege key
  grants.

Record the resource IDs, key IDs, and screenshots or IaC references in the
deployment notes. Stage E is not complete without evidence for all persistent
resources.

## Completion Criteria

Stage E is complete when all are true:

- `npm run encryption:disk:check` or provider evidence shows encrypted backing
  storage for local/hosted Docker volumes.
- Production database storage and backups are encrypted.
- Object storage buckets and backups are encrypted.
- VM/container host disks that can hold app data, logs, swap, or temp files are
  encrypted.
- Evidence is stored outside the app database, such as in deployment notes or
  infrastructure change records.
