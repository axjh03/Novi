/**
 * Plain-language messages for microphone, system-audio and screen-capture failures.
 *
 * When the browser can't start a capture it throws a DOMException with a technical name such as
 * "NotAllowedError" or "NotReadableError". Those mean nothing to someone who is nervous and short on
 * time. This file turns them into one sentence that says what to do, worded for the user's operating
 * system, while keeping the original browser text in `details` for support and debugging.
 *
 * Used by Get ready (SessionPreflight) and by live listening (interviewAudio).
 */

/** Which capture failed. "system" means system audio (what the computer is playing). */
export type CaptureDevice = 'microphone' | 'system' | 'screen';
/** The operating system, used to point at the right settings screen. */
export type Platform = 'mac' | 'windows' | 'linux';

/**
 * A capture failure that has already been turned into plain words.
 *
 * `message` is the sentence shown to the user. `details` is the browser's original error (for
 * example "NotAllowedError: Permission denied"), shown only inside a collapsed "Details" section,
 * or empty when the message already is the original text.
 */
export class DeviceError extends Error {
  constructor(message: string, readonly details: string) { super(message); this.name = 'DeviceError'; }
}

/**
 * Works out the operating system from `navigator.platform`.
 * Anything that isn't macOS or Windows is treated as Linux. Outside a browser (tests) it returns 'linux'.
 */
export function currentPlatform(): Platform {
  const name = typeof navigator === 'undefined' ? '' : navigator.platform;
  return /Mac/.test(name) ? 'mac' : /Win/.test(name) ? 'windows' : 'linux';
}

/** The macOS settings path that controls both screen recording and system audio for Novi. */
const MAC_SCREEN = 'System Settings › Privacy & Security › Screen & System Audio Recording';

/**
 * Messages for "permission was refused" (NotAllowedError, SecurityError, PermissionDeniedError),
 * per device and operating system. macOS needs a restart after the permission is granted.
 */
const BLOCKED: Record<CaptureDevice, Record<Platform, string>> = {
  microphone: {
    mac: 'Microphone access is blocked. Turn on Novi in System Settings › Privacy & Security › Microphone, then restart Novi.',
    windows: 'Microphone access is blocked. In Settings › Privacy & security › Microphone, allow desktop apps to use the microphone, then restart Novi.',
    linux: 'Microphone access is blocked. Check your desktop’s privacy settings for the microphone, then retry.',
  },
  system: {
    mac: `System audio capture is blocked. Turn on Novi in ${MAC_SCREEN}, then restart Novi.`,
    windows: 'System audio capture was cancelled or blocked. Retry and allow sharing when asked.',
    linux: 'System audio capture was cancelled or blocked. Retry and allow sharing when asked.',
  },
  screen: {
    mac: `Screen capture is blocked. Turn on Novi in ${MAC_SCREEN}, then restart Novi.`,
    windows: 'Screen capture was cancelled or blocked. Retry and choose a screen when asked.',
    linux: 'Screen capture was cancelled or blocked. Retry and choose a screen when asked.',
  },
};

/** Messages for "no such device" (NotFoundError, DevicesNotFoundError, OverconstrainedError). */
const MISSING: Record<CaptureDevice, string> = {
  microphone: 'No microphone was found. Connect one, or choose another input in Settings › Audio & Camera.',
  system: 'No system audio source was found. Choose a loopback input in Settings › Audio & Camera.',
  screen: 'No screen was found to capture.',
};

/** Messages for "the device exists but couldn't start" (NotReadableError, TrackStartError, AbortError), usually because another app holds it. */
const BUSY: Record<CaptureDevice, string> = {
  microphone: 'The microphone couldn’t start. Another app may be using it. Close that app, then retry.',
  system: 'System audio couldn’t start. Another app may be using the device. Close that app, then retry.',
  screen: 'Screen capture couldn’t start. Close other apps that are recording the screen, then retry.',
};

/**
 * Turns a getUserMedia / getDisplayMedia failure into a `DeviceError` with one sentence that says what to do.
 *
 * - An error that is already a `DeviceError` is returned unchanged, so wrapping twice is harmless.
 * - Known browser error names map to the BLOCKED, MISSING or BUSY message for this device (and,
 *   for BLOCKED, this operating system).
 * - Anything else keeps its own message (or "Capture is unavailable." when it has none), because a
 *   guessed instruction would be worse than the real text.
 *
 * @param device   which capture failed.
 * @param cause    the error the browser threw.
 * @param platform the operating system; defaults to the current one (tests pass it explicitly).
 * @returns a DeviceError whose `details` holds "Name: original message", or '' when the message is the original.
 */
export function deviceError(device: CaptureDevice, cause: unknown, platform: Platform = currentPlatform()): DeviceError {
  if (cause instanceof DeviceError) return cause;
  const name = cause instanceof Error ? cause.name : '';
  const raw = cause instanceof Error ? cause.message : String(cause ?? '');
  const details = name && name !== 'Error' ? `${name}: ${raw}` : raw;
  const message = /^(NotAllowedError|SecurityError|PermissionDeniedError)$/.test(name) ? BLOCKED[device][platform]
    : /^(NotFoundError|DevicesNotFoundError|OverconstrainedError)$/.test(name) ? MISSING[device]
    : /^(NotReadableError|TrackStartError|AbortError)$/.test(name) ? BUSY[device]
    : raw || 'Capture is unavailable.';
  return new DeviceError(message, message === raw ? '' : details);
}
