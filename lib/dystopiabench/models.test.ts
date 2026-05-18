import assert from "node:assert/strict"
import test from "node:test"
import { parseModelIdentifier } from "./model-selectors"
import { JUDGE_MODEL_OPTIONS, getEstimatedPricingByModelKey, getModelById, getModelByModelString } from "./models"

test("getModelById resolves known curated models", () => {
  const model = getModelById("deepseek-v3.2")

  assert.ok(model)
  assert.equal(model.id, "deepseek-v3.2")
})

test("getModelById resolves Grok 4.3 curated model", () => {
  const model = getModelById("grok-4.3")

  assert.ok(model)
  assert.equal(model.modelString, "x-ai/grok-4.3")
  assert.deepEqual(getEstimatedPricingByModelKey("grok-4.3"), { input: 1.25, output: 2.5 })
})

test("getModelById resolves Mistral Medium 3.5 curated model", () => {
  const mistral = getModelById("mistral-medium-3-5")

  assert.ok(mistral)
  assert.equal(mistral.modelString, "mistralai/mistral-medium-3-5")
  assert.equal(getModelByModelString("mistralai/mistral-medium-3-5")?.id, "mistral-medium-3-5")
  assert.deepEqual(getEstimatedPricingByModelKey("mistral-medium-3-5"), { input: 1.5, output: 7.5 })
  assert.deepEqual(getEstimatedPricingByModelKey("mistralai/mistral-medium-3-5"), { input: 1.5, output: 7.5 })
})

test("getModelById rejects prototype-property keys", () => {
  assert.equal(getModelById("__proto__"), undefined)
  assert.equal(getModelById("constructor"), undefined)
  assert.equal(getModelById("toString"), undefined)
})

test("getModelByModelString rejects unknown keys and prototype-property keys", () => {
  assert.equal(getModelByModelString("deepseek/deepseek-v3.2")?.id, "deepseek-v3.2")
  assert.equal(getModelByModelString("__proto__"), undefined)
})

test("parseModelIdentifier treats prototype-property keys as unknown model ids", () => {
  assert.throws(
    () => parseModelIdentifier("__proto__"),
    /Unknown model identifier '__proto__'/
  )
})

test("parseModelIdentifier resolves curated ids and OpenRouter model strings", () => {
  assert.deepEqual(
    parseModelIdentifier("deepseek-v3.2"),
    {
      id: "deepseek-v3.2",
      label: "DeepSeek V3.2",
      provider: "DeepSeek",
      modelString: "deepseek/deepseek-v3.2",
      backend: "openrouter",
      weightClass: "open_weight",
    },
  )

  const byModelString = parseModelIdentifier("deepseek/deepseek-v3.2")
  assert.equal(byModelString.id, "deepseek-v3.2")
  assert.equal(byModelString.backend, "openrouter")
})

test("parseModelIdentifier handles explicit openrouter and local prefixes", () => {
  assert.deepEqual(parseModelIdentifier("openrouter:openai/gpt-4o"), {
    id: "openrouter:openai/gpt-4o",
    label: "OpenRouter openai/gpt-4o",
    provider: "OpenRouter",
    modelString: "openai/gpt-4o",
    backend: "openrouter",
    weightClass: "unknown",
  })

  assert.deepEqual(parseModelIdentifier("local:llama3"), {
    id: "local:llama3",
    label: "Local llama3",
    provider: "Local",
    modelString: "llama3",
    backend: "local",
    weightClass: "unknown",
  })
})

test("parseModelIdentifier rejects empty and unsupported provider-prefixed selectors", () => {
  assert.throws(
    () => parseModelIdentifier("   "),
    /cannot be empty/,
  )
  assert.throws(
    () => parseModelIdentifier("anthropic:claude-3"),
    /Unknown model identifier 'anthropic:claude-3'/,
  )
  assert.throws(
    () => parseModelIdentifier("openrouter:"),
    /missing model after provider prefix/,
  )
})

test("getEstimatedPricingByModelKey falls back for unknown keys", () => {
  assert.deepEqual(getEstimatedPricingByModelKey("__proto__"), { input: 2, output: 8 })
})

test("JUDGE_MODEL_OPTIONS includes the latest curated GLM judge", () => {
  assert.ok(JUDGE_MODEL_OPTIONS.some((model) => model.id === "glm-5.1"))
})

test("JUDGE_MODEL_OPTIONS includes Gemini 3 Flash (non-3.1-Lite) for judging", () => {
  assert.ok(JUDGE_MODEL_OPTIONS.some((model) => model.id === "gemini-3-flash-preview"))
})

test("JUDGE_MODEL_OPTIONS includes Haiku as a judge", () => {
  assert.ok(JUDGE_MODEL_OPTIONS.some((model) => model.id === "claude-haiku-4.5"))
})

test("JUDGE_MODEL_OPTIONS excludes full GPT 5.4 as a curated judge option", () => {
  assert.ok(!JUDGE_MODEL_OPTIONS.some((model) => model.id === "gpt-5.4"))
})
