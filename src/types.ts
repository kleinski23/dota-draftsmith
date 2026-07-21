export type Team = 'radiant' | 'dire'
export type ActionType = 'pick' | 'ban'
export type Strategy = 'balanced' | 'meta' | 'cheese' | 'counter'

export interface Hero {
  id: number
  name: string
  localizedName: string
  primaryAttr: 'str' | 'agi' | 'int' | 'all'
  attackType: string
  roles: string[]
  image: string
  icon: string
  proPick: number
  proBan: number
  proWin: number
}

export interface DraftStep {
  type: ActionType
  team: Team
  phase: number
}

export interface DraftAction extends DraftStep {
  hero: Hero
  reason?: string
}

export interface DraftMode {
  playerTeam: Team | null
  strategy: Strategy
}

export interface RecentHeroSignal {
  picks: number
  bans: number
  wins: number
  firstPhase: number
}

export interface RecentLaneSignal {
  safe: number
  mid: number
  off: number
  roam: number
  samples: number
}

export interface RecentPositionSignal {
  positions: [number, number, number, number, number]
  samples: number
}

export interface RecentPublicHeroSignal {
  picks: number
  wins: number
}

export interface DurationBucket {
  picks: number
  wins: number
}

export interface RecentDurationSignal {
  short: DurationBucket
  mid: DurationBucket
  long: DurationBucket
}

export interface ModelCalibration {
  matches: number
  proMatches: number
  publicMatches: number
  accuracy: number
  brier: number
  /** Least-squares factor mapping raw probability edges to observed edges; applied as 50 + (p - 50) * shrink. */
  shrink: number
  buckets: Array<{ range: string; matches: number; expected: number; actual: number }>
  evaluatedAt: number
}

export interface RecentProMeta {
  heroSignals: Record<number, RecentHeroSignal>
  synergy: Record<string, number>
  counters: Record<string, number>
  laneSignals?: Record<number, RecentLaneSignal>
  matchesWithLanes?: number
  positionSignals?: Record<number, RecentPositionSignal>
  matchesWithPositions?: number
  matchesAnalyzed: number
  newestMatchAt: number
  generatedAt: number
  datasetSize?: number
  patch?: number
  publicHeroSignals?: Record<number, RecentPublicHeroSignal>
  publicMatchesAnalyzed?: number
  publicDatasetSize?: number
  publicNewestMatchAt?: number
  publicMinRankTier?: number
  durationSignals?: Record<number, RecentDurationSignal>
  matchesWithDuration?: number
  calibration?: ModelCalibration
}
