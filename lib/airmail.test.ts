import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countryAt, delivered, newGame, select, shareText, step, tally, wind, wrapDx, type Letter } from './airmail.ts'
import { at, projection, W } from './geo.ts'

const L = (id: number, to_country: string | null, kind: Letter['kind'] = null, to_handle = `u${id}`): Letter =>
  ({ id, from_handle: 'me', to_handle, to_country, from_country: 'PL', kind })
const still = { aim: null, turn: 0, dive: false }
const circle = { aim: null, turn: 1, dive: false } // кружит на месте — не долетит до цели
const rand = () => 0.5

test('wind: trade winds west, westerlies east, polar west', () => {
  assert.ok(wind(10) < 0)
  assert.ok(wind(-15) < 0)
  assert.ok(wind(45) > 0)
  assert.ok(wind(-50) > 0)
  assert.ok(wind(75) < 0)
})

test('wrapDx takes the short way across the seam', () => {
  assert.equal(wrapDx(10, W - 10), 20)
  assert.equal(wrapDx(100, 300), 200)
})

test('delivered: inside Germany yes, Paris no; tiny/unknown country by radius; AQ by latitude', () => {
  assert.equal(delivered([10.4, 51.1], 'DE'), true)
  assert.equal(delivered([2.35, 48.85], 'DE'), false)
  // Сингапура нет на карте 110m — как и на главной, он в «тумане»; доставка у его точки
  assert.equal(delivered(at('SG'), 'SG'), true)
  assert.equal(delivered([0, -70], null), true)
  assert.equal(delivered([0, -40], 'AQ'), false)
  assert.equal(countryAt([10.4, 51.1]), 'DE')
})

test('newGame targets the nearest letter and starts at full altitude', () => {
  const g = newGame([L(1, 'JP'), L(2, 'PL')], [], [10.4, 51.1])
  assert.equal(g.alt, 100)
  assert.equal(g.target, 2)
})

test('step: glides down, moves, wraps x', () => {
  const g = newGame([L(1, 'JP')], [], [10.4, 51.1])
  const y0 = g.y
  step(g, still, 1, rand)
  assert.ok(g.alt < 100 && g.alt > 90)
  g.x = W - 0.1
  g.heading = 0
  step(g, still, 0.1, rand)
  assert.ok(g.x < 5, `wrapped to ${g.x}`)
  assert.ok(Math.abs(g.y - y0) < 50)
})

test('warm letters sink slower than hot ones', () => {
  const warm = newGame([L(1, 'JP', 'warm')], [], [10.4, 51.1])
  const hot = newGame([L(1, 'JP', 'hot')], [], [10.4, 51.1])
  step(warm, still, 1, rand)
  step(hot, still, 1, rand)
  assert.ok(warm.alt > hot.alt)
})

test('delivery lifts, removes the letter, retargets; question lifts double', () => {
  const g = newGame([L(1, 'DE', 'question'), L(2, 'JP')], [], [2.35, 48.85]) // старт в Париже
  select(g, 1)
  g.x = projection([10.4, 51.1])![0]
  g.y = projection([10.4, 51.1])![1]
  g.left = true
  g.alt = 10
  const ev = step(g, still, 0.01, rand)
  assert.equal(ev[0].type, 'delivered')
  assert.ok(g.alt > 65, `alt ${g.alt}`) // 10 + 30 × 2
  assert.deepEqual(g.letters.map((l) => l.id), [2])
  assert.equal(g.target, 2)
  assert.equal(g.delivered.length, 1)
})

test('altitude 0 crashes; last letter empties the bag', () => {
  const g = newGame([L(1, 'JP')], [], [10.4, 51.1])
  g.alt = 0.01
  assert.equal(step(g, still, 1, rand).at(-1)?.type, 'crashed')
  assert.equal(g.done, true)
  const h = newGame([L(1, 'DE')], [], [10.4, 51.1])
  h.left = true
  assert.deepEqual(step(h, still, 0.01, rand).map((e) => e.type), ['delivered', 'emptied'])
})

test('thermal lifts until it is spent', () => {
  const g = newGame([L(1, 'JP')], [{ iso: 'DE', hot: 0, warm: 9, total: 10 }], [10.4, 51.1])
  g.alt = 50
  step(g, still, 0.5, rand)
  assert.ok(g.alt > 50, `alt ${g.alt}`)
  for (let i = 0; i < 40; i++) step(g, still, 0.5, rand)
  assert.ok(g.thermals.every((t) => t.left <= 0 || Math.hypot(wrapDx(t.x, g.x), t.y - g.y) > t.r))
})

