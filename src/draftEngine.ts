import { scoreTeam, type Dimension } from './analysisEngine'
import type { DraftAction, DraftStep, Hero, RecentProMeta, Strategy, Team } from './types'

export const DRAFT_ORDER: DraftStep[] = [
  { type: 'ban', team: 'radiant', phase: 1 }, { type: 'ban', team: 'dire', phase: 1 },
  { type: 'ban', team: 'dire', phase: 1 }, { type: 'ban', team: 'radiant', phase: 1 },
  { type: 'ban', team: 'radiant', phase: 1 }, { type: 'ban', team: 'dire', phase: 1 },
  { type: 'pick', team: 'radiant', phase: 1 }, { type: 'pick', team: 'dire', phase: 1 },
  { type: 'pick', team: 'dire', phase: 1 }, { type: 'pick', team: 'radiant', phase: 1 },
  { type: 'ban', team: 'dire', phase: 2 }, { type: 'ban', team: 'radiant', phase: 2 },
  { type: 'ban', team: 'radiant', phase: 2 }, { type: 'ban', team: 'dire', phase: 2 },
  { type: 'pick', team: 'dire', phase: 2 }, { type: 'pick', team: 'radiant', phase: 2 },
  { type: 'pick', team: 'radiant', phase: 2 }, { type: 'pick', team: 'dire', phase: 2 },
  { type: 'ban', team: 'radiant', phase: 3 }, { type: 'ban', team: 'dire', phase: 3 },
  { type: 'ban', team: 'dire', phase: 3 }, { type: 'ban', team: 'radiant', phase: 3 },
  { type: 'pick', team: 'radiant', phase: 3 }, { type: 'pick', team: 'dire', phase: 3 },
]

const CHEESE = ['broodmother', 'meepo', 'huskar', 'tinker', 'arc_warden', 'visage', 'lone_druid', 'lycan', 'chen']

// Curated hard-counter map for heroes whose whole game plan collapses into specific answers
// (clones, illusions, summons, heal-stacking). The observed counter table only covers pairs
// that appear in the current sample — notorious matchups pros simply never play (e.g. Meepo
// into Earthshaker) would otherwise score as neutral and the AI would walk into them.
// COUNTERED_BY[hero] = heroes that shut that hero down.
const COUNTERED_BY: Record<string, string[]> = {
  meepo: ['earthshaker', 'winter_wyvern', 'sven', 'ember_spirit', 'dark_seer', 'magnataur', 'axe', 'crystal_maiden', 'warlock'],
  broodmother: ['axe', 'underlord', 'earthshaker', 'legion_commander', 'dark_seer', 'batrider'],
  huskar: ['ancient_apparition', 'axe', 'doom_bringer', 'viper', 'shadow_demon'],
  tinker: ['storm_spirit', 'spirit_breaker', 'nyx_assassin', 'clockwerk', 'zeus'],
  arc_warden: ['storm_spirit', 'spirit_breaker', 'ember_spirit', 'clockwerk'],
  visage: ['crystal_maiden', 'earthshaker', 'winter_wyvern', 'jakiro'],
  lone_druid: ['axe', 'earthshaker', 'winter_wyvern', 'doom_bringer'],
  lycan: ['axe', 'winter_wyvern', 'crystal_maiden', 'earthshaker'],
  chen: ['axe', 'earthshaker', 'crystal_maiden', 'jakiro'],
  phantom_lancer: ['earthshaker', 'sven', 'dark_seer', 'medusa', 'winter_wyvern'],
  naga_siren: ['earthshaker', 'sven', 'dark_seer', 'axe', 'winter_wyvern'],
  chaos_knight: ['earthshaker', 'sven', 'dark_seer', 'shadow_demon'],
  terrorblade: ['axe', 'legion_commander', 'earthshaker', 'winter_wyvern'],
  medusa: ['antimage', 'nyx_assassin', 'phantom_lancer', 'invoker'],
  wraith_king: ['antimage', 'shadow_demon', 'doom_bringer', 'silencer'],
}

// True when `hero` is a curated hard counter to `target`.
const hardCounters = (hero: Hero, target: Hero) => COUNTERED_BY[key(target)]?.includes(key(hero)) ?? false

const key = (hero: Hero) => hero.name.replace('npc_dota_hero_', '')
const hasAny = (hero: Hero, list: string[]) => list.includes(key(hero))
const roleCount = (heroes: Hero[], role: string) => heroes.filter((hero) => hero.roles.includes(role)).length

