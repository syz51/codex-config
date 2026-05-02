import { expect, test } from "bun:test";
import { changedStatusDelta, statusLinePath } from "../src/core/git";

test("status delta detects new changes", () => {
  expect(changedStatusDelta([" M a.md"], [" M a.md", " M b.md"])).toEqual([" M b.md"]);
});

test("statusLinePath handles rename", () => {
  expect(statusLinePath("R  old.md -> new.md")).toBe("new.md");
});
