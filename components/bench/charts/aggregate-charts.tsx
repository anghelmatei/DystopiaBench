"use client"

import { useMemo, useState } from "react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, Cell,
} from "recharts"
import { Card } from "@/components/ui/card"
import type { BenchmarkResult } from "@/lib/dystopiabench/types"
import {
  getAggregateByModel,
  getEscalationCurve,
  getEscalationCurveByModel,
  getDRFRByModel,
  getChartShape,
} from "@/lib/dystopiabench/analytics"
import {
  MODEL_COLORS,
  scoreColor, scoreLabel, LEVEL_LABELS, getResponsiveBarChartLayout,
} from "@/lib/dystopiabench/chart-config"
import { getModelById } from "@/lib/dystopiabench/models"
import { ALL_MODULES } from "@/lib/dystopiabench/scenarios"
import { orderScenarioModulesForDisplay } from "@/lib/dystopiabench/module-display-order"
import { SectionHeader } from "./section-header"

function getModuleDisplayLabel(label: string): string {
  return label.replace(/\s+Module$/i, "")
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score))
}

function lerp(start: number, end: number, amount: number): number {
  return Math.round(start + (end - start) * amount)
}

function moduleHeatmapColor(score: number): string {
  const t = Math.max(0, Math.min(1, (score - 15) / 80))

  if (t < 0.4) {
    const s = t / 0.4
    return `rgb(${lerp(56, 255, s)}, ${lerp(184, 210, s)}, ${lerp(85, 50, s)})`
  }

  if (t < 0.7) {
    const s = (t - 0.4) / 0.3
    return `rgb(${lerp(255, 240, s)}, ${lerp(210, 130, s)}, ${lerp(50, 20, s)})`
  }

  const s = (t - 0.7) / 0.3
  return `rgb(${lerp(240, 195, s)}, ${lerp(130, 30, s)}, ${lerp(20, 28, s)})`
}

function moduleHeatmapTextColor(score: number): string {
  const color = moduleHeatmapColor(score).match(/\d+/g)?.map(Number) ?? [0, 0, 0]
  const luminance = (0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2]) / 255
  return luminance > 0.48 ? "#0a0a0a" : "#f5f5f5"
}

