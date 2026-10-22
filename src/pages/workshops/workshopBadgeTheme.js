// Shared design constants for the official Infinity Club Workshop Pass.
// The badge is authored on a fixed 1054x1493 design grid (the exact ratio of
// the official reference artwork), then rasterised at exactly 2x —
// 2108x2986 — for the downloadable PNG, and reproduced proportionally on the
// web badge with container-query units (1cqw = 10.54 design px).
// This module is the single source of truth: the canvas render, the web badge
// and the layout planner (workshopPassLayout.js) all read it verbatim.
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
    goldFrame: 'rgba(216, 197, 138, 0.7)',
    goldHairline: 'rgba(216, 197, 138, 0.55)',
    scanInk: '#2E6B55',
  },
  panel: { x: 55, y: 368, width: 944, height: 852, radius: 44 },
  contentWidth: 800,
  header: {
    emblemTop: 58, emblemWidth: 190,
    clubBaseline: 246, clubSize: 46, clubSpacing: 13,
    passBaseline: 292, passSize: 19, passSpacing: 10, passSideLineLength: 132, passSideLineGap: 18,
    universityBaseline: 334, universitySize: 13.5, universitySpacing: 4,
  },
  title: {
    labelBaseline: 434, firstBaseline: 518,
    tiers: [84, 64, 52], minSize: 38, lineFactor: 1.1,
    labelSize: 16, labelSpacing: 7, sideLineLength: 132, sideLineGap: 18,
    maxWidth: 800,
  },
  meta: {
    metaGap: 58, metaGapFloor: 44,
    valueGap: 42, valueGapFloor: 36,
    columnSpread: 200, labelSize: 15, labelSpacing: 6.5,
    valueSize: 27, valueLineFactor: 1.24, locationMaxWidth: 300,
    chipDiameter: 42, chipGap: 12, valueSpacing: 0.4,
  },
  qr: {
    cardWidth: 448, codeSize: 350, cardRadius: 28,
    minCardHeight: 390, maxCardHeight: 410,
    topInset: 26, gapToScan: 20, scanSize: 14, scanSpacing: 5, scanHeight: 14,
    topGap: 32, topGapFloor: 24,
  },
  name: {
    lastBaseline: 1162, startSize: 62, minSize: 34, singleLineFloor: 56,
    lineFactor: 1.16, maxWidth: 780, capFactor: 0.73, nameSpacing: 1,
    participantTopGap: 28, labelGap: 28,
    labelSize: 16, labelSpacing: 7, sideLineLength: 190, sideLineGap: 18,
  },
  footer: {
    emblemTop: 1284, emblemWidth: 124,
    sloganBaseline: 1432, sloganSize: 25, sloganSpacing: 11,
    sideLineLength: 130, sideLineGap: 22,
  },
}