function likelyPositionWeight(hero: Hero, position: 0 | 1 | 2 | 3 | 4, recentMeta?: RecentProMeta | null) {
  const observed = recentMeta?.positionSignals?.[hero.id]
  if (observed?.samples) return (observed.positions[position] + 0.6) / (observed.samples + 3)
  if (position === 0) return hero.roles.includes('Carry') ? 0.42 : 0.12
  if (position === 1) return hero.roles.includes('Nuker') || hero.roles.includes('Escape') ? 0.28 : 0.1
  if (position === 2) return hero.roles.includes('Initiator') || hero.roles.includes('Durable') ? 0.3 : 0.12
  return hero.roles.includes('Support') ? 0.34 : 0.08
}

// Normalized affinity over the five positions (index 0 = pos 1 … index 4 = pos 5). Observed
// pro positions dominate when they exist; otherwise a role-tag prior fills in.
function positionAffinity(hero: Hero, recentMeta?: RecentProMeta | null): number[] {
  const raw = [0, 1, 2, 3, 4].map((position) => likelyPositionWeight(hero, position as 0 | 1 | 2 | 3 | 4, recentMeta))
  const total = raw.reduce((sum, value) => sum + value, 0) || 1
  return raw.map((value) => value / total)
}

// Best way to seat these heroes in distinct positions (1–5): the maximum total affinity over
// all assignments. A team stacking one position cannot all get their slot, so its total drops —
// this is what steers the AI toward a coherent 1-2-3-4-5 core/support spread. Heroes are capped
// at five, so the brute-force permutation search stays trivial (≤120 arrangements).
function bestAssignmentFit(heroes: Hero[], recentMeta?: RecentProMeta | null): number {
  if (!heroes.length) return 0
  const affinities = heroes.map((hero) => positionAffinity(hero, recentMeta))
  const used = new Array(5).fill(false)
  let best = Number.NEGATIVE_INFINITY
  const search = (index: number, total: number) => {
    if (index === heroes.length) { if (total > best) best = total; return }
    for (let position = 0; position < 5; position += 1) {
      if (used[position]) continue
      used[position] = true
      search(index + 1, total + affinities[index][position])
      used[position] = false
    }
  }
  search(0, 0)
  return best
}

// Marginal position-fit a candidate adds to the team: how much the best distinct-position
// seating improves by including this hero. Filling an open slot scores high; a fifth hero
// crowding an already-claimed position scores low (someone gets bumped to a dead slot).
function positionCoherence(hero: Hero, teamPicks: Hero[], recentMeta?: RecentProMeta | null): number {
  return bestAssignmentFit([...teamPicks, hero], recentMeta) - bestAssignmentFit(teamPicks, recentMeta)
}

function roleEconomyScore(hero: Hero, teamPicks: Hero[], recentMeta?: RecentProMeta | null) {
  const future = [...teamPicks, hero]
  const carryCount = roleCount(future, 'Carry')
  const supportCount = roleCount(future, 'Support')
  const supportFit = likelyPositionWeight(hero, 3, recentMeta) + likelyPositionWeight(hero, 4, recentMeta)
  const coreFit = likelyPositionWeight(hero, 0, recentMeta) + likelyPositionWeight(hero, 1, recentMeta) + likelyPositionWeight(hero, 2, recentMeta)
  let score = 0
  if (teamPicks.length <= 1 && supportFit > 0.42) score += 8
  if (teamPicks.length >= 2 && supportCount < 2 && supportFit > 0.36) score += 16
  if (teamPicks.length >= 3 && carryCount >= 3 && coreFit > supportFit) score -= 18
  if (teamPicks.length === 4 && supportCount < 2 && supportFit < 0.28) score -= 22
  if (teamPicks.length === 4 && carryCount === 0 && coreFit > 0.32) score += 18
  return score
}

function lanePairScore(hero: Hero, teamPicks: Hero[], recentMeta?: RecentProMeta | null) {
  const heroSupport = likelyPositionWeight(hero, 3, recentMeta) + likelyPositionWeight(hero, 4, recentMeta)
  const heroCore = likelyPositionWeight(hero, 0, recentMeta) + likelyPositionWeight(hero, 2, recentMeta)
  return teamPicks.reduce((score, ally) => {
    const allySupport = likelyPositionWeight(ally, 3, recentMeta) + likelyPositionWeight(ally, 4, recentMeta)
    const allyCore = likelyPositionWeight(ally, 0, recentMeta) + likelyPositionWeight(ally, 2, recentMeta)
    return score + Math.max(0, heroSupport * allyCore + heroCore * allySupport - 0.28) * 12
  }, 0)
}

