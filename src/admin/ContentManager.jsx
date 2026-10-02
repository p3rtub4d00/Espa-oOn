import { uploadGalleryFiles, MAX_GALLERY_PHOTOS } from './gallery-upload'
import { useRef, useState } from 'react'
import {
  Armchair,
  Dumbbell,
  Gamepad2,
  ImagePlus,
  Plus,
  Snowflake,
  Trash2,
  UtensilsCrossed,
  Waves,
} from 'lucide-react'
import { api } from '../data/api'

const iconOptions = [
  ['pool', 'Piscina'],
  ['game', 'Jogos / sinuca'],
  ['food', 'Cozinha / apoio'],
  ['cold', 'Geleira / freezer'],
  ['chair', 'Mesas e cadeiras'],
  ['sport', 'Esporte'],
]

export default function ContentManager({ mode, settings, setSettings }) {
  const fileRef = useRef(null)
  const uploadLock = useRef(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [uploadFailures, setUploadFailures] = useState([])
  const [imageUrl, setImageUrl] = useState('')
  const [amenity, setAmenity] = useState({
    name: '',
    description: '',
    icon: 'game',
  })
  const [message, setMessage] = useState('')

  const persist = async (next) => {
    setSettings(next)
    try {
      const saved = await api.saveSettings(next)
      setSettings(saved)
      return saved
    } catch (error) {
      setMessage(error.message || 'Não foi possível salvar as alterações.')
      throw error
    }
  }

  const addImageUrl = async () => {
    if (uploadLock.current) return
    if (settings.gallery.length >= MAX_GALLERY_PHOTOS) { setMessage('A galeria permite até 100 fotos.'); return }
    const url = imageUrl.trim()
    if (!url) return
    if (!/^https:\/\//i.test(url)) {
      setMessage('Informe uma URL segura iniciando com https://.')
      return
    }
    const next = { ...settings, gallery: [...settings.gallery, url] }
    try {
      await persist(next)
      setImageUrl('')
      setMessage('Foto adicionada.')
    } catch {}
  }

  const addLocalImages = async (files) => {
    if (!files?.length || uploadLock.current) return
    uploadLock.current = true
    setUploading(true)
    setUploadFailures([])
    setUploadProgress(null)
    setMessage('Preparando fotos...')
    try {
      const result = await uploadGalleryFiles({
        files,
        gallery: settings.gallery,
        uploadImage: api.uploadImage,
        saveGallery: gallery => api.saveSettings({ gallery }),
        readSettings: api.getAdminSettings,
        deleteImage: api.deleteImage,
        onSaved: saved => setSettings(current => ({ ...current, ...saved })),
        onProgress: progress => { setUploadProgress(progress); setMessage('') },
      })
      setUploadFailures(result.failures)
      const success = result.savedCount === 1 ? '1 foto enviada e salva online.' : `${result.savedCount} fotos enviadas e salvas online.`
      setMessage(success + (result.failures.length ? ` ${result.failures.length} arquivo(s) não foram salvos; confira abaixo.` : '') + (result.remaining ? ` Envio interrompido: ${result.remaining} foto(s) ainda não foram enviadas.` : ''))
    } catch (error) {
      setMessage(error.message || 'Não foi possível enviar as fotos.')
    } finally {
      uploadLock.current = false
      setUploading(false)
      setUploadProgress(null)
    }
  }

  const removeImage = async (index) => {
    if (uploadLock.current) return
    const src = settings.gallery[index]
    const next = {
      ...settings,
      gallery: settings.gallery.filter((_, itemIndex) => itemIndex !== index),
    }

    try {
      await persist(next)

      const match = String(src || '').match(/^\/api\/images\/([a-f0-9]{24})$/i)
      if (match) {
        await api.deleteImage(match[1]).catch(() => {})
      }

      setMessage('Foto removida da galeria.')
    } catch {}
  }

  const addAmenity = async () => {
    if (!amenity.name.trim()) {
      setMessage('Informe o nome do item.')
      return
    }

    const item = {
      id: 'item-' + Date.now(),
      name: amenity.name.trim(),
      description: amenity.description.trim() || 'Disponível para os convidados.',
      icon: amenity.icon,
    }

    const next = { ...settings, amenities: [...settings.amenities, item] }
    try {
      await persist(next)
      setAmenity({ name: '', description: '', icon: 'game' })
      setMessage('Item adicionado à estrutura.')
    } catch {}
  }

  const removeAmenity = async (id) => {
    const next = {
      ...settings,
      amenities: settings.amenities.filter((item) => item.id !== id),
    }
    try {
      await persist(next)
      setMessage('Item removido.')
    } catch {}
  }

  if (mode === 'gallery') {
    return (
      <section className="admin-card large">
        <div className="admin-card-title">
          <div>
            <span>Galeria do clube</span>
            <strong>{settings.gallery.length} fotos cadastradas</strong>
          </div>
          <ImagePlus />
        </div>

        <div className="content-admin-form">
          <label>
            <span>Adicionar por link</span>
            <div>
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
              />
              <button disabled={uploading} onClick={addImageUrl}><Plus size={15} /> Adicionar</button>
            </div>
          </label>

          <div className="upload-local-box">
            <div>
              <strong>Ou envie várias fotos do aparelho</strong>
              <span>Selecione várias fotos de uma vez. JPG, PNG ou WebP, até 5 MB por foto. Limite de 100 fotos na galeria.</span>
            </div>
            <button disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? 'Enviando fotos...' : 'Escolher fotos'}</button>
            <input
              ref={fileRef}
              type="file"
              multiple
              disabled={uploading}
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => {
                const files = Array.from(e.target.files || [])
                void addLocalImages(files)
                e.target.value = ''
              }}
            />
          </div>

          {uploading && uploadProgress && <div className="gallery-upload-progress" role="status" aria-live="polite">
            <strong>Enviando foto {uploadProgress.current} de {uploadProgress.total}</strong>
            <span>{uploadProgress.name}</span>
            <progress value={uploadProgress.current - 1} max={uploadProgress.total} aria-label="Fotos processadas" />
            <small>Aguarde o término do envio antes de sair desta página.</small>
          </div>}
          {message && <p className="content-admin-message" role="status">{message}</p>}
          {uploadFailures.length > 0 && <ul className="gallery-upload-errors">
            {uploadFailures.map((item, index) => <li key={index}><strong>{item.name}</strong>: {item.error}</li>)}
          </ul>}
        </div>

        <div className="admin-gallery-grid">
          {settings.gallery.map((src, index) => (
            <article key={src.slice(0, 60) + index}>
              <img src={src} alt={'Foto do clube ' + (index + 1)} />
              <div>
                <span>Foto {index + 1}</span>
                <button disabled={uploading} onClick={() => removeImage(index)} title="Apagar foto">
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    )
  }

  const getIcon = (type) => {
    if (type === 'pool') return <Waves />
    if (type === 'food') return <UtensilsCrossed />
    if (type === 'cold') return <Snowflake />
    if (type === 'chair') return <Armchair />
    if (type === 'sport') return <Dumbbell />
    return <Gamepad2 />
  }

  return (
    <section className="admin-card large">
      <div className="admin-card-title">
        <div>
          <span>Estrutura e comodidades</span>
          <strong>{settings.amenities.length} itens cadastrados</strong>
        </div>
        <Plus />
      </div>

      <div className="amenity-admin-form">
        <label>
          <span>Nome do item</span>
          <input
            value={amenity.name}
            onChange={(e) => setAmenity((current) => ({ ...current, name: e.target.value }))}
            placeholder="Ex.: Pula-pula"
          />
        </label>

        <label>
          <span>Descrição curta</span>
          <input
            value={amenity.description}
            onChange={(e) => setAmenity((current) => ({ ...current, description: e.target.value }))}
            placeholder="Ex.: Disponível para as crianças"
          />
        </label>

        <label>
          <span>Categoria / ícone</span>
          <select
            value={amenity.icon}
            onChange={(e) => setAmenity((current) => ({ ...current, icon: e.target.value }))}
          >
            {iconOptions.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>

        <button onClick={addAmenity}><Plus size={16} /> Adicionar item</button>
      </div>

      {message && <p className="content-admin-message">{message}</p>}

      <div className="amenity-admin-list">
        {settings.amenities.map((item) => (
          <article key={item.id}>
            <div className="amenity-admin-icon">{getIcon(item.icon)}</div>
            <div>
              <strong>{item.name}</strong>
              <span>{item.description}</span>
            </div>
            <button onClick={() => removeAmenity(item.id)} title="Remover item">
              <Trash2 size={16} />
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}
