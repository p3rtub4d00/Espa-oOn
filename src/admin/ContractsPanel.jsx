import { useEffect, useMemo, useState } from 'react'
import {
  Eye,
  FileCheck2,
  Fingerprint,
  QrCode,
  ShieldCheck,
  X,
} from 'lucide-react'
import { api } from '../data/api'

function money(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0))
}

function maskCpf(cpf = '') {
  const digits = cpf.replace(/\D/g, '')
  if (digits.length !== 11) return cpf || '-'
  return '***.' + digits.slice(3, 6) + '.' + digits.slice(6, 9) + '-**'
}

export default function ContractsPanel() {
  const [contracts, setContracts] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api.adminContracts()
      .then((data) => {
        if (active) setContracts(data)
      })
      .catch((err) => {
        if (active) setError(err.message || 'Não foi possível carregar os contratos.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const qrUrl = useMemo(() => {
    if (!selected) return ''
    const text = 'EspaçoOn | Contrato ' + selected.id + ' | Hash ' + selected.hash
    return 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(text)
  }, [selected])

  return (
    <>
      <section className="admin-card large">
        <div className="admin-card-title">
          <div>
            <span>Contratos assinados</span>
            <strong>{contracts.length} documentos</strong>
          </div>
          <FileCheck2 />
        </div>

        {error && <div className="admin-empty large">{error}</div>}
      {loading ? (
        <div className="admin-empty large">Carregando contratos...</div>
      ) : contracts.length ? (
          <div className="admin-table contracts-table">
            <div className="table-head">
              <span>Cliente</span>
              <span>Contrato</span>
              <span>Reserva</span>
              <span>Assinado em</span>
              <span>Ação</span>
            </div>

            {contracts.map((contract) => (
              <div className="table-row" key={contract.id}>
                <span>
                  <strong>{contract.customer?.name || 'Cliente'}</strong>
                  <small>{contract.customer?.phone || ''}</small>
                </span>
                <span>{contract.id}</span>
                <span>{contract.reservationId}</span>
                <span>{new Date(contract.signedAt).toLocaleString('pt-BR')}</span>
                <span>
                  <button className="contract-view-button" onClick={() => setSelected(contract)}>
                    <Eye size={15} />
                    Visualizar
                  </button>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="admin-empty large">
            Nenhum contrato foi assinado ainda.
          </div>
        )}
      </section>

      {selected && (
        <div className="admin-contract-backdrop" role="dialog" aria-modal="true" aria-label="Contrato assinado">
          <div className="admin-contract-modal">
            <div className="admin-contract-top">
              <div>
                <span>Contrato assinado</span>
                <strong>{selected.id}</strong>
              </div>
              <button onClick={() => setSelected(null)} aria-label="Fechar contrato">
                <X />
              </button>
            </div>

            <div className="admin-contract-document">
              <div className="admin-contract-heading">
                <div>
                  <span>EspaçoOn</span>
                  <h2>Contrato de locação do espaço de lazer</h2>
                </div>
                <i className={selected.paymentStatus === 'approved-simulated' || selected.status === 'signed-paid-demo' ? 'paid' : 'pending'}>
                  {selected.paymentStatus === 'approved-simulated' || selected.status === 'signed-paid-demo'
                    ? 'Assinado e pago'
                    : 'Assinado • aguardando pagamento'}
                </i>
              </div>

              <div className="admin-contract-meta">
                <div><span>Locatário</span><strong>{selected.customer?.name || '-'}</strong></div>
                <div><span>CPF</span><strong>{maskCpf(selected.customer?.cpf)}</strong></div>
                <div><span>Telefone</span><strong>{selected.customer?.phone || '-'}</strong></div>
                <div><span>Data da locação</span><strong>{selected.reservationDate || '-'}</strong></div>
                <div><span>Período</span><strong>{selected.period || '-'}</strong></div>
                <div><span>Valor</span><strong>{money(selected.price)}</strong></div>
                <div><span>Reserva</span><strong>{selected.reservationId}</strong></div>
                <div><span>Assinado em</span><strong>{new Date(selected.signedAt).toLocaleString('pt-BR')}</strong></div>
              </div>

              <div className="admin-contract-text">
                <p><strong>1. Objeto.</strong> O presente instrumento registra a locação temporária do espaço de lazer indicado pela plataforma EspaçoOn, na data e período informados acima.</p>
                <p><strong>2. Uso do espaço.</strong> O locatário declara estar ciente de que deverá utilizar o imóvel e suas estruturas de forma responsável, observando as regras apresentadas pelo proprietário.</p>
                <p><strong>3. Responsabilidade.</strong> Danos causados ao patrimônio durante o período de locação poderão ser atribuídos ao responsável pela reserva conforme as condições do contrato.</p>
                <p><strong>4. Pagamento.</strong> O valor contratado é o indicado neste documento e o status de pagamento é registrado junto à reserva.</p>
                <p><strong>5. Assinatura eletrônica.</strong> O sistema registra manifestação de aceite, assinatura desenhada, data e hora, identificador do documento e hash de verificação.</p>
              </div>

              <div className="admin-contract-signature">
                <div>
                  <span>Assinatura registrada</span>
                  {selected.signature ? (
                    <img src={selected.signature} alt={'Assinatura de ' + (selected.customer?.name || 'cliente')} />
                  ) : (
                    <strong>Imagem da assinatura indisponível.</strong>
                  )}
                  <small>{selected.customer?.name || 'Locatário'}</small>
                </div>

                <div className="admin-contract-proof">
                  <img src={qrUrl} alt="QR Code de verificação do contrato" />
                  <span><QrCode size={14} /> Verificação</span>
                </div>
              </div>

              <div className="admin-contract-evidence">
                <Fingerprint />
                <span>
                  <strong>Hash de integridade</strong>
                  {selected.hash}
                </span>
              </div>

              <div className="admin-contract-note">
                <ShieldCheck />
                <span>
                  Este painel exibe exatamente o registro de contrato armazenado nesta demonstração.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
