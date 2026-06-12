// ============================================
// Sidebar / icon-rail tool reorder (SortableJS)
// ============================================

import Storage from './storage.js';

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

const LIST_EDGE_SLACK_PX = 48;

const SIDEBAR_TOOLS_LIST_ID = 'sidebar-tools-list';
const RAIL_TOOLS_LIST_ID = 'rail-tools-list';

let railSortable = null;
let sidebarSortable = null;
let toolDragSuppressClickUntil = 0;
let clickSuppressionWired = false;

function motionReduced() {
  if (typeof window.matchMedia === 'function') {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
  }
  const scale = document.documentElement.style.getPropertyValue('--motion-scale');
  if (scale === '0') return true;
  return document.documentElement.getAttribute('data-motion') === 'reduced';
}

function coarsePointer() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

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

function setListDragging(listRoot, active) {
  if (!listRoot) return;
  listRoot.classList.toggle('tool-reorder-is-dragging', Boolean(active));
}

const SORTABLE_DRAG_CLASSES = [
  'tool-sortable-ghost',
  'tool-sortable-chosen',
  'tool-sortable-drag',
  'tool-sortable-fallback',
];

const DRAG_INLINE_STYLE_PROPS = [
  'opacity',
  'visibility',
  'transform',
  'webkitTransform',
  'transition',
  'height',
  'minHeight',
  'paddingTop',
  'paddingBottom',
  'margin',
  'overflow',
];

function clearSortableDragClasses(listRoot) {
  if (!listRoot) return;
  listRoot.querySelectorAll('.tool-reorderable').forEach((el) => {
    SORTABLE_DRAG_CLASSES.forEach((cls) => el.classList.remove(cls));
    DRAG_INLINE_STYLE_PROPS.forEach((prop) => el.style.removeProperty(prop));
  });
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
  const railList = document.getElementById('rail-tools-list');
  const sidebarList = document.getElementById('sidebar-tools-list');
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

function persistToolOrderFromDom(sourceList, deferApplyMs = 0) {
  const subsetOrder = readOrderFromList(sourceList);
  if (!subsetOrder.length) return;

  const sourceKeys = sourceList.id === RAIL_TOOLS_LIST_ID ? RAIL_TOOL_KEYS : SIDEBAR_TOOL_KEYS;
  const merged = mergeToolOrder(readToolOrder(), subsetOrder, sourceKeys);
  saveToolOrder(merged);

  const apply = () => applyToolOrder(merged);
  if (deferApplyMs > 0) {
    window.setTimeout(apply, deferApplyMs);
  } else {
    apply();
  }
}

function createSortableOptions(listRoot) {
  const reduceMotionUi = motionReduced();
  const touchUi = coarsePointer();
  const isSidebarList = listRoot.id === SIDEBAR_TOOLS_LIST_ID;
  const isRailList = listRoot.id === RAIL_TOOLS_LIST_ID;
  const animationMs = reduceMotionUi ? 0 : 240;
  // Sidebar rows use touch-action: pan-y for scroll; forceFallback follows the pointer.
  const useFallback = true;

  return {
    animation: animationMs,
    easing: 'cubic-bezier(0.25, 1, 0.32, 1)',
    draggable: '.tool-reorderable',
    dataIdAttr: 'data-tool-key',
    filter: '.list-item-plus-btn, .list-item-plus-icon, .list-item-plus-label',
    preventOnFilter: true,
    ghostClass: 'tool-sortable-ghost',
    chosenClass: 'tool-sortable-chosen',
    dragClass: 'tool-sortable-drag',
    fallbackClass: 'tool-sortable-fallback',
    direction: 'vertical',
    swapThreshold: isSidebarList ? 0.5 : 0.65,
    invertSwap: false,
    emptyInsertThreshold: (isSidebarList || isRailList) ? LIST_EDGE_SLACK_PX : 5,
    delay: touchUi ? 120 : 0,
    delayOnTouchOnly: true,
    forceFallback: useFallback,
    fallbackOnBody: useFallback,
    fallbackTolerance: useFallback ? 3 : 0,
    onStart() {
      setListDragging(listRoot, true);
      document.body.classList.add('sidebar-tool-reorder-dragging');
    },
    onEnd(evt) {
      const moved = evt.oldIndex != null
        && evt.newIndex != null
        && evt.oldIndex !== evt.newIndex;

      document.body.classList.remove('sidebar-tool-reorder-dragging');
      setListDragging(listRoot, false);

      const animatingDrop = moved && animationMs > 0;
      if (!animatingDrop) {
        clearSortableDragClasses(listRoot);
      }

      if (moved) {
        toolDragSuppressClickUntil = performance.now() + 500;
        const deferPersist = animationMs > 0 ? animationMs : 0;
        persistToolOrderFromDom(listRoot, deferPersist);
      }
      window.setTimeout(
        () => clearSortableDragClasses(listRoot),
        animatingDrop ? animationMs + 50 : 0,
      );
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
  const body = document.body;
  body.classList.toggle('sidebar-reorder-enabled', enabled);

  const railList = document.getElementById('rail-tools-list');
  const sidebarList = document.getElementById('sidebar-tools-list');

  if (enabled) {
    if (typeof window.Sortable !== 'function') {
      console.warn(
        'SortableJS did not load. Sidebar tool reorder is disabled until it succeeds.',
      );
      return;
    }

    wireClickSuppression();

    if (railList && !railSortable) {
      railSortable = window.Sortable.create(railList, createSortableOptions(railList));
    }
    if (sidebarList && !sidebarSortable) {
      sidebarSortable = window.Sortable.create(sidebarList, createSortableOptions(sidebarList));
    }
  } else {
    if (railSortable) {
      railSortable.destroy();
      railSortable = null;
    }
    if (sidebarSortable) {
      sidebarSortable.destroy();
      sidebarSortable = null;
    }
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
