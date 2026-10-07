import "dotenv/config";

import { prisma } from "../src/lib/db";
import { retryPendingAccountPhotoCleanup } from "../src/lib/account-deletion";

async function main() {
  try {
    const result = await retryPendingAccountPhotoCleanup();
    console.info(
      `Account photo cleanup: ${result.completed} completed, ${result.failed} still pending.`,
    );
    if (result.failed > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const name = error instanceof Error ? error.name : "UnknownError";
  const safeName = /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(name)
    ? name
    : "UnknownError";
  console.error(`Account photo cleanup could not run (${safeName}).`);
  process.exitCode = 1;
});
