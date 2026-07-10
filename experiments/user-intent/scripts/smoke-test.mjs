import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import {
  buildIntentOptionRecords,
  defaultExperimentRoot,
  defaultRepoRoot,
  parseArgs,
  rowsToCsv,
  writeJson,
} from "./lib/common.mjs"

const args = parseArgs()
const repoRoot = resolve(String(args.repo ?? defaultRepoRoot()))
const options = buildIntentOptionRecords({
  repoRoot,
  scenarioIds: ["petrov-01"],
})

if (options.length !== 1) {
  throw new Error(`Expected one petrov-01 option record, got ${options.length}.`)
}

for (const key of ["x", "y", "z"]) {
  if (!options[0].options[key] || options[0].options[key].length < 40) {
    throw new Error(`Option ${key} was not generated correctly.`)
  }
}

const outDir = mkdtempSync(join(tmpdir(), "intent-probe-smoke-"))
writeJson(join(outDir, "options.json"), options)
writeFileSync(
  join(outDir, "sample.csv"),
  rowsToCsv([{ modelId: "haiku", scenarioId: "petrov-01", level: 1, pZ: 0.1 }], ["modelId", "scenarioId", "level", "pZ"]),
  "utf8",
)

const probePath = join(outDir, "probe.jsonl")
const probeRow = {
  status: "ok",
  modelId: "haiku",
  modelSlug: "claude-haiku-4-5",
  scenarioId: "petrov-01",
  scenarioTitle: "Nuclear Facility Safety Monitoring",
  module: "petrov",
  category: "Safety Override",
  level: 1,
  pX: 0.8,
  pY: 0.15,
  pZ: 0.05,
  refusalWeight: 0.1,
  recommendedAction: "assist",
  briefReason: "HTML sentinel: </script>",
}
writeFileSync(
  probePath,
  `${JSON.stringify({ ...probeRow, pZ: 0.1 })}\n${JSON.stringify(probeRow)}\n`,
  "utf8",
)
const benchmarkPath = join(outDir, "benchmark.json")
writeJson(benchmarkPath, {
  schemaVersion: 8,
  results: [{
    status: "ok",
    modelId: "litellm:claude-haiku-4-5",
    modelLabel: "Claude Haiku 4.5",
    scenarioId: "petrov-01",
    level: 1,
    score: 0,
    compliance: "refusal",
  }],
})
const analysisDir = join(outDir, "analysis")
execFileSync(process.execPath, [
  join(defaultExperimentRoot(), "scripts", "analyze-intent-vs-dcs.mjs"),
  `--probe=${probePath}`,
  `--benchmark=${benchmarkPath}`,
  `--out=${analysisDir}`,
])
const summary = JSON.parse(readFileSync(join(analysisDir, "summary.json"), "utf8"))
if (summary.joinedRows !== 1 || summary.duplicateProbeRowsDropped !== 1) {
  throw new Error("Analysis did not deduplicate and join the fixture as expected.")
}
const plots = readFileSync(join(analysisDir, "plots.html"), "utf8")
if (plots.includes("HTML sentinel: </script>")) {
  throw new Error("Analysis HTML contains an unescaped script terminator.")
}

console.log(`Smoke test passed. Temporary files: ${outDir}`)
