const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

function getFullLogoSvg(withGlow = true) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="140 150 740 740" width="740" height="740">
  <defs>
    <linearGradient id="ringFill" x1="75%" y1="15%" x2="20%" y2="85%">
      <stop offset="0%" stop-color="#baa7e2" />
      <stop offset="50%" stop-color="#917bbd" />
      <stop offset="100%" stop-color="#755f9f" />
    </linearGradient>

    <linearGradient id="ringStroke" x1="80%" y1="10%" x2="20%" y2="90%">
      <stop offset="0%" stop-color="#d4c7f2" stop-opacity="0.95" />
      <stop offset="50%" stop-color="#9d87ca" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#7e69a8" stop-opacity="0.9" />
    </linearGradient>
    ${withGlow ? `
    <filter id="ambientGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="blur" />
      <feComponentTransfer in="blur" result="dimBlur">
        <feFuncA type="linear" slope="0.35" />
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

function getTraySvg(size) {
  if (size <= 20) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">
      <defs>
        <linearGradient id="trayIris16" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#cfbdf5" />
          <stop offset="100%" stop-color="#8c74bd" />
        </linearGradient>
      </defs>
      <path d="M 9.5 4.8 A 5.6 5.6 0 1 0 12.8 8.5" fill="none" stroke="url(#trayIris16)" stroke-width="2.6" stroke-linecap="round" />
      <path d="M 8.2 6.5 A 3.2 3.2 0 1 0 10.4 8.5" fill="none" stroke="url(#trayIris16)" stroke-width="1.8" stroke-linecap="round" opacity="0.9" />
      <rect x="8.5" y="5.0" width="2.0" height="2.0" rx="0.3" fill="#FFFFFF" />
      <rect x="10.8" y="2.7" width="2.0" height="2.0" rx="0.3" fill="#FFFFFF" />
      <rect x="13.1" y="0.4" width="2.0" height="2.0" rx="0.3" fill="#FFFFFF" />
    </svg>`;
  } else if (size <= 24) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <defs>
        <linearGradient id="trayIris24" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#cfbdf5" />
          <stop offset="100%" stop-color="#8c74bd" />
        </linearGradient>
      </defs>
      <path d="M 14.3 7.2 A 8.4 8.4 0 1 0 19.2 12.8" fill="none" stroke="url(#trayIris24)" stroke-width="3.8" stroke-linecap="round" />
      <path d="M 12.3 9.8 A 4.8 4.8 0 1 0 15.6 12.8" fill="none" stroke="url(#trayIris24)" stroke-width="2.6" stroke-linecap="round" opacity="0.9" />
      <rect x="12.8" y="7.5" width="3.0" height="3.0" rx="0.5" fill="#FFFFFF" />
      <rect x="16.2" y="4.1" width="3.0" height="3.0" rx="0.5" fill="#FFFFFF" />
      <rect x="19.6" y="0.7" width="3.0" height="3.0" rx="0.5" fill="#FFFFFF" />
    </svg>`;
  } else {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
      <defs>
        <linearGradient id="trayIris32" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#cfbdf5" />
          <stop offset="100%" stop-color="#8c74bd" />
        </linearGradient>
      </defs>
      <path d="M 19.0 9.6 A 11.2 11.2 0 1 0 25.6 17" fill="none" stroke="url(#trayIris32)" stroke-width="5.2" stroke-linecap="round" />
      <path d="M 16.4 13.0 A 6.4 6.4 0 1 0 20.8 17" fill="none" stroke="url(#trayIris32)" stroke-width="3.6" stroke-linecap="round" opacity="0.9" />
      <rect x="17.0" y="10.0" width="4.2" height="4.2" rx="0.7" fill="#FFFFFF" />
      <rect x="21.6" y="5.4" width="4.2" height="4.2" rx="0.7" fill="#FFFFFF" />
      <rect x="26.2" y="0.8" width="4.2" height="4.2" rx="0.7" fill="#FFFFFF" />
    </svg>`;
  }
}

