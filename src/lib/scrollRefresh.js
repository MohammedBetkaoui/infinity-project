import { ScrollTrigger } from 'gsap/ScrollTrigger'

let timer

// Image decodes and text re-splits can finish together: measure the document once.
export function requestScrollRefresh() {
  clearTimeout(timer)
  timer = setTimeout(() => ScrollTrigger.refresh(), 100)
}

export function cancelScrollRefresh() {
  clearTimeout(timer)
}