function pickCandidateIndex(count: number, temperature: number) {
  const roll = Math.random()
  const curved = Math.pow(roll, temperature)
  return Math.min(count - 1, Math.floor(curved * count))
}

function recentOpeningBans() {
  try {
    return JSON.parse(localStorage.getItem('draftsmith_opening_bans') ?? '[]') as number[]
  } catch {
    return []
  }
}

function rememberOpeningBan(heroId: number) {
  const bans = recentOpeningBans()
  localStorage.setItem('draftsmith_opening_bans', JSON.stringify([heroId, ...bans.filter((id) => id !== heroId)].slice(0, 8)))
}

function recentAiPicks() {
  try {
    return JSON.parse(localStorage.getItem('draftsmith_ai_picks') ?? '[]') as number[]
  } catch {
    return []
  }
}

function rememberAiPick(heroId: number) {
  const picks = recentAiPicks()
  localStorage.setItem('draftsmith_ai_picks', JSON.stringify([heroId, ...picks.filter((id) => id !== heroId)].slice(0, 16)))
}

function roleNeedScore(hero: Hero, teamPicks: Hero[]) {
  const held = new Set(teamPicks.flatMap((pick) => pick.roles))
  let score = 0
  if (!held.has('Carry') && hero.roles.includes('Carry')) score += 18
  if (!held.has('Support') && hero.roles.includes('Support')) score += 18
  if (!held.has('Initiator') && hero.roles.includes('Initiator')) score += 14
  if (!held.has('Disabler') && hero.roles.includes('Disabler')) score += 10
  if (teamPicks.length >= 3 && hero.roles.length >= 3) score += 8
  return score
}

function compositionScore(hero: Hero, teamPicks: Hero[]) {
  let score = 0
  if (teamPicks.some((h) => h.roles.includes('Pusher')) && hero.roles.includes('Pusher')) score += 11
  if (teamPicks.some((h) => h.roles.includes('Initiator')) && hero.roles.includes('Support')) score += 8
  if (teamPicks.some((h) => h.attackType === 'Melee') && hero.attackType === 'Ranged') score += 5
  const attrCount = teamPicks.filter((h) => h.primaryAttr === hero.primaryAttr).length
  score -= Math.max(0, attrCount - 1) * 3
  return score
}

function reasonFor(hero: Hero, strategy: Strategy, teamPicks: Hero[], isBan: boolean) {
  const heroName = hero.localizedName
  if (isBan && strategy === 'counter') return `${heroName} removes a high-impact answer before the next reveal.`
  if (isBan) return `${heroName} carries strong meta pressure and constrains our next phase.`
  if (strategy === 'cheese' && hasAny(hero, CHEESE)) return `${heroName} creates a narrow counter window and a draft-ending last-pick threat.`
  if (teamPicks.length === 0) return `${heroName} is a flexible opener that hides lanes and keeps multiple plans available.`
  if (hero.roles.includes('Support')) return `${heroName} stabilizes the lanes and adds reliable control to the structure.`
  return `${heroName} improves role coverage and gives this lineup a clearer timing window.`
}

