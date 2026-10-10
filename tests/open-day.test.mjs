import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { test } from 'node:test'
import { eventArchive } from '../src/data/eventArchive.js'
import { groupEventsByYear, layoutYear } from '../src/pages/events/archiveLayout.js'
import { openDayGallery } from '../src/pages/events/open-day/openDayGallery.js'
import { clubFilm, filmStrip, filmTime, sceneAt, sceneSpans } from '../src/pages/events/open-day/openDayFilms.js'
import { ROUTES, jsonLdFor, routeFor } from '../src/seo/seoConfig.js'
import { renderRoute, sitemap } from '../scripts/seo-build.mjs'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

// Read JPEG SOF dimensions from the original file, not from the manifest.
function jpegDimensions(bytes) {
  assert.equal(bytes.readUInt16BE(0), 0xffd8)
  let offset = 2
  while (offset < bytes.length) {
    assert.equal(bytes[offset], 0xff)
    const marker = bytes[offset + 1]
    const length = bytes.readUInt16BE(offset + 2)
    if ([0xc0, 0xc1, 0xc2].includes(marker)) return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) }
    offset += length + 2
  }
  throw new Error('JPEG dimensions not found')
}

test('Open Day is a real completed 2026 event and the first standard card below AIVEX', () => {
  const event = eventArchive.find((item) => item.id === 'open-day-2026')
  assert.ok(event)
  assert.equal(eventArchive.filter((item) => item.id === event.id).length, 1)
  assert.equal(event.title, 'Open Day')
  assert.equal(event.year, 2026)
  assert.equal(event.edition, '05 October 2026')
  assert.equal(event.category, 'Community / Discovery')
  assert.equal(event.status, 'past')
  assert.equal(event.href, '/events/open-day-2026')
  assert.notEqual(event.isMock, true)
  assert.ok(event.image)
  assert.equal(event.poster, undefined)
  assert.equal(event.image.src, openDayGallery.find((photo) => photo.id === 'hall').src)
  const year = groupEventsByYear(eventArchive).find((group) => group.year === 2026)
  const cells = layoutYear(year.events)
  assert.equal(cells[0].event.id, 'aivex-2026')
  assert.equal(cells[0].variant, 'featured')
  assert.equal(cells[1].event.id, event.id)
  assert.equal(cells[1].variant, 'standard')
  assert.ok(eventArchive.filter((item) => item.isMock).every((item) => item.status === 'past'))
})

test('the gallery covers every supplied local image, with measured dimensions and truthful activity labeling', async () => {
  const files = (await readdir(new URL('../public/open-day/', import.meta.url))).filter((name) => !name.startsWith('.') && /\.(jpg|jpeg|png|webp|avif)$/i.test(name))
  assert.equal(openDayGallery.length, 10)
  assert.equal(new Set(openDayGallery.map((photo) => photo.src)).size, openDayGallery.length)
  assert.deepEqual(openDayGallery.map((photo) => photo.src.split('/').at(-1)).sort(), files.sort())
  for (const photo of openDayGallery) {
    assert.match(photo.src, /^\/open-day\/[^/]+\.jpg$/)
    assert.doesNotMatch(photo.src, /https?:|unsplash|\.\./i)
    assert.ok(photo.alt.length > 25, photo.id)
    assert.ok(photo.caption, photo.id)
    const bytes = await readFile(new URL(`../public${photo.src}`, import.meta.url))
    assert.deepEqual(jpegDimensions(bytes), { width: photo.width, height: photo.height }, photo.src)
    assert.equal(photo.orientation, photo.width === photo.height ? 'square' : 'portrait')
  }
  const activity = openDayGallery.find((photo) => photo.id === 'spin')
  assert.equal(activity.kind, 'activity')
  assert.match(activity.alt, /challenge wheel/)
  assert.match(activity.caption, /challenge/)
})

