// DOM removal/movement does not reliably emit mouseleave. Re-test after each commit.
export function createOverlayInput(
  hitTest: (x: number, y: number) => boolean,
  setIgnoreMouse: (ignore: boolean) => void,
) {
  let pointer: { x: number; y: number } | null = null;
  let ignored: boolean | undefined;
  const apply = (ignore: boolean) => {
    if (ignore === ignored) return;
    ignored = ignore;
    setIgnoreMouse(ignore);
  };
  const refresh = (dragging = false) => {
    apply(!(dragging || (pointer && hitTest(pointer.x, pointer.y))));
  };
  return {
    refresh,
    move(x: number, y: number, dragging = false) {
      pointer = { x, y };
      refresh(dragging);
    },
    reset() {
      pointer = null;
      apply(true);
    },
  };
}
