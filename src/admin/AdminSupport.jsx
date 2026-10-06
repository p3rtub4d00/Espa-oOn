import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { CircleHelp, Wrench, ArrowUpRight, X } from 'lucide-react'
import Clubi from '../components/Clubi'
import './support.css'

function supportLink(kind, clubName, sectionName) {
  const message = [
    'Olá, equipe ClubeOn! Preciso de suporte.',
    `Assunto: ${kind}`,
    `Clube: ${clubName || 'Não informado'}`,
    `Seção do painel: ${sectionName || 'Visão geral'}`,
    '',
    kind === 'Informar erro ou problema'
      ? 'O que aconteceu: [descreva o problema e o que estava tentando fazer]'
      : 'Minha dúvida: [descreva sua dúvida]',
  ].join('\n')
  return 'https://wa.me/5569999695779?text=' + encodeURIComponent(message)
}

export default function AdminSupport({ clubName, sectionName, onClose }) {
  const dialogRef = useRef(null)
  const headingRef = useRef(null)
  useEffect(() => {
    const dialog = dialogRef.current
    const previousOverflow = document.body.style.overflow
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    headingRef.current?.focus({ preventScroll: true })
    return () => { dialog.close(); document.body.style.overflow = previousOverflow }
  }, [])
  return createPortal(
    <dialog className="admin-support-modal" ref={dialogRef} aria-labelledby="admin-support-heading" onCancel={(event) => { event.preventDefault(); onClose() }}>
      <button className="admin-support-close" onClick={onClose} aria-label="Fechar suporte"><X size={20} /></button>
      <div className="admin-support-intro">
        <div className="admin-support-mascot"><Clubi wave /></div>
        <span>Estamos aqui para ajudar</span>
        <h2 id="admin-support-heading" tabIndex={-1} ref={headingRef}>Suporte ClubeOn</h2>
        <p>Escolha o assunto e converse com nossa equipe pelo WhatsApp.</p>
      </div>
      <div className="admin-support-options">
        <a href={supportLink('Tirar uma dúvida', clubName, sectionName)} target="_blank" rel="noopener noreferrer"><CircleHelp size={23} /><span><strong>Tirar uma dúvida</strong><small>Ajuda para usar as funções do painel</small></span><ArrowUpRight size={20} /></a>
        <a href={supportLink('Informar erro ou problema', clubName, sectionName)} target="_blank" rel="noopener noreferrer"><Wrench size={23} /><span><strong>Informar erro ou problema</strong><small>Conte o que aconteceu para verificarmos</small></span><ArrowUpRight size={20} /></a>
      </div>
      <div className="admin-support-context"><span>Seu espaço</span><strong>{clubName}</strong><span>Seção atual: {sectionName}</span></div>
      <p className="admin-support-note">O WhatsApp abre com uma mensagem preparada. Complete a descrição e toque em enviar. Para informar um erro, você também pode anexar um print sem dados dos clientes.</p>
      <small className="admin-support-contact">WhatsApp da equipe: (69) 99969-5779</small>
    </dialog>, document.body,
  )
}
