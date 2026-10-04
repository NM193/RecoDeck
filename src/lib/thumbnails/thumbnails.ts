// src/lib/thumbnails/thumbnails.ts
// Thumbnails of the files' artwork, made on the client (track table spec,
// Rows): the raw bytes from get_track_artwork are drawn down to 72×72 on a
// canvas and only the small JPEG is kept. (artworkCache keeps full images,
// for the now-playing bar.) One cache and queue serve every track table.
import { tauriApi } from '../tauri-api'
import { ThumbnailCache, ThumbnailQueue, type Thumb } from './queue'

/** Pixels: twice the 36px cover, so it stays sharp on retina screens. */
export const THUMB_SIZE = 72

/**
 * A 72px JPEG of the picture's middle square. It rejects when the picture
 * does not decode; the queue keeps that as null, like no artwork.
 */
export async function makeThumbnail(bytes: ArrayBuffer): Promise<Thumb> {
  const bitmap = await createImageBitmap(new Blob([bytes]))
  try {
    const canvas = document.createElement('canvas')
    canvas.width = THUMB_SIZE
    canvas.height = THUMB_SIZE
    const context = canvas.getContext('2d')
    if (!context) return null
    context.imageSmoothingQuality = 'high'
    const side = Math.min(bitmap.width, bitmap.height)
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      THUMB_SIZE,
      THUMB_SIZE,
    )
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    )
    return blob ? URL.createObjectURL(blob) : null
  } finally {
    bitmap.close()
  }
}

// get_track_artwork answers an error for a track without artwork; the queue
// keeps that, and a picture that will not decode, as null.
async function loadThumbnail(trackId: number): Promise<Thumb> {
  return makeThumbnail(await tauriApi.getTrackArtwork(trackId))
}

export const thumbnails = new ThumbnailQueue(
  new ThumbnailCache(1000, (url) => URL.revokeObjectURL(url)),
  loadThumbnail,
  4,
)
