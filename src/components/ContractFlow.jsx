import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  FileCheck2,
  Fingerprint,
  PenLine,
  QrCode,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react'
import { api } from '../data/api'
import { DEFAULT_SETTINGS } from '../data/settings'
import './contract.css'

function maskCpf(cpf = '') {
  const digits = cpf.replace(/\D/g, '')
  if (digits.length !== 11) return cpf
  return '***.' + digits.slice(3, 6) + '.' + digits.slice(6, 9) + '-**'
}

export default function ContractFlow({ reservation, onClose, onSigned, continueLabel = 'Concluir' }) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const [accepted, setAccepted] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [signedContract, setSignedContract] = useState(null)
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [verifyResult, setVerifyResult] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [cancellationPolicyText, setCancellationPolicyText] = useState('')
  const [policyLoading, setPolicyLoading] = useState(true)
  const [policyLoadError, setPolicyLoadError] = useState('')
  const [establishmentName, setEstablishmentName] = useState('EspaçoOn')

  const contractId = useMemo(
    () => 'CTR-' + reservation.id.replace('ESP-', ''),
    [reservation.id],
  )

  useEffect(() => {
    let active = true
    api.getSettings()
      .then((settings) => {
        if (!active) return

        const policyText = String(settings?.cancellationPolicy?.text || '').trim()
        if (policyText.length < 20) {
          throw new Error('A política de cancelamento ainda não foi configurada corretamente.')
        }

        setCancellationPolicyText(policyText)
        if (settings?.establishment?.name) {
          setEstablishmentName(settings.establishment.name)
        }
      })
      .catch((error) => {
        if (active) {
          setPolicyLoadError(error.message || 'Não foi possível carregar a política de cancelamento.')
        }
      })
      .finally(() => {
        if (active) setPolicyLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || signedContract) return

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const ratio = window.devicePixelRatio || 1
      const image = canvas.width && canvas.height ? canvas.toDataURL() : null
      canvas.width = Math.floor(rect.width * ratio)
      canvas.height = Math.floor(180 * ratio)
      canvas.style.height = '180px'
      const ctx = canvas.getContext('2d')
      ctx.scale(ratio, ratio)
      ctx.lineWidth = 2.2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#1d2a33'
      if (image && hasSignature) {
        const img = new Image()
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, 180)
        img.src = image
      }
    }

    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [signedContract, hasSignature])

  const getPoint = (event) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
  }

  const startDrawing = (event) => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const point = getPoint(event)
    drawingRef.current = true
    canvas.setPointerCapture?.(event.pointerId)
    ctx.beginPath()
    ctx.moveTo(point.x, point.y)
  }

  const draw = (event) => {
    if (!drawingRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const point = getPoint(event)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    setHasSignature(true)
  }

  const stopDrawing = (event) => {
    drawingRef.current = false
    if (event?.pointerId != null) {
      canvasRef.current?.releasePointerCapture?.(event.pointerId)
    }
  }

  const clearSignature = () => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  const signContract = async () => {
    if (!accepted || !hasSignature || saving || policyLoading || policyLoadError || !cancellationPolicyText) return
    setSaving(true)
    setSaveError('')

    const signedAt = new Date().toISOString()
    const signature = canvasRef.current.toDataURL('image/png')

    const contractRecord = {
      id: contractId,
      reservationId: reservation.id,
      reservationDate: reservation.date,
      reservationDateISO: reservation.dateISO,
      period: reservation.period,
      price: reservation.price,
      customer: reservation.customer,
      signedAt,
      signature,
      establishmentName,
      cancellationPolicyText,
      status: 'signed-awaiting-payment',
      paymentStatus: 'awaiting-payment',
    }

    try {
      const saved = await api.createContract(contractRecord)
      setSignedContract(saved)
    } catch (error) {
      setSaveError(error.message || 'Não foi possível salvar o contrato.')
    } finally {
      setSaving(false)
    }
  }

  const qrUrl = signedContract
    ? '/api/contracts/' + encodeURIComponent(signedContract.id) +
      '/qr?hash=' + encodeURIComponent(signedContract.hash)
    : ''

  const verifyContract = async () => {
    if (!signedContract || verifyLoading) return
    setVerifyLoading(true)
    setVerifyResult(null)
    try {
      const result = await api.verifyContract(signedContract.id, signedContract.hash)
      setVerifyResult(result)
    } catch (error) {
      setVerifyResult({ valid: false, error: error.message || 'Não foi possível verificar o contrato.' })
    } finally {
      setVerifyLoading(false)
    }
  }

  return (
    <div className="contract-backdrop" role="dialog" aria-modal="true" aria-label="Contrato digital">
      <div className="contract-modal">
        <div className="contract-topbar">
          <div>
            <span>Documento eletrônico</span>
            <strong>{contractId}</strong>
          </div>
          <button onClick={onClose} aria-label="Fechar contrato"><X /></button>
        </div>

        {!signedContract ? (
          <>
            <div className="contract-document">
              <div className="contract-heading">
                <span>Contrato de locação</span>
                <h2>Locação temporária do espaço de lazer</h2>
                <p>
                  Documento eletrônico gerado a partir dos dados informados na reserva e registrado no EspaçoOn.
                </p>
              </div>

              <div className="contract-meta">
                <div><span>Locatário</span><strong>{reservation.customer?.name}</strong></div>
                <div><span>CPF</span><strong>{maskCpf(reservation.customer?.cpf)}</strong></div>
                <div><span>Data da locação</span><strong>{reservation.date}</strong></div>
                <div><span>Período</span><strong>{reservation.period}</strong></div>
                <div><span>Valor</span><strong>R$ {Number(reservation.price).toFixed(2).replace('.', ',')}</strong></div>
                <div><span>Reserva</span><strong>{reservation.id}</strong></div>
              </div>

              <div className="contract-body">
                <p>
                  <strong>1. Objeto.</strong> O presente instrumento registra a locação temporária
                  do espaço de lazer indicado pela plataforma {establishmentName}, na data e período informados acima.
                </p>
                <p>
                  <strong>2. Uso do espaço.</strong> O locatário declara estar ciente de que deverá
                  utilizar o imóvel, piscina, campo, mobiliário e demais estruturas de forma responsável,
                  observando as regras apresentadas pelo proprietário.
                </p>
                <p>
                  <strong>3. Responsabilidade.</strong> O locatário responde pelo uso adequado do espaço
                  e por danos ao patrimônio que forem comprovadamente causados durante o período da locação.
                </p>
                <p>
                  <strong>4. Pagamento.</strong> O valor indicado neste documento será cobrado por Pix
                  por meio do Asaas e a reserva somente será confirmada após a confirmação do recebimento.
                </p>
                <div className="contract-cancellation-policy">
                  <div>
                    <ShieldCheck size={18} />
                    <strong>5. Política de cancelamento e reembolso</strong>
                  </div>
                  {policyLoading ? (
                    <p>Carregando política vigente...</p>
                  ) : policyLoadError ? (
                    <p className="contract-policy-error">{policyLoadError}</p>
                  ) : (
                    <p>{cancellationPolicyText}</p>
                  )}
                </div>
                <p>
                  <strong>6. Assinatura eletrônica.</strong> O sistema registra a manifestação de aceite,
                  a assinatura desenhada, a data e hora, o identificador do documento e um hash SHA-256
                  calculado no servidor para verificação de integridade.
                </p>
              </div>

              <div className="contract-evidence">
                <Fingerprint />
                <span>
                  <strong>Identificação do documento</strong>
                  ID {contractId}
                </span>
              </div>
            </div>

            <div className="signature-area">
              <div className="signature-title">
                <div>
                  <span>Assinatura eletrônica</span>
                  <strong>Assine no quadro abaixo usando o dedo ou o mouse.</strong>
                </div>
                <PenLine />
              </div>

              <div className="signature-canvas-wrap">
                <canvas
                  ref={canvasRef}
                  onPointerDown={startDrawing}
                  onPointerMove={draw}
                  onPointerUp={stopDrawing}
                  onPointerCancel={stopDrawing}
                  onPointerLeave={stopDrawing}
                />
                {!hasSignature && <span className="signature-placeholder">Assine aqui</span>}
              </div>

              <button className="clear-signature" onClick={clearSignature}>
                <RotateCcw size={15} /> Limpar assinatura
              </button>

              <label className="contract-accept">
                <input
                  type="checkbox"
                  checked={accepted}
                  disabled={policyLoading || Boolean(policyLoadError) || !cancellationPolicyText}
                  onChange={(event) => setAccepted(event.target.checked)}
                />
                <span>
                  Li o documento acima, inclusive a política de cancelamento e reembolso, concordo com seus termos
                  e autorizo o registro da minha assinatura eletrônica.
                </span>
              </label>

              {saveError && <p className="contract-save-error">{saveError}</p>}
              <button
                className="sign-contract-button"
                disabled={!accepted || !hasSignature || saving}
                onClick={signContract}
              >
                <ShieldCheck size={18} />
                {saving ? 'Salvando contrato...' : 'Assinar e finalizar contrato'}
              </button>
            </div>
          </>
        ) : (
          <div className="contract-success">
            <div className="contract-success-icon"><FileCheck2 /></div>
            <span>Contrato assinado</span>
            <h2>Documento registrado com sucesso.</h2>
            <p>
              A assinatura e as evidências do documento foram registradas no servidor do EspaçoOn.
            </p>

            <div className="contract-proof">
              <div className="contract-qr">
                <img src={qrUrl} alt="QR Code de verificação do contrato" />
                <span><QrCode size={14} /> Verificação</span>
              </div>
              <div className="contract-proof-data">
                <div><span>ID do contrato</span><strong>{signedContract.id}</strong></div>
                <div><span>Reserva</span><strong>{signedContract.reservationId}</strong></div>
                <div><span>Assinado em</span><strong>{new Date(signedContract.signedAt).toLocaleString('pt-BR')}</strong></div>
                <div><span>Hash</span><strong>{signedContract.hash}</strong></div>
              </div>
            </div>

            <div className="contract-disclaimer">
              <ShieldCheck />
              <span>
                <strong>Registro eletrônico</strong>
                O documento possui identificador único, data de assinatura e hash SHA-256 para conferência
                de integridade.
              </span>
            </div>

            <div className="contract-success-actions">
              <button
                className="verify-contract-button"
                onClick={() => {
                  setVerifyOpen(true)
                  verifyContract()
                }}
              >
                <Fingerprint size={17} />
                Verificar autenticidade
              </button>
              <button
                className="finish-contract-button"
                onClick={() => {
                  onSigned?.(signedContract)
                }}
              >
                {continueLabel}
              </button>
            </div>
          </div>
        )}

        {verifyOpen && signedContract && (
          <div className="verification-sheet">
            <button onClick={() => setVerifyOpen(false)} aria-label="Fechar verificação"><X /></button>
            <div className="verified-badge"><CheckCircle2 /></div>
            <span>{verifyLoading ? 'Verificando registro...' : verifyResult?.valid ? 'Registro confirmado' : 'Verificação'}</span>
            <h3>Verificação do contrato</h3>
            <p>
              {verifyLoading
                ? 'Consultando o registro no servidor.'
                : verifyResult?.valid
                  ? 'O identificador e o hash correspondem ao contrato armazenado no EspaçoOn.'
                  : verifyResult?.error || 'Não foi possível confirmar o registro.'}
            </p>
            <dl>
              <div><dt>Contrato</dt><dd>{signedContract.id}</dd></div>
              <div><dt>Locatário</dt><dd>{signedContract.customer?.name}</dd></div>
              <div><dt>Reserva</dt><dd>{signedContract.reservationDate} • {signedContract.period}</dd></div>
              <div><dt>Hash</dt><dd>{signedContract.hash}</dd></div>
            </dl>
          </div>
        )}
      </div>
    </div>
  )
}
