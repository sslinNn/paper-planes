// тип письма решает Jev, прочитав реплай; от него зависит, как летит самолётик
export const KINDS = ['warm', 'hot', 'joke', 'question', 'plain'] as const
export type Kind = (typeof KINDS)[number]
export const isKind = (v: unknown): v is Kind => KINDS.includes(v as Kind)

export const EMOJI: Record<Kind, string> = { warm: '💌', hot: '🔥', joke: '😂', question: '❓', plain: '✉️' }
export const LABEL: Record<Kind, string> = { warm: 'Warm', hot: 'Hot take', joke: 'Joke', question: 'Question', plain: 'Letter' }
// что письмо делает с полётом — подсказка, когда его берёшь в руки
export const EFFECT: Record<Kind, string> = { warm: 'glides long', hot: 'flies fast, burns fast', joke: 'rides the wind', question: 'lifts double on delivery', plain: '' }

// множители полёта для активного письма; score — во сколько раз письмо дороже обычного
export const MOD: Record<Kind, { speed: number; sink: number; wind: number; delivery: number; score: number }> = {
  warm: { speed: 1, sink: 0.6, wind: 1, delivery: 1, score: 1.5 },
  hot: { speed: 1.35, sink: 1.8, wind: 1, delivery: 1, score: 2 },
  joke: { speed: 1, sink: 1, wind: 1.6, delivery: 1, score: 1.5 },
  question: { speed: 1, sink: 1, wind: 1, delivery: 2, score: 1.5 },
  plain: { speed: 1, sink: 1, wind: 1, delivery: 1, score: 1 },
}
export const modOf = (k: Kind | null | undefined) => MOD[k ?? 'plain']
