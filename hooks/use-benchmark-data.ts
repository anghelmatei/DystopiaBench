"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  getRunConversationMode,
  loadRuns,
  loadSavedRun,
  type RunIndexItem,
} from "@/lib/dystopiabench/load-results"
import { isDashboardDisplayCompatibleMetadata } from "@/lib/dystopiabench/display-compat"
import type { RunManifestV2 } from "@/lib/dystopiabench/schemas"
import type { BenchmarkResult } from "@/lib/dystopiabench/types"

export type SelectedRunId = "latest" | string

interface ResolvedRun {
  results: BenchmarkResult[]
  manifest: RunManifestV2 | null
  loadError: string | null
  missingRun: boolean
}

function getRunIndexVersion(run: RunIndexItem | undefined): string | undefined {
  if (!run) return undefined
  return [
    run.id,
    run.timestamp,
    run.metadata.models.join(","),
    run.metadata.totalPrompts,
    run.summary.scoredPrompts,
    run.summary.statusCounts.ok ?? 0,
    run.summary.statusCounts.model_error ?? 0,
    run.summary.statusCounts.judge_error ?? 0,
  ].join(":")
}

export interface BenchmarkDataState {
  loading: boolean
  statefulRuns: RunIndexItem[]
  selectedStatefulRunId: SelectedRunId
  statefulResults: BenchmarkResult[]
  statefulManifest: RunManifestV2 | null
  statefulLoadError: string | null
  statefulMissingRun: boolean
  isolatedLatestResults: BenchmarkResult[]
  isolatedLatestManifest: RunManifestV2 | null
  isolatedLoadError: string | null
  setSelectedStatefulRunId: (runId: SelectedRunId) => Promise<void>
  refresh: () => Promise<void>
}

