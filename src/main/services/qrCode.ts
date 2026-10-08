// Pure TypeScript, zero-dependency QR code SVG generator (ISO/IEC 18004 Model 2)
// Generates standard QR Code SVG strings for URLs and session pairing text.

type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

// Galois field tables for GF(256)
const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP_TABLE[i] = x;
  EXP_TABLE[i + 255] = x;
  LOG_TABLE[x] = i;
  x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
}

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]];
}

function getGeneratorPolynomial(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], EXP_TABLE[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function calculateEC(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = getGeneratorPolynomial(ecCount);
  const res = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ res[0];
    for (let j = 0; j < ecCount - 1; j++) {
      res[j] = res[j + 1] ^ gfMul(gen[j + 1], factor);
    }
    res[ecCount - 1] = gfMul(gen[ecCount], factor);
  }
  return res;
}

// Version table parameters [capacityBytes, ecBytes, totalModules]
const VERSION_SPECS = [
  { version: 1, capacity: 19, ecCount: 7, size: 21 },
  { version: 2, capacity: 34, ecCount: 10, size: 25 },
  { version: 3, capacity: 55, ecCount: 15, size: 29 },
  { version: 4, capacity: 80, ecCount: 20, size: 33 },
  { version: 5, capacity: 108, ecCount: 26, size: 37 },
  { version: 6, capacity: 136, ecCount: 18, size: 41 },
];

