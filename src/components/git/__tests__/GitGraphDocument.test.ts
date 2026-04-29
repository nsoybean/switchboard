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
});
