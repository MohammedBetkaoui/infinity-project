// Shared design constants for the official Infinity Club Workshop Pass.
// The badge is authored on a fixed 1054x1493 design grid (the exact ratio of
// the official reference artwork), then rasterised at exactly 2x —
// 2108x2986 — for the downloadable PNG, and reproduced proportionally on the
// web badge with container-query units (1cqw = 10.54 design px).
export const WORKSHOP_BADGE = {
  width: 1054,
  height: 1493,
  radius: 60,
  scale: 2,
  canvasWidth: 2108,
  canvasHeight: 2986,
  colors: {
    deep: '#002A1E',
    green: '#094A36',
    greenDeep: '#052B1F',
    cream: '#F6F3EA',
    white: '#FFFFFF',
    mint: '#8FD9B8',
    mintDeep: '#0E6A4C',
    inkSoft: 'rgba(0, 42, 30, 0.78)',
    inkFaint: 'rgba(0, 42, 30, 0.16)',
    gold: '#D8C58A',
    goldSoft: 'rgba(216, 197, 138, 0.85)',
    goldHairline: 'rgba(216, 197, 138, 0.55)',
    scanInk: '#2E6B55',
  },
  panel: { x: 55, y: 368, width: 944, height: 852, radius: 44 },
  contentWidth: 800,
  header: {
    emblemTop: 58, emblemWidth: 190,
    clubBaseline: 246, clubSize: 46, clubSpacing: 13,
    passBaseline: 292, passSize: 19, passSpacing: 10,
    universityBaseline: 334, universitySize: 13.5, universitySpacing: 4,
  },
  title: {
    labelBaseline: 434, firstBaseline: 524,
    startSize: 84, secondTierSize: 64, minSize: 38, lineFactor: 1.1,
    labelSize: 16, labelSpacing: 7, sideLineLength: 132, sideLineGap: 18,
  },
  meta: {
    columnSpread: 200, labelSize: 15, labelSpacing: 6.5, valueSize: 27, valueGap: 46,
    locationMaxWidth: 300, chipDiameter: 42, chipGap: 12,
  },
  qr: {
    cardWidth: 372, cardRadius: 26, minCardHeight: 280, maxCardHeight: 384,
    topInset: 28, gapToScan: 34, scanSize: 13, scanSpacing: 5, topGap: 46,
  },
  name: {
    lastBaseline: 1162, startSize: 62, minSize: 34, lineFactor: 1.16,
    labelGap: 34, cardGap: 24, metaGap: 64, maxWidth: 780,
    labelSize: 16, labelSpacing: 7, sideLineLength: 190, sideLineGap: 18,
  },
  footer: {
    emblemTop: 1288, emblemWidth: 124,
    sloganBaseline: 1438, sloganSize: 25, sloganSpacing: 11,
    sideLineLength: 130, sideLineGap: 22,
  },
}
