import { useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Move a live page between desktop and floating panels without losing its form state. */
export function SurfacePortal({ target, children }: { target: HTMLElement | null; children: ReactNode }) {
  const [root] = useState(() => {
    const element = document.createElement('div');
    element.className = 'surface-portal';
    return element;
  });
  useLayoutEffect(() => {
    target?.append(root);
    return () => root.remove();
  }, [root, target]);
  return createPortal(children, root);
}
