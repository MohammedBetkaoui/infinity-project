export const GALLERY_EASE = [0.2, 0.82, 0.24, 1]
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export function galleryPosition(progress, count) {
  return clamp(progress, 0, 1) * Math.max(0, count - 1)
}

export function frameOpacity(position, index) {
  // Keep the outgoing print opaque underneath so a dissolve never dips to black.
  const mix = clamp(position - index + 1, 0, 1)
  return mix * mix * (3 - 2 * mix)
}

export function galleryScrollTarget({ top, height, viewportHeight, inset }, index, count) {
  const distance = Math.max(0, height - viewportHeight + inset)
  const progress = count > 1 ? clamp(index / (count - 1), 0, 1) : 0
  return top - inset + distance * progress
}
