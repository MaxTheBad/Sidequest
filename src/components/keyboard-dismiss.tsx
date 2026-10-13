"use client";

import { useEffect, useRef, useState } from "react";

function isEditable(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  return target.matches("input:not([type='button']):not([type='submit']):not([type='checkbox']):not([type='radio']), textarea, select, [contenteditable='true']");
}

export default function KeyboardDismiss() {
  const activeEditor = useRef<HTMLElement | null>(null);
  const baselineHeight = useRef(0);
  const [visible, setVisible] = useState(false);
  const [bottom, setBottom] = useState(96);

  useEffect(() => {
    const viewport = window.visualViewport;
    const updatePosition = () => {
      const viewportHeight = viewport?.height ?? window.innerHeight;
      baselineHeight.current = Math.max(baselineHeight.current, window.innerHeight, viewportHeight);
      const keyboardHeight = Math.max(0, baselineHeight.current - viewportHeight);
      const layoutInset = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
      setBottom(Math.max(12, layoutInset + 12));
      setVisible(Boolean(activeEditor.current) && keyboardHeight >= 80);
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!isEditable(event.target)) return;
      activeEditor.current = event.target;
      baselineHeight.current = Math.max(baselineHeight.current, window.innerHeight, viewport?.height ?? 0);
      requestAnimationFrame(updatePosition);
    };
    const onFocusOut = () => window.setTimeout(() => {
      if (!isEditable(document.activeElement)) setVisible(false);
    }, 0);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    viewport?.addEventListener("resize", updatePosition);
    viewport?.addEventListener("scroll", updatePosition);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      viewport?.removeEventListener("resize", updatePosition);
      viewport?.removeEventListener("scroll", updatePosition);
    };
  }, []);

  if (!visible) return null;
  return (
    <button
      type="button"
      className="keyboard-dismiss-control"
      style={{ bottom }}
      onPointerDown={(event) => event.preventDefault()}
      onClick={() => {
        activeEditor.current?.blur();
        activeEditor.current = null;
        setVisible(false);
      }}
      aria-label="Close keyboard"
    >
      <span aria-hidden="true">⌄</span> Done
    </button>
  );
}
