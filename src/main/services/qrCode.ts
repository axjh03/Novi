import QRCode from 'qrcode';

export function generateQRCodeSVG(
  text: string,
  options: { size?: number; margin?: number; darkColor?: string; lightColor?: string } = {}
): string {
  const sizePx = options.size || 220;
  const margin = options.margin ?? 3;
  const dark = options.darkColor || '#000000';
  const light = options.lightColor || '#ffffff';

  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const N = qr.modules.size;
  const totalSize = N + margin * 2;
  const rects: string[] = [];

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (qr.modules.get(r, c)) {
        rects.push(`<rect x="${c + margin}" y="${r + margin}" width="1" height="1" fill="${dark}" />`);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges">
  <rect width="100%" height="100%" fill="${light}" />
  ${rects.join('\n  ')}
</svg>`;
}


