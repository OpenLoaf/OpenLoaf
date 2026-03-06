/**
 * Automatically detects Radix UI overlay elements (Dialog, Sheet, DropdownMenu, etc.)
 * mounted to document.body via Portal and dispatches `openloaf:overlay` events.
 *
 * This allows ElectrronBrowserWindow to hide/show WebContentsView without
 * requiring every overlay component to manually dispatch events.
 */

const OVERLAY_SLOTS = new Set([
  'dialog-overlay',
  'dialog-content',
  'alert-dialog-overlay',
  'alert-dialog-content',
  'sheet-overlay',
  'sheet-content',
  'dropdown-menu-content',
  'context-menu-content',
  'popover-content',
])

const OVERLAY_ROLES = new Set(['dialog', 'alertdialog', 'menu', 'listbox'])

const EXCLUDED_SLOTS = new Set(['tooltip-content'])

let nextId = 1
const trackedElements = new WeakMap<Node, string>()

function isOverlayElement(el: Element): boolean {
  const slot = el.getAttribute('data-slot')
  if (slot) {
    if (EXCLUDED_SLOTS.has(slot)) return false
    if (OVERLAY_SLOTS.has(slot)) return true
  }
  const role = el.getAttribute('role')
  if (role && OVERLAY_ROLES.has(role)) return true
  if (el.hasAttribute('data-radix-popper-content-wrapper')) return true
  return false
}

function checkNode(node: Node): boolean {
  if (!(node instanceof Element)) return false
  if (isOverlayElement(node)) return true
  // Portal container div may not have data-slot itself; check first-level children
  for (const child of node.children) {
    if (isOverlayElement(child)) return true
  }
  return false
}

function dispatchOverlayEvent(id: string, open: boolean) {
  window.dispatchEvent(
    new CustomEvent('openloaf:overlay', {
      detail: { id, open },
    }),
  )
}

function trackNode(node: Node) {
  if (trackedElements.has(node)) return
  if (!checkNode(node)) return
  const id = `overlay-detector-${nextId++}`
  trackedElements.set(node, id)
  dispatchOverlayEvent(id, true)
}

function untrackNode(node: Node) {
  const id = trackedElements.get(node)
  if (!id) return
  trackedElements.delete(node)
  dispatchOverlayEvent(id, false)
}

export function initOverlayDetector(): (() => void) | undefined {
  if (typeof document === 'undefined') return undefined

  // Scan existing body children on init
  for (const child of document.body.children) {
    trackNode(child)
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        trackNode(node)
      }
      for (const node of mutation.removedNodes) {
        untrackNode(node)
      }
    }
  })

  observer.observe(document.body, { childList: true })

  return () => {
    observer.disconnect()
  }
}
