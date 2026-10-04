// Geometry of the Hero logo dive (see useHeroLogoScroll), in the emblem's
// viewBox units. Pure functions of the scroll progress and the layout, so the
// sequence is identical in both scroll directions.

// How far past the frame edge the last contour point lands at the end.
export const EXIT_MARGIN = 1.12

const clamp = value => Math.min(1, Math.max(0, value))

// Shared with the canvas: the lines' eased depth, derived only from scroll
// progress. The canvas clamps it at 1.
export function heroZoomProgress(progress) {
  return Math.max(0, (progress - .15) / .7) ** 3
}

// The logo's centre reaches the viewport centre early (.15 → .4, ease-out),
// while its scale is still growing.
export function heroTravelProgress(progress) {
  return 1 - (1 - clamp((progress - .15) / .25)) ** 2
}

// Scale of the logo, starting together with the travel at .15 and reaching
// `finalScale` at .85. Geometric: the size grows slowly and then faster
// (ease-in), yet already grows from the first frames, so the logo never
// travels while it is still small.
export function heroLogoScale(progress, finalScale) {
  return finalScale ** clamp((progress - .15) / .7)
}

// Points along the contour, relative to the emblem centre.
export function sampleContour(path, center, count = 256) {
  const length = path.getTotalLength()
  return Array.from({ length: count }, (_, index) => {
    const point = path.getPointAtLength(length * index / count)
    return [point.x - center[0], point.y - center[1]]
  })
}

// Smallest zoom, around the emblem centre placed at the centre of a frame of
// this half-size, at which every contour point has left the frame (each one
// through its nearer edge). A point on the centre itself never leaves: it is
// ignored rather than sending the zoom to infinity.
export function exitScale(contour, halfWidth, halfHeight) {
  let scale = 1
  for (const [x, y] of contour) {
    const leaves = Math.min(x ? halfWidth / Math.abs(x) : Infinity, y ? halfHeight / Math.abs(y) : Infinity)
    if (Number.isFinite(leaves)) scale = Math.max(scale, leaves)
  }
  return scale * EXIT_MARGIN
}

// CSS transform of the zoom layer, whose transform-origin is the centre of
// its own box (the logo's): it moves by `offset` (viewBox units) and scales
// around that centre, which therefore stays where the translation puts it.
export function diveTransform(offset, travel, scale) {
  return `translate(${offset[0] * travel}px, ${offset[1] * travel}px) scale(${scale})`
}
