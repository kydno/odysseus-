// ============================================
// Sidebar / icon-rail tool reorder (dragSort.js)
// ============================================

import Storage from './storage.js';
import dragSortModule from './dragSort.js';

const TOOL_ORDER_STORAGE_KEY = 'ody_sidebar_tool_order_v1';

/** Default order: alphabetical by tool key (matches shipped HTML comment). */
export const TOOL_ORDER_DEFAULT = [
  'archive',
  'calendar',
  'compare',
  'cookbook',
  'email',
  'gallery',
  'memory',
  'notes',
  'research',
  'tasks',
  'theme',
];

/** Keys that appear in the sidebar tools list (email is rail-only). */
const SIDEBAR_TOOL_KEYS = new Set(
  TOOL_ORDER_DEFAULT.filter((key) => key !== 'email'),
);

const RAIL_TOOL_KEYS = new Set(TOOL_ORDER_DEFAULT);

const RAIL_TOOLS_LIST_ID = 'rail-tools-list';
const SIDEBAR_TOOLS_LIST_ID = 'sidebar-tools-list';

const PLUS_BUTTON_IGNORE = '.list-item-plus-btn, .list-item-plus-icon, .list-item-plus-label';

let railDragInstance = null;
let sidebarDragInstance = null;
let toolDragSuppressClickUntil = 0;
let clickSuppressionWired = false;

export function readToolOrder() {
  try {
    const raw = Storage.get(TOOL_ORDER_STORAGE_KEY);
    if (!raw) return [...TOOL_ORDER_DEFAULT];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...TOOL_ORDER_DEFAULT];
    const kept = parsed.filter((key) => TOOL_ORDER_DEFAULT.includes(key));
    const missing = TOOL_ORDER_DEFAULT.filter((key) => !kept.includes(key));
    return [...kept, ...missing];
  } catch {
    return [...TOOL_ORDER_DEFAULT];
  }
}

function saveToolOrder(order) {
  Storage.set(TOOL_ORDER_STORAGE_KEY, JSON.stringify(order));
}

function readOrderFromList(listRoot) {
  if (!listRoot) return [];
  return Array.from(listRoot.querySelectorAll('[data-tool-key]'))
    .map((el) => el.getAttribute('data-tool-key'))
    .filter((key) => key && TOOL_ORDER_DEFAULT.includes(key));
}

/**
 * Merge a partial reorder (sidebar or rail) into the full saved order.
 * Keys that only exist on the other list (e.g. email) keep their relative slot.
 */
export function mergeToolOrder(prevOrder, reorderedSubset, sourceKeys) {
  const result = [];
  let subsetIndex = 0;

  for (const key of prevOrder) {
    if (!TOOL_ORDER_DEFAULT.includes(key)) continue;
    if (sourceKeys.has(key)) {
      if (subsetIndex < reorderedSubset.length) {
        result.push(reorderedSubset[subsetIndex++]);
      }
    } else {
      result.push(key);
    }
  }

  for (; subsetIndex < reorderedSubset.length; subsetIndex++) {
    const key = reorderedSubset[subsetIndex];
    if (!result.includes(key)) result.push(key);
  }

  for (const key of TOOL_ORDER_DEFAULT) {
    if (!result.includes(key)) result.push(key);
  }

  return result;
}

function listMatchesKeyOrder(listRoot, keys) {
  const current = readOrderFromList(listRoot);
  return current.length === keys.length && current.every((key, index) => key === keys[index]);
}

function reorderListToKeys(listRoot, keys) {
  if (!listRoot || listMatchesKeyOrder(listRoot, keys)) return;
  keys.forEach((key) => {
    const el = listRoot.querySelector(`[data-tool-key="${key}"]`);
    if (el) listRoot.appendChild(el);
  });
}