export function chooseHero(
  heroes: Hero[],
  actions: DraftAction[],
  step: DraftStep,
  strategy: Strategy,
  recentMeta?: RecentProMeta | null,
): { hero: Hero; reason: string } {
  const used = new Set(actions.map((action) => action.hero.id))
  const available = heroes.filter((hero) => !used.has(hero.id))
  const teamPicks = actions.filter((a) => a.type === 'pick' && a.team === step.team).map((a) => a.hero)
  const enemyPicks = actions.filter((a) => a.type === 'pick' && a.team !== step.team).map((a) => a.hero)
  const maxPresence = Math.max(1, ...heroes.map((h) => h.proPick + h.proBan))
  const maxRecentPresence = Math.max(1, ...Object.values(recentMeta?.heroSignals ?? {}).map((s) => s.picks + s.bans))
  const memory = Number(localStorage.getItem('draftsmith_sessions') ?? 0)

  const scored = available.map((hero) => {
    const presence = ((hero.proPick + hero.proBan) / maxPresence) * 30
    const recentSignal = recentMeta?.heroSignals[hero.id]
    const recentPresence = recentSignal ? ((recentSignal.picks + recentSignal.bans) / maxRecentPresence) * 34 : 0
    const recentWinRate = recentSignal?.picks ? (recentSignal.wins / recentSignal.picks - 0.5) * 16 : 0
    const publicSignal = recentMeta?.publicHeroSignals?.[hero.id]
    const publicEdge = publicSignal && publicSignal.picks > 0
      ? (publicSignal.wins / publicSignal.picks - 0.5) * 2 * (publicSignal.picks / (publicSignal.picks + 6))
      : 0
    const isOpeningBan = step.type === 'ban' && enemyPicks.length === 0 && teamPicks.length === 0
    const isOpeningPick = step.type === 'pick' && teamPicks.length === 0
    const openingHistory = isOpeningBan ? recentOpeningBans() : []
    const pickHistory = step.type === 'pick' ? recentAiPicks() : []
    const banPresenceScale = isOpeningBan ? 0.58 : 1
    const pickPresenceScale = isOpeningPick ? 0.72 : 1
    let score = Math.random() * (isOpeningBan ? 14 : 7)
      + presence * (step.type === 'ban' ? 0.45 : 0.55)
      + recentPresence * banPresenceScale * pickPresenceScale
      + (step.type === 'pick' ? recentWinRate : 0)
      + (step.type === 'pick' ? publicEdge * 45 : Math.max(0, publicEdge) * 28)
      + Math.min(memory, 20) * 0.05
    if (isOpeningBan) score -= Math.max(0, 8 - openingHistory.indexOf(hero.id)) * (openingHistory.includes(hero.id) ? 3.2 : 0)
    if (step.type === 'pick' && pickHistory.includes(hero.id)) score -= Math.max(6, 34 - pickHistory.indexOf(hero.id) * 2.2)
    if (step.type === 'pick') {
      score += roleNeedScore(hero, teamPicks) + compositionScore(hero, teamPicks) + roleEconomyScore(hero, teamPicks, recentMeta) + lanePairScore(hero, teamPicks, recentMeta)
      // Dominant balancer: reward the pick that best fills a still-open position slot so the
      // finished team resolves to a clean 1-2-3-4-5 spread instead of four stacked carries.
      // Weight is zero on the opener (it must stay flexible/meta, not lock a hard support) and
      // ramps steeply so later picks are forced to patch missing roles over raw meta presence.
      const coherenceWeight = teamPicks.length * 60
      score += positionCoherence(hero, teamPicks, recentMeta) * coherenceWeight
    }
    if (step.type === 'pick') {
      // Never walk into a known hard counter the opponent has already revealed, and lean
      // toward heroes that hard-counter revealed enemy picks — outdraft, don't coin-flip.
      for (const enemy of enemyPicks) {
        if (hardCounters(enemy, hero)) score -= 30
        if (hardCounters(hero, enemy)) score += 15
      }
    }
    if (step.type === 'ban') {
      score += enemyPicks.length * (hero.roles.includes('Carry') ? 2 : 0)
      for (const enemy of enemyPicks) {
        const pairKey = hero.id < enemy.id ? `${hero.id}:${enemy.id}` : `${enemy.id}:${hero.id}`
        score += Math.max(0, recentMeta?.synergy[pairKey] ?? 0) * 14
        score += Math.max(0, recentMeta?.counters[`${hero.id}:${enemy.id}`] ?? 0) * 12
      }
      // Deny the known answers to our own committed picks before the opponent finds them.
      for (const ally of teamPicks) if (hardCounters(hero, ally)) score += 14
    }
    if (step.type === 'pick' && recentMeta) {
      for (const ally of teamPicks) {
        const synergyKey = hero.id < ally.id ? `${hero.id}:${ally.id}` : `${ally.id}:${hero.id}`
        score += (recentMeta.synergy[synergyKey] ?? 0) * 18
      }
      for (const enemy of enemyPicks) score += (recentMeta.counters[`${hero.id}:${enemy.id}`] ?? 0) * 16
    }
    if (strategy === 'meta') {
      // Chase what is currently winning: contested first-phase heroes, high pick/ban rates,
      // and heroes overperforming in the Divine+ sample.
      score += presence * 0.45 + recentPresence * (step.type === 'ban' ? 0.55 : 1.15) + (recentSignal?.firstPhase ?? 0) * (isOpeningBan ? 0.45 : 2)
      score += Math.max(0, publicEdge) * 30 + (step.type === 'pick' ? recentWinRate * 0.6 : 0)
    }
    if (strategy === 'balanced') {
      // Adaptive: fill role gaps harder, respond to revealed enemy picks, and prefer
      // heroes observed in multiple positions (they hide the plan longer).
      score += hero.roles.length * 2
      if (step.type === 'pick') {
        score += roleNeedScore(hero, teamPicks) * 0.6
        for (const enemy of enemyPicks) score += (recentMeta?.counters[`${hero.id}:${enemy.id}`] ?? 0) * 10
        const observedPositions = recentMeta?.positionSignals?.[hero.id]
        if (observedPositions?.samples) {
          const flexible = observedPositions.positions.filter((count) => count / observedPositions.samples >= 0.2).length
          if (flexible >= 2) score += 7
        }
      }
    }
    if (strategy === 'cheese') {
      // Narrow lineups plus off-meta overperformers: strong Divine+ win rate with low pro
      // presence means the opponent likely has not practiced the answer. A cheese pick whose
      // hard counter is already on the enemy team is no longer a surprise — skip the bonus.
      const cheeseAnswered = enemyPicks.some((enemy) => hardCounters(enemy, hero))
      score += hasAny(hero, CHEESE) && !cheeseAnswered ? (step.phase === 3 ? 45 : 20) : 0
      if (step.type === 'pick') {
        const surprise = Math.max(0, publicEdge) * Math.max(0, 1 - recentPresence / 20)
        score += surprise * (step.phase === 3 ? 55 : 30)
      }
    }
    if (strategy === 'counter') {
      if (step.type === 'pick') {
        // Weight observed matchup edges against every revealed enemy pick much harder.
        for (const enemy of enemyPicks) score += (recentMeta?.counters[`${hero.id}:${enemy.id}`] ?? 0) * 24
        score += hero.roles.includes('Disabler') ? 8 : 0
        if (!enemyPicks.length) score += hero.roles.length * 1.5
      } else {
        score += presence * 0.7
        // Deny answers: ban heroes with a strong observed record against our own picks.
        for (const ally of teamPicks) score += Math.max(0, recentMeta?.counters[`${hero.id}:${ally.id}`] ?? 0) * 20
      }
    }
    return { hero, score }
  }).sort((a, b) => b.score - a.score)

  const candidateCount = step.type === 'ban' ? (enemyPicks.length ? 5 : 10) : teamPicks.length === 0 ? 10 : 4
  const candidatePool = Math.min(candidateCount, scored.length)
  const selected = scored[pickCandidateIndex(candidatePool, step.type === 'ban' && enemyPicks.length === 0 ? 0.85 : teamPicks.length === 0 ? 0.95 : 1.35)]?.hero ?? available[0]
  if (step.type === 'ban' && enemyPicks.length === 0 && teamPicks.length === 0) rememberOpeningBan(selected.id)
  if (step.type === 'pick') rememberAiPick(selected.id)
  const baseReason = reasonFor(selected, strategy, teamPicks, step.type === 'ban')
  const selectedRecent = recentMeta?.heroSignals[selected.id]
  const recentObservations = Math.round((selectedRecent?.picks ?? 0) + (selectedRecent?.bans ?? 0))
  const recentNote = selectedRecent && recentObservations > 0
    ? ` Observed in about ${recentObservations} of ${recentMeta?.matchesAnalyzed ?? 0} weighted current-patch pro drafts.`
    : ''
  const selectedPublic = recentMeta?.publicHeroSignals?.[selected.id]
  const publicNote = selectedPublic && selectedPublic.picks >= 2
    ? ` High-rank win rate ≈ ${Math.round((selectedPublic.wins / selectedPublic.picks) * 100)}% in the current Divine+ sample.`
    : ''
  return { hero: selected, reason: `${baseReason}${recentNote}${publicNote}` }
}

