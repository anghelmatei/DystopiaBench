"use client"

import { useMemo, useState } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
  ReferenceLine,
} from "recharts"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ALL_MODULES, ALL_SCENARIOS, SCENARIOS_BY_ID } from "@/lib/dystopiabench/scenarios"
import { AVAILABLE_MODELS } from "@/lib/dystopiabench/models"
import type { BenchmarkResult, Module } from "@/lib/dystopiabench/types"
import { createResultsIndex, type ResultsIndex } from "@/lib/dystopiabench/analytics"
import { MODEL_COLORS, scoreColor, scoreLabel, LEVEL_LABELS, getResponsiveBarChartLayout } from "@/lib/dystopiabench/chart-config"
import { Radiation, Eye, Building2, HeartPulse, Fingerprint, FlaskConical, FileSearch, MessagesSquare, Boxes } from "lucide-react"
import { SectionHeader } from "./section-header"

const TOOLTIP_STYLE = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 6,
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  color: "hsl(var(--foreground))",
}

function renderModuleIcon(module: Module, className: string) {
  if (module === "petrov") return <Radiation className={className} />
  if (module === "orwell") return <Eye className={className} />
  if (module === "laguardia") return <Building2 className={className} />
  if (module === "basaglia") return <HeartPulse className={className} />
  if (module === "huxley") return <FlaskConical className={className} />
  if (module === "kafka") return <FileSearch className={className} />
  if (module === "pkd") return <Fingerprint className={className} />
  if (module === "baudrillard") return <MessagesSquare className={className} />
  return <Boxes className={className} />
}

function scenarioLevelKey(scenarioId: string, level: number): string {
  return `${scenarioId}::${level}`
}

function scenarioModelLevelKey(scenarioId: string, modelId: string, level: number): string {
  return `${scenarioId}::${modelId}::${level}`
}

const ESCALATION_LEVELS = [1, 2, 3, 4, 5] as const

function buildPromptData(resultsIndex: ResultsIndex, scenarioId: string, models = AVAILABLE_MODELS) {
  const scenario = SCENARIOS_BY_ID.get(scenarioId)
  if (!scenario) return null
  const promptsByLevel = new Map(scenario.escalationPrompts.map((prompt) => [prompt.level, prompt]))

  const levels = ESCALATION_LEVELS.map((level) => {
    const rows = resultsIndex.byScenarioLevel.get(scenarioLevelKey(scenarioId, level)) ?? []
    const levelAvg = rows.length > 0 ? Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length) : null

    const modelScores = models.map((model) => {
      const row = resultsIndex.byScenarioModelLevel.get(
        scenarioModelLevelKey(scenarioId, model.id, level)
      )
      return {
        modelId: model.id,
        label: model.label,
        score: row?.score ?? null,
      }
    })

    return {
      level,
      levelName: LEVEL_LABELS[level],
      prompt: promptsByLevel.get(level),
      levelAvg,
      modelScores,
    }
  })

  const lineData = levels.map((levelEntry) => {
    const row: Record<string, number | string | null> = {
      label: `L${levelEntry.level}`,
      levelName: levelEntry.levelName,
      avg: levelEntry.levelAvg,
    }

    for (const modelScore of levelEntry.modelScores) {
      row[modelScore.modelId] = modelScore.score
    }
    return row
  })

  return { scenario, levels, lineData }
}

function buildGlobalLevelData(resultsIndex: ResultsIndex, models = AVAILABLE_MODELS) {
  return ESCALATION_LEVELS.map((level) => {
    const rows = Array.from(resultsIndex.byScenario.values()).flat().filter((result) => result.level === level)
    const avg = rows.length > 0 ? Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length) : null

    const row: Record<string, string | number | null> = {
      label: `L${level}`,
      levelName: LEVEL_LABELS[level],
      avg,
    }

    for (const model of models) {
      const modelRows = resultsIndex.byModel.get(model.id)?.filter((result) => result.level === level) ?? []
      row[model.id] =
        modelRows.length > 0
          ? Math.round(modelRows.reduce((sum, result) => sum + result.score, 0) / modelRows.length)
          : null
    }

    return row
  })
}

function averageScores(scores: Array<number | null | undefined>): number | null {
  const validScores = scores.filter((score): score is number => typeof score === "number")
  if (validScores.length === 0) return null
  return Math.round(validScores.reduce((sum, score) => sum + score, 0) / validScores.length)
}

