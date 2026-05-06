"use client"

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { Card } from "@/components/ui/card"
import { ModelVisibilityControls } from "@/components/bench/charts/model-visibility-controls"
import { Database } from "lucide-react"
import type { RunManifestV2 } from "@/lib/dystopiabench/schemas"
import type { BenchmarkResult } from "@/lib/dystopiabench/types"
import { ALL_MODULES } from "@/lib/dystopiabench/scenarios"

const DEFAULT_SELECTED_MODEL_IDS = [
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-oss-120b",
  "claude-opus-4.7",
  "claude-opus-4.6",
  "claude-sonnet-4.6",
  "claude-haiku-4.5",
  "gemini-3.1-pro",
  "gemini-3.1-flash-lite-preview",
  "deepseek-v4-pro",
  "deepseek-v4-flash",
  "llama-4-maverick",
  "mistral-medium-3-5",
  "kimi-k2.6",
  "glm-5.1",
  "minimax-m2.7",
  "qwen3.6-max-preview",
  "mimo-v2.5-pro",
  "grok-4.3",
] as const

function ChartPanelLoading() {
  return (
    <div className="rounded-md border border-border bg-card/40 p-5">
      <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
        Loading chart panel...
      </p>
    </div>
  )
}

const AggregateCharts = dynamic(
  () => import("@/components/bench/charts/aggregate-charts").then((mod) => mod.AggregateCharts),
  { ssr: false, loading: ChartPanelLoading },
)

const ModuleCharts = dynamic(
  () => import("@/components/bench/charts/module-charts").then((mod) => mod.ModuleCharts),
  { ssr: false, loading: ChartPanelLoading },
)

const ScenarioCharts = dynamic(
  () => import("@/components/bench/charts/scenario-charts").then((mod) => mod.ScenarioCharts),
  { ssr: false, loading: ChartPanelLoading },
)

const PromptCharts = dynamic(
  () => import("@/components/bench/charts/prompt-charts").then((mod) => mod.PromptCharts),
  { ssr: false, loading: ChartPanelLoading },
)

function getModuleDisplayLabel(label: string): string {
  return label.replace(/\s+Module$/i, "")
}

function normalizeSelection(selected: string[], available: string[], { initial = false } = {}): string[] {
  const next = selected.filter((id) => available.includes(id))
  if (initial && next.length === 0) {
    const defaultSelection = DEFAULT_SELECTED_MODEL_IDS.filter((id) => available.includes(id))
    return defaultSelection.length > 0 ? defaultSelection : available
  }
  return next
}

interface DashboardTabsProps {
  loading?: boolean
  statefulResults: BenchmarkResult[]
  isolatedResults: BenchmarkResult[]
  statefulManifest?: RunManifestV2 | null
  isolatedManifest?: RunManifestV2 | null
}

