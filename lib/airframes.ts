import type { PlaneModel } from './patrons.ts'

// модели самолётиков: одни пути для SVG (карта) и canvas (игра). Нос смотрит по +x.
// size выравнивает модели по охвату с дротиком: у глайдера размах почти вдвое больше, без поправки он гигантский
export const AIRFRAMES: Record<PlaneModel, { wing: string[]; fold: string[]; size: number }> = {
  dart: { wing: ['M13 0 L-10 -9 L-4 0 Z', 'M13 0 L-4 0 L-9 6 Z'], fold: ['M13 0 L-4 0 L-9 6 Z'], size: 1 },
  glider: {
    wing: ['M15 0 L-9 -1.6 L-9 1.6 Z', 'M3 -1 L-1 -14 L-5 -14 L-4 -1 Z', 'M3 1 L-1 14 L-5 14 L-4 1 Z'],
    fold: ['M-6 -1 L-10 -5 L-11 -5 L-9 0 L-11 5 L-10 5 L-6 1 Z'],
    size: 0.7,
  },
  swallow: { wing: ['M14 0 L-2 -11 L-13 -13 L-5 -2 L-13 5 L-2 4 Z'], fold: ['M14 0 L-5 -2 L-13 5 L-2 4 Z'], size: 0.85 },
  crane: { wing: ['M4 0 L-3 -14 L-6 0 Z', 'M15 -5 L3 1 L-6 1 L-15 -4 L-7 4 L5 4 Z'], fold: ['M4 0 L-2 9 L-6 1 Z'], size: 0.72 },
}
