export type SplitDirection = "left" | "right" | "up" | "down";
export type PaneAxis = "horizontal" | "vertical";

export interface PaneLeafNode {
  kind: "leaf";
  id: string;
  tabIds: string[];
  activeTabId: string | null;
}

export interface PaneSplitNode {
  kind: "split";
  id: string;
  axis: PaneAxis;
  children: PaneNode[];
}

export type PaneNode = PaneLeafNode | PaneSplitNode;

export interface PaneLayoutState {
  root: PaneNode | null;
  activePaneId: string | null;
}

export interface RemoveLeafResult {
  node: PaneNode | null;
  removed: boolean;
  focusLeafId: string | null;
}

export function makeNodeId(prefix: "pane" | "split"): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function createLeaf(tabIds: string[] = [], activeTabId?: string | null): PaneLeafNode {
  return {
    kind: "leaf",
    id: makeNodeId("pane"),
    tabIds,
    activeTabId: activeTabId ?? tabIds[0] ?? null,
  };
}

export function arrayEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function paneNodeEqual(left: PaneNode | null, right: PaneNode | null): boolean {
  if (left === right) return true;
  if (!left || !right || left.kind !== right.kind || left.id !== right.id) return false;

  if (left.kind === "leaf" && right.kind === "leaf") {
    return left.activeTabId === right.activeTabId && arrayEqual(left.tabIds, right.tabIds);
  }

  if (left.kind === "split" && right.kind === "split") {
    return (
      left.axis === right.axis &&
      left.children.length === right.children.length &&
      left.children.every((child, i) => paneNodeEqual(child, right.children[i]))
    );
  }

  return false;
}

export function paneLayoutEqual(left: PaneLayoutState, right: PaneLayoutState): boolean {
  return left.activePaneId === right.activePaneId && paneNodeEqual(left.root, right.root);
}

export function getFirstLeaf(node: PaneNode | null): PaneLeafNode | null {
  if (!node) return null;
  if (node.kind === "leaf") return node;
  for (const child of node.children) {
    const leaf = getFirstLeaf(child);
    if (leaf) return leaf;
  }
  return null;
}

export function countLeaves(node: PaneNode | null): number {
  if (!node) return 0;
  if (node.kind === "leaf") return 1;
  return node.children.reduce((sum, child) => sum + countLeaves(child), 0);
}

export function findLeaf(node: PaneNode | null, leafId: string | null): PaneLeafNode | null {
  if (!node || !leafId) return null;
  if (node.kind === "leaf") return node.id === leafId ? node : null;
  for (const child of node.children) {
    const found = findLeaf(child, leafId);
    if (found) return found;
  }
  return null;
}

export function findLeafContainingTab(node: PaneNode | null, tabId: string | null): PaneLeafNode | null {
  if (!node || !tabId) return null;
  if (node.kind === "leaf") return node.tabIds.includes(tabId) ? node : null;
  for (const child of node.children) {
    const found = findLeafContainingTab(child, tabId);
    if (found) return found;
  }
  return null;
}

export function collectAssignedTabIds(node: PaneNode | null): string[] {
  if (!node) return [];
  if (node.kind === "leaf") return node.tabIds;
  return node.children.flatMap(collectAssignedTabIds);
}

export function ensureActiveTabs(node: PaneNode): PaneNode {
  if (node.kind === "leaf") {
    const nextActiveTabId =
      node.activeTabId && node.tabIds.includes(node.activeTabId)
        ? node.activeTabId
        : node.tabIds[0] ?? null;

    if (nextActiveTabId === node.activeTabId) return node;
    return { ...node, activeTabId: nextActiveTabId };
  }

  const nextChildren = node.children.map(ensureActiveTabs);
  if (nextChildren.every((child, i) => child === node.children[i])) return node;
  return { ...node, children: nextChildren };
}

