import { FileCheck2 } from 'lucide-react'

export default function ContractsPanel() {
  const contracts = JSON.parse(localStorage.getItem('espacoon_contracts') || '[]')

  return (
    <section className="admin-card large">
      <div className="admin-card-title">
        <div>
          <span>Contratos assinados</span>
          <strong>{contracts.length} documentos</strong>
        </div>
        <FileCheck2 />
      </div>

      {contracts.length ? (
        <div className="admin-table contracts-table">
          <div className="table-head">
            <span>Cliente</span>
            <span>Contrato</span>
            <span>Reserva</span>
            <span>Assinado em</span>
            <span>Hash</span>
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
              <span><i className="status-ok">{contract.hash}</i></span>
            </div>
          ))}
        </div>
      ) : (
        <div className="admin-empty large">
          Nenhum contrato foi assinado neste navegador ainda.
        </div>
      )}
    </section>
  )
}
