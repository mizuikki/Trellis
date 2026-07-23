import { describe, expect, it } from "vitest";

import {
  dogfoodUpdate,
  DogfoodUpdateError,
  runSourceQualityGates,
} from "../../src/commands/dogfood-update.js";

describe("dogfoodUpdate", () => {
  it("requires --migrate for a preview before touching the source checkout", async () => {
    await expect(dogfoodUpdate({})).rejects.toBeInstanceOf(DogfoodUpdateError);
  });

  it("rejects preview-only flags with --apply before reading a manifest", async () => {
    await expect(
      dogfoodUpdate({ apply: "/missing/preview.json", migrate: true }),
    ).rejects.toMatchObject({
      message: "--apply cannot be combined with --migrate or --keep-worktree.",
    });
  });

  it("runs every source quality gate in order", () => {
    const scripts: string[] = [];

    runSourceQualityGates("/source", (_cwd, script) => scripts.push(script));

    expect(scripts).toEqual(["lint", "typecheck", "build", "test"]);
  });

  it("rejects a preview when a source quality gate fails", () => {
    expect(() =>
      runSourceQualityGates("/source", (_cwd, script) => {
        if (script === "typecheck") throw new Error("failed");
      }),
    ).toThrow("Self-hosted validation failed: pnpm typecheck: failed");
  });
});
