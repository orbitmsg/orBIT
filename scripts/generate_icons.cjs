const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

function getSvg(withGlow = true) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="100 100 800 800" width="800" height="800">
  <defs>
    <linearGradient id="ringFill" x1="75%" y1="15%" x2="20%" y2="85%">
      <stop offset="0%" stop-color="#a894d1" />
      <stop offset="50%" stop-color="#917bbd" />
      <stop offset="100%" stop-color="#755f9f" />
    </linearGradient>

    <linearGradient id="ringStroke" x1="80%" y1="10%" x2="20%" y2="90%">
      <stop offset="0%" stop-color="#c0b0df" stop-opacity="0.9" />
      <stop offset="50%" stop-color="#917bbd" stop-opacity="0.6" />
      <stop offset="100%" stop-color="#7e69a8" stop-opacity="0.8" />
    </linearGradient>
    ${withGlow ? `
    <filter id="ambientGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="16" result="blur" />
      <feComponentTransfer in="blur" result="dimBlur">
        <feFuncA type="linear" slope="0.3" />
      </feComponentTransfer>
      <feMerge>
        <feMergeNode in="dimBlur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>` : ''}
  </defs>

  <g ${withGlow ? 'filter="url(#ambientGlow)"' : ''}>
    <path
      d="M 678.5 239.0 A 340 340 0 1 0 816.0 376.5 L 780.7 411.8 A 290 290 0 1 1 643.2 274.3 Z"
      fill="url(#ringFill)"
      stroke="url(#ringStroke)"
      stroke-width="5"
      stroke-linejoin="round"
    />

    <path
      d="M 603.7 313.8 A 240 240 0 1 0 741.2 451.3 L 705.2 487.3 A 190 190 0 1 1 567.7 349.8 Z"
      fill="url(#ringFill)"
      stroke="url(#ringStroke)"
      stroke-width="5"
      stroke-linejoin="round"
    />

    <g>
      <rect x="605" y="355" width="85" height="85" rx="6" fill="#FFFFFF" />
      <rect x="690" y="270" width="85" height="85" rx="6" fill="#FFFFFF" />
      <rect x="775" y="185" width="85" height="85" rx="6" fill="#FFFFFF" />
    </g>
  </g>
</svg>`;
}

function buildIco(pngBuffersWithSize) {
  const count = pngBuffersWithSize.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = headerSize + count * dirEntrySize;

  let totalSize = dirSize;
  for (const item of pngBuffersWithSize) {
    totalSize += item.buffer.length;
  }

  const out = Buffer.alloc(totalSize);
  out.writeUInt16LE(0, 0);
  out.writeUInt16LE(1, 2);
  out.writeUInt16LE(count, 4);

  let currentOffset = dirSize;
  for (let i = 0; i < count; i++) {
    const item = pngBuffersWithSize[i];
    const entryOffset = headerSize + i * dirEntrySize;
    const w = item.size >= 256 ? 0 : item.size;
    const h = item.size >= 256 ? 0 : item.size;

    out.writeUInt8(w, entryOffset + 0);
    out.writeUInt8(h, entryOffset + 1);
    out.writeUInt8(0, entryOffset + 2);
    out.writeUInt8(0, entryOffset + 3);
    out.writeUInt16LE(1, entryOffset + 4);
    out.writeUInt16LE(32, entryOffset + 6);
    out.writeUInt32LE(item.buffer.length, entryOffset + 8);
    out.writeUInt32LE(currentOffset, entryOffset + 12);

    item.buffer.copy(out, currentOffset);
    currentOffset += item.buffer.length;
  }

  return out;
}

async function run() {
  const iconsDir = path.join(__dirname, '../public/icons');
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  fs.writeFileSync(path.join(__dirname, '../public/logo.svg'), getSvg(true).trim());

  const sizes = [16, 20, 24, 32, 48, 64, 128, 256, 512, 1024];
  const pngMap = {};

  for (const s of sizes) {
    const svg = getSvg(s >= 64);
    const buf = await sharp(Buffer.from(svg))
      .resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    pngMap[s] = buf;
    fs.writeFileSync(path.join(iconsDir, `${s}x${s}.png`), buf);
  }

  fs.writeFileSync(path.join(iconsDir, 'tray-16.png'), pngMap[16]);
  fs.writeFileSync(path.join(iconsDir, 'tray-20.png'), pngMap[20]);
  fs.writeFileSync(path.join(iconsDir, 'tray-24.png'), pngMap[24]);
  fs.writeFileSync(path.join(iconsDir, 'tray-32.png'), pngMap[32]);
  fs.writeFileSync(path.join(iconsDir, 'tray.png'), pngMap[16]);
  fs.writeFileSync(path.join(iconsDir, 'tray@2x.png'), pngMap[32]);

  const icoSizes = [16, 20, 24, 32, 48, 64, 128, 256];
  const icoItems = icoSizes.map(s => ({ size: s, buffer: pngMap[s] }));
  const icoBuffer = buildIco(icoItems);

  fs.writeFileSync(path.join(iconsDir, 'icon.ico'), icoBuffer);
  fs.writeFileSync(path.join(__dirname, '../public/favicon.ico'), icoBuffer);

  console.log('Icons generated successfully with crisp small sizes and transparent background!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
