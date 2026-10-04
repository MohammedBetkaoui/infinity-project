// Touch browsers resize the window each time their address bar slides in or
// out. Nothing in the svh-sized Hero depends on that height, so on touch
// screens only a new width (an orientation change included) is a layout
// change. Elsewhere every resize still counts, as before.
export function onLayoutResize(callback) {
  const touch = window.matchMedia('(pointer: coarse)').matches
  let width = window.innerWidth
  const handle = () => {
    if (touch && window.innerWidth === width) return
    width = window.innerWidth
    callback()
  }
  window.addEventListener('resize', handle, { passive: true })
  return () => window.removeEventListener('resize', handle)
}
