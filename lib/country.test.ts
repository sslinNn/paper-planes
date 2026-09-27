import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isCountry, parseCountry } from './country.ts'

const cases: [string | null, string | null][] = [
  ['Moscow', 'RU'],
  ['Berlin, Germany', 'DE'],
  ['🇧🇷 São Paulo', 'BR'],
  ['Paris, France 🇫🇷', 'FR'],
  ['Россия', 'RU'],
  ['NYC', 'US'],
  ['london | uk', 'GB'],
  ['Санкт-Петербург', 'RU'],
  ['на луне 🌙', null],
  ['Earth', null],
  ['', null],
  [null, null],
]

for (const [input, expected] of cases) {
  test(`parseCountry(${JSON.stringify(input)}) → ${expected}`, () => {
    assert.equal(parseCountry(input), expected)
  })
}

test('isCountry accepts only real alpha-2 codes', () => {
  assert.equal(isCountry('DE'), true)
  for (const bad of ['XX', 'de', 'RUS', '', 123, null, '<script>']) assert.equal(isCountry(bad), false)
})
