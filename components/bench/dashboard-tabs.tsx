"use client"

import { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { Card } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ModelVisibilityControls } from "@/components/bench/charts/model-visibility-controls"
import { Database } from "lucide-react"
import type { RunManifestV2 } from "@/lib/dystopiabench/schemas"
import type { BenchmarkResult } from "@/lib/dystopiabench/types"
import { ALL_MODULES } from "@/lib/dystopiabench/scenarios"
import { orderScenarioModulesForDisplay } from "@/lib/dystopiabench/module-display-order"
import { DEFAULT_DASHBOARD_MODEL_IDS } from "@/lib/dystopiabench/dashboard-model-selection"

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

function ResultsHeader({
  resultVersion,
  onResultVersionChange,
}: {
  resultVersion: "latest" | "v1"
  onResultVersionChange?: (version: "latest" | "v1") => void
}) {
  return (
    <div className="mb-8 flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10">
          <Database className="h-5 w-5 text-primary" />
        </div>
        <p className="truncate font-mono text-xl font-black tracking-wider text-foreground uppercase">
          Benchmark Results
        </p>
      </div>
      <Select value={resultVersion} onValueChange={(value) => onResultVersionChange?.(value as "latest" | "v1")}>
        <SelectTrigger
          className="h-10 min-w-24 shrink-0 border-primary/20 bg-primary/5 font-mono text-xs font-bold tracking-wider uppercase"
          aria-label="Benchmark result version"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="latest" className="font-mono text-xs uppercase">Latest</SelectItem>
          <SelectItem value="v1" className="font-mono text-xs uppercase">V1</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

function normalizeSelection(selected: string[], available: string[], { initial = false } = {}): string[] {
  const next = selected.filter((id) => available.includes(id))
  if (initial && next.length === 0) {
    const defaultSelection = DEFAULT_DASHBOARD_MODEL_IDS.filter((id) => available.includes(id))
    return defaultSelection.length > 0 ? defaultSelection : available
  }
  return next
}

interface DashboardTabsProps {
  loading?: boolean
  isolatedLoading?: boolean
  statefulResults: BenchmarkResult[]
  isolatedResults: BenchmarkResult[]
  statefulManifest?: RunManifestV2 | null
  isolatedManifest?: RunManifestV2 | null
  onLoadIsolatedResults?: () => Promise<void>
  resultVersion?: "latest" | "v1"
  onResultVersionChange?: (version: "latest" | "v1") => void
}

export function DashboardTabs({
  loading = false,
  isolatedLoading = false,
  statefulResults,
  isolatedResults,
  onLoadIsolatedResults,
  resultVersion = "latest",
  onResultVersionChange,
}: DashboardTabsProps) {
  const hasNoResults = statefulResults.length === 0 && isolatedResults.length === 0

  const moduleTabs = useMemo(
    () => orderScenarioModulesForDisplay(ALL_MODULES).map((module) => ({
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

  useEffect(() => {
    if (activeTab === "prompt_no_escalation") {
      void onLoadIsolatedResults?.()
    }
  }, [activeTab, onLoadIsolatedResults])

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
      <>
        <ResultsHeader resultVersion={resultVersion} onResultVersionChange={onResultVersionChange} />
        <Card className="border-border bg-card p-6">
          <p className="mb-3 font-mono text-xs text-muted-foreground uppercase">
            No results have been published for this version yet.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Select V1 to view the historical dataset, or publish a new binary-scored run to populate Latest.
          </p>
        </Card>
      </>
    )
  }

  return (
    <>
      <ResultsHeader resultVersion={resultVersion} onResultVersionChange={onResultVersionChange} />

      <ModelVisibilityControls
        modelIds={availableModelIds}
        selectedModelIds={selectedModelIds}
        onToggleModel={toggleModel}
        onToggleAll={toggleAll}
      />

      <div className="mb-8 grid grid-cols-2 gap-1.5 min-[420px]:grid-cols-3 sm:[grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))]">
        {resultTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex min-h-12 w-full min-w-0 flex-col items-center justify-center rounded-md border px-2.5 py-2 text-center transition-colors sm:items-start sm:px-4 sm:py-2.5 sm:text-left ${activeTab === tab.id
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
              }`}
          >
            <span className="text-wrap font-mono text-[10px] font-bold leading-tight tracking-wide uppercase sm:text-xs">
              {tab.label}
            </span>
          </button>
        ))}
      </div>

      {activeTab === "aggregate" && (
        <div className="flex flex-col gap-6">
          <AggregateCharts
            results={filteredStatefulResults}
            showDirectedRefusalRate={resultVersion === "v1"}
          />
        </div>
      )}
      {moduleTabs.map((tab) => (
        activeTab === tab.id ? (
          <ModuleCharts
            key={tab.id}
            module={tab.moduleId}
            results={filteredStatefulResults}
            selectedModelIds={selectedModelIds}
            legacyScoring={resultVersion === "v1"}
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
        isolatedLoading ? (
          <Card className="bg-card border-border p-6">
            <p className="mb-3 font-mono text-xs text-muted-foreground uppercase">
              Loading isolated run data...
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Fetching the no-escalation chart dataset.
            </p>
          </Card>
        ) : filteredIsolatedResults.length > 0 ? (
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
              pnpm bench:run-isolated --module=all
            </code>
          </Card>
        )
      )}
    </>
  )
}
