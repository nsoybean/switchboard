import { describe, expect, it } from "vitest";
import {
  appendTabsToLeaf,
  closeLeaf,
  collectAssignedTabIds,
  countLeaves,
  ensureActiveTabs,
  findLeaf,
  findLeafContainingTab,
  getFirstLeaf,
  moveTabBetweenLeaves,
  normalizeNode,
  paneLayoutEqual,
  paneNodeEqual,
  setLeafActiveTab,
  splitLeaf,
  splitLeafWithExternalTab,
  syncPaneLayout,
  type PaneLeafNode,
  type PaneNode,
} from "../pane-tree";

// ── helpers ────────────────────────────────────────────────────────────────

function leaf(tabIds: string[], activeTabId?: string | null): PaneLeafNode {
  return {
    kind: "leaf",
    id: `pane-${tabIds.join("-")}`,
    tabIds,
    activeTabId: activeTabId ?? tabIds[0] ?? null,
  };
}

function hSplit(...children: PaneNode[]): PaneNode {
  return { kind: "split", id: "split-h", axis: "horizontal", children };
}

function vSplit(...children: PaneNode[]): PaneNode {
  return { kind: "split", id: "split-v", axis: "vertical", children };
}

// ── countLeaves ────────────────────────────────────────────────────────────

describe("countLeaves", () => {
  it("returns 0 for null", () => expect(countLeaves(null)).toBe(0));
  it("counts a single leaf as 1", () => expect(countLeaves(leaf(["a"]))).toBe(1));
  it("counts all leaves in a split", () => {
    expect(countLeaves(hSplit(leaf(["a"]), leaf(["b"]), leaf(["c"])))).toBe(3);
  });
  it("counts leaves in nested splits", () => {
    expect(countLeaves(hSplit(leaf(["a"]), vSplit(leaf(["b"]), leaf(["c"]))))).toBe(3);
  });
});

// ── findLeaf ───────────────────────────────────────────────────────────────

describe("findLeaf", () => {
  it("returns null for null node", () => expect(findLeaf(null, "x")).toBeNull());
  it("returns null when leafId is null", () => expect(findLeaf(leaf(["a"]), null)).toBeNull());
  it("finds a leaf by id", () => {
    const l = leaf(["a"]);
    expect(findLeaf(l, l.id)).toBe(l);
  });
  it("returns null for missing id", () => expect(findLeaf(leaf(["a"]), "nope")).toBeNull());
  it("finds a deeply nested leaf", () => {
    const deep = leaf(["deep"]);
    const tree = hSplit(leaf(["a"]), vSplit(leaf(["b"]), deep));
    expect(findLeaf(tree, deep.id)).toBe(deep);
  });
});

// ── findLeafContainingTab ──────────────────────────────────────────────────

describe("findLeafContainingTab", () => {
  it("finds leaf containing the tab", () => {
    const l = leaf(["a", "b"]);
    expect(findLeafContainingTab(l, "b")).toBe(l);
  });
  it("returns null when tab is absent", () => {
    expect(findLeafContainingTab(leaf(["a"]), "z")).toBeNull();
  });
  it("searches nested tree", () => {
    const target = leaf(["x"]);
    const tree = hSplit(leaf(["a"]), target);
    expect(findLeafContainingTab(tree, "x")).toBe(target);
  });
});

// ── getFirstLeaf ───────────────────────────────────────────────────────────

describe("getFirstLeaf", () => {
  it("returns null for null", () => expect(getFirstLeaf(null)).toBeNull());
  it("returns the leaf itself", () => {
    const l = leaf(["a"]);
    expect(getFirstLeaf(l)).toBe(l);
  });
  it("returns the leftmost leaf in a split", () => {
    const first = leaf(["a"]);
    expect(getFirstLeaf(hSplit(first, leaf(["b"])))).toBe(first);
  });
});

// ── normalizeNode ──────────────────────────────────────────────────────────

