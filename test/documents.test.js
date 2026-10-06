import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contractDocument } from '../shared/contract-document.js'
import { createContractPdf, createReceiptPdf, receiptFacts } from '../src/utils/documents.js'

test('receipt distinguishes manual deposit, full online payment, demo and unknown methods', () => {
  assert.deepEqual(receiptFacts({ price: 700, paymentMethod: 'cash', paymentStatus: 'manual-deposit', amountPaid: 200 }), { demo: false, total: 700, paid: 200, balance: 500, method: 'Dinheiro' })
  assert.equal(receiptFacts({ price: 700, paymentStatus: 'paid', amountPaid: 0 }).paid, 700)
  assert.equal(receiptFacts({ price: 700, paymentStatus: 'paid', paymentProvider: 'demo' }).paid, 0)
  assert.equal(receiptFacts({ paymentMethod: 'transfer' }).method, 'Transferência bancária')
  assert.equal(receiptFacts({ paymentMethod: 'unknown' }).method, 'Não informado')
})
test('PDFs use stored landlord and clauses, not the new venue name, and paginate many extras', () => {
  const settings = { establishment: { name: 'Espaco Original', ownerName: 'Locador Original', document: '52998224725', address: 'Rua Original 123', city: 'Porto Velho', state: 'RO' }, cancellationPolicy: { text: 'Politica aceita originalmente.' } }
  const snapshot = contractDocument(settings)
  const extras = Array.from({ length: 30 }, (_, i) => ({ id: String(i), name: 'Item longo para aluguel ' + 'mesa e cadeira '.repeat(5), quantity: 1, subtotal: 10 }))
  const contract = { id: 'CTR-TEST', reservationId: 'ESP-TEST', price: 700, customer: { name: 'Cliente' }, documentSnapshot: snapshot, extras, hash: 'A'.repeat(64), signedAt: '2026-10-06T12:00:00Z' }
  settings.establishment.name = 'Espaco Alterado'
  const pdf = createContractPdf(contract, settings.establishment.name)
  assert.ok(pdf.getNumberOfPages() > 1)
  assert.ok(pdf.output().includes('Locador Original'))
  assert.ok(pdf.output().includes('Politica aceita originalmente.'))
  assert.equal(pdf.output().includes('Espaco Alterado'), false)
  const demo = createReceiptPdf({ id: 'ESP-TEST', price: 700, paymentMethod: 'demo', paymentStatus: 'paid', extras }, contract)
  assert.ok(demo.getNumberOfPages() > 1)
  assert.ok(demo.output().includes('SEM PAGAMENTO REAL'))
  assert.equal(demo.output().includes('Confirmado via Pix'), false)
})