export function normalizeNode(node: PaneNode | null, availableTabIds: Set<string>): PaneNode | null {
  if (!node) return null;

  if (node.kind === "leaf") {
    const nextTabIds = node.tabIds.filter((tabId) => availableTabIds.has(tabId));
    if (nextTabIds.length === 0) return null;

    const nextActiveTabId =
      node.activeTabId && nextTabIds.includes(node.activeTabId)
        ? node.activeTabId
        : nextTabIds[0];

    if (arrayEqual(nextTabIds, node.tabIds) && nextActiveTabId === node.activeTabId) return node;
    return { ...node, tabIds: nextTabIds, activeTabId: nextActiveTabId };
  }

  const nextChildren = node.children
    .map((child) => normalizeNode(child, availableTabIds))
    .filter((child): child is PaneNode => child !== null);

  if (nextChildren.length === 0) return null;
  if (nextChildren.length === 1) return nextChildren[0];

  if (
    nextChildren.length === node.children.length &&
    nextChildren.every((child, i) => child === node.children[i])
  ) {
    return node;
  }

  return { ...node, children: nextChildren };
}

export function appendTabsToLeaf(
  node: PaneNode,
  leafId: string,
  tabIds: string[],
  preferredActiveTabId: string | null,
): PaneNode {
  if (node.kind === "leaf") {
    if (node.id !== leafId || tabIds.length === 0) return node;

    const seen = new Set(node.tabIds);
    const nextTabIds = [...node.tabIds];
    for (const tabId of tabIds) {
      if (!seen.has(tabId)) {
        seen.add(tabId);
        nextTabIds.push(tabId);
      }
    }

    const nextActiveTabId =
      preferredActiveTabId && nextTabIds.includes(preferredActiveTabId)
        ? preferredActiveTabId
        : node.activeTabId ?? nextTabIds[0] ?? null;

    if (arrayEqual(nextTabIds, node.tabIds) && nextActiveTabId === node.activeTabId) return node;
    return { ...node, tabIds: nextTabIds, activeTabId: nextActiveTabId };
  }

  const nextChildren = node.children.map((child) =>
    appendTabsToLeaf(child, leafId, tabIds, preferredActiveTabId),
  );
  if (nextChildren.every((child, i) => child === node.children[i])) return node;
  return { ...node, children: nextChildren };
}

export function appendTabsToFirstLeaf(
  node: PaneNode,
  tabIds: string[],
  preferredActiveTabId: string | null,
): PaneNode {
  const firstLeaf = getFirstLeaf(node);
  if (!firstLeaf) return node;
  return appendTabsToLeaf(node, firstLeaf.id, tabIds, preferredActiveTabId);
}

export function setLeafActiveTab(node: PaneNode, leafId: string, tabId: string): PaneNode {
  if (node.kind === "leaf") {
    if (node.id !== leafId || !node.tabIds.includes(tabId) || node.activeTabId === tabId) {
      return node;
    }
    return { ...node, activeTabId: tabId };
  }

  const nextChildren = node.children.map((child) => setLeafActiveTab(child, leafId, tabId));
  if (nextChildren.every((child, i) => child === node.children[i])) return node;
  return { ...node, children: nextChildren };
}

