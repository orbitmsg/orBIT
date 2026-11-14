const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

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

  const src1024 = path.join(iconsDir, '1024x1024.png');
  if (!fs.existsSync(src1024)) {
    throw new Error('1024x1024.png not found');
  }

  const traySizes = [
    { name: 'tray-16.png', size: 16 },
    { name: 'tray-20.png', size: 20 },
    { name: 'tray-24.png', size: 24 },
    { name: 'tray-32.png', size: 32 },
    { name: 'tray.png', size: 16 },
    { name: 'tray@2x.png', size: 32 },
  ];

  for (const t of traySizes) {
    const outPath = path.join(iconsDir, t.name);
    if (fs.existsSync(outPath)) {
      fs.unlinkSync(outPath);
    }
    const buf = await sharp(src1024)
      .resize(t.size, t.size, {
        kernel: sharp.kernel.lanczos3,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toBuffer();
    fs.writeFileSync(outPath, buf);
  }

  const icoSizes = [16, 20, 24, 32, 48, 64, 128, 256];
  const icoEntries = [];
  for (const s of icoSizes) {
    const pngPath = path.join(iconsDir, `${s}x${s}.png`);
    if (s === 256) {
      const pngBuf = fs.readFileSync(pngPath);
      icoEntries.push({ size: 256, buffer: pngBuf });
    } else {
      const { data } = await sharp(pngPath).raw().toBuffer({ resolveWithObject: true });
      const dib = makeDibFrame(data, s, s);
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

  console.log('Tray icons cleanly regenerated from 1024x1024.png, icon.ico rebuilt!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
