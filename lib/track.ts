import type { PostHog } from 'posthog-js'

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
let ready: Promise<PostHog | null> | undefined

// posthog-js — около 100 КБ gzip: тянем отдельным куском уже после отрисовки, а не в критическом пути.
// Ключ есть только на Vercel: локально ничего не шлём
export const analytics = () =>
  (ready ??= key
    ? import('posthog-js').then(({ default: posthog }) => {
        posthog.init(key, {
          // Через свой домен — адблоки не режут /ingest (см. rewrites в next.config.ts)
          api_host: '/ingest',
          ui_host: 'https://eu.posthog.com',
          defaults: '2026-08-30',
          // ошибки фронта — в Error tracking PostHog
          capture_exceptions: true,
        })
        return posthog
      })
    : Promise.resolve(null))

export const track = (event: string, props?: Record<string, unknown>) => void analytics().then((p) => p?.capture(event, props))
export const identify = (id: string, props?: Record<string, unknown>) => void analytics().then((p) => p?.identify(id, props))
