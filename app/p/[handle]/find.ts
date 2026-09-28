import { cache } from 'react'
import { normalizeHandle } from '@/lib/pilot'
import { pilot } from '@/lib/pilot-db'

// generateMetadata, страница и картинка просят одного пилота — один запрос на рендер
export const findPilot = cache(async (raw: string) => {
  const handle = normalizeHandle(raw)
  return handle ? pilot(handle) : null
})
