import { expect, test } from "bun:test";
import { parseDurationMs } from "../src/core/retention";

test("parse duration", () => {
  expect(parseDurationMs("1d")).toBe(24 * 60 * 60 * 1000);
  expect(parseDurationMs("2h")).toBe(2 * 60 * 60 * 1000);
  expect(parseDurationMs("30m")).toBe(30 * 60 * 1000);
});

test("reject invalid duration", () => {
  expect(() => parseDurationMs("30days")).toThrow();
});
