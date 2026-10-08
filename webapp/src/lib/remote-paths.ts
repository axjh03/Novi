export function parentPath(path: string): string | null {
  if (!path || path.startsWith(':') || path === '/') return null;
  const separator = path.includes('\\') ? '\\' : '/';
  const trimmed = path.replace(/[\\/]+$/, '');
  const drive = trimmed.match(/^[A-Za-z]:/)?.[0];
  if (drive && trimmed.length === drive.length) return null;
  const index = trimmed.lastIndexOf(separator);
  if (separator === '\\' && drive && index <= drive.length) return `${drive}\\`;
  if (separator === '/' && index <= 0) return '/';
  return index >= 0 ? trimmed.slice(0, index) : null;
}
