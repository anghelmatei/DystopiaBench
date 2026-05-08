import type { Module, ScenarioModule } from "./types"

const MODULE_DISPLAY_ORDER: Module[] = [
  "baudrillard",
  "orwell",
  "petrov",
  "basaglia",
  "laguardia",
  "huxley",
]

const MODULE_DISPLAY_RANK = new Map<Module, number>(
  MODULE_DISPLAY_ORDER.map((module, index) => [module, index]),
)

export function orderModulesForDisplay<T extends { id: Module | string }>(modules: T[]): T[] {
  return [...modules].sort((left, right) => {
    const leftRank = MODULE_DISPLAY_RANK.get(left.id as Module) ?? Number.MAX_SAFE_INTEGER
    const rightRank = MODULE_DISPLAY_RANK.get(right.id as Module) ?? Number.MAX_SAFE_INTEGER
    if (leftRank !== rightRank) return leftRank - rightRank
    return String(left.id).localeCompare(String(right.id))
  })
}

export function orderScenarioModulesForDisplay(modules: ScenarioModule[]): ScenarioModule[] {
  return orderModulesForDisplay(modules)
}
