import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claimRequest, empires, inkOf, INKS, MAX_CLAIM, rulers, ticketFits, TICKET_TTL_MS, worldEvent } from './wars.ts'
import { issueTicket, readTicket } from './wars-ticket.ts'

test('rulers: most deliveries wins, ties go alphabetical', () => {
  const r = rulers([
    { nation: 'US', country: 'IN', n: 2 }, { nation: 'RU', country: 'IN', n: 1 }, { nation: 'RU', country: 'IN', n: 2 },
    { nation: 'DE', country: 'FR', n: 1 }, { nation: 'BR', country: 'FR', n: 1 },
  ])
  assert.deepEqual(r.get('IN'), { nation: 'RU', n: 3 })
  assert.deepEqual(r.get('FR'), { nation: 'BR', n: 1 })
  assert.deepEqual(empires(r), [{ nation: 'BR', countries: 1 }, { nation: 'RU', countries: 1 }])
})

test('claimRequest validates and counts', () => {
  assert.deepEqual(claimRequest({ nation: 'RU', countries: ['IN', 'IN', 'us', 'AQ', 'FR'] }), { nation: 'RU', claims: [['IN', 2], ['FR', 1]], letters: 5 })
  assert.equal(claimRequest({ nation: 'xx', countries: ['IN'] }), null)
  assert.equal(claimRequest({ nation: 'RU', countries: ['AQ'] }), null)
  assert.equal(claimRequest({ nation: 'RU', countries: Array(MAX_CLAIM + 1).fill('IN') }), null, 'one script request cannot paint the world')
  assert.ok(claimRequest({ nation: 'RU', countries: Array(MAX_CLAIM).fill('IN') }))
  assert.equal(claimRequest(null), null)
})

test('worldEvent rotates through the top by hour and ends on the hour', () => {
  const rows = [{ country: 'US', n: 9, hot: 1 }, { country: 'IN', n: 5, hot: 0 }]
  const h = 3_600_000
  assert.equal(worldEvent(rows, 10 * h + 5)!.country, 'US')
  assert.equal(worldEvent(rows, 11 * h + 5)!.country, 'IN')
  assert.equal(worldEvent(rows, 11 * h + 5)!.until, 12 * h)
  assert.equal(worldEvent([], 0), null)
})

test('inkOf is stable and from the palette', () => {
  assert.equal(inkOf('RU'), inkOf('RU'))
  assert.ok(INKS.includes(inkOf('US')))
})

test('ticketFits: a claim needs time to have flown and must not be stale', () => {
  const t0 = 1_000_000
  assert.equal(ticketFits(t0, t0 + 1000, 3), false, '3 letters in a second: no run behind it')
  assert.equal(ticketFits(t0, t0 + 6000, 3), true)
  assert.equal(ticketFits(t0, t0 + TICKET_TTL_MS + 1, 1), false, 'stale ticket')
  assert.equal(ticketFits(t0, t0 - 5000, 1), false, 'issued in the future')
})

test('tickets are signed: forged, altered or foreign-secret tickets are rejected', () => {
  const t = issueTicket('secret', 12345)
  assert.deepEqual(readTicket(t, 'secret')?.iat, 12345)
  assert.equal(readTicket(t, 'other'), null)
  const [, nonce, sig] = t.split('.')
  assert.equal(readTicket(`1.${nonce}.${sig}`, 'secret'), null, 'cannot backdate the issue time')
  assert.equal(readTicket('garbage', 'secret'), null)
  assert.equal(readTicket(42, 'secret'), null)
  assert.notEqual(issueTicket('secret', 1).split('.')[1], issueTicket('secret', 1).split('.')[1], 'every ticket has its own nonce')
})
