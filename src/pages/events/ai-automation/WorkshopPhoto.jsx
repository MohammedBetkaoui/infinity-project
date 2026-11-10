export default function WorkshopPhoto({ photo, sizes = '(max-width: 767px) 90vw, 45vw', priority = false, eager = false, ...props }) {
  return <img src={photo.src} srcSet={photo.srcSet} sizes={sizes} width={photo.width} height={photo.height} alt={photo.alt} loading={priority || eager ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : eager ? 'low' : undefined} decoding="async" {...props} />
}