function makeDibFrame(rawRgbaBuffer, width, height) {
  const headerSize = 40;
  const pixelDataSize = width * height * 4;
  const andRowStride = Math.ceil(width / 32) * 4;
  const andMaskSize = andRowStride * height;
  const totalFrameSize = headerSize + pixelDataSize + andMaskSize;

  const buf = Buffer.alloc(totalFrameSize);

  buf.writeUInt32LE(40, 0);
  buf.writeInt32LE(width, 4);
  buf.writeInt32LE(height * 2, 8);
  buf.writeUInt16LE(1, 12);
  buf.writeUInt16LE(32, 14);
  buf.writeUInt32LE(0, 16);
  buf.writeUInt32LE(pixelDataSize, 20);
  buf.writeInt32LE(0, 24);
  buf.writeInt32LE(0, 28);
  buf.writeUInt32LE(0, 32);
  buf.writeUInt32LE(0, 36);

  let dstOffset = headerSize;
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const r = rawRgbaBuffer[srcIdx];
      const g = rawRgbaBuffer[srcIdx + 1];
      const b = rawRgbaBuffer[srcIdx + 2];
      const a = rawRgbaBuffer[srcIdx + 3];

      buf[dstOffset] = b;
      buf[dstOffset + 1] = g;
      buf[dstOffset + 2] = r;
      buf[dstOffset + 3] = a;
      dstOffset += 4;
    }
  }

  return buf;
}

function buildNativeIco(entries) {
  const count = entries.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = headerSize + count * dirEntrySize;

  let totalSize = dirSize;
  for (const item of entries) {
    totalSize += item.buffer.length;
  }

  const out = Buffer.alloc(totalSize);
  out.writeUInt16LE(0, 0);
  out.writeUInt16LE(1, 2);
  out.writeUInt16LE(count, 4);

  let currentOffset = dirSize;
  for (let i = 0; i < count; i++) {
    const item = entries[i];
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

  fs.writeFileSync(path.join(__dirname, '../public/logo.svg'), getFullLogoSvg(true).trim());

  const sizes = [16, 20, 24, 32, 48, 64, 128, 256, 512, 1024];
  const pngMap = {};
  const rawMap = {};

  for (const s of sizes) {
    const svg = getFullLogoSvg(s >= 64);
    const { data } = await sharp(Buffer.from(svg))
      .resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .raw()
      .toBuffer({ resolveWithObject: true });
    rawMap[s] = data;

    const pngBuf = await sharp(data, { raw: { width: s, height: s, channels: 4 } })
      .png()
      .toBuffer();
    pngMap[s] = pngBuf;
    fs.writeFileSync(path.join(iconsDir, `${s}x${s}.png`), pngBuf);
  }

  const tray16 = await sharp(Buffer.from(getTraySvg(16))).png().toBuffer();
  const tray20 = await sharp(Buffer.from(getTraySvg(20))).png().toBuffer();
  const tray24 = await sharp(Buffer.from(getTraySvg(24))).png().toBuffer();
  const tray32 = await sharp(Buffer.from(getTraySvg(32))).png().toBuffer();

  fs.writeFileSync(path.join(iconsDir, 'tray-16.png'), tray16);
  fs.writeFileSync(path.join(iconsDir, 'tray-20.png'), tray20);
  fs.writeFileSync(path.join(iconsDir, 'tray-24.png'), tray24);
  fs.writeFileSync(path.join(iconsDir, 'tray-32.png'), tray32);
  fs.writeFileSync(path.join(iconsDir, 'tray.png'), tray16);
  fs.writeFileSync(path.join(iconsDir, 'tray@2x.png'), tray32);

  const icoSizes = [16, 20, 24, 32, 48, 64, 128, 256];
  const icoEntries = [];
  for (const s of icoSizes) {
    if (s === 256) {
      icoEntries.push({ size: 256, buffer: pngMap[256] });
    } else {
      const dib = makeDibFrame(rawMap[s], s, s);
      icoEntries.push({ size: s, buffer: dib });
    }
  }

  const icoBuffer = buildNativeIco(icoEntries);
  fs.writeFileSync(path.join(iconsDir, 'icon.ico'), icoBuffer);
  fs.writeFileSync(path.join(__dirname, '../public/favicon.ico'), icoBuffer);

  const websiteIcons = path.join(__dirname, '../website/icons');
  if (fs.existsSync(websiteIcons)) {
    fs.writeFileSync(path.join(websiteIcons, 'icon.ico'), icoBuffer);
  }

  console.log('Successfully generated full icon suite with native DIB ICO and tight 95% coverage!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
