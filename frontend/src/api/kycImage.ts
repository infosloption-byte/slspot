/**
 * Prepare a photo for upload: shrink it so a phone camera image fits the size limit, and re-encode it as JPEG.
 * Re-encoding through a canvas also drops EXIF metadata such as GPS position and device details.
 */
const MAX_EDGE = 2200
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']

export class ImagePrepareError extends Error {}

export async function prepareKycImage(file: File): Promise<string> {
  if (!ACCEPTED.includes(file.type)) throw new ImagePrepareError('Choose a JPG, PNG or WebP photo.')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new ImagePrepareError('This photo could not be read. Try a different file.')
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new ImagePrepareError('This browser cannot process photos.')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
  if (!blob) throw new ImagePrepareError('This photo could not be processed. Try a different file.')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(binary)
}
