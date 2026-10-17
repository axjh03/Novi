export type CaptureDevice = 'microphone' | 'system' | 'screen';
export type Platform = 'mac' | 'windows' | 'linux';

/** A capture failure in plain words; `details` keeps the browser's own text for anyone who needs it. */
export class DeviceError extends Error {
  constructor(message: string, readonly details: string) { super(message); this.name = 'DeviceError'; }
}

export function currentPlatform(): Platform {
  const name = typeof navigator === 'undefined' ? '' : navigator.platform;
  return /Mac/.test(name) ? 'mac' : /Win/.test(name) ? 'windows' : 'linux';
}

const MAC_SCREEN = 'System Settings › Privacy & Security › Screen & System Audio Recording';
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
const MISSING: Record<CaptureDevice, string> = {
  microphone: 'No microphone was found. Connect one, or choose another input in Settings › Audio & Camera.',
  system: 'No system audio source was found. Choose a loopback input in Settings › Audio & Camera.',
  screen: 'No screen was found to capture.',
};
const BUSY: Record<CaptureDevice, string> = {
  microphone: 'The microphone couldn’t start. Another app may be using it. Close that app, then retry.',
  system: 'System audio couldn’t start. Another app may be using the device. Close that app, then retry.',
  screen: 'Screen capture couldn’t start. Close other apps that are recording the screen, then retry.',
};

/** Turns a getUserMedia/getDisplayMedia failure into one sentence that says what to do. Unknown errors keep their own text. */
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
