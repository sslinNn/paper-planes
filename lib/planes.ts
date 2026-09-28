import { parseCountry } from './country.ts'

export type Tweet = { id: string; created_at: string; in_reply_to_user_id?: string }
export type XUser = { id: string; username: string; location?: string }
export type Me = { x_id: string; handle: string; country: string | null }
export type Plane = {
  tweet_id: string; from_x_id: string; to_x_id: string; from_handle: string; to_handle: string
  from_country: string | null; to_country: string | null; created_at: string
}
export type Recipient = { x_id: string; handle: string; country: string | null }

const isReplyToOther = (me: Me, t: Tweet) => !!t.in_reply_to_user_id && t.in_reply_to_user_id !== me.x_id

export function replyTargets(me: Me, tweets: Tweet[]): string[] {
  return [...new Set(tweets.filter((t) => isReplyToOther(me, t)).map((t) => t.in_reply_to_user_id!))]
}

export function resolveCountries(
  ids: string[],
  registered: Map<string, string | null>,
  cached: Map<string, string | null>,
  users: XUser[],
) {
  const byId = new Map(users.map((u) => [u.id, u]))
  const countryOf = new Map<string, string | null>()
  const newRecipients: Recipient[] = []
  for (const id of ids) {
    if (registered.has(id)) countryOf.set(id, registered.get(id)!)
    else if (cached.get(id)) countryOf.set(id, cached.get(id)!)
    else {
      // не видели или страна раньше не определилась (юзер мог дописать локацию) — пробуем снова
      const u = byId.get(id)
      const country = parseCountry(u?.location)
      countryOf.set(id, country)
      if (u && (country || !cached.has(id))) newRecipients.push({ x_id: id, handle: u.username, country })
    }
  }
  return { countryOf, newRecipients }
}

export function toPlanes(me: Me, tweets: Tweet[], users: XUser[], countryOf: Map<string, string | null>): Plane[] {
  const byId = new Map(users.map((u) => [u.id, u]))
  return tweets.flatMap((t) => {
    const to = isReplyToOther(me, t) ? byId.get(t.in_reply_to_user_id!) : undefined
    if (!to) return []
    return [{
      tweet_id: t.id, from_x_id: me.x_id, to_x_id: to.id, from_handle: me.handle, to_handle: to.username,
      from_country: me.country, to_country: countryOf.get(to.id) ?? null, created_at: t.created_at,
    }]
  })
}
