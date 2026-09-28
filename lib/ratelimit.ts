import { pool } from './db.ts'

// фиксированное окно в базе: функции на Vercel не делят память, а Redis ради двух эндпоинтов не нужен.
// true — лимит исчерпан. Сбой самой базы лимитер не должен превращать в отказ сайта: пропускаем и пишем в лог
export const limited = (key: string, max: number, windowSec: number): Promise<boolean> =>
  count(key, windowSec).then((n) => n > max, (e) => (console.error('ratelimit', e), false))

async function count(key: string, windowSec: number): Promise<number> {
  const { rows: [r] } = await pool.query(
    `insert into rate_limits (key, started, n) values ($1, now(), 1)
     on conflict (key) do update set
       n = case when rate_limits.started < now() - make_interval(secs => $2::double precision) then 1 else rate_limits.n + 1 end,
       started = case when rate_limits.started < now() - make_interval(secs => $2::double precision) then now() else rate_limits.started end
     returning n`, [key, windowSec])
  return r.n
}

// на Vercel x-real-ip выставляет платформа, подделать его снаружи нельзя
export const clientIp = (req: Request) =>
  req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local'
