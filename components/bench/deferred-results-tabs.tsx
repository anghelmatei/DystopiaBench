"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import {
  getRunConversationMode,
  loadRuns,
  loadSavedRun,
  type RunIndexItem,
} from "@/lib/dystopiabench/load-results"
import { isDashboardDisplayCompatibleMetadata } from "@/lib/dystopiabench/display-compat"
import {
  createDashboardVersionHash,
  getDashboardModelSelectionVersion,
} from "@/lib/dystopiabench/dashboard-model-selection"
import type { RunManifestV2 } from "@/lib/dystopiabench/schemas"
import type { BenchmarkResult } from "@/lib/dystopiabench/types"

function DeferredResultsPlaceholder() {
  return (
    <div className="rounded-md border border-border bg-card/40 p-5">
      <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
        Charts will load when this section enters view.
      </p>
    </div>
  )
}

const DashboardTabs = dynamic(
  () => import("@/components/bench/dashboard-tabs").then((mod) => mod.DashboardTabs),
  { ssr: false, loading: DeferredResultsPlaceholder },
)

interface ResolvedRun {
  results: BenchmarkResult[]
  manifest: RunManifestV2 | null
}

function getRunIndexVersion(run: RunIndexItem | undefined): string | undefined {
  if (!run) return undefined
  return createDashboardVersionHash([
    run.id,
    run.timestamp,
    run.metadata.models.join(","),
    run.metadata.totalPrompts,
    run.summary.scoredPrompts,
    run.summary.statusCounts.ok ?? 0,
    run.summary.statusCounts.model_error ?? 0,
    run.summary.statusCounts.judge_error ?? 0,
  ].join(":"))
}

function getDashboardCacheVersion(run: RunIndexItem | undefined): string | undefined {
  const runVersion = getRunIndexVersion(run)
  if (!runVersion) return undefined
  return `${runVersion}:models:${getDashboardModelSelectionVersion()}`
}

function useBenchmarkData() {
  const [loading, setLoading] = useState(true)
  const [statefulResults, setStatefulResults] = useState<BenchmarkResult[]>([])
  const [statefulManifest, setStatefulManifest] = useState<RunManifestV2 | null>(null)
  const [isolatedLatestResults, setIsolatedLatestResults] = useState<BenchmarkResult[]>([])
  const [isolatedLatestManifest, setIsolatedLatestManifest] = useState<RunManifestV2 | null>(null)
  const [isolatedLoading, setIsolatedLoading] = useState(false)

  const statefulLatestVersionRef = useRef<string | number | undefined>(undefined)
  const statelessLatestVersionRef = useRef<string | number | undefined>(undefined)
  const isolatedLoadedRef = useRef(false)

  const resolveLatestStatefulRun = useCallback(async (
    latestStatefulRunId?: string,
  ): Promise<ResolvedRun> => {
    try {
      let loaded = await loadSavedRun(undefined, {
        latestVersion: statefulLatestVersionRef.current,
        latestMode: "stateful",
        expectedMode: "stateful",
      })

      // Backward-compatible fallback for repos that don't yet have
      // benchmark-results-stateful.json published.
      if (!loaded && latestStatefulRunId) {
        loaded = await loadSavedRun(latestStatefulRunId, { expectedMode: "stateful" })
      }

      if (loaded) {
        return {
          results: loaded.results,
          manifest: loaded.manifest,
        }
      }

      return {
        results: [],
        manifest: null,
      }
    } catch {
      return {
        results: [],
        manifest: null,
      }
    }
  }, [])

  const resolveLatestIsolatedRun = useCallback(async (): Promise<ResolvedRun> => {
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
        }
      }

      return {
        results: [],
        manifest: null,
      }
    } catch {
      return {
        results: [],
        manifest: null,
      }
    }
  }, [])

  const ensureIsolatedLatestLoaded = useCallback(async () => {
    if (isolatedLoadedRef.current || isolatedLoading) return

    setIsolatedLoading(true)
    try {
      const resolved = await resolveLatestIsolatedRun()
      setIsolatedLatestResults(resolved.results)
      setIsolatedLatestManifest(resolved.manifest)
      isolatedLoadedRef.current = true
    } finally {
      setIsolatedLoading(false)
    }
  }, [isolatedLoading, resolveLatestIsolatedRun])

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

      statefulLatestVersionRef.current = getDashboardCacheVersion(filteredStatefulRuns[0])
      statelessLatestVersionRef.current = getDashboardCacheVersion(filteredStatelessRuns[0])

      const resolvedStateful = await resolveLatestStatefulRun(filteredStatefulRuns[0]?.id)
      setStatefulResults(resolvedStateful.results)
      setStatefulManifest(resolvedStateful.manifest)
      setIsolatedLatestResults([])
      setIsolatedLatestManifest(null)
      isolatedLoadedRef.current = false
    } finally {
      setLoading(false)
    }
  }, [resolveLatestStatefulRun])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    loading,
    statefulResults,
    statefulManifest,
    isolatedLatestResults,
    isolatedLatestManifest,
    isolatedLoading,
    ensureIsolatedLatestLoaded,
  }
}

function MountedResultsTabs() {
  const {
    loading,
    statefulResults,
    statefulManifest,
    isolatedLatestResults,
    isolatedLatestManifest,
    isolatedLoading,
    ensureIsolatedLatestLoaded,
  } = useBenchmarkData()
  return (
    <DashboardTabs
      loading={loading}
      isolatedLoading={isolatedLoading}
      statefulResults={statefulResults}
      isolatedResults={isolatedLatestResults}
      statefulManifest={statefulManifest}
      isolatedManifest={isolatedLatestManifest}
      onLoadIsolatedResults={ensureIsolatedLatestLoaded}
    />
  )
}

export function DeferredResultsTabs() {
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const [shouldMount, setShouldMount] = useState(
    () => typeof window !== "undefined" && !("IntersectionObserver" in window),
  )

  useEffect(() => {
    if (shouldMount) return
    const node = sentinelRef.current
    if (!node) return
    if (!("IntersectionObserver" in window)) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShouldMount(true)
            observer.disconnect()
            break
          }
        }
      },
      { rootMargin: "500px 0px" },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [shouldMount])

  return (
    <div ref={sentinelRef}>
      {shouldMount ? (
        <MountedResultsTabs />
      ) : (
        <DeferredResultsPlaceholder />
      )}
    </div>
  )
}
