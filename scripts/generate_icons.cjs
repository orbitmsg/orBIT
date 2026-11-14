const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico').default;

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
      <path
        d="M 9.2 3.4 A 5.8 5.8 0 1 0 13.6 8.5"
        fill="none"
        stroke="url(#trayIris16)"
        stroke-width="3.4"
        stroke-linecap="round"
      />
      <path d="M 10.0 2.5 L 11.7 4.2 L 10.0 5.9 L 8.3 4.2 Z" fill="#FFFFFF" />
      <path d="M 13.4 0.1 L 15.1 1.8 L 13.4 3.5 L 11.7 1.8 Z" fill="#FFFFFF" />
    </svg>`;
  } else if (size <= 24) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <defs>
        <linearGradient id="trayIris24" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#cfbdf5" />
          <stop offset="100%" stop-color="#8c74bd" />
        </linearGradient>
      </defs>
      <path
        d="M 13.8 5.1 A 8.7 8.7 0 1 0 20.4 12.8"
        fill="none"
        stroke="url(#trayIris24)"
        stroke-width="5.0"
        stroke-linecap="round"
      />
      <path d="M 15.0 3.8 L 17.5 6.3 L 15.0 8.8 L 12.5 6.3 Z" fill="#FFFFFF" />
      <path d="M 20.1 0.2 L 22.6 2.7 L 20.1 5.2 L 17.6 2.7 Z" fill="#FFFFFF" />
    </svg>`;
  } else {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
      <defs>
        <linearGradient id="trayIris32" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#cfbdf5" />
          <stop offset="100%" stop-color="#8c74bd" />
        </linearGradient>
      </defs>
      <path
        d="M 18.4 6.8 A 11.6 11.6 0 1 0 27.2 17.0"
        fill="none"
        stroke="url(#trayIris32)"
        stroke-width="6.8"
        stroke-linecap="round"
      />
      <path d="M 20.0 5.0 L 23.4 8.4 L 20.0 11.8 L 16.6 8.4 Z" fill="#FFFFFF" />
      <path d="M 26.8 0.2 L 30.2 3.6 L 26.8 7.0 L 23.4 3.6 Z" fill="#FFFFFF" />
    </svg>`;
  }
}

async function run() {
  const iconsDir = path.join(__dirname, '../public/icons');
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  fs.writeFileSync(path.join(__dirname, '../public/logo.svg'), getFullLogoSvg(true).trim());

  const sizes = [16, 20, 24, 32, 48, 64, 128, 256, 512, 1024];

  for (const s of sizes) {
    const svg = getFullLogoSvg(s >= 64);
    const pngBuf = await sharp(Buffer.from(svg))
      .resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
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

  const pngFilesForIco = [
    path.join(iconsDir, '16x16.png'),
    path.join(iconsDir, '32x32.png'),
    path.join(iconsDir, '48x48.png'),
    path.join(iconsDir, '64x64.png'),
    path.join(iconsDir, '128x128.png'),
    path.join(iconsDir, '256x256.png'),
  ];

  const icoBuffer = await pngToIco(pngFilesForIco);
  fs.writeFileSync(path.join(iconsDir, 'icon.ico'), icoBuffer);
  fs.writeFileSync(path.join(__dirname, '../public/favicon.ico'), icoBuffer);

  const websiteIcons = path.join(__dirname, '../website/icons');
  if (fs.existsSync(websiteIcons)) {
    fs.writeFileSync(path.join(websiteIcons, 'icon.ico'), icoBuffer);
  }

  console.log('Successfully generated icons: png-to-ico used for icon.ico, dedicated single-ring diamonds for tray!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
