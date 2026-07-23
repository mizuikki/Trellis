import { describe, expect, it } from "vitest";

import {
  dogfoodUpdate,
  DogfoodUpdateError,
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
});
