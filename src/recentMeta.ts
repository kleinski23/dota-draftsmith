import type { RecentProMeta } from './types'

export async function loadRecentProMeta(): Promise<{ meta: RecentProMeta | null; cached: boolean }> {
  try {
    const response = await fetch('/api/meta/recent', { cache: 'no-store' })
    if (!response.ok) throw new Error('Professional draft model unavailable')
    return { meta: await response.json() as RecentProMeta, cached: true }
  } catch {
    try {
      const response = await fetch('/data/recent-pro-meta.json', { cache: 'no-store' })
      if (!response.ok) throw new Error('Bundled professional draft model unavailable')
      return { meta: await response.json() as RecentProMeta, cached: true }
    } catch {
      return { meta: null, cached: false }
    }
  }
}