test('the lazy detail route uses the shared shell and only one H1', async () => {
  const app = await read('src/App.jsx')
  assert.match(app, /const OpenDayPage = lazy\(/)
  assert.match(app, /const OPEN_DAY_PAUSED = false/)
  assert.match(app, /path="\/events\/open-day-2026" element={<SitePage motionTrigger="viewport"><Suspense/)
  const components = await Promise.all(['OpenDayPage', 'OpenDayHero', 'OpenDayStory', 'OpenDayGallery', 'OpenDayLightbox', 'OpenDayClubFilm'].map((file) => read(`src/pages/events/open-day/${file}.jsx`)))
  assert.equal((components.join('\n').match(/<h1\b/g) || []).length, 1)
  assert.doesNotMatch(components.join('\n'), /<Navbar|<Footer|<PageHero|<iframe/)
  assert.match(components[1], /<Link to="\/events"/)
  assert.match(components[1], /dateTime="2026-10-05"/)
  assert.match(components[0], /to="\/community"/)
  assert.match(components[0], /<OpenDayHero \/>\s*<OpenDayClubFilm \/>/)
  assert.match(components[1], /href="#club-film"/)
  assert.match(components[2], /AI &amp; Development/)
})

function mp4Atoms(bytes, start = 0, end = bytes.length) {
  const entries = []
  for (let offset = start; offset + 8 <= end;) {
    const size = bytes.readUInt32BE(offset) || end - offset
    assert.ok(size >= 8 && offset + size <= end)
    entries.push({ type: bytes.toString('ascii', offset + 4, offset + 8), start: offset + 8, end: offset + size })
    offset += size
  }
  return entries
}

// Measure the video track's display size and duration from the file itself.
function mp4Video(bytes) {
  const top = mp4Atoms(bytes)
  const movie = top.find((atom) => atom.type === 'moov')
  const tracks = mp4Atoms(bytes, movie.start, movie.end).filter((atom) => atom.type === 'trak').map((atom) => {
    const children = mp4Atoms(bytes, atom.start, atom.end)
    const media = children.find((child) => child.type === 'mdia')
    const mediaChildren = mp4Atoms(bytes, media.start, media.end)
    const handler = mediaChildren.find((child) => child.type === 'hdlr')
    return { children, mediaChildren, type: bytes.toString('ascii', handler.start + 8, handler.start + 12) }
  })
  const track = tracks.find((atom) => atom.type === 'vide')
  const header = track.children.find((atom) => atom.type === 'tkhd')
  const mediaHeader = track.mediaChildren.find((atom) => atom.type === 'mdhd')
  const version = bytes[mediaHeader.start]
  const timescale = bytes.readUInt32BE(mediaHeader.start + (version ? 20 : 12))
  const duration = version ? Number(bytes.readBigUInt64BE(mediaHeader.start + 24)) : bytes.readUInt32BE(mediaHeader.start + 16)
  return {
    width: bytes.readUInt32BE(header.end - 8) / 65536,
    height: bytes.readUInt32BE(header.end - 4) / 65536,
    duration: duration / timescale,
    audio: tracks.some((atom) => atom.type === 'soun'),
    layout: top.map((atom) => atom.type),
  }
}

// Lossy (VP8) or extended (VP8X) WebP: read the frame size from the file.
function webpSize(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF')
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP')
  const chunk = bytes.toString('ascii', 12, 16)
  if (chunk === 'VP8 ') return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff }
  if (chunk === 'VP8X') return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) }
  throw new Error(`unsupported WebP chunk ${chunk}`)
}

async function pngSize(path) {
  const poster = await readFile(new URL(`../public${path}`, import.meta.url))
  assert.equal(poster.toString('hex', 0, 8), '89504e470d0a1a0a')
  return { width: poster.readUInt32BE(16), height: poster.readUInt32BE(20) }
}

