// X берёт twitter:image раньше og:image — без этого файла табло унаследовало бы общий скриншот из app/
export { default } from './opengraph-image'
export const alt = 'Air traffic of paper planes: busiest routes of replies on X'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const revalidate = 900
