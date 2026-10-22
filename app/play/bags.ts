import { dailyBag, freeBag } from '@/lib/airmail-db'
import type { Bag } from './Airmail'

export type StartBags = { daily: Bag; free: Bag }

// мешки дня и свободного полёта — прямо в HTML игры: первый экран не ждёт /api/airmail/guest и /free
// (холодная база и функция — это секунды на «Sorting the mailbag…»). Страницы с игрой кэшируются по revalidate,
// так что в БД ходит перегенерация, а не каждый зритель. База не ответила — null, клиент сходит за мешками сам
export async function startBags(): Promise<StartBags | null> {
  try {
    const [daily, free] = await Promise.all([dailyBag(), freeBag()])
    // через JSON — как отдаёт API: даты строками, ровно та форма, которую ждёт клиент
    return JSON.parse(JSON.stringify({ daily, free })) as StartBags
  } catch (e) {
    console.error('airmail start bags', e instanceof Error ? e.message : e)
    return null
  }
}