describe("normalizeNode", () => {
  it("returns null for null", () => expect(normalizeNode(null, new Set())).toBeNull());

  it("removes tabs not in the available set", () => {
    const l = leaf(["a", "b", "c"]);
    const result = normalizeNode(l, new Set(["a", "c"]));
    expect((result as PaneLeafNode).tabIds).toEqual(["a", "c"]);
  });

  it("returns null when all tabs removed", () => {
    expect(normalizeNode(leaf(["a", "b"]), new Set())).toBeNull();
  });

  it("resets activeTabId when active tab removed", () => {
    const l: PaneLeafNode = { ...leaf(["a", "b"]), activeTabId: "b" };
    const result = normalizeNode(l, new Set(["a"])) as PaneLeafNode;
    expect(result.activeTabId).toBe("a");
  });

  it("collapses single-child split", () => {
    const l = leaf(["a"]);
    const tree = hSplit(l, leaf(["b"]));
    const result = normalizeNode(tree, new Set(["a"]));
    expect(result?.kind).toBe("leaf");
    expect((result as PaneLeafNode).tabIds).toEqual(["a"]);
  });

  it("prunes empty branch from split, keeps others", () => {
    const tree = hSplit(leaf(["a"]), leaf(["b"]), leaf(["c"]));
    const result = normalizeNode(tree, new Set(["a", "c"]));
    expect(result?.kind).toBe("split");
    expect(countLeaves(result)).toBe(2);
  });

  it("returns same reference when nothing changed", () => {
    const l = leaf(["a"]);
    expect(normalizeNode(l, new Set(["a"]))).toBe(l);
  });
});

// ── appendTabsToLeaf ───────────────────────────────────────────────────────

describe("appendTabsToLeaf", () => {
  it("appends new tabs to the target leaf", () => {
    const l = leaf(["a"]);
    const result = appendTabsToLeaf(l, l.id, ["b", "c"], null) as PaneLeafNode;
    expect(result.tabIds).toEqual(["a", "b", "c"]);
  });

  it("does not duplicate existing tabs", () => {
    const l = leaf(["a", "b"]);
    const result = appendTabsToLeaf(l, l.id, ["a", "c"], null) as PaneLeafNode;
    expect(result.tabIds).toEqual(["a", "b", "c"]);
  });

  it("sets preferredActiveTabId when provided", () => {
    const l = leaf(["a"]);
    const result = appendTabsToLeaf(l, l.id, ["b"], "b") as PaneLeafNode;
    expect(result.activeTabId).toBe("b");
  });

  it("returns same reference when no change", () => {
    const l = leaf(["a", "b"]);
    expect(appendTabsToLeaf(l, l.id, ["a"], null)).toBe(l);
  });
});

// ── setLeafActiveTab ───────────────────────────────────────────────────────

describe("setLeafActiveTab", () => {
  it("updates the active tab", () => {
    const l = leaf(["a", "b"]);
    const result = setLeafActiveTab(l, l.id, "b") as PaneLeafNode;
    expect(result.activeTabId).toBe("b");
  });

  it("returns same reference when tab already active", () => {
    const l = leaf(["a", "b"]);
    expect(setLeafActiveTab(l, l.id, "a")).toBe(l);
  });

  it("returns same reference when tab not in leaf", () => {
    const l = leaf(["a"]);
    expect(setLeafActiveTab(l, l.id, "z")).toBe(l);
  });
});

// ── ensureActiveTabs ───────────────────────────────────────────────────────

describe("ensureActiveTabs", () => {
  it("resets activeTabId to first tab when current active is missing", () => {
    const l: PaneLeafNode = { kind: "leaf", id: "p", tabIds: ["b", "c"], activeTabId: "gone" };
    const result = ensureActiveTabs(l) as PaneLeafNode;
    expect(result.activeTabId).toBe("b");
  });

  it("keeps valid activeTabId unchanged", () => {
    const l: PaneLeafNode = { kind: "leaf", id: "p", tabIds: ["a", "b"], activeTabId: "b" };
    expect(ensureActiveTabs(l)).toBe(l);
  });
});

// ── collectAssignedTabIds ──────────────────────────────────────────────────

describe("collectAssignedTabIds", () => {
  it("collects from a single leaf", () => {
    expect(collectAssignedTabIds(leaf(["a", "b"]))).toEqual(["a", "b"]);
  });
  it("collects from nested splits", () => {
    const tree = hSplit(leaf(["a"]), vSplit(leaf(["b"]), leaf(["c", "d"])));
    expect(collectAssignedTabIds(tree)).toEqual(["a", "b", "c", "d"]);
  });
});

// ── splitLeaf ─────────────────────────────────────────────────────────────

