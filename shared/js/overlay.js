// Explicit element references keep this usable with any page's IDs.
export function createOverlay({ element, title, detail, action }) {
  return {
    show({ heading = '', description = '', actionLabel = '', ready = false } = {}) {
      element.hidden = false;
      element.classList.toggle('ready', ready);
      title.textContent = heading;
      detail.textContent = description;
      action.hidden = !actionLabel;
      action.textContent = actionLabel;
    },
    hide() { element.hidden = true; },
    focus() { action.focus({ preventScroll: true }); },
  };
}
