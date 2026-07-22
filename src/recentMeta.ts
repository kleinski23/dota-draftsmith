import type { RecentProMeta } from './types'
import type { DataSource } from './heroData'

export async function loadRecentProMeta(): Promise<{ meta: RecentProMeta | null; source: DataSource | null }> {
  try {
    const response = await fetch('/api/meta/recent', { cache: 'no-store' })
    if (!response.ok) throw new Error('Professional draft model unavailable')
    const source = response.headers.get('x-draftgg-data-source') === 'bundled' ? 'bundled' : 'live'
    return { meta: await response.json() as RecentProMeta, source }
  } catch {
    try {
      const response = await fetch('/data/recent-pro-meta.json', { cache: 'no-store' })
      if (!response.ok) throw new Error('Bundled professional draft model unavailable')
      return { meta: await response.json() as RecentProMeta, source: 'bundled' }
    } catch {
      return { meta: null, source: null }
    }
  }
}
