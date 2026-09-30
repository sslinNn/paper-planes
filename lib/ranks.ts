import type { PlaneModel } from './patrons.ts'

// ранг пилота = сколько писем доставлено за все забеги; каждый ранг открывает модель самолётика со своим характером
export const RANKS = [
  { name: 'Cadet', xp: 0, plane: 'dart' },
  { name: 'Courier', xp: 10, plane: 'glider' },
  { name: 'Captain', xp: 30, plane: 'swallow' },
  { name: 'Ace', xp: 60, plane: 'crane' },
] as const satisfies readonly { name: string; xp: number; plane: PlaneModel }[]
export type Rank = (typeof RANKS)[number]

export const rankOf = (xp: number): Rank => [...RANKS].reverse().find((r) => xp >= r.xp) ?? RANKS[0]
export const nextRank = (xp: number): Rank | null => RANKS.find((r) => r.xp > xp) ?? null
export const unlocked = (xp: number, plane: PlaneModel) => RANKS.some((r) => r.plane === plane && xp >= r.xp)

// характер модели в полёте (множители к базовой физике)
export const PLANE_MOD: Record<PlaneModel, { speed: number; sink: number; turn: number; storm: number; wind: number }> = {
  dart: { speed: 1, sink: 1, turn: 1, storm: 1, wind: 1 },
  glider: { speed: 1, sink: 0.8, turn: 0.85, storm: 1, wind: 1 },
  swallow: { speed: 1.15, sink: 1.1, turn: 1.2, storm: 1, wind: 1 },
  crane: { speed: 0.95, sink: 1, turn: 1, storm: 0.5, wind: 0.7 },
}
export const TRAIT: Record<PlaneModel, string> = {
  dart: 'The classic fold',
  glider: 'Glides longer, turns wider',
  swallow: 'Faster and sharper, sinks a bit quicker',
  crane: 'Shrugs off storms and wind',
}

// потолок правдоподобного счёта: письмо стоит максимум (100 + 20000 км / 10) × 2 (🔥) × 5 (серия), плюс пойманные самолётики.
// ponytail: счёт считает клиент — это только отсечка невозможного, не античит; серверный пересчёт забега, если начнут мухлевать
export const maxScore = (delivered: number) => delivered * 21000 + 10000

export type Run = { day: number; mode: 'daily' | 'mine' | 'free'; score: number; delivered: number; km: number; countries: string[] }

const int = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi

// забег от клиента: день — сегодня или вчера (начал до полуночи по Нью-Йорку), числа в разумных пределах
export function runRequest(body: unknown, today: number): Run | null {
  if (!body || typeof body !== 'object') return null
  const { day, mode, score, delivered, km, countries } = body as Record<string, unknown>
  if (!int(day, today - 1, today)) return null
  if (mode !== 'daily' && mode !== 'mine' && mode !== 'free') return null
  // бесконечный мешок: в свободном полёте писем может быть много — потолок щедрый, счёт всё равно режет maxScore
  if (!int(delivered, 0, 200) || !int(km, 0, 2000000)) return null
  if (!int(score, 0, maxScore(delivered as number))) return null
  if (!Array.isArray(countries) || countries.length !== delivered || !countries.every((c) => typeof c === 'string' && /^[A-Z]{2}$/.test(c))) return null
  return { day: day as number, mode, score: score as number, delivered: delivered as number, km: km as number, countries: countries as string[] }
}
