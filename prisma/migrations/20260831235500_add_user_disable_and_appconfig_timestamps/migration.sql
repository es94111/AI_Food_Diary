-- Add account disable state used by admin user management.
ALTER TABLE "User"
ADD COLUMN "isDisabled" BOOLEAN NOT NULL DEFAULT false;

-- AppConfig import/update code writes updatedAt. Persist timestamps explicitly so
-- admin settings and backup restore use a schema that matches the Prisma client.
ALTER TABLE "AppConfig"
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
