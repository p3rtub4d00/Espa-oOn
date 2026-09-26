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
import { saveSettings } from '../data/settings'

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
  const [imageUrl, setImageUrl] = useState('')
  const [amenity, setAmenity] = useState({
    name: '',
    description: '',
    icon: 'game',
  })
  const [message, setMessage] = useState('')

  const persist = (next) => {
    setSettings(next)
    saveSettings(next)
  }

  const addImageUrl = () => {
    const url = imageUrl.trim()
    if (!url) return
    const next = { ...settings, gallery: [...settings.gallery, url] }
    persist(next)
    setImageUrl('')
    setMessage('Foto adicionada.')
  }

  const addLocalImage = (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setMessage('Escolha um arquivo de imagem.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setMessage('Para esta fase de testes, use imagens com até 2 MB.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const next = { ...settings, gallery: [...settings.gallery, reader.result] }
        persist(next)
        setMessage('Foto adicionada neste navegador.')
      } catch {
        setMessage('Não foi possível salvar. Tente uma imagem menor.')
      }
    }
    reader.readAsDataURL(file)
  }

  const removeImage = (index) => {
    const next = {
      ...settings,
      gallery: settings.gallery.filter((_, itemIndex) => itemIndex !== index),
    }
    persist(next)
  }

  const addAmenity = () => {
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
    persist(next)
    setAmenity({ name: '', description: '', icon: 'game' })
    setMessage('Item adicionado à estrutura.')
  }

  const removeAmenity = (id) => {
    const next = {
      ...settings,
      amenities: settings.amenities.filter((item) => item.id !== id),
    }
    persist(next)
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
              <button onClick={addImageUrl}><Plus size={15} /> Adicionar</button>
            </div>
          </label>

          <div className="upload-local-box">
            <div>
              <strong>Ou envie uma foto do aparelho</strong>
              <span>Para testes locais, até 2 MB por imagem.</span>
            </div>
            <button onClick={() => fileRef.current?.click()}>Escolher foto</button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                addLocalImage(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>

          {message && <p className="content-admin-message">{message}</p>}
        </div>

        <div className="admin-gallery-grid">
          {settings.gallery.map((src, index) => (
            <article key={src.slice(0, 60) + index}>
              <img src={src} alt={'Foto do clube ' + (index + 1)} />
              <div>
                <span>Foto {index + 1}</span>
                <button onClick={() => removeImage(index)} title="Apagar foto">
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
