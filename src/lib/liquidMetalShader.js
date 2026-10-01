export const liquidMetalVertexShader = `
attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`

export const liquidMetalFragmentShader = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uTime;
uniform float uIntensity;
uniform vec4 uVariant;

varying vec2 vUv;

float hash21(vec2 point) {
  point = fract(point * vec2(123.34, 456.21));
  point += dot(point, point + 45.32);
  return fract(point.x * point.y);
}

float valueNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  vec2 curve = local * local * (3.0 - 2.0 * local);

  float a = hash21(cell);
  float b = hash21(cell + vec2(1.0, 0.0));
  float c = hash21(cell + vec2(0.0, 1.0));
  float d = hash21(cell + vec2(1.0, 1.0));

  return mix(mix(a, b, curve.x), mix(c, d, curve.x), curve.y);
}

float fbm(vec2 point) {
  float sum = 0.0;
  float amplitude = 0.52;
  mat2 octaveTurn = mat2(0.82, 0.57, -0.57, 0.82);

  for (int octave = 0; octave < 6; octave++) {
    sum += amplitude * valueNoise(point);
    point = octaveTurn * point * 2.03 + vec2(17.13, 9.71);
    amplitude *= 0.5;
  }

  return sum;
}

float warpFbm(vec2 point) {
  float sum = 0.0;
  float amplitude = 0.55;
  mat2 octaveTurn = mat2(0.82, 0.57, -0.57, 0.82);

  for (int octave = 0; octave < 4; octave++) {
    sum += amplitude * valueNoise(point);
    point = octaveTurn * point * 2.03 + vec2(17.13, 9.71);
    amplitude *= 0.5;
  }

  return sum;
}

float domainWarp(vec2 point, float time, float seed, float warpAmount) {
  float firstWarp = warpFbm(point + vec2(seed * 8.1, time * 0.19));
  vec2 firstOffset = vec2(firstWarp - 0.5, 0.5 - firstWarp);
  float secondWarp = warpFbm(
    point + firstOffset * (1.15 * warpAmount) + vec2(-time * 0.13, seed * 11.7)
  );
  vec2 secondOffset = vec2(firstWarp - secondWarp, firstWarp + secondWarp - 1.0);

  return fbm(point + secondOffset * (1.72 * warpAmount) + vec2(time * 0.08, -time * 0.06));
}

mat2 rotate2d(float angle) {
  float sine = sin(angle);
  float cosine = cos(angle);
  return mat2(cosine, -sine, sine, cosine);
}

void main() {
  vec2 canvasUv = vUv;
  vec2 uv = canvasUv - 0.5;
  uv.x *= uResolution.x / max(uResolution.y, 1.0);

  float warpAmount = uVariant.x;
  float motion = uVariant.y;
  float specularAmount = uVariant.z;
  float seed = uVariant.w;
  float time = uTime * (0.72 + motion * 0.28);

  uv = rotate2d(-0.34 + seed * 1.28) * uv;
  vec2 pointer = uPointer - 0.5;
  pointer.x *= uResolution.x / max(uResolution.y, 1.0);
  pointer = rotate2d(-0.34 + seed * 1.28) * pointer;

  vec2 pointerDelta = uv - pointer;
  float pointerInfluence = exp(-dot(pointerDelta, pointerDelta) * 2.8);
  float pointerEnergy = max(uIntensity - 0.46, 0.0) * pointerInfluence;
  uv += vec2(pointerDelta.y, -pointerDelta.x) * pointerEnergy * 0.075;

  vec2 fieldPoint = uv * (2.34 + warpAmount * 0.34);
  fieldPoint += vec2(seed * 12.7, seed * -8.3);
  float field = domainWarp(fieldPoint, time * 0.28, seed, warpAmount);
  field += (valueNoise(fieldPoint * 0.46 - time * 0.025) - 0.5) * 0.075;

  float body = smoothstep(0.43, 0.67, field);
  float shadow = pow(clamp(1.0 - body, 0.0, 1.0), 3.0);

  float ridgeCenter = 0.605 + (seed - 0.5) * 0.025;
  float ridge = 1.0 - abs(field - ridgeCenter) * 18.5;
  ridge = pow(max(ridge, 0.0), 8.0);
  float hotHighlight = pow(ridge, 2.8);

  float fromCenter = length((canvasUv - 0.5) * vec2(1.0, 1.25));
  float edgeBias = smoothstep(0.13, 0.68, fromCenter);
  float topGuard = 1.0 - smoothstep(0.74, 1.0, canvasUv.y);
  float lowerGuard = smoothstep(0.02, 0.24, canvasUv.y);
  float highlightMask = (0.26 + edgeBias * 0.74) * topGuard * lowerGuard;

  vec3 ground = vec3(0.0, 42.0, 30.0) / 255.0;
  vec3 infinityGreen = vec3(9.0, 74.0, 54.0) / 255.0;
  vec3 mint = vec3(158.0, 215.0, 196.0) / 255.0;
  vec3 cream = vec3(241.0, 235.0, 221.0) / 255.0;

  vec3 material = mix(ground * 0.62, infinityGreen * 0.9, body * 0.58);
  material *= 1.0 - shadow * 0.24;

  float specular = ridge * specularAmount * (0.42 + uIntensity) * highlightMask;
  material = mix(material, mint * 0.82, clamp(specular * 0.72, 0.0, 1.0));
  material = mix(material, cream * 0.9, hotHighlight * specular * 0.11);

  float edgeShade = 1.0 - smoothstep(0.18, 0.82, length(uv * vec2(0.58, 0.72)));
  material *= mix(0.82, 1.0, edgeShade);
  material *= mix(0.74, 1.0, topGuard);

  gl_FragColor = vec4(material, 1.0);
}
`
