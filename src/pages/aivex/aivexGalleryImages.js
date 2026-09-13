export function prepareGalleryPhoto(photo, cache) {
  if (!cache.has(photo.src)) {
    const image = new Image()
    image.src = photo.src
    const loaded = image.decode().catch((error) => {
      cache.delete(photo.src)
      throw error
    })
    cache.set(photo.src, loaded)
  }
  return cache.get(photo.src)
}
