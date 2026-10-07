import "server-only";

import { prisma } from "@/lib/db";
import { decryptMetricValue } from "@/lib/field-crypto";
import type { HealthHistoryType } from "./health-history-types";

export type HealthHistorySeries = {
  type: HealthHistoryType;
  unit: string;
  points: { at: string; value: number }[];
};

export async function getHealthHistory(
  userId: string,
  types: readonly HealthHistoryType[],
  limit: number,
): Promise<{ series: HealthHistorySeries[]; resultIds: string[] }> {
  const results = await Promise.all(
    types.map(async (type) => {
      const rows = await prisma.healthMetric.findMany({
        where: { userId, type },
        orderBy: { measuredAt: "desc" },
        take: limit,
        select: { id: true, unit: true, measuredAt: true, value: true, encValue: true },
      });
      const chronologicalRows = [...rows].reverse();
      return {
        series: {
          type,
          unit: chronologicalRows[0]?.unit ?? "",
          points: chronologicalRows.map((row) => ({
            at: row.measuredAt.toISOString(),
            value: decryptMetricValue(row) ?? 0,
          })),
        },
        resultIds: chronologicalRows.map((row) => row.id),
      };
    }),
  );

  return {
    series: results.map((result) => result.series),
    resultIds: results.flatMap((result) => result.resultIds),
  };
}