describe("splitLeaf", () => {
  it("splits a leaf right — moves active tab into new pane", () => {
    const l = leaf(["a", "b"], "b");
    const { root, activePaneId } = splitLeaf(l, l.id, "right", "b");
    expect(root.kind).toBe("split");
    expect(activePaneId).not.toBeNull();
    expect(countLeaves(root)).toBe(2);
    const firstLeaf = getFirstLeaf(root) as PaneLeafNode;
    expect(firstLeaf.tabIds).toEqual(["a"]);
  });

  it("splits left — moved tab goes before source", () => {
    const l = leaf(["a", "b"], "b");
    const { root } = splitLeaf(l, l.id, "left", "b");
    expect(root.kind).toBe("split");
    const firstLeaf = getFirstLeaf(root) as PaneLeafNode;
    expect(firstLeaf.tabIds).toContain("b");
  });

  it("no-ops when tab not in leaf", () => {
    const l = leaf(["a"]);
    const { root } = splitLeaf(l, l.id, "right", "z");
    expect(root).toBe(l);
  });

  it("no-ops when leaf has only one tab (would leave empty source)", () => {
    const l = leaf(["a"]);
    const { root } = splitLeaf(l, l.id, "right", "a");
    // remainingTabIds.length === 0, returns same node
    expect(root).toBe(l);
  });

  it("absorbs same-axis sibling into parent (no double nesting)", () => {
    const l = leaf(["a", "b", "c"], "c");
    const { root: after1 } = splitLeaf(l, l.id, "right", "b");
    // after1 is horizontal split [leaf(a,c), leaf(b)]
    // Now split leaf(a,c) right with "c" — should produce 3-child horizontal split
    const leftLeaf = getFirstLeaf(after1) as PaneLeafNode;
    const { root: after2 } = splitLeaf(after1, leftLeaf.id, "right", "c");
    expect(after2.kind).toBe("split");
    // Should be flat: [leaf(a), leaf(c), leaf(b)] not nested
    if (after2.kind === "split") {
      expect(after2.children.length).toBe(3);
    }
  });
});

// ── closeLeaf ─────────────────────────────────────────────────────────────

describe("closeLeaf", () => {
  it("returns null when closing the only leaf", () => {
    const l = leaf(["a"]);
    const result = closeLeaf(l, l.id);
    expect(result.removed).toBe(true);
    expect(result.node).toBeNull();
  });

  it("removes a leaf from a split and redistributes its tabs", () => {
    const left = leaf(["a", "b"]);
    const right = leaf(["c"]);
    const tree = hSplit(left, right);
    const result = closeLeaf(tree, left.id);
    expect(result.removed).toBe(true);
    // Collapses to single leaf containing redistributed tabs
    expect(result.node?.kind).toBe("leaf");
    const node = result.node as PaneLeafNode;
    expect(node.tabIds).toContain("a");
    expect(node.tabIds).toContain("b");
    expect(node.tabIds).toContain("c");
  });

  it("returns removed:false when leaf not found", () => {
    const l = leaf(["a"]);
    const result = closeLeaf(l, "nonexistent");
    expect(result.removed).toBe(false);
    expect(result.node).toBe(l);
  });

  it("collapses split when reduced to 1 child", () => {
    const left = leaf(["a"]);
    const right = leaf(["b"]);
    const tree = hSplit(left, right);
    const result = closeLeaf(tree, right.id);
    expect(result.node?.kind).toBe("leaf");
  });
});

// ── paneNodeEqual / paneLayoutEqual ───────────────────────────────────────

describe("paneNodeEqual", () => {
  it("same reference is equal", () => {
    const l = leaf(["a"]);
    expect(paneNodeEqual(l, l)).toBe(true);
  });

  it("structurally identical leaves are equal", () => {
    const l1 = { kind: "leaf" as const, id: "x", tabIds: ["a"], activeTabId: "a" };
    const l2 = { kind: "leaf" as const, id: "x", tabIds: ["a"], activeTabId: "a" };
    expect(paneNodeEqual(l1, l2)).toBe(true);
  });

  it("differing activeTabId is not equal", () => {
    const l1 = { kind: "leaf" as const, id: "x", tabIds: ["a", "b"], activeTabId: "a" };
    const l2 = { kind: "leaf" as const, id: "x", tabIds: ["a", "b"], activeTabId: "b" };
    expect(paneNodeEqual(l1, l2)).toBe(false);
  });

  it("null nodes are equal", () => {
    expect(paneNodeEqual(null, null)).toBe(true);
  });
});

describe("paneLayoutEqual", () => {
  it("equal layouts", () => {
    const l = leaf(["a"]);
    expect(paneLayoutEqual({ root: l, activePaneId: l.id }, { root: l, activePaneId: l.id })).toBe(true);
  });
  it("different activePaneId", () => {
    const l = leaf(["a"]);
    expect(paneLayoutEqual({ root: l, activePaneId: "x" }, { root: l, activePaneId: "y" })).toBe(false);
  });
});

