/**
 * Outside-click dismissal for panels that contain portalled popups.
 *
 * Lives in its own module rather than beside the toolbar so it can be imported by tests without
 * tripping the fast-refresh rule, which allows a component file to export components only.
 */

/** Marker the `Select` atom stamps on its portal container and positioner. */
const PORTAL_MARKER_ATTRIBUTE = "data-gvui-portal";

/**
 * Roles every floating surface we can land on already carries. Matching these as well as the
 * explicit marker keeps the guard correct for popups we do not own (native menus, nested dialogs)
 * without reaching for a third-party internal class name.
 */
const PORTAL_ROLES = new Set(["listbox", "menu", "dialog"]);

/** The slice of an element the dismiss guard reads, kept structural so it is exercisable in
 * Bun's DOM-less test runtime. */
interface AttributeReader {
  getAttribute(name: string): string | null;
}

function readsAttributes(value: unknown): value is AttributeReader {
  return (
    typeof value === "object" &&
    value !== null &&
    "getAttribute" in value &&
    typeof value.getAttribute === "function"
  );
}

function hasParentNode(value: unknown): value is { readonly parentNode: unknown } {
  return typeof value === "object" && value !== null && "parentNode" in value;
}

function isPortalSurface(value: unknown): boolean {
  if (!readsAttributes(value)) return false;
  if (value.getAttribute(PORTAL_MARKER_ATTRIBUTE) !== null) return true;
  const role = value.getAttribute("role");
  return role !== null && PORTAL_ROLES.has(role);
}

/**
 * Events the dismiss guard inspects. A real `MouseEvent` satisfies this shape; the path entries
 * stay `unknown` because the guard only ever compares identity and duck-types attribute reads.
 */
export interface DismissPointerEvent {
  readonly target: unknown;
  readonly composedPath?: () => readonly unknown[];
}

function resolveEventPath(event: DismissPointerEvent): readonly unknown[] {
  if (typeof event.composedPath === "function") {
    const composed = event.composedPath();
    if (composed.length > 0) return composed;
  }

  // Pre-`composedPath` fallback: walk the target's ancestors by hand so the guard still sees the
  // popup wrapper rather than only the clicked option.
  const ancestors: unknown[] = [];
  let current: unknown = event.target;
  while (current !== null && current !== undefined) {
    ancestors.push(current);
    current = hasParentNode(current) ? current.parentNode : null;
  }
  return ancestors;
}

/**
 * Builds the document-level `mousedown` guard for a dismissable panel.
 *
 * A plain `panel.contains(event.target)` check is wrong here: the panel's `Select` popups render
 * through a portal rooted at `document.body`, so clicking an option reads as an outside click. The
 * panel then unmounts before Base UI commits the value change, which is why the dropdowns looked
 * inert. Anything on the event path that is the panel itself, or a portalled popup surface, counts
 * as inside.
 */
export function createPanelDismissHandler(
  getPanel: () => unknown,
  onDismiss: () => void,
): (event: DismissPointerEvent) => void {
  return (event) => {
    const panel = getPanel();
    const hasPanel = panel !== null && panel !== undefined;
    for (const entry of resolveEventPath(event)) {
      if (hasPanel && entry === panel) return;
      if (isPortalSurface(entry)) return;
    }
    onDismiss();
  };
}
