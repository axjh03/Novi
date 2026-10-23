import { BrowserWindow, desktopCapturer, screen, systemPreferences, type Rectangle } from 'electron';

let captureQueue: Promise<unknown> = Promise.resolve();

export function captureScreenBuffer(getMainWindow?: () => BrowserWindow | null, targetDisplayId?: number | null, sampleBounds?: Rectangle, restoreFocus = true): Promise<Buffer> {
  const capture = captureQueue.then(() => captureScreen(getMainWindow, targetDisplayId, sampleBounds, restoreFocus));
  captureQueue = capture.catch(() => {});
  return capture;
}

async function captureScreen(
  getMainWindow?: () => BrowserWindow | null,
  targetDisplayId?: number | null,
  sampleBounds?: Rectangle,
  restoreFocus = true,
): Promise<Buffer> {
  if (sampleBounds && process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('screen') !== 'granted') {
    throw new Error('Allow Screen Recording for Novi before enabling Smart colors.');
  }
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
    if (!sampleBounds) try { win.setContentProtection(true); } catch {}
    // Windows excludes protected windows natively. Else briefly clear their opacity for background sampling without changing focus.
    if (!sampleBounds || process.platform !== 'win32') try { win.setOpacity(0); } catch {}
    // shortcut: Linux opacity is unsupported, so sampling briefly hides windows; use native exclusion if Linux gains support.
    if (!sampleBounds || process.platform === 'linux') try { win.hide(); } catch {}
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
      thumbnailSize: sampleBounds ? { width: 320, height: Math.max(1, Math.round(320 * height / width)) } : { width, height },
    });

    if (!sources.length) {
      throw new Error('No screen display available for capture.');
    }

    // Match source by display_id or screen id or display index
    let source = sources.find((s) => s.display_id === String(targetDisplay.id));
    if (sampleBounds && !source && (allDisplays.length > 1 || sources.length > 1)) throw new Error('Could not identify the display behind Novi.');
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

    if (sampleBounds) {
      if (source.thumbnail.isEmpty()) throw new Error('Screen capture is unavailable. Check screen recording permission.');
      const size = source.thumbnail.getSize(), display = targetDisplay.bounds;
      const left = Math.max(0, Math.floor((sampleBounds.x - display.x) * size.width / display.width));
      const top = Math.max(0, Math.floor((sampleBounds.y - display.y) * size.height / display.height));
      const right = Math.min(size.width, Math.ceil((sampleBounds.x + sampleBounds.width - display.x) * size.width / display.width));
      const bottom = Math.min(size.height, Math.ceil((sampleBounds.y + sampleBounds.height - display.y) * size.height / display.height));
      if (right <= left || bottom <= top) throw new Error('Novi is outside the captured display.');
      return source.thumbnail.crop({ x: left, y: top, width: right - left, height: bottom - top }).resize({ width: 16, height: 16 }).toPNG();
    }
    return source.thumbnail.toPNG();
  } finally {
    // 2. Restore all windows, opacity, content protection, and focus immediately
    for (const [win, state] of savedState.entries()) {
      if (!win.isDestroyed()) {
        try {
          if (!sampleBounds || process.platform === 'linux') { if (restoreFocus) win.show(); else win.showInactive(); }
          win.setOpacity(state.opacity);
          if (!sampleBounds) try { win.setContentProtection(state.contentProtected); } catch {}
          if ((!sampleBounds || process.platform === 'linux') && state.wasFocused) {
            win.focus();
          }
        } catch {}
      }
    }
  }
}