test('big dt after a background tab is clamped', () => {
  const g = newGame([L(1, 'JP')], [], [10.4, 51.1])
  step(g, still, 30, rand)
  assert.ok(g.alt > 50)
})

test('storms stay away during the calm start, then appear', () => {
  // шаг ограничен 0.05 с — крутим кадрами, держа высоту, чтобы не разбиться
  const g = newGame([L(1, 'AQ')], [{ iso: 'US', hot: 5, warm: 0, total: 5 }], [10.4, 51.1])
  for (let i = 0; i < 180; i++) { step(g, circle, 0.05, rand); g.alt = 100 } // 9 с
  assert.equal(g.storms.length, 0)
  for (let i = 0; i < 40; i++) { step(g, circle, 0.05, rand); g.alt = 100 } // ещё 2 с
  assert.ok(g.storms.length > 0)
})

test('shareText: logged-in mentions up to 3 unique recipients, guest none', () => {
  const d = [L(1, 'DE', 'hot', 'a'), L(2, 'FR', null, 'b'), L(3, 'JP', null, 'a'), L(4, 'US', null, 'c'), L(5, 'BR', null, 'd')]
  const s = shareText({ delivered: d, km: 12345, score: 4321, won: false, guest: false, me: 'me', bag: tally(d) })
  assert.match(s, /@a @b @c/)
  assert.doesNotMatch(s, /@d/)
  assert.match(s, /20% of my replies are hot takes/)
  assert.match(s, /4,321/)
  const g = shareText({ delivered: d, km: 10, score: 5, won: false, guest: true, me: null, bag: tally(d) })
  assert.doesNotMatch(g, /@/)
})

test('projection round trip used by the game', () => {
  const [x, y] = projection([10.4, 51.1])!
  const [lon, lat] = projection.invert!([x, y])!
  assert.ok(Math.abs(lon - 10.4) < 1e-6 && Math.abs(lat - 51.1) < 1e-6)
})

test('no free delivery at home: letters to the start country wait until you have left it', () => {
  const g = newGame([L(1, 'DE'), L(2, 'FR')], [], [10.4, 51.1])
  assert.equal(g.target, 2, 'aims abroad first')
  select(g, 1)
  assert.equal(step(g, still, 0.01, rand).length, 0, 'no delivery while still at home')
  g.left = true
  assert.equal(step(g, still, 0.01, rand)[0]?.type, 'delivered')
})

test('diving trades altitude for speed', () => {
  const glide = newGame([L(1, 'JP')], [], [10.4, 51.1])
  const dive = newGame([L(1, 'JP')], [], [10.4, 51.1])
  for (let i = 0; i < 20; i++) {
    step(glide, still, 0.05, rand)
    step(dive, { ...still, dive: true }, 0.05, rand)
  }
  assert.ok(dive.alt < glide.alt)
  assert.ok(dive.km > glide.km * 1.4)
})

test('score: longer legs and hotter letters pay more; quick chains multiply', () => {
  const g = newGame([L(1, 'DE', 'hot'), L(2, 'DE'), L(3, 'JP')], [], [10.4, 51.1])
  g.left = true
  select(g, 1)
  const [a] = step(g, still, 0.01, rand)
  select(g, 2)
  const [b] = step(g, still, 0.01, rand)
  assert.equal(a.type, 'delivered')
  assert.equal(b.type, 'delivered')
  if (a.type !== 'delivered' || b.type !== 'delivered') return
  assert.equal(a.combo, 1)
  assert.equal(b.combo, 2)
  assert.ok(a.points > 0 && b.points > 0)
  assert.equal(g.score, a.points + b.points)
})

test('strays: real planes cross your path; flying through one catches it', () => {
  const sky = [{ from_handle: 'a', to_handle: 'b', from_country: 'FR', to_country: 'PL' }]
  const g = newGame([L(1, 'JP')], [], [10.4, 51.1], sky)
  for (let i = 0; i < 80 && !g.strays.length; i++) step(g, circle, 0.05, rand)
  assert.equal(g.strays.length, 1, 'a stray spawned near the player')
  const s = g.strays[0]
  g.x = s.x
  g.y = s.y
  g.alt = 50
  const ev = step(g, still, 0.01, rand)
  assert.ok(ev.some((e) => e.type === 'caught'))
  assert.ok(g.alt > 50)
  assert.equal(g.strays.length, 0)
})
