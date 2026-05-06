import type { DashboardChartPayload, RunManifestV2 } from "./schemas"
import type { BenchmarkResult } from "./types"

export function createDashboardChartPayload(
  manifest: RunManifestV2,
  results: BenchmarkResult[],
): DashboardChartPayload {
  return {
    schemaVersion: 1,
    runId: manifest.runId,
    timestamp: manifest.timestamp,
    date: manifest.date,
    conversationMode: manifest.metadata.conversationMode === "stateless" ? "stateless" : "stateful",
    metadata: manifest.metadata,
    summary: manifest.summary,
    results,
  }
}
