const deferredReplaceTimers = new WeakMap();

export function deferReplaceChildren(rootElement, ...children) {
  clearTimeout(deferredReplaceTimers.get(rootElement));

  // Defer replacement so access-button dwell handlers can finish before
  // the currently active element is removed from the DOM.
  const timer = setTimeout(() => {
    if (!rootElement.isConnected) return;

    rootElement.replaceChildren(...children);
    deferredReplaceTimers.delete(rootElement);
  }, 0);

  deferredReplaceTimers.set(rootElement, timer);
}