export function applyToolOrder(orderIds) {
  const railList = document.getElementById(RAIL_TOOLS_LIST_ID);
  const sidebarList = document.getElementById(SIDEBAR_TOOLS_LIST_ID);
  const seq = orderIds.filter((id) => TOOL_ORDER_DEFAULT.includes(id));
  const trailing = TOOL_ORDER_DEFAULT.filter((id) => !seq.includes(id));
  const finalOrder = [...seq, ...trailing];

  if (railList) {
    reorderListToKeys(railList, finalOrder);
  }

  if (sidebarList) {
    const sidebarOrder = finalOrder.filter((key) => SIDEBAR_TOOL_KEYS.has(key));
    reorderListToKeys(sidebarList, sidebarOrder);
  }
}

function persistToolOrderFromDom(sourceList) {
  const subsetOrder = readOrderFromList(sourceList);
  if (!subsetOrder.length) return;

  const sourceKeys = sourceList.id === RAIL_TOOLS_LIST_ID ? RAIL_TOOL_KEYS : SIDEBAR_TOOL_KEYS;
  const merged = mergeToolOrder(readToolOrder(), subsetOrder, sourceKeys);
  saveToolOrder(merged);
  applyToolOrder(merged);
}

function makeDragSortOptions(listId) {
  let orderBeforeDrag = null;

  return {
    instanceKey: `tool-reorder-${listId}`,
    ignoreSelector: PLUS_BUTTON_IGNORE,
    onDragStart() {
      const list = document.getElementById(listId);
      orderBeforeDrag = list ? readOrderFromList(list).join(',') : null;
      document.body.classList.add('sidebar-tool-reorder-dragging');
    },
    onDragEnd() {
      document.body.classList.remove('sidebar-tool-reorder-dragging');
      orderBeforeDrag = null;
    },
    onReorder() {
      const list = document.getElementById(listId);
      if (!list) return;

      const orderAfterDrag = readOrderFromList(list).join(',');
      if (orderBeforeDrag != null && orderBeforeDrag !== orderAfterDrag) {
        toolDragSuppressClickUntil = performance.now() + 500;
        persistToolOrderFromDom(list);
      }
    },
  };
}

function wireClickSuppression() {
  if (clickSuppressionWired) return;
  clickSuppressionWired = true;

  const suppressIfNeeded = (e) => {
    if (performance.now() >= toolDragSuppressClickUntil) return;
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    if (!target.closest('#rail-tools-list, #sidebar-tools-list')) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  };

  document.addEventListener('click', suppressIfNeeded, true);
  document.addEventListener('pointerup', suppressIfNeeded, true);
}

export function toggleSidebarReorder(enabled) {
  document.body.classList.toggle('sidebar-reorder-enabled', enabled);

  if (enabled) {
    wireClickSuppression();

    if (!railDragInstance) {
      railDragInstance = dragSortModule.enable(
        RAIL_TOOLS_LIST_ID,
        '.tool-reorderable',
        makeDragSortOptions(RAIL_TOOLS_LIST_ID),
      );
    }
    if (!sidebarDragInstance) {
      sidebarDragInstance = dragSortModule.enable(
        SIDEBAR_TOOLS_LIST_ID,
        '.tool-reorderable',
        makeDragSortOptions(SIDEBAR_TOOLS_LIST_ID),
      );
    }
  } else {
    if (railDragInstance) {
      railDragInstance.cleanup();
      railDragInstance = null;
    }
    if (sidebarDragInstance) {
      sidebarDragInstance.cleanup();
      sidebarDragInstance = null;
    }
    document.body.classList.remove('sidebar-tool-reorder-dragging');
  }
}

if (typeof window !== 'undefined') {
  window.toggleSidebarReorder = toggleSidebarReorder;
}

export function initSidebarReorder() {
  applyToolOrder(readToolOrder());

  let enabled = false;
  if (typeof window !== 'undefined' && window.loadUIVis) {
    const state = window.loadUIVis();
    enabled = state['sidebar-tool-reorder'] === true;
  }
  toggleSidebarReorder(enabled);
}
