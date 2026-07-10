import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { NextResponse } from "next/server"

export const dynamic = "force-static"

const LEGACY_RESULT_FILES = {
  stateful: "outputs-stateful.json",
  stateless: "outputs-stateless.json",
} as const

interface RouteContext {
  params: Promise<{ mode: string }>
}

export function generateStaticParams() {
  return Object.keys(LEGACY_RESULT_FILES).map((mode) => ({ mode }))
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { mode } = await params
  if (!(mode in LEGACY_RESULT_FILES)) {
    return NextResponse.json({ error: "Unknown legacy result mode." }, { status: 404 })
  }

  const fileName = LEGACY_RESULT_FILES[mode as keyof typeof LEGACY_RESULT_FILES]
  const filePath = join(process.cwd(), "legacy-tests", "artifacts", fileName)
  const payload = JSON.parse(await readFile(filePath, "utf8")) as { results?: unknown }

  if (!Array.isArray(payload.results)) {
    return NextResponse.json({ error: "Legacy result file is invalid." }, { status: 500 })
  }

  return NextResponse.json({ results: payload.results })
}
