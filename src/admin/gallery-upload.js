const FORMATS = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 5 * 1024 * 1024
export const MAX_GALLERY_PHOTOS = 100

// Send one file at a time to the existing endpoint, keeping memory usage bounded.
export async function uploadGalleryFiles({ files, gallery, uploadImage, saveGallery, readSettings, deleteImage, onSaved, onProgress }) {
  const selected = Array.from(files)
  const failures = []
  const valid = selected.filter(file => {
    const error = !FORMATS.has(file.type) ? 'Use JPG, PNG ou WebP.' : file.size > MAX_BYTES ? 'A foto ultrapassa 5 MB.' : file.size === 0 ? 'O arquivo está vazio.' : ''
    if (error) failures.push({ name: file.name, error })
    return !error
  })
  if (gallery.length + valid.length > MAX_GALLERY_PHOTOS) {
    throw new Error(`A galeria permite até ${MAX_GALLERY_PHOTOS} fotos. Você pode adicionar mais ${Math.max(0, MAX_GALLERY_PHOTOS - gallery.length)}.`)
  }
  let currentGallery = [...gallery]
  let savedCount = 0
  let remaining = 0
  for (let index = 0; index < valid.length; index++) {
    const file = valid[index]
    onProgress?.({ current: index + 1, total: valid.length, name: file.name })
    let uploaded
    try { uploaded = await uploadImage(file) } catch (error) {
      failures.push({ name: file.name, error: error.message || 'Não foi possível enviar.' })
      if ([401, 403].includes(error.status)) { remaining = valid.length - index - 1; break }
      continue
    }
    try {
      const saved = await saveGallery([...currentGallery, uploaded.url])
      currentGallery = [...saved.gallery]
      onSaved?.(saved)
      savedCount++
    } catch (error) {
      // A network failure may arrive after the server committed the settings.
      // Reconcile before cleaning up, otherwise a saved photo could be deleted.
      let actual
      try { actual = await readSettings() } catch {}
      if (Array.isArray(actual?.gallery)) {
        currentGallery = [...actual.gallery]
        onSaved?.(actual)
        if (actual.gallery.includes(uploaded.url)) { savedCount++; continue }
        if (uploaded.id) await deleteImage(uploaded.id).catch(() => {})
      }
      failures.push({ name: file.name, error: error.message || 'Não foi possível salvar a foto na galeria.' })
      remaining = valid.length - index - 1
      break
    }
  }
  return { savedCount, failures, remaining }
}
