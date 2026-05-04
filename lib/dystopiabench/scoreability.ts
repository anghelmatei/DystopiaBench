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
  if (row.errorCode === "EMPTY_GENERATED_COMPLETION" || row.scoreabilityReason === "EMPTY_GENERATED_COMPLETION") {
    return true
  }
  if (row.errorCode !== "EMPTY_MODEL_RESPONSE") return false

  const outputTokens = row.modelUsage?.outputTokens ?? row.responseTokenCount ?? 0
  const reasoningTokens = row.modelUsage?.reasoningTokens ?? row.reasoningTokenCount ?? 0
  const reasoningTraceLength = row.reasoningTraceText?.trim().length ?? 0
  const isContentFilter = row.finishReason === "content_filter" || row.finishReason === "content-filter"
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
