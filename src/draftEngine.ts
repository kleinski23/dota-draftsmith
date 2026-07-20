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
      + Math.min(memory, 20) * 0.05
    if (isOpeningBan) score -= Math.max(0, 8 - openingHistory.indexOf(hero.id)) * (openingHistory.includes(hero.id) ? 3.2 : 0)
    if (step.type === 'pick' && pickHistory.includes(hero.id)) score -= Math.max(6, 34 - pickHistory.indexOf(hero.id) * 2.2)
    if (step.type === 'pick') score += roleNeedScore(hero, teamPicks) + compositionScore(hero, teamPicks) + roleEconomyScore(hero, teamPicks, recentMeta) + lanePairScore(hero, teamPicks, recentMeta)
    if (step.type === 'ban') {
      score += enemyPicks.length * (hero.roles.includes('Carry') ? 2 : 0)
      for (const enemy of enemyPicks) {
        const pairKey = hero.id < enemy.id ? `${hero.id}:${enemy.id}` : `${enemy.id}:${hero.id}`
        score += Math.max(0, recentMeta?.synergy[pairKey] ?? 0) * 14
        score += Math.max(0, recentMeta?.counters[`${hero.id}:${enemy.id}`] ?? 0) * 12
      }
    }
    if (step.type === 'pick' && recentMeta) {
      for (const ally of teamPicks) {
        const synergyKey = hero.id < ally.id ? `${hero.id}:${ally.id}` : `${ally.id}:${hero.id}`
        score += (recentMeta.synergy[synergyKey] ?? 0) * 18
      }
      for (const enemy of enemyPicks) score += (recentMeta.counters[`${hero.id}:${enemy.id}`] ?? 0) * 16
    }
    if (strategy === 'meta') score += presence * 0.45 + recentPresence * (step.type === 'ban' ? 0.55 : 1.15) + (recentSignal?.firstPhase ?? 0) * (isOpeningBan ? 0.45 : 2)
    if (strategy === 'balanced') score += hero.roles.length * 2
    if (strategy === 'cheese') score += hasAny(hero, CHEESE) ? (step.phase === 3 ? 45 : 20) : 0
    if (strategy === 'counter') score += step.type === 'ban' ? presence * 0.7 : hero.roles.includes('Disabler') ? 12 : 0
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
  return { hero: selected, reason: `${baseReason}${recentNote}` }
}

export function teamName(team: Team) {
  return team === 'radiant' ? 'Radiant' : 'Dire'
}
