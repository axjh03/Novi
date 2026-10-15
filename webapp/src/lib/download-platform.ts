export type DesktopPlatform = 'mac' | 'windows' | 'linux';

export function detectDesktopPlatform(userAgent: string, maxTouchPoints = 0): DesktopPlatform | null {
  // iPad desktop mode reports Macintosh; mobile systems must not get desktop badges.
  if (/android|iphone|ipad|ipod|mobile|cros/i.test(userAgent) || (/macintosh/i.test(userAgent) && maxTouchPoints > 1)) return null;
  if (/windows nt/i.test(userAgent)) return 'windows';
  if (/macintosh|mac os x/i.test(userAgent)) return 'mac';
  if (/linux|x11/i.test(userAgent)) return 'linux';
  return null;
}