function DcsGradientLegend({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted-foreground ${className}`}>
      <span>Low DCS (better)</span>
      <div
        className="h-2 w-40 rounded"
        style={{
          background:
            "linear-gradient(90deg, rgb(56, 184, 85), rgb(255, 210, 50), rgb(240, 130, 20), rgb(195, 30, 28))",
        }}
      />
      <span>High DCS (worse)</span>
    </div>
  )
}

function ModelBarTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { label: string; avgScore: number; provider: string } }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 shadow-lg">
      <p className="mb-1 font-mono text-[10px] text-muted-foreground">{d.provider}</p>
      <p className="font-mono text-xs font-bold text-foreground">{d.label}</p>
      <p className="mt-1 font-mono text-sm font-black" style={{ color: scoreColor(d.avgScore) }}>
        {d.avgScore} <span className="text-[10px] font-normal">{scoreLabel(d.avgScore)}</span>
      </p>
    </div>
  )
}

function EscalationTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  const levelNum = parseInt(label?.replace("L", "") || "1", 10)
  return (
    <div className="min-w-40 rounded-md border border-border bg-card px-3 py-2 shadow-lg">
      <p className="mb-2 font-mono text-[10px] text-muted-foreground">
        {label} - {LEVEL_LABELS[levelNum] ?? label}
      </p>
      {payload
        .slice()
        .sort((a, b) => a.value - b.value)
        .map((entry) => {
          const model = getModelById(String(entry.dataKey))
          return (
            <div key={entry.dataKey} className="mb-0.5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
                <span className="font-mono text-[10px] text-muted-foreground">{model?.label ?? entry.dataKey}</span>
              </div>
              <span className="font-mono text-[10px] font-bold" style={{ color: entry.color }}>{entry.value}</span>
            </div>
          )
        })}
    </div>
  )
}

function RadarTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="min-w-40 rounded-md border border-border bg-card px-3 py-2 shadow-lg">
      <p className="mb-2 font-mono text-[10px] text-muted-foreground">{label}</p>
      {payload
        .slice()
        .sort((a, b) => a.value - b.value)
        .map((entry) => {
          const model = getModelById(String(entry.dataKey))
          return (
            <div key={entry.dataKey} className="mb-0.5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
                <span className="font-mono text-[10px] text-muted-foreground">{model?.label ?? entry.dataKey}</span>
              </div>
              <span className="font-mono text-[10px] font-bold" style={{ color: scoreColor(entry.value) }}>{entry.value}</span>
            </div>
          )
        })}
    </div>
  )
}

function DRFRTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { label: string; drfr: number; provider: string } }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 shadow-lg">
      <p className="mb-1 font-mono text-[10px] text-muted-foreground">{d.provider}</p>
      <p className="font-mono text-xs font-bold text-foreground">{d.label}</p>
      <p className="mt-1 font-mono text-sm font-black text-accent">
        {d.drfr}% <span className="text-[10px] font-normal text-muted-foreground">principled refusals</span>
      </p>
    </div>
  )
}

function ModelBarChart({ data }: { data: ReturnType<typeof getAggregateByModel> }) {
  const barLayout = getResponsiveBarChartLayout({ categoryCount: data.length })

  return (
    <Card className="bg-card border-border p-5">
      <SectionHeader
        label="Average Dystopian Compliance Score by Model"
        sub="DCS - measures how willingly a model complies with harmful requests (Lower is better)"
      />
      <div className="h-[300px] md:h-[420px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ left: 4, right: 4, top: 4, bottom: 72 }}
            barGap={barLayout.barGap}
            barCategoryGap={barLayout.barCategoryGap}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              type="category"
              dataKey="label"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9, fontFamily: "var(--font-mono)" }}
              axisLine={{ stroke: "hsl(var(--border))" }}
              tickLine={false}
              angle={-40}
              textAnchor="end"
              interval={0}
            />
            <YAxis
              type="number"
              domain={[0, 100]}
              tickFormatter={(value) => `${value}`}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "var(--font-mono)" }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            <Tooltip content={<ModelBarTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
            <Bar dataKey="avgScore" radius={[3, 3, 0, 0]} maxBarSize={barLayout.maxBarSize}>
              {data.map((entry) => (
                <Cell key={entry.modelId} fill={MODEL_COLORS[entry.modelId] ?? "#888"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

function DRFRChart({ data }: { data: ReturnType<typeof getDRFRByModel> }) {
  const barLayout = getResponsiveBarChartLayout({ categoryCount: data.length })

  return (
    <Card className="bg-card border-border p-5">
      <SectionHeader
        label="Directed Refusal Rate by Model"
        sub="DRFR - percentage of harmful prompts the model refused on principle (Higher is better)"
      />
      <div className="h-[300px] md:h-[420px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ left: 4, right: 4, top: 4, bottom: 72 }}
            barGap={barLayout.barGap}
            barCategoryGap={barLayout.barCategoryGap}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              type="category"
              dataKey="label"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9, fontFamily: "var(--font-mono)" }}
              axisLine={{ stroke: "hsl(var(--border))" }}
              tickLine={false}
              angle={-40}
              textAnchor="end"
              interval={0}
            />
            <YAxis
              type="number"
              domain={[0, 100]}
              tickFormatter={(value) => `${value}%`}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "var(--font-mono)" }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip content={<DRFRTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
            <Bar dataKey="drfr" radius={[3, 3, 0, 0]} maxBarSize={barLayout.maxBarSize}>
              {data.map((entry) => (
                <Cell key={entry.modelId} fill={MODEL_COLORS[entry.modelId] ?? "#888"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

function EscalationCurveChart({
  data,
  title = "Escalation Curve - All Models",
  sub = "How each model's Dystopian Compliance Score (DCS) changes as pressure escalates from L1 to L5 (Lower is better)",
}: {
  data: ReturnType<typeof getEscalationCurveByModel>
  title?: string
  sub?: string
}) {
  const modelIds = data.length > 0 ? Object.keys(data[0]).filter((key) => key !== "level") : []
  return (
    <Card className="bg-card border-border p-5">
      <SectionHeader
        label={title}
        sub={sub}
      />
      <div className="h-[220px] md:h-[360px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="level"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "var(--font-mono)" }}
              axisLine={{ stroke: "hsl(var(--border))" }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "var(--font-mono)" }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            <Tooltip content={<EscalationTooltip />} />
            {modelIds.map((id) => (
              <Line
                key={id}
                type="linear"
                dataKey={id}
                stroke={MODEL_COLORS[id] ?? "#888"}
                strokeWidth={2}
                dot={{ r: 3, fill: MODEL_COLORS[id] ?? "#888", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 border-t border-border pt-3">
        {modelIds.map((id) => {
          const model = getModelById(id)
          return (
            <div key={id} className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full" style={{ background: MODEL_COLORS[id] ?? "#888" }} />
              <span className="font-mono text-[10px] text-muted-foreground">{model?.label ?? id}</span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function AggregateEscalationTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number; color: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const levelNum = parseInt(label?.replace("L", "") || "1", 10)
  const value = payload[0]?.value ?? 0

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 shadow-lg">
      <p className="mb-1 font-mono text-[10px] text-muted-foreground">
        {label} - {LEVEL_LABELS[levelNum] ?? label}
      </p>
      <p className="font-mono text-sm font-black" style={{ color: scoreColor(value) }}>
        {value} <span className="text-[10px] font-normal">{scoreLabel(value)}</span>
      </p>
    </div>
  )
}

function ModuleAggregateEscalationCard({
  label,
  data,
}: {
  label: string
  data: ReturnType<typeof getEscalationCurve>
}) {
  const aggregateLineColor = "hsl(var(--destructive))"

  return (
    <Card className="bg-card border-border p-5">
      <SectionHeader
        label={`${label} Escalation Curve`}
        sub={`Aggregate DCS across all models from L1 to L5 within ${label} (Lower is better)`}
      />
      <div className="h-[180px] md:h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 0, right: 8, top: 20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="level"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "var(--font-mono)" }}
              axisLine={{ stroke: "hsl(var(--border))" }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "var(--font-mono)" }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            <Tooltip content={<AggregateEscalationTooltip />} />
            <Line
              type="linear"
              dataKey="avgScore"
              stroke={aggregateLineColor}
              strokeWidth={2.5}
              dot={{ r: 3, fill: aggregateLineColor, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              label={{
                position: "top",
                offset: 8,
                fill: aggregateLineColor,
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

function ModuleEscalationCurves({ results }: { results: BenchmarkResult[] }) {
  const moduleEntries = orderScenarioModulesForDisplay(ALL_MODULES).map((module) => ({
    id: module.id,
    label: getModuleDisplayLabel(module.label),
    data: getEscalationCurve(results.filter((result) => result.module === module.id)),
  }))

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        {moduleEntries.map((module) => (
          <ModuleAggregateEscalationCard
            key={String(module.id)}
            label={module.label}
            data={module.data}
          />
        ))}
      </div>
    </div>
  )
}

function ModuleComparisonChart({ results }: { results: BenchmarkResult[] }) {
  const [view, setView] = useState<"heatmap" | "module-bars">("module-bars")
  const [sortKey, setSortKey] = useState<string>("avg")
  const moduleEntries = useMemo(
    () =>
      orderScenarioModulesForDisplay(ALL_MODULES).map((module) => ({
        id: module.id,
        label: getModuleDisplayLabel(module.label),
      })),
    [],
  )

  const modelEntries = useMemo(() => {
    const modelIds = [...new Set(results.map((result) => result.modelId))]

    return modelIds.map((id) => {
      const model = getModelById(id)
      const allModelRows = results.filter((result) => result.modelId === id)
      const moduleScores = new Map<string, number>()

      for (const moduleEntry of moduleEntries) {
        const moduleRows = allModelRows.filter((result) => result.module === moduleEntry.id)
        if (moduleRows.length > 0) {
          moduleScores.set(
            String(moduleEntry.id),
            Math.round(moduleRows.reduce((sum, result) => sum + result.score, 0) / moduleRows.length),
          )
        }
      }

      return {
        id,
        label: model?.label ?? id,
        provider: model?.provider ?? allModelRows[0]?.provider ?? "Unknown",
        avgScore: allModelRows.length
          ? Math.round(allModelRows.reduce((sum, result) => sum + result.score, 0) / allModelRows.length)
          : null,
        moduleScores,
      }
    })
  }, [moduleEntries, results])

  const sortedModelEntries = useMemo(() => {
    return modelEntries.slice().sort((left, right) => {
      const leftScore = sortKey === "avg" ? left.avgScore : left.moduleScores.get(sortKey)
      const rightScore = sortKey === "avg" ? right.avgScore : right.moduleScores.get(sortKey)

      if (leftScore == null && rightScore == null) return left.label.localeCompare(right.label)
      if (leftScore == null) return 1
      if (rightScore == null) return -1
      return leftScore - rightScore || left.label.localeCompare(right.label)
    })
  }, [modelEntries, sortKey])

  const moduleAverages = useMemo(() => {
    return new Map(
      moduleEntries.map((moduleEntry) => {
        const values = modelEntries
          .map((modelEntry) => modelEntry.moduleScores.get(String(moduleEntry.id)))
          .filter((score): score is number => typeof score === "number")

        return [
          String(moduleEntry.id),
          values.length
            ? Math.round(values.reduce((sum, score) => sum + score, 0) / values.length)
            : null,
        ]
      }),
    )
  }, [modelEntries, moduleEntries])

  const getCellTitle = (modelLabel: string, moduleLabel: string, score: number | null) => {
    if (score == null) return `${modelLabel} | ${moduleLabel}: no data`
    return `${modelLabel} | ${moduleLabel}: ${score} DCS (lower is better)`
  }

  const renderScoreCell = (key: string, score: number | null, title: string) => {
    if (score == null) {
      return (
        <td
          key={key}
          className="h-9 w-20 min-w-20 max-w-20 rounded bg-muted/25 text-center font-mono text-[10px] text-muted-foreground"
          title={title}
        >
          -
        </td>
      )
    }

    return (
      <td
        key={key}
        className="h-9 w-20 min-w-20 max-w-20 rounded text-center font-mono text-[11px] font-bold transition-transform duration-100 hover:relative hover:z-10 hover:scale-110"
        style={{
          background: moduleHeatmapColor(score),
          color: moduleHeatmapTextColor(score),
        }}
        title={title}
      >
        {score}
      </td>
    )
  }

  return (
    <Card className="bg-card border-border p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <SectionHeader
          label="Module Breakdown by Model"
          sub="Average Dystopian Compliance Score (DCS) per module per model (Lower is better)"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="module-comparison-sort" className="font-mono text-[10px] text-muted-foreground">
            Sort by
          </label>
          <select
            id="module-comparison-sort"
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value)}
            disabled={view !== "heatmap"}
            className="h-7 rounded border border-border bg-background px-2 font-mono text-[10px] text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="avg">Avg score</option>
            {moduleEntries.map((moduleEntry) => (
              <option key={moduleEntry.id} value={String(moduleEntry.id)}>
                {moduleEntry.label}
              </option>
            ))}
          </select>
          <div className="flex rounded border border-border p-0.5">
            <button
              type="button"
              onClick={() => setView("heatmap")}
              className={`h-6 rounded px-2 font-mono text-[10px] transition-colors ${
                view === "heatmap"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Heatmap
            </button>
            <button
              type="button"
              onClick={() => setView("module-bars")}
              className={`h-6 rounded px-2 font-mono text-[10px] transition-colors ${
                view === "module-bars"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              By Module
            </button>
          </div>
        </div>
      </div>

      {view === "heatmap" ? (
        <div className="mt-5 overflow-x-auto subtle-x-scrollbar">
          <table className="w-max border-separate border-spacing-1 table-fixed">
            <thead>
              <tr>
                <th className="w-36 pb-2 text-left align-bottom font-mono text-[10px] font-medium text-muted-foreground" />
                {sortedModelEntries.map((modelEntry) => (
                  <th
                    key={modelEntry.id}
                    className="h-24 w-20 min-w-20 max-w-20 pb-3 text-center align-bottom"
                    title={`${modelEntry.label} | ${modelEntry.provider}`}
                  >
                    <span className="inline-block origin-bottom-left -rotate-45 whitespace-nowrap font-mono text-[10px] font-medium text-muted-foreground">
                      {modelEntry.label}
                    </span>
                  </th>
                ))}
                <th className="h-24 w-20 min-w-20 max-w-20 pb-3 text-center align-bottom">
                  <span className="inline-block origin-bottom-left -rotate-45 whitespace-nowrap font-mono text-[10px] font-medium text-muted-foreground">
                    Avg
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {moduleEntries.map((moduleEntry) => (
                <tr key={moduleEntry.id}>
                  <th className="w-36 pr-3 text-left align-middle font-mono text-[11px] font-semibold uppercase tracking-wide text-foreground">
                    {moduleEntry.label}
                  </th>
                  {sortedModelEntries.map((modelEntry) =>
                    renderScoreCell(
                      `${moduleEntry.id}-${modelEntry.id}`,
                      modelEntry.moduleScores.get(String(moduleEntry.id)) ?? null,
                      getCellTitle(
                        modelEntry.label,
                        moduleEntry.label,
                        modelEntry.moduleScores.get(String(moduleEntry.id)) ?? null,
                      ),
                    )
                  )}
                  {renderScoreCell(
                    `${moduleEntry.id}-avg`,
                    moduleAverages.get(String(moduleEntry.id)) ?? null,
                    `${moduleEntry.label} average: ${
                      moduleAverages.get(String(moduleEntry.id)) ?? "no data"
                    } DCS (lower is better)`,
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <DcsGradientLegend className="mt-4" />
        </div>
      ) : (
        <div className="mt-5">
          <DcsGradientLegend className="mb-4" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {moduleEntries.map((moduleEntry) => {
              const rows = modelEntries
                .map((modelEntry) => ({
                  id: modelEntry.id,
                  label: modelEntry.label,
                  score: modelEntry.moduleScores.get(String(moduleEntry.id)) ?? null,
                }))
                .sort((left, right) => {
                  if (left.score == null && right.score == null) return left.label.localeCompare(right.label)
                  if (left.score == null) return 1
                  if (right.score == null) return -1
                  return left.score - right.score || left.label.localeCompare(right.label)
                })

              return (
                <div key={moduleEntry.id} className="rounded-lg border border-border bg-background/35 p-3">
                  <p className="mb-3 font-mono text-[11px] font-bold uppercase tracking-wide text-foreground">
                    {moduleEntry.label}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {rows.map((row) => {
                      const score = row.score
                      const width = score == null ? 0 : clampScore(score)

                      return (
                        <div key={row.id} className="flex min-w-0 items-center gap-2">
                          <span
                            className="w-28 shrink-0 truncate font-mono text-[10px] text-muted-foreground"
                            title={row.label}
                          >
                            {row.label}
                          </span>
                          <div
                            className="h-4 min-w-0 flex-1 overflow-hidden rounded bg-muted/35"
                            title={getCellTitle(row.label, moduleEntry.label, score)}
                          >
                            {score == null ? null : (
                              <div
                                className="flex h-full items-center justify-end rounded px-1 font-mono text-[9px] font-bold"
                                style={{
                                  width: `${width}%`,
                                  minWidth: "1.75rem",
                                  background: moduleHeatmapColor(score),
                                  color: moduleHeatmapTextColor(score),
                                }}
                              >
                                {score}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Card>
  )
}

function ModelRadarChart({ results }: { results: BenchmarkResult[] }) {
  const modelIds = [...new Set(results.map((result) => result.modelId))]
  const data = [1, 2, 3, 4, 5].map((level) => {
    const row: Record<string, string | number> = { level: `L${level}\n${LEVEL_LABELS[level]}` }
    for (const id of modelIds) {
      const rows = results.filter((result) => result.modelId === id && result.level === level)
      row[id] = rows.length ? Math.round(rows.reduce((sum, result) => sum + result.score, 0) / rows.length) : 0
    }
    return row
  })

  return (
    <Card className="bg-card border-border px-5 pb-4 pt-4">
      <div className="mb-1">
        <p className="font-mono text-xs font-bold tracking-wider text-foreground uppercase">Escalation Radar - All Models</p>
        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">Dystopian Compliance Score (DCS) by escalation pressure level (Lower is better)</p>
      </div>
      <div className="-mb-10 -mt-4 h-[360px] md:-mb-14 md:-mt-5 md:h-[560px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart
            data={data}
            cx="50%"
            cy="50%"
            outerRadius="92%"
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          >
            <PolarGrid stroke="hsl(var(--border))" />
            <PolarAngleAxis
              dataKey="level"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9, fontFamily: "var(--font-mono)" }}
            />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} tickLine={false} />
            <Tooltip content={<RadarTooltip />} />
            {modelIds.map((id) => {
              const model = getModelById(id)
              return (
                <Radar
                  key={id}
                  name={model?.label ?? id}
                  dataKey={id}
                  stroke={MODEL_COLORS[id] ?? "#888"}
                  fill={MODEL_COLORS[id] ?? "#888"}
                  fillOpacity={0.07}
                  strokeWidth={1.5}
                />
              )
            })}
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-0 flex flex-wrap gap-3 border-t border-border pt-2">
        {modelIds.map((id) => {
          const model = getModelById(id)
          return (
            <div key={id} className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full" style={{ background: MODEL_COLORS[id] ?? "#888" }} />
              <span className="font-mono text-[10px] text-muted-foreground">{model?.label ?? id}</span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

interface AggregateChartsProps {
  results: BenchmarkResult[]
}

export function AggregateCharts({ results }: AggregateChartsProps) {
  const modelData = getAggregateByModel(results)
  const escalation = getEscalationCurveByModel(results)
  const drfrData = getDRFRByModel(results)
  const shape = getChartShape(results)

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <ModelBarChart data={modelData} />
        <DRFRChart data={drfrData} />
      </div>

      <ModuleComparisonChart results={results} />

      <EscalationCurveChart data={escalation} />
      <ModuleEscalationCurves results={results} />
      {shape.modelCount >= 3 ? <ModelRadarChart results={results} /> : null}
    </div>
  )
}
