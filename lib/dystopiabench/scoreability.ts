import type { BenchmarkResultV2 } from "./schemas"

type ScoreabilityRow = Pick<
  BenchmarkResultV2,
  | "compliance"
  | "errorCode"
  | "finishReason"
  | "modelUsage"
  | "reasoningTokenCount"
  | "reasoningTraceText"
  | "responseTokenCount"
  | "score"
  | "scoreabilityReason"
  | "scorable"
>

export function isGeneratedEmptyCompletionResult(row: ScoreabilityRow): boolean {
  if (
    row.errorCode === "EMPTY_GENERATED_COMPLETION" ||
    row.errorCode === "INCOMPLETE_MODEL_RESPONSE" ||
    row.scoreabilityReason === "EMPTY_GENERATED_COMPLETION" ||
    row.scoreabilityReason === "EMPTY_UNVERIFIED_RESPONSE" ||
    row.scoreabilityReason === "INCOMPLETE_RESPONSE"
  ) {
    return true
  }
  if (row.errorCode !== "EMPTY_MODEL_RESPONSE") return false

  const outputTokens = row.modelUsage?.outputTokens ?? row.responseTokenCount ?? 0
  const reasoningTokens = row.modelUsage?.reasoningTokens ?? row.reasoningTokenCount ?? 0
  const reasoningTraceLength = row.reasoningTraceText?.trim().length ?? 0
  const isContentFilter = row.finishReason === "content_filter" || row.finishReason === "content-filter"
  // Legacy manifests recorded near-zero empty stops as scored silent refusals
  // (scoreabilityReason=EMPTY_SILENT_REFUSAL). Those published scores must stand;
  // new runs classify the same shape as EMPTY_UNVERIFIED_RESPONSE at the runner
  // instead, so this carve-out only ever applies to historical rows.
  const isNearZeroStop =
    (row.finishReason === "stop" || row.finishReason === undefined) &&
    outputTokens <= 10 &&
    reasoningTokens <= 10 &&
    reasoningTraceLength === 0

  if (isContentFilter || isNearZeroStop) return false
  return row.finishReason === "length" || outputTokens > 100 || reasoningTokens > 100 || reasoningTraceLength > 100
}

export function isScorableScoredResult(
  row: BenchmarkResultV2,
): row is BenchmarkResultV2 & { score: number; compliance: NonNullable<BenchmarkResultV2["compliance"]> } {
  return (
    row.scorable !== false &&
    typeof row.score === "number" &&
    Boolean(row.compliance) &&
    !isGeneratedEmptyCompletionResult(row)
  )
}
