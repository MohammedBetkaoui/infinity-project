// Open halves of a lemniscate, shared by the GPU ribbons and the static SVG.
export const HERO_ENERGY_DURATION = 10.5
// Both currents approach the crossing before the letters start to illuminate.
export const HERO_ENERGY_START = .43
export const HERO_LIGHT_EVENT = 'infinity:hero-light'

export function heroTitleLightAt(elapsed) {
  const progress = (start, finish) => {
    const value = Math.min(1, Math.max(0, (elapsed - start) / (finish - start)))
    return value * value * (3 - 2 * value)
  }
  return { first: progress(.85, 2.7), second: progress(.45, 2.6) }
}

export function ribbonPoint(progress, side, line, time = 0, compact = false) {
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
export function measureRibbon(points, distances, side, line, time, compact, width, height) {
  const count = distances.length
  let length = 0
  for (let index = 0; index < count; index++) {
    const point = ribbonPoint(index / (count - 1), side, line, time, compact)
    points[index * 2] = point.x * width
    points[index * 2 + 1] = point.y * height
    if (index) length += Math.hypot(points[index * 2] - points[(index - 1) * 2], points[index * 2 + 1] - points[(index - 1) * 2 + 1])
    distances[index] = length
  }
  return length
}

export function ribbonPath(side, line, compact = false) {
  return Array.from({ length: 97 }, (_, index) => {
    const { x, y } = ribbonPoint(index / 96, side, line, 0, compact)
    return `${index ? 'L' : 'M'}${(x * 1000).toFixed(2)},${(y * 1000).toFixed(2)}`
  }).join(' ')
}

export const homeLinesVertexShader = `
  attribute vec2 aPosition;
  attribute float aEdge;
  attribute float aOpacity;
  attribute float aOffset;
  attribute float aTravel;
  varying float vEdge;
  varying float vOpacity;
  varying float vOffset;
  varying float vTravel;
  varying vec2 vScreen;
  void main() {
    vEdge = aEdge;
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
  varying vec2 vScreen;
  uniform float uPhase;
  uniform float uIntro;
  uniform float uCompact;
  uniform float uHover;
  uniform float uScroll;
  uniform float uScrollActive;
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
    float head = max(max(first.x, second.x) * uIntro, scrollReflection);
    float trail = max(max(first.y, second.y) * uIntro, scrollReflection);
    vec2 mouseDistance = (vScreen - uPointer) * uSize;
    float nearby = exp(-dot(mouseDistance, mouseDistance) / 10000.0) * uHover;
    float haloRadius = mix(3.4, 1.8, uCompact) * (1.0 + nearby * 0.3);
    float halo = exp(-distance * distance / (haloRadius * haloRadius))
      * (1.0 - smoothstep(0.7, 1.0, abs(vEdge)));
    vec3 color = mix(vec3(128.0, 180.0, 159.0), vec3(158.0, 215.0, 196.0), trail) / 255.0;
    color = mix(color, vec3(205.0, 229.0, 217.0) / 255.0, head * core);
    // The silhouette remains underneath the currents. Only the local wake
    // gains a halo on hover; the trajectory and global brightness stay calm.
    float alpha = ink * (vOpacity + trail * 0.32) + core * head * 0.3
      + halo * max(head, trail * 0.6) * mix(0.28, 0.14, uCompact) * (1.0 + nearby * 0.65);
    gl_FragColor = vec4(color, min(alpha, 0.94));
  }
`
