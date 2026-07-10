import { existsSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import {
  ensureDir,
  defaultExperimentRoot,
  mean,
  normalizeModelIdentity,
  nowRunId,
  parseArgs,
  pearson,
  readJsonMaybeGz,
  readJsonl,
  round,
  rowsToCsv,
  spearman,
  writeJson,
} from "./lib/common.mjs"

function benchmarkKey(row) {
  return `${normalizeModelIdentity(row.modelId)}::${row.scenarioId}::${row.level}`
}

function probeKey(row) {
  return `${normalizeModelIdentity(row.modelId)}::${row.scenarioId}::${row.level}`
}

function summarizeBenchmarkRows(rows) {
  const scored = rows.filter((row) => Number.isFinite(row.score))
  if (scored.length === 0) return null
  return {
    benchmarkModelId: rows[0].modelId,
    benchmarkModelLabel: rows[0].modelLabel,
    dcsScore: mean(scored.map((row) => row.score)),
    replicateCount: scored.length,
    refusalRate: scored.filter((row) => row.compliance === "refusal").length / scored.length,
    hesitantRate: scored.filter((row) => row.compliance === "hesitant").length / scored.length,
    compliantRate: scored.filter((row) => row.compliance === "compliant").length / scored.length,
    proactiveRate: scored.filter((row) => row.compliance === "proactive").length / scored.length,
    complianceLabels: [...new Set(scored.map((row) => row.compliance).filter(Boolean))].join("|"),
  }
}

function groupBy(rows, keyFn) {
  const groups = new Map()
  for (const row of rows) {
    const key = keyFn(row)
    const existing = groups.get(key)
    if (existing) existing.push(row)
    else groups.set(key, [row])
  }
  return groups
}

function summarizeCorrelation(rows) {
  const pZ = rows.map((row) => row.pZ)
  const pX = rows.map((row) => row.pX)
  const pY = rows.map((row) => row.pY)
  const scores = rows.map((row) => row.dcsScore)
  const refusals = rows.map((row) => row.refusalRate)
  const refusalWeights = rows.map((row) => row.refusalWeight)
  const recommendedActions = rows.map((row) => row.recommendedAction)
  const actionScores = recommendedActions.map((action) => ({ assist: 0, bounded_assist: 0.5, refuse: 1 })[action])
  return {
    n: rows.length,
    meanPZ: round(mean(pZ)),
    meanPX: round(mean(pX)),
    meanPY: round(mean(pY)),
    meanDcs: round(mean(scores)),
    meanRefusalRate: round(mean(refusals)),
    meanRefusalWeight: round(mean(refusalWeights)),
    recommendedAssistRate: round(recommendedActions.filter((action) => action === "assist").length / rows.length),
    recommendedBoundedAssistRate: round(recommendedActions.filter((action) => action === "bounded_assist").length / rows.length),
    recommendedRefuseRate: round(recommendedActions.filter((action) => action === "refuse").length / rows.length),
    pearsonPzDcs: round(pearson(pZ, scores)),
    spearmanPzDcs: round(spearman(pZ, scores)),
    pearsonPzRefusalRate: round(pearson(pZ, refusals)),
    spearmanPzRefusalRate: round(spearman(pZ, refusals)),
    pearsonPxDcs: round(pearson(pX, scores)),
    pearsonPyDcs: round(pearson(pY, scores)),
    pearsonRefusalWeightDcs: round(pearson(refusalWeights, scores)),
    pearsonRefusalWeightRefusalRate: round(pearson(refusalWeights, refusals)),
    pearsonPzRefusalWeight: round(pearson(pZ, refusalWeights)),
    spearmanPzRecommendedAction: round(spearman(pZ, actionScores)),
  }
}

function summarizeGroups(rows, key) {
  return Object.fromEntries(
    [...groupBy(rows, (row) => String(row[key])).entries()]
      .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
      .map(([groupKey, groupRows]) => [groupKey, summarizeCorrelation(groupRows)]),
  )
}

function buildPlotsHtml({ summary, rows }) {
  const safeRows = JSON.stringify(rows).replace(/</g, "\\u003c")
  const safeSummary = JSON.stringify(summary, null, 2)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DystopiaBench Intent Probe Analysis</title>
  <style>
    :root { color-scheme: light; font-family: Arial, sans-serif; }
    body { margin: 24px; color: #172026; background: #f8fafc; }
    h1, h2 { margin: 0 0 12px; }
    .panel { background: white; border: 1px solid #d7dde5; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
    svg { width: 100%; height: auto; background: white; }
    .muted { color: #5d6978; }
    pre { overflow: auto; background: #111827; color: #f8fafc; padding: 12px; border-radius: 6px; }
  </style>
</head>
<body>
  <h1>DystopiaBench Intent Probe Analysis</h1>
  <p class="muted">Rows joined by scenario, level, and normalized model identity.</p>
  <div class="grid">
    <div class="panel">
      <h2>P(Z) vs DCS</h2>
      <div id="scatter-z"></div>
    </div>
    <div class="panel">
      <h2>P(Y) vs DCS</h2>
      <div id="scatter-y"></div>
    </div>
    <div class="panel">
      <h2>P(X) vs DCS</h2>
      <div id="scatter-x"></div>
    </div>
    <div class="panel">
      <h2>Refusal weight vs DCS</h2>
      <div id="scatter-refusal"></div>
    </div>
    <div class="panel">
      <h2>Means by Level</h2>
      <div id="level"></div>
    </div>
  </div>
  <div class="panel">
    <h2>Summary</h2>
    <pre>${safeSummary.replace(/</g, "&lt;")}</pre>
  </div>
  <script>
    const rows = ${safeRows};
    const colors = {
      "haiku": "#2563eb",
      "gemini-3.5-flash": "#059669",
      "gpt-5.4-mini": "#dc2626"
    };
    function svg(width, height, content) {
      return '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img">' + content + '</svg>';
    }
    function line(x1, y1, x2, y2, stroke = "#94a3b8") {
      return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + stroke + '" stroke-width="1" />';
    }
    function text(x, y, value, anchor = "middle", size = 11) {
      return '<text x="' + x + '" y="' + y + '" text-anchor="' + anchor + '" font-size="' + size + '" fill="#334155">' + value + '</text>';
    }
    function scatter(containerId, field, axisLabel) {
      const width = 720, height = 420, left = 58, right = 20, top = 20, bottom = 52;
      const plotW = width - left - right, plotH = height - top - bottom;
      let content = '';
      for (let i = 0; i <= 5; i++) {
        const x = left + plotW * i / 5;
        const y = top + plotH * i / 5;
        content += line(x, top, x, top + plotH, "#e2e8f0");
        content += line(left, y, left + plotW, y, "#e2e8f0");
        content += text(x, height - 28, (i / 5).toFixed(1));
        content += text(42, top + plotH - plotH * i / 5 + 4, String(i * 20), "end");
      }
      content += line(left, top, left, top + plotH, "#475569");
      content += line(left, top + plotH, left + plotW, top + plotH, "#475569");
      content += text(width / 2, height - 8, axisLabel);
      content += text(14, height / 2, "DCS", "middle");
      for (const row of rows) {
        const estimate = row[field];
        if (!Number.isFinite(estimate)) continue;
        const x = left + Math.max(0, Math.min(1, estimate)) * plotW;
        const y = top + plotH - Math.max(0, Math.min(100, row.dcsScore)) / 100 * plotH;
        const color = colors[row.modelId] || "#7c3aed";
        content += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4" fill="' + color + '" fill-opacity="0.72"><title>' + row.modelId + ' ' + row.scenarioId + ' L' + row.level + ' ' + field + '=' + estimate.toFixed(2) + ' DCS=' + row.dcsScore.toFixed(1) + '</title></circle>';
      }
      let legendY = 34;
      for (const model of [...new Set(rows.map((row) => row.modelId))]) {
        const color = colors[model] || "#7c3aed";
        content += '<circle cx="575" cy="' + legendY + '" r="5" fill="' + color + '" />';
        content += text(588, legendY + 4, model, "start", 12);
        legendY += 18;
      }
      document.getElementById(containerId).innerHTML = svg(width, height, content);
    }
    function levelChart() {
      const grouped = new Map();
      for (const row of rows) {
        const key = String(row.level);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(row);
      }
      const levels = [...grouped.keys()].sort((a, b) => Number(a) - Number(b));
      const width = 720, height = 420, left = 58, right = 24, top = 28, bottom = 52;
      const plotW = width - left - right, plotH = height - top - bottom;
      let content = '';
      for (let i = 0; i <= 5; i++) {
        const y = top + plotH * i / 5;
        content += line(left, y, left + plotW, y, "#e2e8f0");
        content += text(42, top + plotH - plotH * i / 5 + 4, String(i * 20), "end");
      }
      content += line(left, top, left, top + plotH, "#475569");
      content += line(left, top + plotH, left + plotW, top + plotH, "#475569");
      const barW = plotW / Math.max(1, levels.length) * 0.28;
      levels.forEach((level, index) => {
        const levelRows = grouped.get(level);
        const avgPz = levelRows.reduce((sum, row) => sum + row.pZ, 0) / levelRows.length;
        const avgDcs = levelRows.reduce((sum, row) => sum + row.dcsScore, 0) / levelRows.length;
        const center = left + plotW * (index + 0.5) / levels.length;
        const pzH = avgPz * 100 / 100 * plotH;
        const dcsH = avgDcs / 100 * plotH;
        content += '<rect x="' + (center - barW - 2) + '" y="' + (top + plotH - pzH) + '" width="' + barW + '" height="' + pzH + '" fill="#0f766e"><title>L' + level + ' mean PZ=' + avgPz.toFixed(3) + '</title></rect>';
        content += '<rect x="' + (center + 2) + '" y="' + (top + plotH - dcsH) + '" width="' + barW + '" height="' + dcsH + '" fill="#b91c1c"><title>L' + level + ' mean DCS=' + avgDcs.toFixed(1) + '</title></rect>';
        content += text(center, height - 28, "L" + level);
      });
      content += '<rect x="540" y="24" width="10" height="10" fill="#0f766e" />' + text(556, 34, "Mean P(Z) x 100", "start", 12);
      content += '<rect x="540" y="44" width="10" height="10" fill="#b91c1c" />' + text(556, 54, "Mean DCS", "start", 12);
      document.getElementById("level").innerHTML = svg(width, height, content);
    }
    scatter("scatter-z", "pZ", "Estimated P(Z)");
    scatter("scatter-y", "pY", "Estimated P(Y)");
    scatter("scatter-x", "pX", "Estimated P(X)");
    scatter("scatter-refusal", "refusalWeight", "Refusal weight");
    levelChart();
  </script>
</body>
</html>
`
}

const args = parseArgs()
const probePath = args.probe ? resolve(String(args.probe)) : null
const benchmarkPath = args.benchmark ? resolve(String(args.benchmark)) : null
if (!probePath || !existsSync(probePath)) {
  throw new Error("Pass --probe=<path to intent-probes.jsonl>.")
}
if (!benchmarkPath || !existsSync(benchmarkPath)) {
  throw new Error("Pass --benchmark=<path to normal DystopiaBench run manifest .json or .json.gz>.")
}

const analysisId = String(args["analysis-id"] ?? nowRunId("intent-analysis"))
const outDir = args.out
  ? resolve(String(args.out))
  : join(defaultExperimentRoot(), "analysis", analysisId)
ensureDir(outDir)

const rawProbeRows = readJsonl(probePath).filter((row) => row.status === "ok")
const probeRowsByKey = new Map()
for (const row of rawProbeRows) probeRowsByKey.set(probeKey(row), row)
const probeRows = [...probeRowsByKey.values()]
const benchmarkManifest = readJsonMaybeGz(benchmarkPath)
const benchmarkRows = Array.isArray(benchmarkManifest.results) ? benchmarkManifest.results : []
const benchmarkGroups = groupBy(
  benchmarkRows.filter((row) => row.status === "ok" && Number.isFinite(row.score)),
  benchmarkKey,
)
const benchmarkSummaryByKey = new Map()
for (const [key, rows] of benchmarkGroups) {
  const summary = summarizeBenchmarkRows(rows)
  if (summary) benchmarkSummaryByKey.set(key, summary)
}

const joined = []
const missing = []
for (const probe of probeRows) {
  const key = probeKey(probe)
  const benchmark = benchmarkSummaryByKey.get(key)
  if (!benchmark) {
    missing.push({
      modelId: probe.modelId,
      scenarioId: probe.scenarioId,
      level: probe.level,
      key,
    })
    continue
  }
  joined.push({
    modelId: normalizeModelIdentity(probe.modelId),
    probeModelId: probe.modelId,
    probeModelSlug: probe.modelSlug,
    benchmarkModelId: benchmark.benchmarkModelId,
    scenarioId: probe.scenarioId,
    scenarioTitle: probe.scenarioTitle,
    module: probe.module,
    category: probe.category,
    level: probe.level,
    pX: probe.pX,
    pY: probe.pY,
    pZ: probe.pZ,
    refusalWeight: probe.refusalWeight,
    recommendedAction: probe.recommendedAction,
    dcsScore: benchmark.dcsScore,
    refusalRate: benchmark.refusalRate,
    hesitantRate: benchmark.hesitantRate,
    compliantRate: benchmark.compliantRate,
    proactiveRate: benchmark.proactiveRate,
    replicateCount: benchmark.replicateCount,
    complianceLabels: benchmark.complianceLabels,
    briefReason: probe.briefReason,
  })
}

const summary = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  probePath,
  benchmarkPath,
  probeRawOkRows: rawProbeRows.length,
  probeOkRows: probeRows.length,
  duplicateProbeRowsDropped: rawProbeRows.length - probeRows.length,
  benchmarkScoredRows: benchmarkRows.filter((row) => row.status === "ok" && Number.isFinite(row.score)).length,
  joinedRows: joined.length,
  missingJoinRows: missing.length,
  overall: summarizeCorrelation(joined),
  byModel: summarizeGroups(joined, "modelId"),
  byLevel: summarizeGroups(joined, "level"),
  byModule: summarizeGroups(joined, "module"),
  missing: missing.slice(0, 200),
}

writeJson(join(outDir, "summary.json"), summary)
writeFileSync(
  join(outDir, "joined.csv"),
  rowsToCsv(joined, [
    "modelId",
    "probeModelId",
    "probeModelSlug",
    "benchmarkModelId",
    "scenarioId",
    "scenarioTitle",
    "module",
    "category",
    "level",
    "pX",
    "pY",
    "pZ",
    "refusalWeight",
    "recommendedAction",
    "dcsScore",
    "refusalRate",
    "hesitantRate",
    "compliantRate",
    "proactiveRate",
    "replicateCount",
    "complianceLabels",
    "briefReason",
  ]),
  "utf8",
)
writeFileSync(join(outDir, "plots.html"), buildPlotsHtml({ summary, rows: joined }), "utf8")

console.log(`Joined rows: ${joined.length}; missing: ${missing.length}`)
console.log(`Summary: ${join(outDir, "summary.json")}`)
console.log(`Plots: ${join(outDir, "plots.html")}`)
