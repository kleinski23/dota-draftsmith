import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RecentDurationSignal, RecentHeroSignal, RecentLaneSignal, RecentPositionSignal, RecentProMeta, RecentPublicHeroSignal } from '../src/types.js'

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = resolve(PROJECT_ROOT, 'data')
const DRAFTS_PATH = resolve(DATA_DIR, 'pro-drafts.json')
const HIGH_RANK_PATH = resolve(DATA_DIR, 'high-rank-matches.json')
const META_PATH = resolve(DATA_DIR, 'recent-pro-meta.json')
const HEROES_PATH = resolve(DATA_DIR, 'heroes.json')
const API_BASE = process.env.OPENDOTA_API_BASE ?? 'https://api.opendota.com/api'
const REFRESH_MS = 6 * 60 * 60 * 1000
const BATCH_SIZE = Math.max(4, Math.min(160, Number(process.env.PRO_MATCH_BATCH_SIZE ?? 80)))
const HIGH_RANK_BATCH_SIZE = Math.max(0, Math.min(4000, Number(process.env.HIGH_RANK_BATCH_SIZE ?? process.env.PUBLIC_MATCH_BATCH_SIZE ?? 400)))
const HIGH_RANK_MIN_TIER = Math.max(10, Math.min(85, Number(process.env.HIGH_RANK_MIN_TIER ?? 75)))
const HIGH_RANK_DATASET_LIMIT = Math.max(1000, Number(process.env.HIGH_RANK_DATASET_LIMIT ?? 100000))
const EXPLORER_BATCH_SIZE = Math.max(0, Math.min(400, Number(process.env.EXPLORER_MATCH_BATCH_SIZE ?? 0)))
const POSITION_BACKFILL_SIZE = Math.max(4, Math.min(240, Number(process.env.PRO_POSITION_BACKFILL_SIZE ?? 120)))
const DATASET_LIMIT = Math.max(500, Number(process.env.PRO_DATASET_LIMIT ?? 8000))
// OpenDota free tier allows 60 calls/min; pace detail fetches so batches are not silently dropped as 429s.
const DETAIL_BATCH_DELAY_MS = Math.max(0, Number(process.env.OPENDOTA_BATCH_DELAY_MS ?? 4500))
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
  duration?: number
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
  duration?: number
  picksBans: PickBan[]
  positions?: PlayerPosition[]
}

interface PublicMatchRow {
  match_id: number
  radiant_win: boolean
  start_time: number
  duration: number
  lobby_type: number
  game_mode: number
  avg_rank_tier: number
  radiant_team: number[] | string
  dire_team: number[] | string
}

interface StoredPublicMatch {
  matchId: number
  startTime: number
  radiantWin: boolean
  avgRankTier: number
  duration?: number
  radiant: number[]
  dire: number[]
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

async function fetchJson<T>(url: string, retries = 5): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(url, { headers: { 'User-Agent': 'Draftsmith/0.2 pro-meta-ingestion' } })
    if (response.ok) return response.json() as Promise<T>
    if (response.status === 429 && attempt < retries) {
      const retryAfter = Number(response.headers.get('retry-after'))
      await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 15000 * (attempt + 1)))
      continue
    }
    throw new Error(`OpenDota request failed: ${response.status}`)
  }
}

async function fetchExplorerRows(sql: string): Promise<ProMatchSummary[]> {
  const encoded = encodeURIComponent(sql)
  const result = await fetchJson<{ rows?: ProMatchSummary[] }>(`${API_BASE}/explorer?sql=${encoded}`)
  return result.rows ?? []
}

const sleep = (ms: number) => ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve()

function teamHeroIds(team: number[] | string): number[] {
  const ids = Array.isArray(team) ? team : team.split(',').map(Number)
  return ids.filter((id) => Number.isInteger(id) && id > 0)
}

