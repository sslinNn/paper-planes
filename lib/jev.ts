import { isKind, type Kind } from './letters.ts'

// Jev (TypeSafe System One) читает реплай один раз и решает, какое это письмо. Текст дальше никуда не идёт
const API = 'https://api.typesafe.ai/v1/systemone'
const CHUNK = 20

const CRITERIA: Record<Kind, string> = {
  warm: 'Gratitude, support, congratulations, encouragement or another kind word to the person',
  hot: 'Disagreement, criticism, irritation, mockery or sarcasm aimed at the person or their point',
  joke: 'A joke, meme, pun or playful banter meant to be funny',
  question: 'Asks the person a genuine question and expects an answer',
  plain: 'None of these: a neutral statement, a link, an emoji-only or unclear reply',
}

// реплай в X начинается с @хэндлов адресатов — Jev они только мешают
export const cleanReply = (text: string) => text.replace(/^(@\w+\s+)+/, '').trim()

export const jevRequest = (chunk: { id: string; text: string }[]) => ({
  model: 'jev-latest',
  state: { replies: chunk.map((c) => ({ text: cleanReply(c.text) })) },
  questions: Object.fromEntries(chunk.map((_, k) => [`k${k}`, {
    type: 'choice' as const,
    instructions: `What kind of letter is the reply \`replies[${k}].text\`? Judge only that reply.`,
    criteria: CRITERIA,
  }])),
})

export async function foldLetters(
  replies: { id: string; text: string }[],
  key = process.env.TYPESAFE_API_KEY,
  f: typeof fetch = fetch,
): Promise<Map<string, Kind>> {
  const out = new Map<string, Kind>()
  if (!key) return out
  for (let i = 0; i < replies.length; i += CHUNK) {
    const chunk = replies.slice(i, i + CHUNK)
    try {
      const r = await f(API, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(jevRequest(chunk)),
        signal: AbortSignal.timeout(8000),
      })
      if (!r.ok) throw new Error(`jev ${r.status}`)
      const j = (await r.json()) as { answers?: Record<string, { choice?: string }> }
      chunk.forEach((c, k) => {
        const kind = j.answers?.[`k${k}`]?.choice
        if (isKind(kind)) out.set(c.id, kind)
      })
    } catch (e) {
      console.error('jev', e) // без ярлыка письмо просто обычное — сбор не падает
    }
  }
  return out
}
