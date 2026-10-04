// Off-screen motion setups (text splits, presence watchers) wait their turn.
// Preparing every block of a page at once costs about half a second of main
// thread right as the route opens, and the hero's intro stalls behind it. A
// block far below the fold is not needed yet: it is prepared once the opening
// animation has played, in idle time, or at once when the scroll brings it
// near, whichever comes first.

// Within this many viewport heights from the top, a block is prepared right
// away: it may be on screen, or one flick away.
const NEAR_VIEWPORTS = 1.4
// Time left to the opening animation (the page heroes' rise, ~1.2s) before
// idle preparation begins.
const START_DELAY_MS = 1200
// Idle slices shorter than this are skipped rather than overrun.
const MIN_SLICE_MS = 4

const pending = new Map()
let startTimer = 0
let idleHandle = 0
let listening = false

const canDefer = () => typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function'

// One layout read; done for every block before any of them is split.
function span(element) {
  const rect = element.getBoundingClientRect()
  return { top: rect.top + window.scrollY, bottom: rect.bottom + window.scrollY }
}

function nearScroll({ top, bottom }) {
  const margin = window.innerHeight * (NEAR_VIEWPORTS - 1)
  return bottom > window.scrollY - margin && top < window.scrollY + window.innerHeight + margin
}

// Scroll events run before the frame is painted: a block brought near by a
// wheel, a flick or an anchor jump is prepared before it can be seen.
function onScroll() {
  for (const job of [...pending.values()]) if (nearScroll(job.span)) job.run()
}

// Layout moved (resize, fonts, images): measure the waiting blocks again.
function onResize() {
  pending.forEach((job, element) => { job.span = span(element) })
  onScroll()
}

function listen(active) {
  if (active === listening) return
  listening = active
  const method = active ? 'addEventListener' : 'removeEventListener'
  window[method]('scroll', onScroll, { passive: true })
  window[method]('resize', onResize, { passive: true })
}

function pump(deadline) {
  idleHandle = 0
  for (const job of [...pending.values()]) {
    if (!deadline.didTimeout && deadline.timeRemaining() < MIN_SLICE_MS) break
    // One block failing must not leave the rest of the page unprepared.
    try { job.run() } catch (error) { window.reportError?.(error) }
    if (deadline.didTimeout) break
  }
  if (pending.size) idleHandle = window.requestIdleCallback(pump, { timeout: 1000 })
}

function schedule() {
  if (startTimer || idleHandle) return
  startTimer = window.setTimeout(() => {
    startTimer = 0
    if (pending.size) idleHandle = window.requestIdleCallback(pump, { timeout: 1000 })
  }, START_DELAY_MS)
}

function settle() {
  if (pending.size) return
  listen(false)
  window.clearTimeout(startTimer)
  window.cancelIdleCallback(idleHandle)
  startTimer = 0
  idleHandle = 0
}

// Runs `setup(false)` now for a block near the viewport; otherwise queues it.
// A queued setup gets `true` when its block is already on screen by the time
// its turn comes (layout moved, idle came late): that block is shown as it
// is, without an entrance that would first hide it. Returns a cancel function
// for the scene's cleanup: a setup that never ran has nothing to undo.
export function deferSetup(element, setup) {
  const where = canDefer() ? span(element) : null
  if (!where || nearScroll(where)) {
    setup(false)
    return () => {}
  }
  const job = {
    span: where,
    run() {
      if (pending.get(element) !== job) return
      pending.delete(element)
      try {
        const rect = element.getBoundingClientRect()
        setup(rect.bottom > 0 && rect.top < window.innerHeight)
      } finally {
        settle()
      }
    },
  }
  pending.set(element, job)
  listen(true)
  schedule()
  return () => {
    if (pending.get(element) !== job) return
    pending.delete(element)
    settle()
  }
}