function ScoreCell({
  score,
  title,
  className = "w-24",
}: {
  score: number | null | undefined
  title: string
  className?: string
}) {
  if (score === null || score === undefined) {
    return (
      <div
        className={`${className} h-12 flex items-center justify-center rounded-sm bg-muted/30`}
        title={`${title}: no data`}
      >
        <span className="font-mono text-[10px] text-muted-foreground">-</span>
      </div>
    )
  }

  return (
    <div
      className={`${className} h-12 flex items-center justify-center rounded-sm`}
      style={{ background: `${scoreColor(score)}28` }}
      title={`${title}: ${score}`}
    >
      <span className="font-mono text-[10px] font-bold" style={{ color: scoreColor(score) }}>
        {score}
      </span>
    </div>
  )
}

function LevelModelGrid({
  data,
  models,
}: {
  data: Array<Record<string, string | number | null>>
  models: typeof AVAILABLE_MODELS
}) {
  const modelRows = models.map((model) => {
    const levelScores = data.map((row) => ({
      label: row.label as string,
      levelName: row.levelName as string,
      score: row[model.id] as number | null | undefined,
    }))

    return {
      model,
      levelScores,
      avg: averageScores(levelScores.map((entry) => entry.score)),
    }
  })
  const grandAverage = averageScores(modelRows.map((row) => row.avg))

  return (
    <Card className="bg-card border-border p-3 overflow-x-auto subtle-x-scrollbar">
      <SectionHeader
        label="Compliance Score Grid — Level × Model"
        sub="Avg Dystopian Compliance Score (DCS) at each escalation level per model. Color = compliance tier (Lower is better)"
      />
      <div className="min-w-max">
        <div className="flex items-end gap-px mb-1">
          <div className="w-48 shrink-0" />
          {data.map((row) => (
            <div key={row.label as string} className="w-24 h-12 flex flex-col items-center justify-end pb-2 text-center">
              <span className="font-mono text-[10px] font-bold text-foreground">
                {row.label as string}
              </span>
              <span className="font-mono text-[8px] text-muted-foreground leading-tight">
                {row.levelName as string}
              </span>
            </div>
          ))}
          <div className="w-16 h-12 flex items-center justify-center pb-2">
            <span className="font-mono text-[8px] text-muted-foreground uppercase font-bold">
              AVG
            </span>
          </div>
        </div>

        {modelRows.map((row) => (
          <div key={row.model.id} className="flex items-center gap-px mb-px">
            <div className="w-48 shrink-0 pr-3 flex items-center justify-end gap-2 text-right">
              <div
                className="h-2 w-2 rounded-full shrink-0"
                style={{ background: MODEL_COLORS[row.model.id] ?? "hsl(var(--muted-foreground))" }}
              />
              <span className="font-mono text-[9px] text-muted-foreground uppercase leading-tight">
                {row.model.label}
              </span>
            </div>
            {row.levelScores.map((levelScore) => (
              <ScoreCell
                key={levelScore.label}
                score={levelScore.score}
                title={`${row.model.label} / ${levelScore.label}`}
              />
            ))}
            <ScoreCell score={row.avg} title={`${row.model.label} average`} className="w-16" />
          </div>
        ))}

        <div className="flex items-center gap-px mt-1 border-t border-border pt-1">
          <div className="w-48 shrink-0 pr-3 text-right">
            <span className="font-mono text-[9px] text-muted-foreground uppercase">Avg</span>
          </div>
          {data.map((row) => (
            <ScoreCell
              key={row.label as string}
              score={row.avg as number | null}
              title={`${row.label as string} average`}
            />
          ))}
          <ScoreCell score={grandAverage} title="Grand average" className="w-16" />
        </div>
      </div>
    </Card>
  )
}

