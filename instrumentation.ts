import type { Instrumentation } from 'next'

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY

// серверные ошибки — в Error tracking PostHog рядом с фронтовыми: на Hobby логи Vercel живут час, разбирать задним числом нечего.
// Без заголовков и тела запроса: только путь, маршрут и текст ошибки
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (!key) return
  const e = err instanceof Error ? err : new Error(String(err))
  const digest = typeof err === 'object' && err !== null && 'digest' in err ? String(err.digest) : undefined
  await fetch('https://eu.i.posthog.com/i/v0/e/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      event: '$exception',
      distinct_id: 'server',
      properties: {
        $exception_list: [{ type: e.name, value: e.message, mechanism: { handled: false, synthetic: false } }],
        $exception_level: 'error',
        $process_person_profile: false,
        path: request.path.split('?')[0],
        method: request.method,
        route: context.routePath,
        route_type: context.routeType,
        digest,
        source: 'server',
      },
    }),
    signal: AbortSignal.timeout(2000),
  }).catch(() => {})
}
