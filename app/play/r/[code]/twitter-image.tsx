// X берёт twitter:image раньше og:image — без этого файла открытка унаследовала бы общую картинку /play
export { default } from './opengraph-image'
export const alt = 'An Airmail route: real X replies flown as a paper plane'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const revalidate = 86400
