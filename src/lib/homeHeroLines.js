// Open halves of a lemniscate, shared by the GPU ribbons and the static SVG.
export const HERO_ENERGY_DURATION = 10.5
// Both currents approach the crossing before the letters start to illuminate.
export const HERO_ENERGY_START = .43
export const HERO_LIGHT_EVENT = 'infinity:hero-light'
export const HERO_SCROLL_EVENT = 'infinity:hero-scroll'

export function heroTitleLightAt(elapsed) {
  const progress = (start, finish) => {
    const value = Math.min(1, Math.max(0, (elapsed - start) / (finish - start)))
    return value * value * (3 - 2 * value)
  }
  return { first: progress(.85, 2.7), second: progress(.45, 2.6) }
}

// Portrait phones and tablets: the same symbol drawn for a tall screen. Seven
// fibres like desktop, in a frame 1.5 times as wide as it is tall, so both
// loops keep their curvature in view; its crossing sits at the frame centre.
export const PORTRAIT_ASPECT = 1.5

function portraitPoint(progress, side, line, time) {
  const angle = progress * Math.PI
  const spread = line - 3
  const breath = Math.sin(side * .7) * .006
    + (Math.sin(time * .13 + side * .7) - Math.sin(side * .7)) * .003
  const radius = .47 + spread * .012 + breath
  return {
    x: .5 + side * radius * Math.sin(angle) + Math.sin(time * .09) * .003 * Math.sin(angle),
    y: .5 - side * (.47 + spread * .018) * Math.sin(angle * 2)
      + spread * .02 * Math.sin(angle) + Math.sin(angle) * .014
      + Math.sin(time * .11) * Math.sin(angle * 2) * Math.sin(angle) * .004,
  }
}

// variant: false (desktop), true (compact) or 'portrait'.
export function ribbonPoint(progress, side, line, time = 0, variant = false) {
  if (variant === 'portrait') return portraitPoint(progress, side, line, time)
  const compact = variant === true
  const angle = progress * Math.PI
  const spread = line - (compact ? 1.5 : 3)
  // Keep the desktop silhouette; compact loops fit inside the screen gutters.
  const breath = Math.sin(side * .7) * .014
    + (Math.sin(time * .13 + side * .7) - Math.sin(side * .7)) * .003
  const radius = (compact ? .42 : .57) + spread * .012 + breath
  return {
    x: .5 + side * radius * Math.sin(angle) + Math.sin(time * .09) * .003 * Math.sin(angle),
    y: (compact ? .5 : .48) - side * (.31 + spread * .013) * Math.sin(angle * 2)
      + spread * .015 * Math.sin(angle) + Math.sin(angle) * .012
      + Math.sin(time * .11) * Math.sin(angle * 2) * Math.sin(angle) * .004,
  }
}

// Screen-space arc length makes the energy travel at a constant speed even
// through tight turns, at different aspect ratios and while the curve breathes.
// `frame` places the symbol inside the canvas (the portrait variant, centred
// on the logo); without it the symbol spans the whole canvas.
export function measureRibbon(points, distances, side, line, time, variant, width, height, frame = null) {
  const count = distances.length
  const left = frame ? frame.left : 0
  const top = frame ? frame.top : 0
  const frameWidth = frame ? frame.width : width
  const frameHeight = frame ? frame.height : height
  let length = 0
  for (let index = 0; index < count; index++) {
    const point = ribbonPoint(index / (count - 1), side, line, time, variant)
    points[index * 2] = left + point.x * frameWidth
    points[index * 2 + 1] = top + point.y * frameHeight
    if (index) length += Math.hypot(points[index * 2] - points[(index - 1) * 2], points[index * 2 + 1] - points[(index - 1) * 2 + 1])
    distances[index] = length
  }
  return length
}

// Scroll beams. Each continues one of the two upper strokes from the point
// where it fades out before the crossing (BEAM_START along its lobe, counted
// from the crossing end), runs through the crossing onto the other lobe and
// follows its lower branch down to its lowest point (BEAM_END): A from the
// upper left to the lower right, B its mirror. Lobe progress runs from the
// crossing (0) round the lobe and back to it (1).
export const BEAM_START = .94
export const BEAM_END = .75

function distanceAt(distances, progress) {
  const index = progress * (distances.length - 1)
  const lower = Math.floor(index)
  const upper = Math.min(distances.length - 1, lower + 1)
  return distances[lower] + (distances[upper] - distances[lower]) * (index - lower)
}

// Lengths of both paths for one fibre, from its two lobes' cumulative
// distances (see measureRibbon). B uses the mirror positions of A.
export function beamSpan(leftDistances, rightDistances) {
  const left = leftDistances.at(-1)
  const right = rightDistances.at(-1)
  const a = { upper: left - distanceAt(leftDistances, BEAM_START), lower: right - distanceAt(rightDistances, BEAM_END) }
  const b = { upper: distanceAt(rightDistances, 1 - BEAM_START), lower: distanceAt(leftDistances, 1 - BEAM_END) }
  return { left, right, a, b, lengthA: a.upper + a.lower, lengthB: b.upper + b.lower }
}

// Position of a ribbon point along each beam path: 0 at its start, 1 at its
// end, the crossing in between. Values keep growing (or falling) beyond both
// ends, so a point off the path never lies under a beam.
export function beamCoordinates(side, distance, span) {
  const total = side === 1 ? span.right : span.left
  const fromEnd = total - distance
  return side === 1
    ? [(span.a.upper + fromEnd) / span.lengthA, (span.b.upper - distance) / span.lengthB]
    : [(span.a.upper - fromEnd) / span.lengthA, (span.b.upper + distance) / span.lengthB]
}

