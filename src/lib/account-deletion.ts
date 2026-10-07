import "server-only";

import { prisma } from "@/lib/db";
import { deleteImages, listKeys } from "@/lib/storage";

const validAccountPhotoPrefix = /^meals\/[A-Za-z0-9_-]{1,128}\/$/;

function accountPhotoPrefix(userId: string): string {
  const prefix = `meals/${userId}/`;
  if (!validAccountPhotoPrefix.test(prefix)) {
    throw new Error("Unsupported account photo storage prefix");
  }
  return prefix;
}

type PhotoCleanupJob = { id: string; storagePrefix: string };

function safeErrorName(error: unknown): string {
  const name = error instanceof Error ? error.name : "UnknownError";
  return /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(name) ? name : "UnknownError";
}

async function cleanPhotoJob(jobId: string): Promise<void> {
  const job = await prisma.accountDeletionPhotoCleanup.findUnique({
    where: { id: jobId },
    select: { id: true, storagePrefix: true },
  });
  if (!job) return;
  if (!validAccountPhotoPrefix.test(job.storagePrefix)) {
    throw new Error("Invalid account photo cleanup prefix");
  }

  const keys = await listKeys(job.storagePrefix);
  if (keys.some((key) => !key.startsWith(job.storagePrefix))) {
    throw new Error("Storage returned an object outside the account prefix");
  }
  await deleteImages(keys);
  await prisma.accountDeletionPhotoCleanup.deleteMany({ where: { id: job.id } });
}

export async function deleteAccount(userId: string): Promise<"complete" | "pending"> {
  const storagePrefix = accountPhotoPrefix(userId);
  const cleanupJob = await prisma.$transaction(async (tx) => {
    // Bump the session version before deletion; after commit, browser and MCP
    // tokens are rejected because authentication can no longer find this user.
    await tx.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    const job = await tx.accountDeletionPhotoCleanup.create({
      data: { storagePrefix },
      select: { id: true },
    });
    await tx.aiAuditEvent.updateMany({
      where: { userId },
      data: { userId: null },
    });
    await tx.aiAuditEvent.updateMany({
      where: { restoredByUserId: userId },
      data: { restoredByUserId: null },
    });
    await tx.user.delete({ where: { id: userId } });
    return job;
  });

  try {
    await cleanPhotoJob(cleanupJob.id);
    return "complete";
  } catch (error) {
    console.error("Account photo cleanup remains pending", {
      cleanupJobId: cleanupJob.id,
      errorName: safeErrorName(error),
    });
    return "pending";
  }
}

export async function retryPendingAccountPhotoCleanup(): Promise<{
  completed: number;
  failed: number;
}> {
  const jobs: PhotoCleanupJob[] = await prisma.accountDeletionPhotoCleanup.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, storagePrefix: true },
  });
  let completed = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      await cleanPhotoJob(job.id);
      completed += 1;
    } catch (error) {
      failed += 1;
      console.error("Account photo cleanup job failed", {
        cleanupJobId: job.id,
        errorName: safeErrorName(error),
      });
    }
  }

  return { completed, failed };
}
