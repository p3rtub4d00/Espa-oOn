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
import './contract.css'

function simpleHash(text) {
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash >>> 0).toString(16).padStart(8, '0').toUpperCase()
}

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

  const contractId = useMemo(
    () => 'CTR-' + reservation.id.replace('ESP-', ''),
    [reservation.id],
  )

  const baseHash = useMemo(
    () =>
      simpleHash(
        [
          contractId,
          reservation.id,
          reservation.date,
          reservation.period,
          reservation.price,
          reservation.customer?.name,
          reservation.customer?.cpf,
        ].join('|'),
      ),
    [contractId, reservation],
  )

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
    const source = event.touches?.[0] || event
    return {
      x: source.clientX - rect.left,
      y: source.clientY - rect.top,
    }
  }

  const startDrawing = (event) => {
    event.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const point = getPoint(event)
    drawingRef.current = true
    ctx.beginPath()
    ctx.moveTo(point.x, point.y)
  }

  const draw = (event) => {
    if (!drawingRef.current) return
    event.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const point = getPoint(event)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    setHasSignature(true)
  }

  const stopDrawing = () => {
    drawingRef.current = false
  }

  const clearSignature = () => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  const signContract = () => {
    if (!accepted || !hasSignature) return
    const signedAt = new Date().toISOString()
    const signature = canvasRef.current.toDataURL('image/png')
    const finalHash = simpleHash(baseHash + '|' + signedAt + '|' + signature.slice(-128))

    const contractRecord = {
      id: contractId,
      reservationId: reservation.id,
      reservationDate: reservation.date,
      period: reservation.period,
      price: reservation.price,
      customer: reservation.customer,
      signedAt,
      signature,
      hash: finalHash,
      status: 'signed-awaiting-payment-demo',
    }

    const stored = JSON.parse(localStorage.getItem('espacoon_contracts') || '[]')
    const filtered = stored.filter((item) => item.reservationId !== reservation.id)
    localStorage.setItem('espacoon_contracts', JSON.stringify([...filtered, contractRecord]))
    setSignedContract(contractRecord)
  }

  const verificationText = signedContract
    ? 'EspaçoOn | Contrato ' + signedContract.id + ' | Hash ' + signedContract.hash
    : ''

  const qrUrl = signedContract
    ? 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(verificationText)
    : ''

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
                  Documento demonstrativo gerado automaticamente a partir dos dados da reserva.
                  O texto jurídico definitivo poderá ser substituído posteriormente.
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
                  do espaço de lazer indicado pela plataforma EspaçoOn, na data e período informados acima.
                </p>
                <p>
                  <strong>2. Uso do espaço.</strong> O locatário declara estar ciente de que deverá
                  utilizar o imóvel, piscina, campo, mobiliário e demais estruturas de forma responsável,
                  observando as regras apresentadas pelo proprietário.
                </p>
                <p>
                  <strong>3. Responsabilidade.</strong> Danos causados ao patrimônio durante o período
                  de locação poderão ser atribuídos ao responsável pela reserva, conforme apuração e
                  condições definitivas do contrato.
                </p>
                <p>
                  <strong>4. Pagamento.</strong> Nesta versão do sistema, o pagamento registrado é
                  exclusivamente simulado e não representa cobrança financeira real.
                </p>
                <p>
                  <strong>5. Assinatura eletrônica.</strong> Para fins de demonstração técnica, o sistema
                  registra a manifestação de aceite, a assinatura desenhada, a data e hora, o identificador
                  do documento e um hash local de verificação.
                </p>
              </div>

              <div className="contract-evidence">
                <Fingerprint />
                <span>
                  <strong>Identificação do documento</strong>
                  ID {contractId} • Hash base {baseHash}
                </span>
              </div>
            </div>

            <div className="signature-area">
              <div className="signature-title">
                <div>
                  <span>Assinatura eletrônica demonstrativa</span>
                  <strong>Assine no quadro abaixo usando o dedo ou o mouse.</strong>
                </div>
                <PenLine />
              </div>

              <div className="signature-canvas-wrap">
                <canvas
                  ref={canvasRef}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
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
                  onChange={(event) => setAccepted(event.target.checked)}
                />
                <span>
                  Li o documento acima e concordo em registrar minha assinatura nesta demonstração.
                </span>
              </label>

              <button
                className="sign-contract-button"
                disabled={!accepted || !hasSignature}
                onClick={signContract}
              >
                <ShieldCheck size={18} />
                Assinar e finalizar contrato
              </button>
            </div>
          </>
        ) : (
          <div className="contract-success">
            <div className="contract-success-icon"><FileCheck2 /></div>
            <span>Contrato assinado</span>
            <h2>Documento registrado com sucesso.</h2>
            <p>
              Nesta demonstração, a assinatura e as evidências foram armazenadas somente neste navegador.
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
                <strong>Ambiente de testes</strong>
                Este registro demonstra o fluxo técnico. A validade jurídica final dependerá do texto
                contratual definitivo e da solução de assinatura adotada na versão de produção.
              </span>
            </div>

            <div className="contract-success-actions">
              <button className="verify-contract-button" onClick={() => setVerifyOpen(true)}>
                <Fingerprint size={17} />
                Verificar autenticidade
              </button>
              <button
                className="finish-contract-button"
                onClick={() => {
                  onSigned?.(signedContract)
                  onClose()
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
            <span>Registro localizado</span>
            <h3>Contrato íntegro nesta demonstração</h3>
            <p>
              O identificador e o hash abaixo correspondem ao contrato salvo localmente neste navegador.
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
