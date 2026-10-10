import { readFile } from 'node:fs/promises'

function atoms(bytes, start = 0, end = bytes.length) {
  const entries = []
  for (let offset = start; offset + 8 <= end;) {
    const size = bytes.readUInt32BE(offset) || end - offset
    if (size < 8 || offset + size > end) throw new Error('Invalid MP4 atom')
    entries.push({ type: bytes.toString('ascii', offset + 4, offset + 8), start: offset + 8, end: offset + size })
    offset += size
  }
  return entries
}

const bytes = await readFile('public/open-day/video_2026-10-10_15-09-43.mp4')
const top = atoms(bytes)
const movie = top.find((atom) => atom.type === 'moov')
const tracks = atoms(bytes, movie.start, movie.end).filter((atom) => atom.type === 'trak').map((atom) => {
  const children = atoms(bytes, atom.start, atom.end)
  const media = children.find((child) => child.type === 'mdia')
  const mediaChildren = atoms(bytes, media.start, media.end)
  const handler = mediaChildren.find((child) => child.type === 'hdlr')
  return { children, mediaChildren, type: bytes.toString('ascii', handler.start + 8, handler.start + 12) }
})
const track = tracks.find((atom) => atom.type === 'vide')
const header = track.children.find((atom) => atom.type === 'tkhd')
const mediaHeader = track.mediaChildren.find((atom) => atom.type === 'mdhd')
const version = bytes[mediaHeader.start]
const timescale = bytes.readUInt32BE(mediaHeader.start + (version ? 20 : 12))
const duration = version ? Number(bytes.readBigUInt64BE(mediaHeader.start + 24)) : bytes.readUInt32BE(mediaHeader.start + 16)
console.log(JSON.stringify({
  width: bytes.readUInt32BE(header.end - 8) / 65536,
  height: bytes.readUInt32BE(header.end - 4) / 65536,
  duration: duration / timescale,
  audio: tracks.some((atom) => atom.type === 'soun'),
  layout: top.map((atom) => atom.type),
}, null, 2))