export function useBenchmarkData(): BenchmarkDataState {
  const [loading, setLoading] = useState(true)
  const [statefulRuns, setStatefulRuns] = useState<RunIndexItem[]>([])
  const [selectedStatefulRunId, setSelectedStatefulRunIdState] = useState<SelectedRunId>("latest")
  const [statefulResults, setStatefulResults] = useState<BenchmarkResult[]>([])
  const [statefulManifest, setStatefulManifest] = useState<RunManifestV2 | null>(null)
  const [statefulLoadError, setStatefulLoadError] = useState<string | null>(null)
  const [statefulMissingRun, setStatefulMissingRun] = useState(false)
  const [isolatedLatestResults, setIsolatedLatestResults] = useState<BenchmarkResult[]>([])
  const [isolatedLatestManifest, setIsolatedLatestManifest] = useState<RunManifestV2 | null>(null)
  const [isolatedLoadError, setIsolatedLoadError] = useState<string | null>(null)

  const selectedStatefulRunIdRef = useRef<SelectedRunId>("latest")
  const statefulLatestVersionRef = useRef<string | number | undefined>(undefined)
  const statelessLatestVersionRef = useRef<string | number | undefined>(undefined)

  const resolveStatefulRun = useCallback(async (
    runId: SelectedRunId,
    latestStatefulRunId?: string,
    selectedRunVersion?: string,
  ): Promise<ResolvedRun> => {
    try {
      const latestOptions =
        runId === "latest"
          ? {
            latestVersion: statefulLatestVersionRef.current,
            latestMode: "stateful" as const,
            expectedMode: "stateful" as const,
          }
          : {
            latestVersion: selectedRunVersion,
            expectedMode: "stateful" as const,
          }

      let loaded = await loadSavedRun(
        runId === "latest" ? undefined : runId,
        latestOptions,
      )

      // Backward-compatible fallback for repos that don't yet have
      // benchmark-results-stateful.json published.
      if (!loaded && runId === "latest" && latestStatefulRunId) {
        loaded = await loadSavedRun(latestStatefulRunId, { expectedMode: "stateful" })
      }

      if (loaded) {
        return {
          results: loaded.results,
          manifest: loaded.manifest,
          loadError: null,
          missingRun: false,
        }
      }

      return {
        results: [],
        manifest: null,
        loadError: null,
        missingRun: runId !== "latest",
      }
    } catch (error) {
      return {
        results: [],
        manifest: null,
        loadError: error instanceof Error ? error.message : "Failed to load stateful run data.",
        missingRun: false,
      }
    }
  }, [])

  const resolveLatestIsolatedRun = useCallback(async (): Promise<Omit<ResolvedRun, "missingRun">> => {
    try {
      const loaded = await loadSavedRun(undefined, {
        latestVersion: statelessLatestVersionRef.current,
        latestMode: "stateless",
        expectedMode: "stateless",
      })

      if (loaded) {
        return {
          results: loaded.results,
          manifest: loaded.manifest,
          loadError: null,
        }
      }

      return {
        results: [],
        manifest: null,
        loadError: null,
      }
    } catch (error) {
      return {
        results: [],
        manifest: null,
        loadError: error instanceof Error ? error.message : "Failed to load isolated run data.",
      }
    }
  }, [])

  const setSelectedStatefulRunId = useCallback(
    async (runId: SelectedRunId) => {
      if (runId !== selectedStatefulRunIdRef.current) {
        selectedStatefulRunIdRef.current = runId
      }

      setSelectedStatefulRunIdState(runId)
      const selectedRunVersion =
        runId === "latest" ? undefined : getRunIndexVersion(statefulRuns.find((run) => run.id === runId))
      const resolved = await resolveStatefulRun(runId, statefulRuns[0]?.id, selectedRunVersion)
      setStatefulResults(resolved.results)
      setStatefulManifest(resolved.manifest)
      setStatefulLoadError(resolved.loadError)
      setStatefulMissingRun(resolved.missingRun)
    },
    [resolveStatefulRun, statefulRuns],
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const runIndex = await loadRuns()
      const filteredStatefulRuns = runIndex.filter((run) => {
        return getRunConversationMode(run) === "stateful" && isDashboardDisplayCompatibleMetadata(run.metadata)
      })
      const filteredStatelessRuns = runIndex.filter((run) => {
        return getRunConversationMode(run) === "stateless" && isDashboardDisplayCompatibleMetadata(run.metadata)
      })
      setStatefulRuns(filteredStatefulRuns)

      const latestStatefulRunId = filteredStatefulRuns[0]?.id
      statefulLatestVersionRef.current = getRunIndexVersion(filteredStatefulRuns[0])
      statelessLatestVersionRef.current = getRunIndexVersion(filteredStatelessRuns[0])
      const selectedRunVersion =
        selectedStatefulRunIdRef.current === "latest"
          ? undefined
          : getRunIndexVersion(filteredStatefulRuns.find((run) => run.id === selectedStatefulRunIdRef.current))
      const [resolvedStateful, resolvedIsolated] = await Promise.all([
        resolveStatefulRun(selectedStatefulRunIdRef.current, latestStatefulRunId, selectedRunVersion),
        resolveLatestIsolatedRun(),
      ])

      setSelectedStatefulRunIdState(selectedStatefulRunIdRef.current)
      setStatefulResults(resolvedStateful.results)
      setStatefulManifest(resolvedStateful.manifest)
      setStatefulLoadError(resolvedStateful.loadError)
      setStatefulMissingRun(resolvedStateful.missingRun)
      setIsolatedLatestResults(resolvedIsolated.results)
      setIsolatedLatestManifest(resolvedIsolated.manifest)
      setIsolatedLoadError(resolvedIsolated.loadError)
    } finally {
      setLoading(false)
    }
  }, [resolveLatestIsolatedRun, resolveStatefulRun])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    loading,
    statefulRuns,
    selectedStatefulRunId,
    statefulResults,
    statefulManifest,
    statefulLoadError,
    statefulMissingRun,
    isolatedLatestResults,
    isolatedLatestManifest,
    isolatedLoadError,
    setSelectedStatefulRunId,
    refresh,
  }
}
