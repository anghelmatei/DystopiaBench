import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { buildLegacyChartPayload } from "../lib/dystopiabench/legacy-results"

const repoRoot = process.cwd()
const dataDir = join(repoRoot, "public", "data")

function publishLegacyResults(mode: "stateful" | "stateless") {
  const payload = buildLegacyChartPayload(repoRoot, mode)
  const outputPath = join(dataDir, `legacy-results-${mode}.chart.json`)
  writeFileSync(outputPath, `${JSON.stringify(payload)}\n`, "utf8")
  console.log(`Published ${outputPath} (${payload.results.length} chart rows)`)
}

function main() {
  mkdirSync(dataDir, { recursive: true })
  publishLegacyResults("stateful")
  publishLegacyResults("stateless")
}

main()