test('the supplied Open Day folder has one measured film and a matching local poster', async () => {
  const files = (await readdir(new URL('../public/open-day/', import.meta.url))).filter((name) => /\.mp4$/i.test(name))
  assert.deepEqual([clubFilm.src.split('/').at(-1)], files)
  assert.match(clubFilm.src, /^\/open-day\/.+\.mp4$/)
  assert.match(clubFilm.poster, /^\/open-day\/posters\/.+\.png$/)
  assert.deepEqual(await pngSize(clubFilm.poster), { width: clubFilm.width, height: clubFilm.height })
  assert.equal(filmTime(17.833), '00:17')
  assert.equal(filmTime(Number.NaN), '00:00')
})

test('the club film is the new measured portrait edit with sound and scenes inside its runtime', async () => {
  const video = mp4Video(await readFile(new URL(`../public${clubFilm.src}`, import.meta.url)))
  assert.deepEqual({ width: video.width, height: video.height }, { width: clubFilm.width, height: clubFilm.height })
  assert.deepEqual({ width: clubFilm.width, height: clubFilm.height }, { width: 464, height: 832 })
  assert.ok(clubFilm.height > clubFilm.width)
  assert.ok(Math.abs(video.duration - clubFilm.duration) < .1)
  assert.equal(video.audio, true)
  assert.ok(video.layout.includes('moov'))
  assert.deepEqual(await pngSize(clubFilm.poster), { width: clubFilm.width, height: clubFilm.height })
  assert.ok(clubFilm.description.length > 60)
  assert.equal(clubFilm.scenes[0].time, 0)
  clubFilm.scenes.forEach((scene, index) => {
    assert.ok(scene.title && scene.note, `scene ${index}`)
    assert.ok(scene.time < clubFilm.duration)
    if (index) assert.ok(scene.time > clubFilm.scenes[index - 1].time, 'scenes ascend')
  })
})