export function generateQRCodeSVG(text: string, options: { size?: number; margin?: number; darkColor?: string; lightColor?: string } = {}): string {
  const sizePx = options.size || 220;
  const margin = options.margin ?? 3;
  const dark = options.darkColor || '#000000';
  const light = options.lightColor || '#ffffff';

  const bytes = new TextEncoder().encode(text);
  const spec = VERSION_SPECS.find(s => s.capacity >= bytes.length + 3) || VERSION_SPECS[VERSION_SPECS.length - 1];
  const N = spec.size;

  // Initialize N x N grid (0 = unset, 1 = dark, -1 = light)
  const matrix: number[][] = Array.from({ length: N }, () => Array(N).fill(0));
  const isFunction: boolean[][] = Array.from({ length: N }, () => Array(N).fill(false));

  function setModule(r: number, c: number, darkMod: boolean) {
    if (r >= 0 && r < N && c >= 0 && c < N) {
      matrix[r][c] = darkMod ? 1 : -1;
      isFunction[r][c] = true;
    }
  }

  // 1. Finder patterns (top-left, top-right, bottom-left)
  function drawFinder(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const isBorder = r === -1 || r === 7 || c === -1 || c === 7;
        const isOuter = r === 0 || r === 6 || c === 0 || c === 6;
        const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        const val = !isBorder && (isOuter || isInner);
        setModule(row + r, col + c, val);
      }
    }
  }
  drawFinder(0, 0);
  drawFinder(0, N - 7);
  drawFinder(N - 7, 0);

  // 2. Timing patterns
  for (let i = 8; i < N - 8; i++) {
    setModule(6, i, i % 2 === 0);
    setModule(i, 6, i % 2 === 0);
  }

  // 3. Alignment patterns for version >= 2
  if (spec.version >= 2) {
    const alignPos = spec.version === 2 ? [6, 18] : spec.version === 3 ? [6, 22] : [6, 26];
    for (const r of alignPos) {
      for (const c of alignPos) {
        if (isFunction[r][c]) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isO = Math.abs(dr) === 2 || Math.abs(dc) === 2;
            const isC = dr === 0 && dc === 0;
            setModule(r + dr, c + dc, isO || isC);
          }
        }
      }
    }
  }

  // 4. Reserve format information areas
  for (let i = 0; i < 9; i++) {
    if (!isFunction[8][i]) { matrix[8][i] = 0; isFunction[8][i] = true; }
    if (!isFunction[i][8]) { matrix[i][8] = 0; isFunction[i][8] = true; }
  }
  for (let i = 0; i < 8; i++) {
    if (!isFunction[8][N - 1 - i]) { matrix[8][N - 1 - i] = 0; isFunction[8][N - 1 - i] = true; }
    if (!isFunction[N - 1 - i][8]) { matrix[N - 1 - i][8] = 0; isFunction[N - 1 - i][8] = true; }
  }
  setModule(N - 8, 8, true); // Dark module

  // 5. Encode data bits (Byte mode: 0100)
  const bitStream: number[] = [];
  function pushBits(val: number, len: number) {
    for (let i = len - 1; i >= 0; i--) bitStream.push((val >> i) & 1);
  }
  pushBits(0b0100, 4); // Byte mode indicator
  pushBits(bytes.length, 8); // Character count indicator (8 bits for V1-V9)
  for (let i = 0; i < bytes.length; i++) pushBits(bytes[i], 8);

  // Terminator & padding to capacity
  const maxBits = spec.capacity * 8;
  const termLen = Math.min(4, maxBits - bitStream.length);
  pushBits(0, termLen);
  while (bitStream.length % 8 !== 0) bitStream.push(0);
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bitStream.length < maxBits) {
    pushBits(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  // Convert bits to byte array
  const dataBytes = new Uint8Array(spec.capacity);
  for (let i = 0; i < spec.capacity; i++) {
    let b = 0;
    for (let bit = 0; bit < 8; bit++) b = (b << 1) | bitStream[i * 8 + bit];
    dataBytes[i] = b;
  }

  // Compute Error Correction
  const ecBytes = calculateEC(dataBytes, spec.ecCount);
  const fullBytes = new Uint8Array(dataBytes.length + ecBytes.length);
  fullBytes.set(dataBytes);
  fullBytes.set(ecBytes, dataBytes.length);

  // Expand full message to bits
  const finalBits: number[] = [];
  for (let i = 0; i < fullBytes.length; i++) {
    for (let bit = 7; bit >= 0; bit--) finalBits.push((fullBytes[i] >> bit) & 1);
  }

  // 6. Place data bits in matrix (Right-to-left zigzag)
  let bitIndex = 0;
  let dir = -1; // Going up
  let col = N - 1;
  while (col > 0) {
    if (col === 6) col--; // Skip vertical timing column
    const rows = dir === -1 ? Array.from({ length: N }, (_, i) => N - 1 - i) : Array.from({ length: N }, (_, i) => i);
    for (const r of rows) {
      for (const c of [col, col - 1]) {
        if (!isFunction[r][c]) {
          const bit = bitIndex < finalBits.length ? finalBits[bitIndex++] : 0;
          // Apply mask pattern 0: (row + col) % 2 === 0
          const mask = (r + c) % 2 === 0;
          matrix[r][c] = (bit ^ (mask ? 1 : 0)) === 1 ? 1 : -1;
        }
      }
    }
    dir = -dir;
    col -= 2;
  }

  // 7. Write format bits for mask 0, EC level L (01) -> 0x77c4 format string
  const formatBits = 0b111011111000100; // Format info for L + Mask 0 with BCH error code
  for (let i = 0; i < 15; i++) {
    const bit = ((formatBits >> i) & 1) === 1;
    if (i < 6) matrix[8][i] = bit ? 1 : -1;
    else if (i === 6) matrix[8][7] = bit ? 1 : -1;
    else if (i === 7) matrix[8][8] = bit ? 1 : -1;
    else if (i === 8) matrix[7][8] = bit ? 1 : -1;
    else matrix[14 - i][8] = bit ? 1 : -1;

    if (i < 8) matrix[N - 1 - i][8] = bit ? 1 : -1;
    else matrix[8][N - 15 + i] = bit ? 1 : -1;
  }

  // 8. Render crisp SVG
  const totalSize = N + margin * 2;
  const rects: string[] = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (matrix[r][c] === 1) {
        rects.push(`<rect x="${c + margin}" y="${r + margin}" width="1" height="1" fill="${dark}" />`);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges">
  <rect width="100%" height="100%" fill="${light}" />
  ${rects.join('\n  ')}
</svg>`;
}
