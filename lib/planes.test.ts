import { test } from 'node:test'
import assert from 'node:assert/strict'
import { replyTargets, resolveCountries, toPlanes, type Tweet, type XUser } from './planes.ts'

const me = { x_id: '1', handle: 'me', country: 'RU' }
const t = (id: string, to?: string): Tweet => ({ id, created_at: '2026-09-28T00:00:00Z', in_reply_to_user_id: to })
const users: XUser[] = [
  { id: '2', username: 'bob', location: 'Berlin' },
  { id: '3', username: 'ann', location: 'somewhere' },
]

test('replyTargets: only replies to other people, unique', () => {
  assert.deepEqual(replyTargets(me, [t('a', '2'), t('b'), t('c', '1'), t('d', '2'), t('e', '3')]), ['2', '3'])
})

test('toPlanes: reply to other user becomes plane', () => {
  assert.deepEqual(toPlanes(me, [t('a', '2')], users, new Map([['2', 'DE']])), [{
    tweet_id: 'a', from_x_id: '1', to_x_id: '2', from_handle: 'me', to_handle: 'bob',
    from_country: 'RU', to_country: 'DE', created_at: '2026-09-28T00:00:00Z',
  }])
})

test('toPlanes: self-reply and non-reply are skipped', () => {
  assert.deepEqual(toPlanes(me, [t('a', '1'), t('b')], users, new Map()), [])
})

test('toPlanes: recipient missing from includes (deleted account) is skipped', () => {
  assert.deepEqual(toPlanes(me, [t('a', '99')], users, new Map()), [])
})

test('resolveCountries: registered beats cached beats parsed', () => {
  const { countryOf, newRecipients } = resolveCountries(
    ['2', '3', '4'],
    new Map([['2', 'FR']]), // bob залогинен и выбрал Францию
    new Map([['3', 'JP']]), // ann уже в кэше
    [...users, { id: '4', username: 'kim', location: 'Seoul' }],
  )
  assert.deepEqual([...countryOf], [['2', 'FR'], ['3', 'JP'], ['4', 'KR']])
  assert.deepEqual(newRecipients, [{ x_id: '4', handle: 'kim', country: 'KR' }])
})

test('resolveCountries: unknown user without includes → null, not cached', () => {
  const { countryOf, newRecipients } = resolveCountries(['9'], new Map(), new Map(), [])
  assert.equal(countryOf.get('9'), null)
  assert.deepEqual(newRecipients, [])
})
