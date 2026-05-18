import assert from "node:assert/strict"
import test from "node:test"
import {
  formatCount,
  formatDuration,
  renderKeyValueRows,
  renderProgressBar,
} from "./terminal-output"

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "")
}

test("formatDuration rounds milliseconds and clamps negative durations", () => {
  assert.equal(formatDuration(-500), "0s")
  assert.equal(formatDuration(499), "0s")
  assert.equal(formatDuration(1_500), "2s")
  assert.equal(formatDuration(61_000), "1m 1s")
  assert.equal(formatDuration(3_661_000), "1h 1m 1s")
})

test("formatCount emits stable en-US grouping", () => {
  assert.equal(formatCount(0), "0")
  assert.equal(formatCount(1_234_567), "1,234,567")
})

test("renderKeyValueRows skips undefined values and pads labels", () => {
  const rendered = stripAnsi(renderKeyValueRows([
    ["A", "x"],
    ["Skip", undefined],
    ["Long", 2],
  ], 6))

  assert.equal(rendered, "  A      x\n  Long   2")
})

test("renderProgressBar clamps percentage and honors width", () => {
  assert.equal(stripAnsi(renderProgressBar(50, 10)), "[#####-----]")
  assert.equal(stripAnsi(renderProgressBar(-10, 10)), "[----------]")
  assert.equal(stripAnsi(renderProgressBar(110, 10)), "[##########]")
})
