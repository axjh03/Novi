import { BrowserWindow, desktopCapturer, screen } from 'electron';

export async function captureScreenBuffer(
  getMainWindow?: () => BrowserWindow | null,
  targetDisplayId?: number | null
): Promise<Buffer> {
  // 1. Temporarily hide all app windows and enable content protection so Novi never appears in the screenshot
  const allWindows = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w.isVisible());
  const savedState = new Map<BrowserWindow, { opacity: number; wasFocused: boolean; contentProtected: boolean }>();

  for (const win of allWindows) {
    const cp = typeof (win as any).isContentProtected === 'function' ? (win as any).isContentProtected() : false;
    savedState.set(win, {
      opacity: win.getOpacity(),
      wasFocused: win.isFocused(),
      contentProtected: cp,
    });
    // Set content protection so OS window manager / DWM natively excludes it from capture
    try { win.setContentProtection(true); } catch {}
    // Set opacity to 0 and hide window to ensure DWM compositor excludes it completely
    try { win.setOpacity(0); } catch {}
    try { win.hide(); } catch {}
  }

  // Allow DWM / window manager to composite the frame without our windows
  await new Promise((resolve) => setTimeout(resolve, 100));

  try {
    const allDisplays = screen.getAllDisplays();
    const primary = screen.getPrimaryDisplay();

    // Prioritize explicitly selected Working Monitor, then display matching window, then primary
    let targetDisplay = allDisplays.find((d) => d.id === targetDisplayId);
    if (!targetDisplay) {
      const mainWin = getMainWindow ? getMainWindow() : null;
      if (mainWin && !mainWin.isDestroyed()) {
        targetDisplay = screen.getDisplayMatching(mainWin.getBounds()) || primary;
      } else {
        targetDisplay = primary;
      }
    }

    const scale = targetDisplay.scaleFactor || 1;
    const width = Math.round(targetDisplay.bounds.width * scale);
    const height = Math.round(targetDisplay.bounds.height * scale);

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height },
    });

    if (!sources.length) {
      throw new Error('No screen display available for capture.');
    }

    // Match source by display_id or screen id or display index
    let source = sources.find((s) => s.display_id === String(targetDisplay.id));
    if (!source) {
      source = sources.find((s) => s.id === `screen:${targetDisplay.id}:0` || s.id.includes(String(targetDisplay.id)));
    }
    if (!source) {
      const displayIndex = allDisplays.findIndex((d) => d.id === targetDisplay.id);
      if (displayIndex >= 0 && sources[displayIndex]) {
        source = sources[displayIndex];
      } else {
        source = sources[0];
      }
    }

    return source.thumbnail.toPNG();
  } finally {
    // 2. Restore all windows, opacity, content protection, and focus immediately
    for (const [win, state] of savedState.entries()) {
      if (!win.isDestroyed()) {
        try {
          win.show();
          win.setOpacity(state.opacity);
          try { win.setContentProtection(state.contentProtected); } catch {}
          if (state.wasFocused) {
            win.focus();
          }
        } catch {}
      }
    }
  }
}