export interface CoachSuggestion {
  hero: Hero
  reason: string
}

// Dimensions a pick can meaningfully shore up, with the short label used in advice text.
// Execution is excluded (it measures draft difficulty, not a capability to add).
const NEED_LABELS: Partial<Record<Dimension, string>> = {
  Laning: 'Stabilizes your lanes',
  Teamfight: 'Adds needed teamfight',
  Pickoff: 'Adds catch potential',
  Push: 'Adds tower pressure',
  Sustain: 'Adds sustain and saves',
  Scaling: 'Adds late-game scaling',
  Roshan: 'Adds Roshan control',
}

// Deterministic hash of two integers to a stable [0, 1) value — used to reshuffle
// statistically-equivalent coach suggestions without frame-to-frame flicker.
function seededUnit(a: number, b: number) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x165667b1, 0xc2b2ae35)
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

// How much a candidate improves the team's weakest capabilities: gains in a dimension are
// worth more the further that dimension currently is below a healthy baseline.
function teamNeedBoost(hero: Hero, teamPicks: Hero[]): { value: number; note?: { weight: number; text: string } } {
  if (!teamPicks.length) return { value: 0 }
  const before = scoreTeam(teamPicks)
  const after = scoreTeam([...teamPicks, hero])
  let value = 0
  let best: { weight: number; text: string } | undefined
  for (const dimension of Object.keys(NEED_LABELS) as Dimension[]) {
    const gain = after[dimension] - before[dimension]
    const deficit = Math.max(0, 62 - before[dimension])
    if (gain <= 0 || deficit <= 0) continue
    const weight = gain * (deficit / 62)
    value += weight
    if (!best || weight > best.weight) best = { weight, text: `${NEED_LABELS[dimension]}` }
  }
  return { value, note: best && best.weight >= 4 ? best : undefined }
}

