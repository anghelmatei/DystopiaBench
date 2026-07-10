import { resolve } from "node:path"
import {
  buildIntentOptionRecords,
  defaultExperimentRoot,
  defaultRepoRoot,
  parseArgs,
  splitCsv,
  writeJson,
} from "./lib/common.mjs"

const args = parseArgs()
const repoRoot = resolve(String(args.repo ?? defaultRepoRoot()))
const modules = splitCsv(args.modules)
const scenarioIds = splitCsv(args["scenario-ids"])
const outPath = args.out
  ? resolve(String(args.out))
  : resolve(defaultExperimentRoot(), "data", "intent-options.json")

const records = buildIntentOptionRecords({
  repoRoot,
  modules,
  scenarioIds,
})

writeJson(outPath, {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  repoRoot,
  scenarioCount: records.length,
  records,
})

console.log(`Wrote ${records.length} scenario intent option records to ${outPath}`)
