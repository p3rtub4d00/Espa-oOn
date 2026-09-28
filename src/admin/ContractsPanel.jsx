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
    return '/api/contracts/' + encodeURIComponent(selected.id) +
      '/qr?hash=' + encodeURIComponent(selected.hash)
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
                  <span>{selected.establishmentName || 'EspaçoOn'}</span>
                  <h2>Contrato de locação do espaço de lazer</h2>
                </div>
                <i className={
                  selected.status === 'cancelled'
                    ? 'pending'
                    : selected.paymentStatus === 'paid' || selected.status === 'signed-paid'
                      ? 'paid'
                      : 'pending'
                }>
                  {selected.status === 'cancelled'
                    ? 'Reserva cancelada'
                    : selected.paymentStatus === 'paid' || selected.status === 'signed-paid'
                      ? 'Assinado e pago'
                      : selected.paymentStatus === 'manual-review'
                        ? 'Assinado • conferência manual'
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
                <p><strong>1. Objeto.</strong> O presente instrumento registra a locação temporária do espaço de lazer indicado pela plataforma {selected.establishmentName || 'EspaçoOn'}, na data e período informados acima.</p>
                <p><strong>2. Uso do espaço.</strong> O locatário declara estar ciente de que deverá utilizar o imóvel e suas estruturas de forma responsável, observando as regras apresentadas pelo proprietário.</p>
                <p><strong>3. Responsabilidade.</strong> O locatário responde pelo uso adequado do espaço e por danos ao patrimônio que forem comprovadamente causados durante o período da locação.</p>
                <p><strong>4. Pagamento.</strong> O valor indicado neste documento é cobrado por Pix por meio do Asaas e a reserva é confirmada após o registro do recebimento.</p>
                <p><strong>5. Cancelamento e reembolso.</strong> {selected.cancellationPolicyText || 'A política de cancelamento registrada no momento da assinatura integra este contrato.'}</p>
                <p><strong>6. Assinatura eletrônica.</strong> O sistema registra manifestação de aceite, assinatura desenhada, data e hora, identificador do documento e hash SHA-256 calculado no servidor para verificação de integridade.</p>
              </div>

              {selected.cancellation && (
                <div className="admin-contract-note">
                  <ShieldCheck />
                  <span>
                    Reserva cancelada em {selected.cancellation.cancelledAt
                      ? new Date(selected.cancellation.cancelledAt).toLocaleString('pt-BR')
                      : 'data não informada'}.
                    {' '}Motivo: {selected.cancellation.reason || '-'}.
                    {' '}Reembolso registrado: {money(selected.cancellation.refundAmount || 0)}.
                  </span>
                </div>
              )}

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
                  Este painel exibe o registro eletrônico armazenado no servidor do EspaçoOn.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