test('the club film loads nothing until asked, plays with sound under house controls, and stops offscreen or under a dialog', async () => {
  const film = await read('src/pages/events/open-day/OpenDayClubFilm.jsx')
  const video = film.match(/<video\b[^>]*>/)[0]
  assert.match(video, /preload="none"[\s\S]*playsInline/)
  assert.doesNotMatch(video, /\b(autoPlay|muted|loop|controls)\b/, 'no autoplay, forced mute, loop or native controls')
  assert.doesNotMatch(film, /autoPlay/)
  assert.match(film, /else if \(video\.error\) \{[\s\S]*video\.load\(\)/)
  assert.match(film, /<p className="od-feature-error" role="status">\{failed &&/)
  assert.match(film, /IntersectionObserver/)
  assert.match(film, /infinity:scroll-lock/)
  assert.match(film, /loadedmetadata/)
  assert.match(film, /aria-current={started && index === scene/)
  assert.match(film, /<h2 id="od-feature-title">/)
  assert.equal((film.match(/<video\b/g) || []).length, 1, 'one video element, no visual duplicates')
  assert.doesNotMatch(film, /<canvas|<iframe/)
  assert.match(film, /setStatus\('ended'\)/)
  for (const title of ["'Press play'", "'Continue'", "'Watch again'"]) assert.ok(film.includes(`title: ${title}`), title)
  assert.match(film, /className="od-feature-play" data-state={status} hidden={status === 'playing'}/)
})

test('the house controls work by keyboard, pointer and screen reader, full screen included', async () => {
  const film = await read('src/pages/events/open-day/OpenDayClubFilm.jsx')
  assert.match(film, /role="group" aria-label="Film controls" hidden={!started}/)
  assert.match(film, /type="range"[\s\S]*step="any"[\s\S]*aria-label="Seek in the film"[\s\S]*aria-valuetext=/)
  assert.match(film, /aria-label={playing \? 'Pause the film' : 'Play the film'}/)
  assert.match(film, /aria-pressed={muted} aria-label="Mute sound"/)
  assert.match(film, /frame\.requestFullscreen\(\)[\s\S]*webkitEnterFullscreen/)
  assert.match(film, /fullscreenchange/)
  for (const key of ["'k'", "'m'", "'f'", "'Home'", "'End'"]) assert.ok(film.includes(key), key)
  // The controls never rest while a keyboard user is inside them.
  assert.match(film, /querySelector\(':focus-visible'\)/)
  // A chapter pressed below the fold brings the screen into view before playing.
  assert.match(film, /bringIntoView\(\)\s*video\.play\(\)/)
})

test('chapter spans tile the runtime and every chapter has its own decoded frame', async () => {
  assert.equal(sceneSpans.length, clubFilm.scenes.length)
  assert.equal(sceneSpans[0].start, 0)
  assert.equal(sceneSpans.at(-1).end, 1)
  sceneSpans.forEach((span, index) => {
    assert.ok(span.end > span.start, `span ${index}`)
    if (index) assert.equal(span.start, sceneSpans[index - 1].end)
  })
  assert.equal(sceneAt(0), 0)
  assert.equal(sceneAt(clubFilm.scenes[2].time), 2)
  assert.equal(sceneAt(clubFilm.duration), clubFilm.scenes.length - 1)
  assert.equal(new Set(clubFilm.scenes.map((scene) => scene.thumb)).size, clubFilm.scenes.length)
  for (const scene of clubFilm.scenes) {
    assert.match(scene.thumb, /^\/open-day\/posters\/scene-\d\d\.webp$/)
    assert.deepEqual(webpSize(await readFile(new URL(`../public${scene.thumb}`, import.meta.url))), { width: 96, height: 172 }, scene.thumb)
  }
})

test('the 35 mm strip is one measured sprite of real frames that runs one loop per screening', async () => {
  const { frames, frameWidth, frameHeight, gap, times } = filmStrip
  assert.match(filmStrip.src, /^\/open-day\/posters\/[^/]+\.webp$/)
  assert.deepEqual(webpSize(await readFile(new URL(`../public${filmStrip.src}`, import.meta.url))), { width: frameWidth, height: frames * (frameHeight + gap) })
  assert.equal(times.length, frames)
  times.forEach((time, index) => {
    assert.ok(time > 0 && time < clubFilm.duration, `frame ${index}`)
    if (index) assert.ok(time > times[index - 1], 'frames ascend')
  })
  const strip = await read('src/pages/events/open-day/OpenDayFilmStrip.jsx')
  const css = await read('src/pages/events/open-day/open-day-film.css')
  assert.match(strip, /<div className="od-strip" aria-hidden="true">/)
  assert.match(strip, /alt="" loading="lazy" decoding="async"/)
  assert.match(css, /\.od-strip-reel \{[^}]*translate3d\(0, calc\(var\(--film-progress\) \* -50%\), 0\)/)
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*\.od-strip-reel \{ transform: none; \}/)
})

test('chapters start on hard cuts and the cut is checked every frame', async () => {
  // Cuts measured by frame difference in the supplied file.
  assert.deepEqual(clubFilm.scenes.map((scene) => scene.time), [0, 5.03, 12.63, 26.93])
  const film = await read('src/pages/events/open-day/OpenDayClubFilm.jsx')
  assert.match(film, /const paint = useCallback\(\(\) => \{[\s\S]*?setScene\(sceneAt\(time\)\)[\s\S]*?\}, \[\]\)/)
  assert.match(film, /key={scene} className="od-feature-caption"/)
  assert.match(film, /key={`cut-\$\{scene\}`} className="od-feature-cut"/)
})

test('the projector opening runs once, only for a screen still below the fold, and leaves base CSS behind', async () => {
  const motion = await read('src/pages/events/open-day/useOpenDayMotion.js')
  const css = await read('src/pages/events/open-day/open-day-film.css')
  assert.match(motion, /getBoundingClientRect\(\)\.top <= window\.innerHeight \* \.9\) return/)
  assert.match(motion, /once: true, onEnter: \(\) => opening\.play\(\)/)
  assert.match(motion, /clearProps: 'all'/)
  assert.match(motion, /if \(reduced\) return\s*armProjector\(/)
  assert.doesNotMatch(motion, /clipPath|clip-path|filter:/)
  for (const part of ['shutter', 'slit', 'flash']) assert.match(css, new RegExp(`\\.od-feature-${part} \\{[^}]*visibility: hidden`), part)
  const tilt = await read('src/pages/events/open-day/useScreenTilt.js')
  assert.match(tilt, /\(hover: hover\) and \(pointer: fine\)/)
  assert.match(tilt, /if \(!enabled \|\| reduced/)
  const film = await read('src/pages/events/open-day/OpenDayClubFilm.jsx')
  assert.match(film, /useScreenTilt\(stageRef, status === 'idle'\)/)
  assert.match(film, /data-cursor="play"/)
})

test('the portrait film gets an editorial responsive layout and a reduced-motion fallback', async () => {
  const css = await read('src/pages/events/open-day/open-day-film.css')
  const film = await read('src/pages/events/open-day/OpenDayClubFilm.jsx')
  assert.match(css, /grid-template-columns: minmax\(190px, \.72fr\) minmax\(290px, 420px\) minmax\(210px, \.82fr\)/)
  assert.match(css, /aspect-ratio: 464 \/ 832/)
  assert.match(css, /@media \(max-width: 1050px\)/)
  assert.match(css, /@media \(max-width: 700px\)/)
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.match(css, /\.od-feature-frame:fullscreen/)
  assert.match(css, /scaleX\(clamp\(0, \(var\(--film-progress\) - var\(--start\)\)/)
  assert.doesNotMatch(film, /useOpenDayFilmMotion|data-film-mode|autoPlay/)
})

test('the detail page is indexable, self-canonical, sitemap eligible and preserves private route exclusions', async () => {
  const route = routeFor('/events/open-day-2026')
  assert.equal(route.robots, 'index,follow')
  assert.equal(route.sitemap, true)
  assert.equal(route.priority, '0.7')
  const html = renderRoute(await read('index.html'), route)
  assert.match(html, /<title>Open Day 2026 \| Infinity Club, Bordj Bou Arreridj<\/title>/)
  assert.match(html, /rel="canonical" href="https:\/\/www.infinty-bba.com\/events\/open-day-2026"/)
  assert.ok(sitemap(ROUTES.filter((item) => item.sitemap)).includes('/events/open-day-2026</loc>'))
  for (const path of ['/admin', '/aivex/status', '/aivex/register', '/join']) assert.equal(routeFor(path).sitemap, false)
  const blocks = jsonLdFor(route)
  assert.deepEqual(blocks.map((block) => block['@type']), ['WebPage', 'Event'])
  assert.equal(blocks[1].startDate, '2026-10-05')
  assert.doesNotMatch(JSON.stringify(blocks[1]), /T\d\d:|"endDate"|"offers"|"performer"|"attendance"/)
})

test('image loading, lightweight modal and reduced-motion fallbacks remain part of the page', async () => {
  const gallery = await read('src/pages/events/open-day/OpenDayGallery.jsx')
  const hero = await read('src/pages/events/open-day/OpenDayHero.jsx')
  const modal = await read('src/pages/events/open-day/OpenDayLightbox.jsx')
  const motion = await read('src/pages/events/open-day/useOpenDayMotion.js')
  const css = await read('src/pages/events/open-day/open-day.css')
  assert.match(gallery, /width={photo.width} height={photo.height}.*loading="lazy" decoding="async"/)
  assert.match(hero, /loading="eager" fetchPriority="high"/)
  for (const pattern of [/createPortal/, /role="dialog"/, /aria-modal="true"/, /ArrowLeft/, /ArrowRight/, /Escape/, /event.key === 'Tab'/, /root.inert = true/, /overflow = 'hidden'/, /previousFocus.focus/, /infinity:scroll-lock/]) assert.match(modal, pattern)
  assert.match(motion, /useScrollAnimations/)
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.match(css, /opacity: 1 !important/)
  const head = await read('src/seo/RouteSeo.jsx')
  assert.match(head, /jsonLdFor\(route\)/)
  assert.match(head, /script\[data-route-seo\]/)
})
