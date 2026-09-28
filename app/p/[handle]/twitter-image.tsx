// X берёт twitter:image раньше og:image — без этого файла карточка унаследовала бы общий скриншот из app/
export { default } from './opengraph-image'
export const alt = 'Paper planes of a pilot on X'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const revalidate = 3600
