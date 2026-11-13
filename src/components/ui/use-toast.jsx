import { useEffect, useState } from "react";

const TOAST_LIMIT = 3;
const DEFAULT_DURATION = 4000;

let count = 0;
let memoryState = { toasts: [] };
const listeners = new Set();

function setState(next) {
  memoryState = next;
  listeners.forEach((listener) => listener(memoryState));
}

function dismiss(id) {
  setState({ toasts: memoryState.toasts.filter((t) => t.id !== id) });
}

function toast({ duration = DEFAULT_DURATION, ...props }) {
  const id = String(++count);
  setState({ toasts: [{ ...props, id }, ...memoryState.toasts].slice(0, TOAST_LIMIT) });
  setTimeout(() => dismiss(id), duration);
  return { id, dismiss: () => dismiss(id) };
}

function useToast() {
  const [state, setLocal] = useState(memoryState);
  useEffect(() => {
    listeners.add(setLocal);
    return () => listeners.delete(setLocal);
  }, []);
  return { ...state, toast, dismiss };
}

export { useToast, toast };
