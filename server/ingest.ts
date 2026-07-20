import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RecentHeroSignal, RecentLaneSignal, RecentPositionSignal, RecentProMeta } from '../src/types.js'

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = resolve(PROJECT_ROOT, 'data')
const DRAFTS_PATH = resolve(DATA_DIR, 'pro-drafts.json')
const META_PATH = resolve(DATA_DIR, 'recent-pro-meta.json')
const HEROES_PATH = resolve(DATA_DIR, 'heroes.json')
const API_BASE = process.env.OPENDOTA_API_BASE ?? 'https://api.opendota.com/api'
const REFRESH_MS = 6 * 60 * 60 * 1000
const BATCH_SIZE = Math.max(4, Math.min(160, Number(process.env.PRO_MATCH_BATCH_SIZE ?? 80)))
const PUBLIC_BATCH_SIZE = Math.max(0, Math.min(160, Number(process.env.PUBLIC_MATCH_BATCH_SIZE ?? 0)))
const EXPLORER_BATCH_SIZE = Math.max(0, Math.min(400, Number(process.env.EXPLORER_MATCH_BATCH_SIZE ?? 0)))
const POSITION_BACKFILL_SIZE = Math.max(4, Math.min(240, Number(process.env.PRO_POSITION_BACKFILL_SIZE ?? 120)))
const DATASET_LIMIT = Math.max(500, Number(process.env.PRO_DATASET_LIMIT ?? 8000))
let refreshInFlight: Promise<RecentProMeta> | null = null

interface ProMatchSummary {
  match_id: number
  start_time: number
}

interface PickBan {
  is_pick: boolean
  hero_id: number
  team: number
  order: number
}

interface ProMatchDetail {
  match_id: number
  start_time: number
  radiant_win: boolean
  game_mode: number
  patch?: number
  leagueid?: number
  picks_bans?: PickBan[]
  players?: Array<{
    hero_id: number
    player_slot: number
    lane_role?: number
    is_roaming?: boolean
    gold_per_min?: number
  }>
}

interface PlayerPosition {
  heroId: number
  team: number
  laneRole: number
  roaming: boolean
  position?: number
}

interface StoredDraft {
  matchId: number
  startTime: number
  radiantWin: boolean
  patch: number
  leagueId: number
  picksBans: PickBan[]
  positions?: PlayerPosition[]
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(path, 'utf8')) as T } catch { return fallback }
}

