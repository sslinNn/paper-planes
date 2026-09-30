// тип письма решает Jev, прочитав реплай; от него зависит, как летит самолётик
export const KINDS = ['warm', 'hot', 'joke', 'question', 'plain'] as const
export type Kind = (typeof KINDS)[number]
export const isKind = (v: unknown): v is Kind => KINDS.includes(v as Kind)

export const EMOJI: Record<Kind, string> = { warm: '💌', hot: '🔥', joke: '😂', question: '❓', plain: '✉️' }
export const LABEL: Record<Kind, string> = { warm: 'Warm', hot: 'Hot take', joke: 'Joke', question: 'Question', plain: 'Letter' }

// множители полёта для активного письма
export const MOD: Record<Kind, { speed: number; sink: number; wind: number; delivery: number }> = {
  warm: { speed: 1, sink: 0.6, wind: 1, delivery: 1 },
  hot: { speed: 1.35, sink: 1.8, wind: 1, delivery: 1 },
  joke: { speed: 1, sink: 1, wind: 1.6, delivery: 1 },
  question: { speed: 1, sink: 1, wind: 1, delivery: 2 },
  plain: { speed: 1, sink: 1, wind: 1, delivery: 1 },
}
export const modOf = (k: Kind | null | undefined) => MOD[k ?? 'plain']
