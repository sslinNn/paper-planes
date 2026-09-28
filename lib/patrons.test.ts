import { test } from 'node:test'
import assert from 'node:assert/strict'
import { donationRequest, isPlaneModel, paidDonation } from './patrons.ts'

test('donationRequest: valid email, currency and amount only', () => {
  assert.deepEqual(donationRequest({ email: 'a@b.co', amount: 5, currency: 'USD' }), { email: 'a@b.co', amount: 5, currency: 'USD' })
  assert.deepEqual(donationRequest({ email: 'a@b.co', amount: '300', currency: 'RUB' }), { email: 'a@b.co', amount: 300, currency: 'RUB' })
  for (const bad of [
    null, 'x', {},
    { email: 'nope', amount: 5, currency: 'USD' },
    { email: 'a@b.co', amount: 3, currency: 'USD' }, // у lava.top минимум 5 $ / 5 €
    { email: 'a@b.co', amount: 50, currency: 'RUB' }, // меньше 100 ₽
    { email: 'a@b.co', amount: 5, currency: 'BTC' },
    { email: 'a@b.co', amount: 1e9, currency: 'EUR' },
    { email: 'a@b.co', amount: NaN, currency: 'EUR' },
  ]) assert.equal(donationRequest(bad), null, JSON.stringify(bad))
})

test('paidDonation: only successful payments tagged by us', () => {
  const ok = {
    eventType: 'payment.success', status: 'completed', contractId: 'c1', amount: 5, currency: 'USD',
    clientUtm: { utm_source: 'paper-planes', utm_content: 'user-42' },
  }
  assert.deepEqual(paidDonation(ok), { userId: 'user-42', contractId: 'c1', amount: 5, currency: 'USD' })
  assert.equal(paidDonation({ ...ok, eventType: 'payment.failed' }), null)
  assert.equal(paidDonation({ ...ok, status: 'failed' }), null)
  assert.equal(paidDonation({ ...ok, clientUtm: { utm_source: 'google', utm_content: 'user-42' } }), null)
  assert.equal(paidDonation({ ...ok, clientUtm: null }), null)
  assert.equal(paidDonation({ ...ok, contractId: '' }), null)
  assert.equal(paidDonation('garbage'), null)
})

test('isPlaneModel', () => {
  assert.equal(isPlaneModel('crane'), true)
  assert.equal(isPlaneModel('boeing'), false)
  assert.equal(isPlaneModel(null), false)
})

test('paidInvoices: completed invoices tagged by us, any case of status', async () => {
  const { paidInvoices } = await import('./patrons.ts')
  const inv = (id: string, status: string, utm: object | null) => ({
    id, status, receipt: { amount: 10, currency: 'USD', fee: 0 }, clientUtm: utm,
  })
  const ours = { utm_source: 'paper-planes', utm_content: 'user-1' }
  assert.deepEqual(
    paidInvoices([
      inv('a', 'COMPLETED', ours),
      inv('b', 'FAILED', ours),
      inv('c', 'completed', { utm_source: 'google', utm_content: 'user-1' }),
      inv('d', 'NEW', ours),
      inv('e', 'completed', ours),
      inv('f', 'COMPLETED', null),
    ]),
    [
      { contractId: 'a', userId: 'user-1', amount: 10, currency: 'USD' },
      { contractId: 'e', userId: 'user-1', amount: 10, currency: 'USD' },
    ],
  )
  assert.deepEqual(paidInvoices('nope'), [])
})