export function DashboardTabs({
  loading = false,
  statefulResults,
  isolatedResults,
}: DashboardTabsProps) {
  const hasNoResults = statefulResults.length === 0 && isolatedResults.length === 0

  const moduleTabs = useMemo(
    () => ALL_MODULES.map((module) => ({
      id: String(module.id),
      moduleId: module.id,
      label: getModuleDisplayLabel(module.label),
    })),
    [],
  )
  const resultTabs = useMemo(
    () => [
      { id: "aggregate", label: "Aggregate" },
      ...moduleTabs.map(({ id, label }) => ({ id, label })),
      { id: "scenario", label: "Per Scenario" },
      { id: "prompt", label: "Per Prompt" },
      { id: "prompt_no_escalation", label: "Per Prompt (No Escalation)" },
    ],
    [moduleTabs],
  )

  const [requestedActiveTab, setActiveTab] = useState<string>(
    "aggregate",
  )
  const [hasInteracted, setHasInteracted] = useState(false)
  const [rawSelectedModelIds, setRawSelectedModelIds] = useState<string[]>([])

  const availableModelIds = useMemo(() => {
    const ids = new Set<string>()
    for (const row of statefulResults) ids.add(row.modelId)
    for (const row of isolatedResults) ids.add(row.modelId)
    return [...ids]
  }, [statefulResults, isolatedResults])

  const selectedModelIds = useMemo(
    () => normalizeSelection(rawSelectedModelIds, availableModelIds, { initial: !hasInteracted }),
    [availableModelIds, rawSelectedModelIds, hasInteracted],
  )

  const selectedSet = useMemo(() => new Set(selectedModelIds), [selectedModelIds])
  const filteredStatefulResults = useMemo(
    () => statefulResults.filter((row) => selectedSet.has(row.modelId)),
    [selectedSet, statefulResults],
  )
  const filteredIsolatedResults = useMemo(
    () => isolatedResults.filter((row) => selectedSet.has(row.modelId)),
    [isolatedResults, selectedSet],
  )

  const activeTab = requestedActiveTab

  const toggleModel = (modelId: string) => {
    setHasInteracted(true)
    setRawSelectedModelIds((current) => {
      const next = normalizeSelection(current, availableModelIds, { initial: !hasInteracted })
      if (!next.includes(modelId)) return [...next, modelId]
      return next.filter((id) => id !== modelId)
    })
  }

  const toggleAll = () => {
    setHasInteracted(true)
    setRawSelectedModelIds((current) => {
      const next = normalizeSelection(current, availableModelIds, { initial: !hasInteracted })
      if (next.length === availableModelIds.length) return []
      return availableModelIds
    })
  }

  if (loading) {
    return (
      <Card className="border-border bg-card p-6">
        <p className="mb-3 font-mono text-xs text-muted-foreground uppercase">
          Loading published benchmark results...
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Reading the run index and resolving the latest stateful and isolated manifests.
        </p>
      </Card>
    )
  }

  if (hasNoResults) {
    return (
      <Card className="border-border bg-card p-6">
        <p className="mb-3 font-mono text-xs text-muted-foreground uppercase">
          No published results match the current scenario catalog.
        </p>
        <p className="mb-2 text-sm leading-relaxed text-muted-foreground">
          Historical run manifests are still preserved in <code>public/data/benchmark-*.json</code>. Publish a new
          full run to repopulate the dashboard.
        </p>
        <p className="mb-2 font-mono text-[10px] text-muted-foreground uppercase">Command</p>
        <code className="block whitespace-pre-wrap font-mono text-xs text-foreground">
          pnpm bench:run
        </code>
      </Card>
    )
  }

  return (
    <>
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md border border-primary/20 bg-primary/10">
          <Database className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="font-mono text-xl font-black tracking-wider text-foreground uppercase">
            Benchmark Results
          </p>
        </div>
      </div>

      <ModelVisibilityControls
        modelIds={availableModelIds}
        selectedModelIds={selectedModelIds}
        onToggleModel={toggleModel}
        onToggleAll={toggleAll}
      />

      <div className="mb-8 grid gap-1.5 [grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))]">
        {resultTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex w-full min-w-0 flex-col items-start rounded-md border px-4 py-2.5 text-left transition-colors ${activeTab === tab.id
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
              }`}
          >
            <span className="font-mono text-xs font-bold tracking-wide uppercase">
              {tab.label}
            </span>
          </button>
        ))}
      </div>

      {activeTab === "aggregate" && (
        <div className="flex flex-col gap-6">
          <AggregateCharts results={filteredStatefulResults} />
        </div>
      )}
      {moduleTabs.map((tab) => (
        activeTab === tab.id ? (
          <ModuleCharts
            key={tab.id}
            module={tab.moduleId}
            results={filteredStatefulResults}
            selectedModelIds={selectedModelIds}
          />
        ) : null
      ))}
      {activeTab === "scenario" && <ScenarioCharts results={filteredStatefulResults} selectedModelIds={selectedModelIds} />}
      {activeTab === "prompt" && (
        <PromptCharts
          results={filteredStatefulResults}
          selectedModelIds={selectedModelIds}
          viewMode="stateful"
        />
      )}
      {activeTab === "prompt_no_escalation" && (
        filteredIsolatedResults.length > 0 ? (
          <PromptCharts
            results={filteredIsolatedResults}
            selectedModelIds={selectedModelIds}
            viewMode="stateless"
          />
        ) : (
          <Card className="bg-card border-border p-6">
            <p className="mb-3 font-mono text-xs text-muted-foreground uppercase">
              No isolated run data found.
            </p>
            <p className="mb-2 font-mono text-[10px] text-muted-foreground uppercase">Command</p>
            <code className="block whitespace-pre-wrap font-mono text-xs text-foreground">
              pnpm bench:run-isolated --module=both
            </code>
          </Card>
        )
      )}
    </>
  )
}
