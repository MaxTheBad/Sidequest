export function manageModalFocus(selector, dismiss, isTopModal = () => true) {
  const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const dialog = document.querySelector(selector);
  if (!(dialog instanceof HTMLElement)) return;
  const controls = () => Array.from(dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]')).filter(element => element instanceof HTMLElement && element.getClientRects().length);
  (controls()[0] || dialog).focus();
  const onKey = event => {
    if (!isTopModal()) return;
    if (event.key === 'Escape') {
      event.preventDefault();event.stopImmediatePropagation();dismiss();
    } else if (event.key === 'Tab') {
      const items=controls();const first=items[0];const last=items[items.length-1];
      if (!items.length) {event.preventDefault();dialog.focus();return;}
      if (event.shiftKey && (document.activeElement===first || !dialog.contains(document.activeElement))) {event.preventDefault();last.focus();}
      else if (!event.shiftKey && (document.activeElement===last || !dialog.contains(document.activeElement))) {event.preventDefault();first.focus();}
    }
  };
  document.addEventListener('keydown',onKey,true);
  return () => {document.removeEventListener('keydown',onKey,true);if(previouslyFocused?.isConnected) previouslyFocused.focus();};
}