export function ribbonPath(side, line, variant = false) {
  return Array.from({ length: 97 }, (_, index) => {
    const { x, y } = ribbonPoint(index / 96, side, line, 0, variant)
    return `${index ? 'L' : 'M'}${(x * 1000).toFixed(2)},${(y * 1000).toFixed(2)}`
  }).join(' ')
}

export const homeLinesVertexShader = `
  attribute vec2 aPosition;
  attribute float aEdge;
  attribute float aOpacity;
  attribute float aOffset;
  attribute float aTravel;
  attribute vec2 aBeam;
  varying float vEdge;
  varying float vOpacity;
  varying float vOffset;
  varying float vTravel;
  varying vec2 vBeam;
  varying vec2 vScreen;
  void main() {
    vEdge = aEdge;
    vBeam = aBeam;
    vOpacity = aOpacity;
    vOffset = aOffset;
    vTravel = aTravel;
    vScreen = vec2(aPosition.x * 0.5 + 0.5, 0.5 - aPosition.y * 0.5);
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`

export const homeLinesFragmentShader = `
  precision mediump float;
  varying float vEdge;
  varying float vOpacity;
  varying float vOffset;
  varying float vTravel;
  varying vec2 vBeam;
  varying vec2 vScreen;
  uniform float uPhase;
  uniform float uIntro;
  uniform float uCompact;
  uniform float uHover;
  uniform float uScroll;
  uniform float uScrollActive;
  uniform float uBeam;
  uniform float uBeamAlpha;
  uniform float uBeamsOnly;
  uniform float uBeamLength;
  uniform vec4 uTextMask;
  uniform float uTextMaskStrength;
  uniform vec2 uPointer;
  uniform vec2 uSize;

  vec2 current(float behind) {
    // A fine head followed by a progressively extinguished 19% wake.
    // Both ends reach zero, including at the periodic seam.
    float opening = smoothstep(0.0, 0.012, behind);
    float head = opening * (1.0 - smoothstep(0.038, 0.075, behind));
    float trail = opening * (1.0 - smoothstep(0.04, 0.19, behind));
    return vec2(head, trail);
  }
  void main() {
    float radius = mix(9.0, 4.5, uCompact);
    float distance = abs(vEdge) * radius;
    float ink = 1.0 - smoothstep(0.3, 1.05, distance);
    float core = 1.0 - smoothstep(0.22, 0.8, distance);
    // Slightly less than half a lap apart: the two heads do not disappear
    // beyond the cropped edges together. Per-line delay propagates the glow.
    vec2 first = current(fract(uPhase - vTravel - vOffset + 1.0));
    vec2 second = current(fract(uPhase + 0.46 - vTravel - vOffset + 1.0));
    float scrollDistance = abs(fract(vTravel - uScroll + 0.5) - 0.5);
    float scrollReflection = (1.0 - smoothstep(0.012, 0.09, scrollDistance)) * uScrollActive * 0.3;
    // Scroll beams (uBeamsOnly, drawn on their own canvas above the centre
    // shade): the same head and wake as the currents, placed by the timeline
    // along each beam path. All fibres share one position, so both beams meet
    // the crossing as a single point; the centre fibres carry them, a little
    // dimmer than the logo's contour. With uBeamsOnly at 0 nothing changes.
    float beamFibre = (1.0 - smoothstep(0.008, 0.024, abs(vOffset))) * uBeamAlpha * 0.75;
    // Longer wake on portrait screens (uBeamLength), where the path is short.
    float beamLength = uBeamLength > 0.0 ? uBeamLength : 1.0;
    vec2 beam = max(current((uBeam - vBeam.x) / beamLength), current((uBeam - vBeam.y) / beamLength)) * beamFibre;
    float head = mix(max(max(first.x, second.x) * uIntro, scrollReflection), beam.x, uBeamsOnly);
    float trail = mix(max(max(first.y, second.y) * uIntro, scrollReflection), beam.y, uBeamsOnly);
    vec2 mouseDistance = (vScreen - uPointer) * uSize;
    float nearby = exp(-dot(mouseDistance, mouseDistance) / 10000.0) * uHover;
    float haloRadius = mix(3.4, 1.8, uCompact) * (1.0 + nearby * 0.3);
    float halo = exp(-distance * distance / (haloRadius * haloRadius))
      * (1.0 - smoothstep(0.7, 1.0, abs(vEdge)));
    vec3 color = mix(vec3(128.0, 180.0, 159.0), vec3(158.0, 215.0, 196.0), trail) / 255.0;
    color = mix(color, vec3(205.0, 229.0, 217.0) / 255.0, head * core);
    // The silhouette remains underneath the currents. Only the local wake
    // gains a halo on hover; the trajectory and global brightness stay calm.
    float alpha = ink * (vOpacity * (1.0 - uBeamsOnly) + trail * 0.32) + core * head * 0.3
      + halo * max(head, trail * 0.6) * mix(0.28, 0.14, uCompact) * (1.0 + nearby * 0.65);
    // Portrait: a soft rounded-rectangle mask over the copy dims the fibres
    // that pass behind the text or the buttons to a faint trace (the
    // silhouette stays whole, as under the desktop's central shade), and
    // lifts with the copy.
    if (uTextMaskStrength > 0.0) {
      vec2 offset = abs(vScreen * uSize - uTextMask.xy) / uTextMask.zw;
      float reach = pow(pow(offset.x, 4.0) + pow(offset.y, 4.0), 0.25);
      alpha *= 1.0 - (1.0 - smoothstep(0.78, 1.14, reach)) * uTextMaskStrength * 0.86;
    }
    gl_FragColor = vec4(color, min(alpha, 0.94));
  }
`