async function fetchHighRankMatches(existingIds: Set<number>, target: number): Promise<StoredPublicMatch[]> {
  const collected: StoredPublicMatch[] = []
  const seen = new Set(existingIds)
  let cursor: number | null = null
  const maxPages = Math.min(60, Math.ceil(target / 30) + 4)
  for (let page = 0; page < maxPages && collected.length < target; page += 1) {
    const cursorClause = cursor ? `&less_than_match_id=${cursor}` : ''
    const rows = await fetchJson<PublicMatchRow[]>(`${API_BASE}/publicMatches?min_rank=${HIGH_RANK_MIN_TIER}${cursorClause}`)
    if (!rows.length) break
    cursor = Math.min(...rows.map((row) => row.match_id))
    for (const row of rows) {
      // Ranked matchmaking (lobby 7) All Draft (mode 22) only: no Turbo, no unranked lobbies.
      if (row.lobby_type !== 7 || row.game_mode !== 22) continue
      if (row.duration < 600) continue
      if (seen.has(row.match_id)) continue
      const radiant = teamHeroIds(row.radiant_team)
      const dire = teamHeroIds(row.dire_team)
      if (radiant.length !== 5 || dire.length !== 5) continue
      seen.add(row.match_id)
      collected.push({
        matchId: row.match_id,
        startTime: row.start_time,
        radiantWin: row.radiant_win,
        avgRankTier: row.avg_rank_tier,
        duration: row.duration,
        radiant,
        dire,
      })
    }
    await sleep(1100)
  }
  return collected
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

// Game-length buckets: short < 25 min, long > 37 min, mid in between.
function durationBucket(duration: number): keyof RecentDurationSignal {
  return duration < 1500 ? 'short' : duration > 2220 ? 'long' : 'mid'
}

function emptyDurationSignal(): RecentDurationSignal {
  return { short: { picks: 0, wins: 0 }, mid: { picks: 0, wins: 0 }, long: { picks: 0, wins: 0 } }
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

// Pro drafts carry full weight; high-rank pubs are a broader but noisier sample, so each
// match contributes less and decays faster (the public meta shifts quicker than pro).
const PUBLIC_MATCH_WEIGHT = 0.35
const PUBLIC_DECAY_DAYS = 10
const PRO_DECAY_DAYS = 21

function shrunkEdge(wins: number, samples: number): number {
  const winRate = (wins + 2) / (samples + 4)
  const credibility = samples / (samples + 5)
  return (winRate - 0.5) * 2 * credibility
}

function aggregateDrafts(dataset: StoredDraft[], publicDataset: StoredPublicMatch[] = []): RecentProMeta {
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
  const durationSignals: Record<number, RecentDurationSignal> = {}
  const now = Date.now() / 1000
  const recordDuration = (team: number[], won: boolean, duration: number | undefined, weight: number) => {
    if (!duration) return
    const bucket = durationBucket(duration)
    for (const heroId of team) {
      const signal = durationSignals[heroId] ?? emptyDurationSignal()
      signal[bucket].picks += weight
      if (won) signal[bucket].wins += weight
      durationSignals[heroId] = signal
    }
  }

  for (const match of pool) {
    // Every stored pro draft comes from a league (tournament) game; the freshest results
    // carry extra weight so the model tracks the current tournament meta quickly.
    const ageDays = Math.max(0, (now - match.startTime) / 86400)
    const freshBoost = ageDays <= 14 ? 1.35 : 1
    const weight = freshBoost * Math.exp(-ageDays / PRO_DECAY_DAYS)
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
      recordDuration(team, won, match.duration, weight)
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

  const publicPool = publicDataset.slice(0, HIGH_RANK_DATASET_LIMIT)
  const publicHeroSignals: Record<number, RecentPublicHeroSignal> = {}
  for (const match of publicPool) {
    const weight = PUBLIC_MATCH_WEIGHT * Math.exp(-Math.max(0, (now - match.startTime) / 86400) / PUBLIC_DECAY_DAYS)
    for (const [team, won] of [[match.radiant, match.radiantWin], [match.dire, !match.radiantWin]] as const) {
      recordDuration(team, won, match.duration, weight)
      for (const heroId of team) {
        const signal = publicHeroSignals[heroId] ?? { picks: 0, wins: 0 }
        signal.picks += weight
        if (won) signal.wins += weight
        publicHeroSignals[heroId] = signal
      }
      for (let i = 0; i < team.length; i += 1) for (let j = i + 1; j < team.length; j += 1) {
        const key = pairKey(team[i], team[j])
        pairSamples[key] = (pairSamples[key] ?? 0) + weight
        if (won) pairWins[key] = (pairWins[key] ?? 0) + weight
      }
    }
    for (const radiantHero of match.radiant) for (const direHero of match.dire) {
      for (const [hero, enemy, won] of [[radiantHero, direHero, match.radiantWin], [direHero, radiantHero, !match.radiantWin]] as const) {
        const key = `${hero}:${enemy}`
        matchupSamples[key] = (matchupSamples[key] ?? 0) + weight
        if (won) matchupWins[key] = (matchupWins[key] ?? 0) + weight
      }
    }
  }

  for (const [key, samples] of Object.entries(pairSamples)) {
    synergy[key] = shrunkEdge(pairWins[key] ?? 0, samples)
  }
  for (const [key, samples] of Object.entries(matchupSamples)) {
    counters[key] = shrunkEdge(matchupWins[key] ?? 0, samples)
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
    publicHeroSignals,
    publicMatchesAnalyzed: publicPool.length,
    publicDatasetSize: publicDataset.length,
    publicNewestMatchAt: Math.max(0, ...publicPool.map((match) => match.startTime)),
    publicMinRankTier: HIGH_RANK_MIN_TIER,
    durationSignals,
    matchesWithDuration: pool.filter((draft) => draft.duration).length + publicPool.filter((match) => match.duration).length,
  }
}

async function fetchDraftDetails(summaries: ProMatchSummary[], limit: number, existingIds: Set<number>) {
  const pending = summaries.filter((match) => !existingIds.has(match.match_id)).slice(0, limit)
  const drafts: StoredDraft[] = []
  for (let index = 0; index < pending.length; index += 4) {
    if (index > 0) await sleep(DETAIL_BATCH_DELAY_MS)
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
        duration: match.duration ?? 0,
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
  const needsDetail = (draft: StoredDraft) =>
    (draft.positions?.filter((position) => position.position).length ?? 0) < 10 || !draft.duration
  const pending = drafts.filter(needsDetail).slice(0, POSITION_BACKFILL_SIZE)
  const updates = new Map<number, { positions: PlayerPosition[]; duration: number }>()
  for (let index = 0; index < pending.length; index += 4) {
    if (index > 0) await sleep(DETAIL_BATCH_DELAY_MS)
    const batch = pending.slice(index, index + 4)
    const results = await Promise.allSettled(batch.map((draft) => fetchJson<ProMatchDetail>(`${API_BASE}/matches/${draft.matchId}`)))
    results.forEach((result, resultIndex) => {
      if (result.status === 'fulfilled') updates.set(batch[resultIndex].matchId, { positions: positionsFrom(result.value), duration: result.value.duration ?? 0 })
    })
  }
  return drafts.map((draft) => {
    const update = updates.get(draft.matchId)
    return update ? { ...draft, positions: update.positions, duration: update.duration || draft.duration } : draft
  })
}

export async function refreshProData(force = false): Promise<RecentProMeta> {
  const existingMeta = await readJson<RecentProMeta | null>(META_PATH, null)
  if (!force && existingMeta && Date.now() - existingMeta.generatedAt < REFRESH_MS) return existingMeta
  const current = await readJson<StoredDraft[]>(DRAFTS_PATH, [])
  const currentPublic = await readJson<StoredPublicMatch[]>(HIGH_RANK_PATH, [])
  const incoming = await fetchNewDrafts(new Set(current.map((draft) => draft.matchId))).catch((error: unknown) => {
    console.warn('New match ingestion skipped:', error instanceof Error ? error.message : error)
    return [] as StoredDraft[]
  })
  const incomingPublic = HIGH_RANK_BATCH_SIZE
    ? await fetchHighRankMatches(new Set(currentPublic.map((match) => match.matchId)), HIGH_RANK_BATCH_SIZE).catch((error: unknown) => {
        console.warn('High-rank match ingestion skipped:', error instanceof Error ? error.message : error)
        return [] as StoredPublicMatch[]
      })
    : []
  const enrichedCurrent = await backfillPositions(current)
  const merged = [...incoming, ...enrichedCurrent]
    .filter((draft, index, all) => all.findIndex((item) => item.matchId === draft.matchId) === index)
    .sort((a, b) => b.startTime - a.startTime)
    .slice(0, DATASET_LIMIT)
  const mergedPublic = [...incomingPublic, ...currentPublic]
    .filter((match, index, all) => all.findIndex((item) => item.matchId === match.matchId) === index)
    .sort((a, b) => b.startTime - a.startTime)
    .slice(0, HIGH_RANK_DATASET_LIMIT)
  if (!merged.length) throw new Error('No parsed Captain’s Mode drafts are available')
  const meta = aggregateDrafts(merged, mergedPublic)
  // Backtest calibration is produced by evaluate-model.ts; carry it across refreshes.
  if (existingMeta?.calibration) meta.calibration = existingMeta.calibration
  await writeJsonAtomic(DRAFTS_PATH, merged)
  await writeJsonAtomic(HIGH_RANK_PATH, mergedPublic)
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
    .then((meta) => console.log(`Ingested ${meta.datasetSize} stored drafts; ${meta.matchesAnalyzed} in the active patch model; ${meta.publicDatasetSize ?? 0} high-rank matches.`))
    .catch((error: unknown) => { console.error(error); process.exitCode = 1 })
}
