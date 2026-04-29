import { describe, expect, it } from "vitest";
import { buildGraphRows } from "../GitGraphDocument";
import type { GitGraphCommit } from "@/lib/tauri-commands";

function commit(hash: string, parents: string[] = []): GitGraphCommit {
  return {
    hash,
    short_hash: hash.slice(0, 7),
    parents,
    refs: [],
    subject: hash,
    author: "Test Author",
    email: "author@example.com",
    relative_date: "now",
    date: "2026-04-29",
  };
}

describe("buildGraphRows", () => {
  it("reuses active parent lanes instead of duplicating them", () => {
    const rows = buildGraphRows([
      commit("child", ["shared-parent"]),
      commit("merge", ["shared-parent", "other-parent"]),
      commit("shared-parent"),
      commit("other-parent"),
    ]);

    const laneCounts = rows.map((row) =>
      Math.max(row.lanesBefore.length, row.lanesAfter.length),
    );
    const uniqueAfterCounts = rows.map((row) => new Set(row.lanesAfter).size);

    expect(Math.max(...laneCounts)).toBe(2);
    expect(rows.every((row, index) => row.lanesAfter.length === uniqueAfterCounts[index])).toBe(
      true,
    );
    expect(rows[2].lanesAfter).toEqual(["other-parent"]);
  });

  it("keeps a branch parent lane connected across stash pseudo-commits", () => {
    const rows = buildGraphRows([
      commit("merge-2466", ["merge-2465", "fix-typing"]),
      commit("fix-typing", ["script-base"]),
      commit("merge-2465", ["main-base", "script-base"]),
      commit("main-base", ["older-main", "bulk-fix"]),
      commit("stash", ["script-base", "stash-index", "stash-untracked"]),
      commit("stash-untracked"),
      commit("stash-index", ["script-base"]),
      commit("script-base", ["older-main"]),
    ]);

    const fixTyping = rows[1];
    const merge2465 = rows[2];
    const stash = rows[4];
    const scriptBase = rows[7];

    expect(fixTyping.lanesAfter[fixTyping.parentLanes[0]]).toBe("script-base");
    expect(merge2465.lanesBefore).toContain("script-base");
    expect(merge2465.lanesAfter).toContain("script-base");
    expect(stash.parentLanes.map((lane) => stash.lanesAfter[lane])).toEqual([
      "script-base",
      "stash-index",
      "stash-untracked",
    ]);
    expect(scriptBase.isNew).toBe(false);
  });
});
