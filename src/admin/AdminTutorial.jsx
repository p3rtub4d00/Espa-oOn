import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BookOpen, ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react'
import { tutorialTopics } from './tutorial-topics'
import './tutorial.css'

export default function AdminTutorial({ demoMode, onNavigate, onClose, onDismiss, headingRef }) {
  const [index, setIndex] = useState(0)
  const dialogRef = useRef(null)
  useEffect(() => {
    const dialog = dialogRef.current
    const previousOverflow = document.body.style.overflow
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    headingRef.current?.focus({ preventScroll: true })
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
    }
  }, [headingRef])
  const topic = tutorialTopics[index]
  return createPortal(
    <dialog ref={dialogRef} className="admin-tutorial-modal" aria-labelledby="admin-tutorial-heading" onCancel={(event) => { event.preventDefault(); onClose() }}>
    <section className="admin-tutorial" aria-labelledby="admin-tutorial-heading">
      <div className="admin-tutorial-head">
        <div className="admin-tutorial-heading"><BookOpen size={24} /><div><span>Guia do proprietário</span><h2 id="admin-tutorial-heading" tabIndex={-1} ref={headingRef}>Como usar o painel</h2></div></div>
        <button className="admin-tutorial-close" onClick={onClose} aria-label="Fechar tutorial"><X size={20} /></button>
      </div>
      <p className="admin-tutorial-intro">Aprenda no seu ritmo. Escolha uma função ou avance pelos tópicos; os atalhos apenas abrem a seção, sem alterar seus dados.</p>
      {demoMode && <p className="admin-tutorial-demo">Você está na demonstração: explore o painel e simule uma reserva sem pagamento real.</p>}
      <div className="admin-tutorial-body">
        <div className="admin-tutorial-picker"><label htmlFor="admin-tutorial-topic">O que você quer aprender?</label><select id="admin-tutorial-topic" value={index} onChange={(event) => setIndex(Number(event.target.value))}>{tutorialTopics.map((item, i) => <option value={i} key={item.id}>{i + 1}. {item.title}</option>)}</select><span>Tópico {index + 1} de {tutorialTopics.length}</span></div>
        <div className="admin-tutorial-topic" aria-live="polite" aria-atomic="true">
          <span className="admin-tutorial-path">{topic.path}</span><h3>{topic.title}</h3>
          <ol>{topic.steps.map((step) => <li key={step}>{step}</li>)}</ol>
          {demoMode && topic.demo && <p className="admin-tutorial-demo">{topic.demo}</p>}
          <button className="admin-tutorial-open" onClick={() => onNavigate(topic.target || topic.id)}><ExternalLink size={16} />Abrir seção</button>
        </div>
      </div>
      <div className="admin-tutorial-footer">
        <div className="admin-tutorial-pagination"><button disabled={index === 0} onClick={() => setIndex((value) => value - 1)}><ChevronLeft size={16} />Voltar</button><button disabled={index === tutorialTopics.length - 1} onClick={() => setIndex((value) => value + 1)}>Próximo<ChevronRight size={16} /></button></div>
        <button className="admin-tutorial-dismiss" onClick={onDismiss}>Não mostrar novamente</button>
      </div>
      <small className="admin-tutorial-preference">Essa preferência vale neste navegador. Você sempre pode reabrir pelo botão “Como usar o painel”.</small>
    </section>
    </dialog>,
    document.body,
  )
}
