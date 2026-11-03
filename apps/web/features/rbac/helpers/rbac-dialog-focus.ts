/** Keep keyboard navigation inside the review and return to its trigger on close. */
export function bindDialogFocus(dialog: HTMLElement, onClose: () => void) {
  const ownerDocument = dialog.ownerDocument;
  const previousFocus = ownerDocument.activeElement as HTMLElement | null;
  const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ));
  (focusable()[0] ?? dialog).focus();
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const elements = focusable();
    const first = elements[0] ?? dialog;
    const last = elements.at(-1) ?? dialog;
    if (!dialog.contains(ownerDocument.activeElement) || (event.shiftKey ? ownerDocument.activeElement === first : ownerDocument.activeElement === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  };
  ownerDocument.addEventListener("keydown", handleKeyDown);
  return () => {
    ownerDocument.removeEventListener("keydown", handleKeyDown);
    if (previousFocus?.isConnected) previousFocus.focus();
    // Saving can disable the review trigger; native focus() then does nothing.
    // Module search remains enabled and mounted throughout the editor lifecycle.
    if (!previousFocus?.isConnected || ownerDocument.activeElement !== previousFocus) {
      ownerDocument.getElementById("rbac-module-search")?.focus();
    }
  };
}