async function writeJsonAtomic(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp`
  await writeFile(temporary, JSON.stringify(value, null, 2), 'utf8')
  await rename(temporary, path)
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { 'User-Agent': 'Draftsmith/0.2 pro-meta-ingestion' } })
  if (!response.ok) throw new Error(`OpenDota request failed: ${response.status}`)
  return response.json() as Promise<T>
}

async function fetchExplorerRows(sql: string): Promise<ProMatchSummary[]> {
  const encoded = encodeURIComponent(sql)
  const result = await fetchJson<{ rows?: ProMatchSummary[] }>(`${API_BASE}/explorer?sql=${encoded}`)
  return result.rows ?? []
}

function pairKey(a: number, b: number) {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

function emptySignal(): RecentHeroSignal {
  return { picks: 0, bans: 0, wins: 0, firstPhase: 0 }
}

function emptyLaneSignal(): RecentLaneSignal {
  return { safe: 0, mid: 0, off: 0, roam: 0, samples: 0 }
}

function emptyPositionSignal(): RecentPositionSignal {
  return { positions: [0, 0, 0, 0, 0], samples: 0 }
}

function positionsFrom(match: ProMatchDetail): PlayerPosition[] {
  const players = (match.players ?? []).flatMap((player) => {
    if (!player.hero_id || !player.lane_role) return []
    return [{
      heroId: player.hero_id,
      team: player.player_slot >= 128 ? 1 : 0,
      laneRole: player.lane_role,
      roaming: Boolean(player.is_roaming),
      gpm: player.gold_per_min ?? 0,
    }]
  })
  return [0, 1].flatMap((team) => {
    const teamPlayers = players.filter((player) => player.team === team)
    const assigned = new Map<number, number>()
    const lane = (role: number) => teamPlayers.filter((player) => player.laneRole === role && !player.roaming).sort((a, b) => b.gpm - a.gpm)
    const safe = lane(1); const mid = lane(2); const off = lane(3)
    if (safe[0]) assigned.set(safe[0].heroId, 1)
    safe.slice(1).forEach((player) => assigned.set(player.heroId, 5))
    if (mid[0]) assigned.set(mid[0].heroId, 2)
    mid.slice(1).forEach((player) => assigned.set(player.heroId, 4))
    if (off[0]) assigned.set(off[0].heroId, 3)
    off.slice(1).forEach((player) => assigned.set(player.heroId, 4))
    const used = new Set(assigned.values())
    const open = [1, 2, 3, 4, 5].filter((position) => !used.has(position))
    teamPlayers.filter((player) => !assigned.has(player.heroId)).sort((a, b) => b.gpm - a.gpm).forEach((player, index) => assigned.set(player.heroId, open[index] ?? 4))
    return teamPlayers.map(({ gpm: _gpm, ...player }) => ({ ...player, position: assigned.get(player.heroId) }))
  })
}

function aggregateDrafts(dataset: StoredDraft[]): RecentProMeta {
  const newestPatch = dataset.find((draft) => draft.patch > 0)?.patch
  const patchPool = newestPatch ? dataset.filter((draft) => draft.patch === newestPatch) : dataset
  const pool = patchPool.slice(0, 2500)
  const heroSignals: Record<number, RecentHeroSignal> = {}
  const synergy: Record<string, number> = {}
  const counters: Record<string, number> = {}
  const pairSamples: Record<string, number> = {}
  const pairWins: Record<string, number> = {}
  const matchupSamples: Record<string, number> = {}
  const matchupWins: Record<string, number> = {}
  const laneSignals: Record<number, RecentLaneSignal> = {}
  const positionSignals: Record<number, RecentPositionSignal> = {}
  const now = Date.now() / 1000

  for (const match of pool) {
    const weight = Math.exp(-Math.max(0, (now - match.startTime) / 86400) / 21)
    const radiant = match.picksBans.filter((a) => a.is_pick && a.team === 0).map((a) => a.hero_id)
    const dire = match.picksBans.filter((a) => a.is_pick && a.team === 1).map((a) => a.hero_id)
    for (const action of match.picksBans) {
      const signal = heroSignals[action.hero_id] ?? emptySignal()
      if (action.is_pick) signal.picks += weight
      else signal.bans += weight
      if (action.order < 10) signal.firstPhase += weight
      if (action.is_pick && (action.team === 0 ? match.radiantWin : !match.radiantWin)) signal.wins += weight
      heroSignals[action.hero_id] = signal
    }
    for (const position of match.positions ?? []) {
      const signal = laneSignals[position.heroId] ?? emptyLaneSignal()
      signal.samples += weight
      if (position.roaming) signal.roam += weight
      else if (position.laneRole === 1) signal.safe += weight
      else if (position.laneRole === 2) signal.mid += weight
      else if (position.laneRole === 3) signal.off += weight
      laneSignals[position.heroId] = signal
      if (position.position && position.position >= 1 && position.position <= 5) {
        const positionSignal = positionSignals[position.heroId] ?? emptyPositionSignal()
        positionSignal.positions[position.position - 1] += weight
        positionSignal.samples += weight
        positionSignals[position.heroId] = positionSignal
      }
    }
    for (const [team, won] of [[radiant, match.radiantWin], [dire, !match.radiantWin]] as const) {
      for (let i = 0; i < team.length; i += 1) for (let j = i + 1; j < team.length; j += 1) {
        const key = pairKey(team[i], team[j])
        pairSamples[key] = (pairSamples[key] ?? 0) + weight
        if (won) pairWins[key] = (pairWins[key] ?? 0) + weight
      }
    }
    for (const radiantHero of radiant) for (const direHero of dire) {
      for (const [hero, enemy, won] of [[radiantHero, direHero, match.radiantWin], [direHero, radiantHero, !match.radiantWin]] as const) {
        const key = `${hero}:${enemy}`
        matchupSamples[key] = (matchupSamples[key] ?? 0) + weight
        if (won) matchupWins[key] = (matchupWins[key] ?? 0) + weight
      }
    }
  }

  for (const [key, samples] of Object.entries(pairSamples)) {
    const winRate = ((pairWins[key] ?? 0) + 1.5) / (samples + 3)
    synergy[key] = (winRate - 0.5) * 2 * Math.min(1, samples / 3)
  }
  for (const [key, samples] of Object.entries(matchupSamples)) {
    const winRate = ((matchupWins[key] ?? 0) + 1.5) / (samples + 3)
    counters[key] = (winRate - 0.5) * 2 * Math.min(1, samples / 3)
  }

  return {
    heroSignals,
    synergy,
    counters,
    laneSignals,
    matchesWithLanes: pool.filter((draft) => (draft.positions?.length ?? 0) >= 10).length,
    positionSignals,
    matchesWithPositions: pool.filter((draft) => (draft.positions?.filter((position) => position.position).length ?? 0) >= 10).length,
    matchesAnalyzed: pool.length,
    newestMatchAt: Math.max(0, ...pool.map((draft) => draft.startTime)),
    generatedAt: Date.now(),
    datasetSize: dataset.length,
    patch: newestPatch,
  }
}

async function fetchDraftDetails(summaries: ProMatchSummary[], limit: number, existingIds: Set<number>) {
  const pending = summaries.filter((match) => !existingIds.has(match.match_id)).slice(0, limit)
  const drafts: StoredDraft[] = []
  for (let index = 0; index < pending.length; index += 4) {
    const batch = pending.slice(index, index + 4)
    const results = await Promise.allSettled(batch.map(({ match_id }) => fetchJson<ProMatchDetail>(`${API_BASE}/matches/${match_id}`)))
    for (const result of results) {
      if (result.status !== 'fulfilled') continue
      const match = result.value
      if (match.game_mode !== 2 || (match.picks_bans?.length ?? 0) < 20) continue
      drafts.push({
        matchId: match.match_id,
        startTime: match.start_time,
        radiantWin: match.radiant_win,
        patch: match.patch ?? 0,
        leagueId: match.leagueid ?? 0,
        picksBans: match.picks_bans ?? [],
        positions: positionsFrom(match),
      })
    }
  }
  return drafts
}

async function fetchNewDrafts(existingIds: Set<number>) {
  const proSummaries = await fetchJson<ProMatchSummary[]>(`${API_BASE}/proMatches`)
  const proDrafts = await fetchDraftDetails(proSummaries, BATCH_SIZE, existingIds)
  const drafts = [...proDrafts]
  const knownIds = new Set([...existingIds, ...proDrafts.map((draft) => draft.matchId)])
  if (PUBLIC_BATCH_SIZE) {
    try {
      const publicSummaries = await fetchJson<ProMatchSummary[]>(`${API_BASE}/publicMatches`)
      const publicDrafts = await fetchDraftDetails(publicSummaries, PUBLIC_BATCH_SIZE, knownIds)
      publicDrafts.forEach((draft) => knownIds.add(draft.matchId))
      drafts.push(...publicDrafts)
    } catch (error) {
      console.warn('Public match ingestion skipped:', error instanceof Error ? error.message : error)
    }
  }
  if (EXPLORER_BATCH_SIZE) {
    try {
      const oldestKnown = Math.min(...Array.from(existingIds))
      const beforeClause = Number.isFinite(oldestKnown) ? `AND match_id < ${oldestKnown}` : ''
      const explorerRows = await fetchExplorerRows(`SELECT match_id,start_time FROM matches WHERE game_mode = 2 ${beforeClause} ORDER BY match_id DESC LIMIT ${EXPLORER_BATCH_SIZE}`)
      drafts.push(...await fetchDraftDetails(explorerRows, EXPLORER_BATCH_SIZE, knownIds))
    } catch (error) {
      console.warn('Explorer match ingestion skipped:', error instanceof Error ? error.message : error)
    }
  }
  return drafts
}

async function backfillPositions(drafts: StoredDraft[]) {
  const pending = drafts.filter((draft) => (draft.positions?.filter((position) => position.position).length ?? 0) < 10).slice(0, POSITION_BACKFILL_SIZE)
  const updates = new Map<number, PlayerPosition[]>()
  for (let index = 0; index < pending.length; index += 4) {
    const batch = pending.slice(index, index + 4)
    const results = await Promise.allSettled(batch.map((draft) => fetchJson<ProMatchDetail>(`${API_BASE}/matches/${draft.matchId}`)))
    results.forEach((result, resultIndex) => {
      if (result.status === 'fulfilled') updates.set(batch[resultIndex].matchId, positionsFrom(result.value))
    })
  }
  return drafts.map((draft) => updates.has(draft.matchId) ? { ...draft, positions: updates.get(draft.matchId) } : draft)
}

export async function refreshProData(force = false): Promise<RecentProMeta> {
  const existingMeta = await readJson<RecentProMeta | null>(META_PATH, null)
  if (!force && existingMeta && Date.now() - existingMeta.generatedAt < REFRESH_MS) return existingMeta
  const current = await readJson<StoredDraft[]>(DRAFTS_PATH, [])
  const incoming = await fetchNewDrafts(new Set(current.map((draft) => draft.matchId))).catch((error: unknown) => {
    console.warn('New match ingestion skipped:', error instanceof Error ? error.message : error)
    return [] as StoredDraft[]
  })
  const enrichedCurrent = await backfillPositions(current)
  const merged = [...incoming, ...enrichedCurrent]
    .filter((draft, index, all) => all.findIndex((item) => item.matchId === draft.matchId) === index)
    .sort((a, b) => b.startTime - a.startTime)
    .slice(0, DATASET_LIMIT)
  if (!merged.length) throw new Error('No parsed Captain’s Mode drafts are available')
  const meta = aggregateDrafts(merged)
  await writeJsonAtomic(DRAFTS_PATH, merged)
  await writeJsonAtomic(META_PATH, meta)
  return meta
}

export async function getCachedMeta() {
  const cached = await readJson<RecentProMeta | null>(META_PATH, null)
  return cached ?? ensureProData()
}

export function ensureProData(force = false) {
  if (!refreshInFlight) {
    refreshInFlight = refreshProData(force).finally(() => { refreshInFlight = null })
  }
  return refreshInFlight
}

export async function refreshHeroes(force = false) {
  const cached = await readJson<{ generatedAt: number; heroes: unknown[] } | null>(HEROES_PATH, null)
  if (!force && cached && Date.now() - cached.generatedAt < 24 * 60 * 60 * 1000) return cached.heroes
  const heroes = await fetchJson<unknown[]>(`${API_BASE}/heroStats`)
  await writeJsonAtomic(HEROES_PATH, { generatedAt: Date.now(), heroes })
  return heroes
}

export async function getCachedHeroes() {
  return refreshHeroes(false)
}

if (process.argv[1]?.endsWith('ingest.ts')) {
  refreshProData(process.argv.includes('--force'))
    .then((meta) => console.log(`Ingested ${meta.datasetSize} stored drafts; ${meta.matchesAnalyzed} in the active patch model.`))
    .catch((error: unknown) => { console.error(error); process.exitCode = 1 })
}
