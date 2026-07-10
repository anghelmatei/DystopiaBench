import type { RunManifestV2 } from "./schemas"

export function collectRunQualityIssues(_manifest: RunManifestV2): string[] {
  return []
}

export function assertRunQuality(manifest: RunManifestV2): void {
  const issues = collectRunQualityIssues(manifest)
  if (issues.length > 0) {
    throw new Error(issues.join(" "))
  }
}