function GlobalLevelBar({
  data,
  viewMode,
}: {
  data: Array<Record<string, string | number | null>>
  viewMode: "stateful" | "stateless"
}) {
  const levelLabel = viewMode === "stateless" ? "Prompt Level" : "Escalation Level"
  const levelSub =
    viewMode === "stateless"
      ? "How average compliance changes by prompt level when each prompt runs in a fresh context."
      : "How average compliance across all models and scenarios changes with pressure."
  const barLayout = getResponsiveBarChartLayout({ categoryCount: data.length })

  return (
    <Card className="bg-card border-border p-5">
      <SectionHeader
        label={`Avg Compliance Score by ${levelLabel} — All Scenarios`}
        sub={`${levelSub} (Lower is better)`}
      />
      <ResponsiveContainer width="100%" height={200}>
        <BarChart
          data={data}
          margin={{ left: 0, right: 8, top: 8, bottom: 4 }}
          barGap={barLayout.barGap}
          barCategoryGap={barLayout.barCategoryGap}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="label"
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
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as { label: string; levelName: string; avg: number | null }
              if (d.avg === null) return null
              return (
                <div className="rounded-md border border-border bg-card px-3 py-2 shadow-lg">
                  <p className="font-mono text-xs font-bold text-foreground">{d.label} – {d.levelName}</p>
                  <p className="mt-1 font-mono text-sm font-black" style={{ color: scoreColor(d.avg) }}>
                    {d.avg} <span className="text-[10px] font-normal">{scoreLabel(d.avg)}</span>
                  </p>
                </div>
              )
            }}
          />
          <Bar dataKey="avg" radius={[3, 3, 0, 0]} maxBarSize={barLayout.maxBarSize}>
            {data.map((entry) => (
              <Cell key={entry.label as string} fill={scoreColor(entry.avg as number)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  )
}

function ScenarioPromptDrillDown({
  resultsIndex,
  models,
  viewMode,
}: {
  resultsIndex: ResultsIndex
  models: typeof AVAILABLE_MODELS
  viewMode: "stateful" | "stateless"
}) {
  const [selectedId, setSelectedId] = useState<string>(ALL_SCENARIOS[0].id)
  const data = useMemo(() => buildPromptData(resultsIndex, selectedId, models), [models, resultsIndex, selectedId])
  const scenarioGroups = useMemo(
    () =>
      ALL_MODULES.map((scenarioModule) => ({
        module: scenarioModule,
        scenarios: scenarioModule.scenarios,
      })).filter((group) => group.scenarios.length > 0),
    [],
  )

  if (!data) return null
  const { scenario, levels, lineData } = data
  const selectedModuleGroup =
    scenarioGroups.find((group) => group.module.id === scenario.module) ?? scenarioGroups[0] ?? null

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase mb-2">
            Select Module
          </p>
          <div className="flex flex-wrap gap-2">
            {scenarioGroups.map((group) => (
              <button
                key={group.module.id}
                onClick={() => {
                  const firstScenario = group.scenarios[0]
                  if (firstScenario) setSelectedId(firstScenario.id)
                }}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-mono text-xs transition-colors ${
                  scenario.module === group.module.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                {renderModuleIcon(group.module.id, "h-3 w-3")}
                {group.module.id}
              </button>
            ))}
          </div>
        </div>
        {selectedModuleGroup ? (
          <div>
            <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase mb-2">
              Select Scenario
            </p>
            <div className="flex flex-wrap gap-2">
              {selectedModuleGroup.scenarios.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  title={item.title}
                  className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-mono text-xs transition-colors ${
                    selectedId === item.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {renderModuleIcon(item.module, "h-3 w-3")}
                  {item.id}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <Card className="bg-card border-border p-4">
        <div className="flex items-start gap-3">
          {renderModuleIcon(scenario.module, "h-5 w-5 mt-0.5 text-muted-foreground shrink-0")}
          <div>
            <h3 className="font-mono text-sm font-bold text-foreground">{scenario.title}</h3>
            <p className="font-mono text-[10px] text-muted-foreground mt-1">{scenario.description}</p>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="font-mono text-[9px] uppercase">
                {scenario.category}
              </Badge>
              <Badge variant="outline" className="font-mono text-[9px] uppercase">
                {scenario.module} module
              </Badge>
            </div>
          </div>
        </div>
      </Card>

      <Card className="bg-card border-border p-5">
        <SectionHeader
          label={viewMode === "stateless" ? "Per-Prompt (No Escalation) — Selected Models" : "Per-Prompt Escalation — Selected Models"}
          sub={viewMode === "stateless"
            ? "Each model's Dystopian Compliance Score (DCS) at each prompt level for this scenario with fresh context (Lower is better)"
            : "Each model's Dystopian Compliance Score (DCS) at each of the 5 escalation levels for this scenario (Lower is better)"}
        />
        <div className="h-[220px] md:h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData} margin={{ left: 0, right: 12, top: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="label"
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
              <ReferenceLine
                y={50}
                stroke="hsl(var(--border))"
                strokeDasharray="6 3"
                label={{
                  value: "threshold",
                  position: "right",
                  style: {
                    fontSize: 9,
                    fontFamily: "var(--font-mono)",
                    fill: "hsl(var(--muted-foreground))",
                  },
                }}
              />
              <Tooltip
                formatter={(val: number, name: string) => [`${val} (${scoreLabel(val)})`, `${name} DCS`]}
                labelFormatter={(label) => {
                  const levelNum = parseInt(String(label).replace("L", ""), 10)
                  return `${label} – ${LEVEL_LABELS[levelNum] ?? label}`
                }}
                contentStyle={TOOLTIP_STYLE}
              />
              {models.map((model) => (
                <Line
                  key={model.id}
                  type="linear"
                  dataKey={model.id}
                  stroke={MODEL_COLORS[model.id] ?? "#888"}
                  strokeWidth={2}
                  dot={{ r: 3.5, fill: MODEL_COLORS[model.id] ?? "#888", strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  name={model.label}
                  connectNulls
                />
              ))}
              <Line
                type="linear"
                dataKey="avg"
                stroke="hsl(var(--foreground))"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                dot={false}
                name="Average"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-5">
        {levels.map((levelEntry) => (
          <Card key={levelEntry.level} className="bg-card border-border p-4">
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[10px] font-bold text-foreground">
                  L{levelEntry.level}
                </span>
                <span className="font-mono text-[9px] text-muted-foreground">
                  {levelEntry.levelName}
                </span>
              </div>
              <div className="flex items-center justify-between">
                {levelEntry.levelAvg !== null ? (
                  <>
                    <span className="font-mono text-xl font-black" style={{ color: scoreColor(levelEntry.levelAvg) }}>
                      {levelEntry.levelAvg}
                    </span>
                    <span className="font-mono text-[9px]" style={{ color: scoreColor(levelEntry.levelAvg) }}>
                      {scoreLabel(levelEntry.levelAvg)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-mono text-xl font-black text-muted-foreground">-</span>
                    <span className="font-mono text-[9px] text-muted-foreground">no data</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              {[...levelEntry.modelScores].sort((a, b) => (a.score ?? -1) - (b.score ?? -1)).map((modelScore) => (
                <div key={modelScore.modelId} className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1 min-w-0">
                      <div
                        className="h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ background: MODEL_COLORS[modelScore.modelId] }}
                      />
                      <span
                        className="font-mono text-[8px] truncate"
                        style={{ color: MODEL_COLORS[modelScore.modelId] ?? "hsl(var(--muted-foreground))" }}
                      >
                        {modelScore.label}
                      </span>
                    </div>
                    <span className="font-mono text-[9px] shrink-0" style={{ color: modelScore.score !== null ? scoreColor(modelScore.score) : "hsl(var(--muted-foreground))" }}>
                      {modelScore.score ?? "–"}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    {modelScore.score !== null ? (
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${modelScore.score}%`, background: scoreColor(modelScore.score) }}
                      />
                    ) : (
                      <div className="h-full rounded-full bg-muted/30" />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {levelEntry.prompt ? (
              <div className="mt-3 pt-2 border-t border-border">
                <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
                  {levelEntry.prompt.prompt}
                </p>
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  )
}

export function PromptCharts({
  results,
  selectedModelIds,
  viewMode = "stateful",
}: {
  results: BenchmarkResult[]
  selectedModelIds?: string[]
  viewMode?: "stateful" | "stateless"
}) {
  const resultsIndex = useMemo(() => createResultsIndex(results), [results])
  const activeModels = useMemo(
    () =>
      AVAILABLE_MODELS.filter((model) =>
        selectedModelIds
          ? selectedModelIds.includes(model.id)
          : results.some((row) => row.modelId === model.id),
      ),
    [results, selectedModelIds],
  )
  const globalData = useMemo(() => buildGlobalLevelData(resultsIndex, activeModels), [activeModels, resultsIndex])
  const promptSectionTitle = viewMode === "stateless" ? "Per-Scenario Prompt Drill Down (No Escalation)" : "Per-Scenario Prompt Drill Down (Escalation)"

  return (
    <div className="flex flex-col gap-6">
      <GlobalLevelBar data={globalData} viewMode={viewMode} />
      <LevelModelGrid data={globalData} models={activeModels} />
      <div className="border-t border-border pt-6">
        <p className="font-mono text-xs font-bold tracking-wider text-foreground uppercase mb-5">
          {promptSectionTitle}
        </p>
        <ScenarioPromptDrillDown
          resultsIndex={resultsIndex}
          models={activeModels}
          viewMode={viewMode}
        />
      </div>
    </div>
  )
}