export function splitLeaf(
  node: PaneNode,
  leafId: string,
  direction: SplitDirection,
  tabId: string,
): { root: PaneNode; activePaneId: string | null } {
  let nextActivePaneId: string | null = null;
  const splitAxis: PaneAxis = direction === "left" || direction === "right" ? "horizontal" : "vertical";
  const insertBefore = direction === "left" || direction === "up";

  const visit = (current: PaneNode, parentAxis?: PaneAxis): PaneNode => {
    if (current.kind === "leaf") {
      if (current.id !== leafId) return current;

      const remainingTabIds = current.tabIds.filter((candidate) => candidate !== tabId);
      if (!current.tabIds.includes(tabId) || remainingTabIds.length === 0) return current;

      const movedLeaf = createLeaf([tabId], tabId);
      const currentLeaf: PaneLeafNode = {
        ...current,
        tabIds: remainingTabIds,
        activeTabId:
          current.activeTabId && remainingTabIds.includes(current.activeTabId)
            ? current.activeTabId
            : remainingTabIds[0] ?? null,
      };

      nextActivePaneId = movedLeaf.id;

      if (parentAxis === splitAxis) {
        return {
          kind: "split",
          id: "__absorb__",
          axis: splitAxis,
          children: insertBefore ? [movedLeaf, currentLeaf] : [currentLeaf, movedLeaf],
        };
      }

      return {
        kind: "split",
        id: makeNodeId("split"),
        axis: splitAxis,
        children: insertBefore ? [movedLeaf, currentLeaf] : [currentLeaf, movedLeaf],
      };
    }

    const nextChildren = current.children.map((child) => visit(child, current.axis));
    if (nextChildren.every((child, i) => child === current.children[i])) return current;

    if (current.axis === splitAxis) {
      const absorbed: PaneNode[] = [];
      for (const child of nextChildren) {
        if (child.kind === "split" && child.id === "__absorb__" && child.axis === current.axis) {
          absorbed.push(...child.children);
        } else {
          absorbed.push(child);
        }
      }
      return { ...current, children: absorbed };
    }

    return { ...current, children: nextChildren };
  };

  return { root: visit(node), activePaneId: nextActivePaneId };
}

export function closeLeaf(node: PaneNode, leafId: string): RemoveLeafResult {
  if (node.kind === "leaf") {
    if (node.id !== leafId) return { node, removed: false, focusLeafId: null };
    return { node: null, removed: true, focusLeafId: null };
  }

  for (let i = 0; i < node.children.length; i++) {
    const result = closeLeaf(node.children[i], leafId);
    if (!result.removed) continue;

    const removedChild = node.children[i];
    const tabsToRedistribute = collectAssignedTabIds(removedChild);

    if (result.node) {
      const nextChildren = [...node.children];
      nextChildren[i] = result.node;
      return {
        node: { ...node, children: nextChildren },
        removed: true,
        focusLeafId: getFirstLeaf(result.node)?.id ?? null,
      };
    }

    const remaining = node.children.filter((_, idx) => idx !== i);

    if (remaining.length === 0) return { node: null, removed: true, focusLeafId: null };

    const adjacentIdx = Math.min(i, remaining.length - 1);
    remaining[adjacentIdx] = appendTabsToFirstLeaf(remaining[adjacentIdx], tabsToRedistribute, null);

    if (remaining.length === 1) {
      return {
        node: remaining[0],
        removed: true,
        focusLeafId: getFirstLeaf(remaining[0])?.id ?? null,
      };
    }

    return {
      node: { ...node, children: remaining },
      removed: true,
      focusLeafId: getFirstLeaf(remaining[adjacentIdx])?.id ?? null,
    };
  }

  return { node, removed: false, focusLeafId: null };
}

export function syncPaneLayout(
  current: PaneLayoutState,
  surfaces: { id: string }[],
  preferredTabId: string | null,
): PaneLayoutState {
  if (surfaces.length === 0) return { root: null, activePaneId: null };

  const orderedTabIds = surfaces.map((surface) => surface.id);
  const availableTabIds = new Set(orderedTabIds);
  let root = normalizeNode(current.root, availableTabIds);

  if (!root) {
    root = createLeaf([orderedTabIds[0]], orderedTabIds[0]);
  }

  const shouldFocusPreferred = Boolean(preferredTabId && !findLeafContainingTab(current.root, preferredTabId));
  let activePaneId = findLeaf(root, current.activePaneId)?.id ?? null;
  const assignedTabIds = new Set(collectAssignedTabIds(root));
  const missingTabIds = orderedTabIds.filter((tabId) => !assignedTabIds.has(tabId));

  if (missingTabIds.length > 0) {
    const targetLeafId =
      activePaneId ??
      findLeafContainingTab(root, preferredTabId)?.id ??
      getFirstLeaf(root)?.id;

    if (targetLeafId) {
      root = appendTabsToLeaf(root, targetLeafId, missingTabIds, preferredTabId);
    }
  }

  root = ensureActiveTabs(root);

  if (preferredTabId && shouldFocusPreferred) {
    const preferredLeaf = findLeafContainingTab(root, preferredTabId);
    if (preferredLeaf) {
      root = setLeafActiveTab(root, preferredLeaf.id, preferredTabId);
      activePaneId = preferredLeaf.id;
    }
  }

  if (!findLeaf(root, activePaneId)?.id) {
    activePaneId = getFirstLeaf(root)?.id ?? null;
  }

  return { root, activePaneId };
}