// ── syncPaneLayout ─────────────────────────────────────────────────────────

describe("syncPaneLayout", () => {
  it("returns empty layout for no surfaces", () => {
    const result = syncPaneLayout({ root: null, activePaneId: null }, [], null);
    expect(result.root).toBeNull();
    expect(result.activePaneId).toBeNull();
  });

  it("creates a leaf with first tab when starting from empty", () => {
    const result = syncPaneLayout({ root: null, activePaneId: null }, [{ id: "a" }, { id: "b" }], null);
    expect(result.root?.kind).toBe("leaf");
    const l = result.root as PaneLeafNode;
    expect(l.tabIds).toContain("a");
    expect(l.tabIds).toContain("b");
  });

  it("focuses the preferred tab", () => {
    const result = syncPaneLayout({ root: null, activePaneId: null }, [{ id: "a" }, { id: "b" }], "b");
    const l = result.root as PaneLeafNode;
    expect(l.activeTabId).toBe("b");
  });

  it("prunes tabs that are no longer in surfaces", () => {
    const l = leaf(["a", "b"]);
    const result = syncPaneLayout({ root: l, activePaneId: l.id }, [{ id: "a" }], null);
    expect((result.root as PaneLeafNode).tabIds).toEqual(["a"]);
  });
});

// ── moveTabBetweenLeaves ───────────────────────────────────────────────────

describe("moveTabBetweenLeaves", () => {
  it("moves a tab from one leaf to another", () => {
    const src = leaf(["a", "b"]);
    const dst = leaf(["c"]);
    const tree = hSplit(src, dst);
    const result = moveTabBetweenLeaves(tree, src.id, "b", dst.id);
    const srcAfter = findLeaf(result, src.id) as PaneLeafNode;
    const dstAfter = findLeaf(result, dst.id) as PaneLeafNode;
    expect(srcAfter.tabIds).toEqual(["a"]);
    expect(dstAfter.tabIds).toContain("c");
    expect(dstAfter.tabIds).toContain("b");
    expect(dstAfter.activeTabId).toBe("b");
  });

  it("closes source leaf synchronously when it becomes empty", () => {
    const src = leaf(["a"]);
    const dst = leaf(["b"]);
    const tree = hSplit(src, dst);
    const result = moveTabBetweenLeaves(tree, src.id, "a", dst.id);
    // Source pane should be gone — tree collapses to single leaf
    expect(countLeaves(result)).toBe(1);
    expect(findLeaf(result, src.id)).toBeNull();
  });

  it("inserts at specific index when provided", () => {
    const src = leaf(["a"]);
    const dst = leaf(["b", "c", "d"]);
    const tree = hSplit(src, dst);
    const result = moveTabBetweenLeaves(tree, src.id, "a", dst.id, 1);
    const dstAfter = findLeaf(result, dst.id) as PaneLeafNode;
    expect(dstAfter.tabIds[1]).toBe("a");
  });

  it("no-ops when tab not in source", () => {
    const src = leaf(["a"]);
    const dst = leaf(["b"]);
    const tree = hSplit(src, dst);
    expect(moveTabBetweenLeaves(tree, src.id, "z", dst.id)).toBe(tree);
  });
});

// ── splitLeafWithExternalTab ───────────────────────────────────────────────

describe("splitLeafWithExternalTab", () => {
  it("splits target pane and moves tab from source", () => {
    const src = leaf(["a", "b"]);
    const dst = leaf(["c"]);
    const tree = hSplit(src, dst);
    const { root, activePaneId } = splitLeafWithExternalTab(tree, dst.id, "right", "b", src.id);
    expect(activePaneId).not.toBeNull();
    expect(countLeaves(root)).toBe(3);
    const srcAfter = findLeaf(root, src.id) as PaneLeafNode;
    expect(srcAfter.tabIds).toEqual(["a"]);
  });

  it("closes source when it becomes empty after split", () => {
    const src = leaf(["a"]);
    const dst = leaf(["b", "c"]);
    const tree = hSplit(src, dst);
    const { root } = splitLeafWithExternalTab(tree, dst.id, "right", "a", src.id);
    expect(findLeaf(root, src.id)).toBeNull();
  });

  it("works with null fromLeafId (external / sidebar drag)", () => {
    const dst = leaf(["a", "b"]);
    const { root, activePaneId } = splitLeafWithExternalTab(dst, dst.id, "down", "b", null);
    expect(activePaneId).not.toBeNull();
    expect(countLeaves(root)).toBe(2);
  });
});