// Pick/ban advice for the human captain: rank the best answers to the current board and explain
// each in one line. The ranking is stable for a given (board, seed), but among statistically
// equivalent candidates it rotates by seed so an empty board no longer shows the same four bans
// every draft. Variety shrinks to zero as picks reveal a concrete answer to counter.
export function coachSuggestions(
  heroes: Hero[],
  actions: DraftAction[],
  step: DraftStep,
  playerTeam: Team,
  recentMeta?: RecentProMeta | null,
  count = 4,
  seed = 0,
): CoachSuggestion[] {
  const used = new Set(actions.map((action) => action.hero.id))
  const available = heroes.filter((hero) => !used.has(hero.id))
  const teamPicks = actions.filter((a) => a.type === 'pick' && a.team === playerTeam).map((a) => a.hero)
  const enemyPicks = actions.filter((a) => a.type === 'pick' && a.team !== playerTeam).map((a) => a.hero)
  const maxRecentPresence = Math.max(1, ...Object.values(recentMeta?.heroSignals ?? {}).map((s) => s.picks + s.bans))

  const scored = available.map((hero) => {
    const signal = recentMeta?.heroSignals[hero.id]
    const presence = signal ? ((signal.picks + signal.bans) / maxRecentPresence) * 20 : 0
    const publicSignal = recentMeta?.publicHeroSignals?.[hero.id]
    const publicEdge = publicSignal && publicSignal.picks > 0
      ? (publicSignal.wins / publicSignal.picks - 0.5) * 2 * (publicSignal.picks / (publicSignal.picks + 6))
      : 0
    let score = presence + publicEdge * 30
    const notes: Array<{ weight: number; text: string }> = []

    if (step.type === 'pick') {
      let counterScore = 0
      const countered: string[] = []
      for (const enemy of enemyPicks) {
        const edge = (recentMeta?.counters[`${hero.id}:${enemy.id}`] ?? 0) * 30 + (hardCounters(hero, enemy) ? 16 : 0)
        counterScore += edge
        if (edge >= 6) countered.push(enemy.localizedName)
        // Never recommend walking into a counter the enemy already holds.
        if (hardCounters(enemy, hero)) score -= 40
        score -= Math.max(0, recentMeta?.counters[`${enemy.id}:${hero.id}`] ?? 0) * 18
      }
      score += counterScore
      if (countered.length) notes.push({ weight: counterScore, text: `Counters ${countered.slice(0, 2).join(' + ')}` })

      // Synergy with your committed picks weighs as much as countering the enemy: observed
      // pair win rates plus lane-pair fit with the heroes you already locked.
      let synergyScore = 0
      const partners: string[] = []
      for (const ally of teamPicks) {
        const pairKey = hero.id < ally.id ? `${hero.id}:${ally.id}` : `${ally.id}:${hero.id}`
        const edge = (recentMeta?.synergy[pairKey] ?? 0) * 30
        synergyScore += edge
        if (edge >= 5) partners.push(ally.localizedName)
      }
      score += synergyScore
      if (partners.length) notes.push({ weight: synergyScore, text: `Pairs with ${partners.slice(0, 2).join(' + ')}` })

      const needScore = roleNeedScore(hero, teamPicks)
      score += needScore + roleEconomyScore(hero, teamPicks, recentMeta) + compositionScore(hero, teamPicks) + lanePairScore(hero, teamPicks, recentMeta)
      if (needScore >= 14) {
        const held = new Set(teamPicks.flatMap((pick) => pick.roles))
        const need = !held.has('Carry') && hero.roles.includes('Carry') ? 'carry' : !held.has('Support') && hero.roles.includes('Support') ? 'support' : 'initiation'
        notes.push({ weight: needScore, text: `Fills the ${need} slot` })
      }

      // Cover the draft's weakest capabilities (teamfight, sustain, push, scaling…).
      const needs = teamNeedBoost(hero, teamPicks)
      score += needs.value * 1.2
      if (needs.note) notes.push({ weight: needs.note.weight * 1.2, text: needs.note.text })
      if (publicEdge * 30 >= 5 && publicSignal) notes.push({ weight: publicEdge * 30, text: `${Math.round((publicSignal.wins / publicSignal.picks) * 100)}% high-rank win rate` })
    } else {
      // Ban advice: deny the heroes that punish your committed picks or complete the enemy draft.
      let threatScore = 0
      const threatened: string[] = []
      for (const ally of teamPicks) {
        const edge = Math.max(0, recentMeta?.counters[`${hero.id}:${ally.id}`] ?? 0) * 32 + (hardCounters(hero, ally) ? 18 : 0)
        threatScore += edge
        if (edge >= 6) threatened.push(ally.localizedName)
      }
      score += threatScore
      if (threatened.length) notes.push({ weight: threatScore, text: `Punishes your ${threatened.slice(0, 2).join(' + ')}` })

      let fitScore = 0
      for (const enemy of enemyPicks) {
        const pairKey = hero.id < enemy.id ? `${hero.id}:${enemy.id}` : `${enemy.id}:${hero.id}`
        fitScore += Math.max(0, recentMeta?.synergy[pairKey] ?? 0) * 16
      }
      score += fitScore
      if (fitScore >= 5) notes.push({ weight: fitScore, text: 'Completes the enemy draft' })

      if (signal && step.phase === 1) score += signal.firstPhase * 1.2
      if (presence >= 12) notes.push({ weight: presence, text: 'Heavily contested in pro drafts' })
      if (publicEdge * 30 >= 5 && publicSignal) notes.push({ weight: publicEdge * 30, text: `${Math.round((publicSignal.wins / publicSignal.picks) * 100)}% high-rank win rate` })
    }

    const reason = notes.sort((a, b) => b.weight - a.weight).slice(0, 2).map((note) => note.text).join(' · ') || 'Strong current-patch presence'
    return { hero, reason, score }
  }).sort((a, b) => b.score - a.score)

  // Variety is only appropriate when the board offers no concrete target: with no heroes
  // revealed many bans/openers are equally valid, so rotate them by seed. The moment any pick
  // is on the board a specific answer exists (counters, punishers) and must lock in — so kill
  // the jitter entirely rather than risk shuffling a real counter out of the list.
  const revealed = teamPicks.length + enemyPicks.length
  const contextFactor = Math.max(0, 1 - revealed)
  if (seed && contextFactor > 0) {
    // Reshuffle only within the strong pool (top 10) so a bad hero is never promoted; jitter
    // is multiplicative (±50% at an empty board) so stronger candidates still surface more often.
    const poolSize = Math.min(scored.length, Math.max(count, 10))
    const pool = scored.slice(0, poolSize).map((entry, index) => ({
      ...entry,
      jittered: entry.score * (1 + contextFactor * (seededUnit(entry.hero.id, seed) - 0.5) + index * 1e-6),
    })).sort((a, b) => b.jittered - a.jittered)
    return pool.slice(0, count).map(({ hero, reason }) => ({ hero, reason }))
  }

  return scored.slice(0, count).map(({ hero, reason }) => ({ hero, reason }))
}

export function teamName(team: Team) {
  return team === 'radiant' ? 'Radiant' : 'Dire'
}