export function moveTabBetweenLeaves(
  root: PaneNode,
  fromLeafId: string,
  tabId: string,
  toLeafId: string,
  insertIndex?: number,
): PaneNode {
  const fromLeaf = findLeaf(root, fromLeafId);
  if (!fromLeaf || !fromLeaf.tabIds.includes(tabId)) return root;

  const nextFromTabIds = fromLeaf.tabIds.filter((id) => id !== tabId);
  const nextFromActiveTabId =
    fromLeaf.activeTabId === tabId ? nextFromTabIds[0] ?? null : fromLeaf.activeTabId;

  // Remove the tab from source first so closeLeaf sees an empty leaf and skips redistribution
  let result = updateLeaf(root, fromLeafId, { tabIds: nextFromTabIds, activeTabId: nextFromActiveTabId });

  if (nextFromTabIds.length === 0) {
    const closeResult = closeLeaf(result, fromLeafId);
    if (closeResult.node) result = closeResult.node;
  }

  // Add tab to destination
  const toLeaf = findLeaf(result, toLeafId);
  if (!toLeaf) return result;

  const nextToTabIds = [...toLeaf.tabIds];
  if (!nextToTabIds.includes(tabId)) {
    if (insertIndex !== undefined) {
      nextToTabIds.splice(insertIndex, 0, tabId);
    } else {
      nextToTabIds.push(tabId);
    }
  }

  return updateLeaf(result, toLeafId, { tabIds: nextToTabIds, activeTabId: tabId });
}

export function splitLeafWithExternalTab(
  root: PaneNode,
  targetLeafId: string,
  direction: SplitDirection,
  incomingTabId: string,
  fromLeafId: string | null,
): { root: PaneNode; activePaneId: string | null } {
  let result = root;

  // Remove from source if it came from another leaf
  if (fromLeafId) {
    const fromLeaf = findLeaf(result, fromLeafId);
    if (fromLeaf && fromLeaf.tabIds.includes(incomingTabId)) {
      const nextFromTabIds = fromLeaf.tabIds.filter((id) => id !== incomingTabId);
      const nextActiveTabId =
        fromLeaf.activeTabId === incomingTabId
          ? nextFromTabIds[0] ?? null
          : fromLeaf.activeTabId;
      // Remove tab from source first so closeLeaf sees empty leaf and skips redistribution
      result = updateLeaf(result, fromLeafId, { tabIds: nextFromTabIds, activeTabId: nextActiveTabId });
      if (nextFromTabIds.length === 0) {
        const closeResult = closeLeaf(result, fromLeafId);
        if (closeResult.node) result = closeResult.node;
      }
    }
  }

  // Temporarily add the tab to target leaf so splitLeaf can move it out
  const targetLeaf = findLeaf(result, targetLeafId);
  if (!targetLeaf) return { root: result, activePaneId: null };

  if (!targetLeaf.tabIds.includes(incomingTabId)) {
    result = appendTabsToLeaf(result, targetLeafId, [incomingTabId], null);
  }

  return splitLeaf(result, targetLeafId, direction, incomingTabId);
}

function updateLeaf(
  node: PaneNode,
  leafId: string,
  patch: Partial<PaneLeafNode>,
): PaneNode {
  if (node.kind === "leaf") {
    if (node.id !== leafId) return node;
    return { ...node, ...patch };
  }
  const nextChildren = node.children.map((child) => updateLeaf(child, leafId, patch));
  if (nextChildren.every((child, i) => child === node.children[i])) return node;
  return { ...node, children: nextChildren };
}
