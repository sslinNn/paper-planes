// адрес сайта для абсолютных ссылок (превью, пост в X): прод на Vercel, локально — 127.0.0.1
export const SITE = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://127.0.0.1:3000'
// автор: видит счётчик посетителей всегда, остальные — когда цифры уже не стыдные
export const OWNER = '_sslinNn'
