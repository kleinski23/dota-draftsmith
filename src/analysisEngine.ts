import type { Hero, RecentProMeta, Team } from './types'

export type Dimension = 'Laning' | 'Teamfight' | 'Pickoff' | 'Push' | 'Sustain' | 'Scaling' | 'Roshan' | 'Execution'

export interface PowerSpike {
  hero: Hero
  label: string
  minuteStart: number
  minuteEnd: number
  impact: 'major' | 'supporting'
}

export interface LaneAssignment {
  lane: 'Safe lane' | 'Mid lane' | 'Off lane'
  heroes: Hero[]
  evidence: string
  matchup?: string
}

export interface ObjectiveStep {
  window: string
  action: string
}

export type TraitId =
  | 'early-aggression'
  | 'teamfight'
  | 'pickoff'
  | 'push'
  | 'roshan'
  | 'split-push'
  | 'scaling'
  | 'sustain'
  | 'defense'

export interface DraftTrait {
  id: TraitId
  label: string
  strength: number
  tier: 'signature' | 'solid' | 'situational'
  /** What the pattern is for these specific heroes, against these specific opponents. */
  detail: string
  /** The concrete play that follows from it. */
  tactic: string
  drivers: string[]
  edge?: 'dominant' | 'even' | 'outmatched'
}

export interface TeamAnalysis {
  scores: Record<Dimension, number>
  archetype: string
  pressureProfile: string
  riskLevel: 'Low' | 'Medium' | 'High'
  strengths: string[]
  gaps: string[]
  winConditions: string[]
  spikes: PowerSpike[]
  peakWindow: string
  lanePlan: LaneAssignment[]
  laneEvidence: string
  damageProfile: string
  responseItems: string[]
  objectivePlan: ObjectiveStep[]
  traits: DraftTrait[]
  identityHeadline: string
  identitySummary: string
}

export interface MatchupAnalysis {
  radiant: TeamAnalysis
  dire: TeamAnalysis
  probability: Record<Team, number>
  stageEdge: { early: Team | 'even'; mid: Team | 'even'; late: Team | 'even' }
  favored: Team | 'even'
  headline: string
  decidingFactors: string[]
  simulationInsights: string[]
  simulationRuns: number
  samplingMargin: number
  modelBasis: string
}

const PUSH = ['beastmaster', 'broodmother', 'chen', 'death_prophet', 'jakiro', 'lone_druid', 'lycan', 'pugna', 'shadow_shaman', 'visage']
const ROSHAN = ['huskar', 'ursa', 'templar_assassin', 'slardar', 'troll_warlord', 'lone_druid', 'lycan', 'meepo']
const PICKOFF = ['axe', 'bane', 'batrider', 'beastmaster', 'clockwerk', 'doom_bringer', 'legion_commander', 'lion', 'nyx_assassin', 'pudge', 'shadow_shaman', 'spirit_breaker']
const HARD_CARRY = ['antimage', 'arc_warden', 'drow_ranger', 'faceless_void', 'medusa', 'morphling', 'naga_siren', 'phantom_lancer', 'spectre', 'terrorblade']
const MICRO = ['arc_warden', 'beastmaster', 'brewmaster', 'broodmother', 'chen', 'lone_druid', 'lycan', 'meepo', 'naga_siren', 'visage']
const BLINK = ['axe', 'centaur', 'earthshaker', 'enigma', 'legion_commander', 'lion', 'magnataur', 'mars', 'sand_king', 'slardar', 'tidehunter', 'tiny']
const AURA = ['beastmaster', 'chen', 'dark_seer', 'death_prophet', 'enigma', 'lycan', 'tidehunter', 'underlord', 'visage']
const BATTLE_FURY = ['antimage', 'juggernaut', 'phantom_assassin', 'ursa']
const SAVE = ['abaddon', 'dazzle', 'oracle', 'shadow_demon', 'tusk', 'vengefulspirit', 'winter_wyvern', 'wisp']
const TEAMFIGHT_ULT = ['ancient_apparition', 'dark_seer', 'disruptor', 'earthshaker', 'enigma', 'faceless_void', 'magnataur', 'mars', 'phoenix', 'sand_king', 'tidehunter', 'warlock']
const SPLIT_PUSH = ['arc_warden', 'broodmother', 'furion', 'lone_druid', 'lycan', 'naga_siren', 'terrorblade', 'tinker']
const BKB_PIERCING = ['axe', 'bane', 'beastmaster', 'batrider', 'doom_bringer', 'enigma', 'faceless_void', 'legion_commander', 'magnataur', 'pudge', 'shadow_demon', 'spirit_breaker']
// Common position 4/5 flex picks whose OpenDota role tags lack 'Support' (e.g. Bounty Hunter
// is tagged Escape/Nuker only). Without this prior, heroes with no pro sample default toward
// a core slot and can steal mid or safe lane from an observed core.
const SUPPORT_FLEX = ['bounty_hunter', 'clockwerk', 'earth_spirit', 'mirana', 'nyx_assassin', 'riki', 'spirit_breaker', 'techies', 'tusk']
// Heroes whose kit answers a specific pattern — used to name the hero that punishes or blunts
// a trait instead of describing the counterplay in the abstract.
const ANTI_HEAL = ['ancient_apparition', 'necrophos', 'doom_bringer']
const WAVE_CLEAR = ['death_prophet', 'dragon_knight', 'elder_titan', 'gyrocopter', 'jakiro', 'kunkka', 'leshrac', 'lina', 'luna', 'phoenix', 'pugna', 'sand_king', 'shadow_fiend', 'tinker', 'zuus']
const SLIPPERY = ['antimage', 'clinkz', 'ember_spirit', 'morphling', 'puck', 'queenofpain', 'riki', 'slark', 'storm_spirit', 'templar_assassin', 'void_spirit', 'weaver']

const key = (hero: Hero) => hero.name.replace('npc_dota_hero_', '')
const inList = (hero: Hero, list: string[]) => list.includes(key(hero))
const roleCount = (heroes: Hero[], role: string) => heroes.filter((h) => h.roles.includes(role)).length
const listCount = (heroes: Hero[], list: string[]) => heroes.filter((h) => inList(h, list)).length
const clamp = (value: number) => Math.max(18, Math.min(96, Math.round(value)))
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
const names = (heroes: Hero[], limit = 2) => heroes.slice(0, limit).map((hero) => hero.localizedName).join(' + ')
const scoreDelta = (team: TeamAnalysis, opponent: TeamAnalysis, dimension: Dimension) => team.scores[dimension] - opponent.scores[dimension]

export function scoreTeam(heroes: Hero[]): Record<Dimension, number> {
  const ranged = heroes.filter((h) => h.attackType === 'Ranged').length
  const supports = roleCount(heroes, 'Support')
  const disablers = roleCount(heroes, 'Disabler')
  const initiators = roleCount(heroes, 'Initiator')
  const nukers = roleCount(heroes, 'Nuker')
  const carries = roleCount(heroes, 'Carry')
  const durable = roleCount(heroes, 'Durable')
  const escape = roleCount(heroes, 'Escape')
  const pushers = roleCount(heroes, 'Pusher') + listCount(heroes, PUSH)
  const hardCarry = listCount(heroes, HARD_CARRY)
  const micro = listCount(heroes, MICRO)
  const saves = listCount(heroes, SAVE)
  const teamfightUltimates = listCount(heroes, TEAMFIGHT_ULT)
  const splitPush = listCount(heroes, SPLIT_PUSH)
  const bkbPierce = listCount(heroes, BKB_PIERCING)

  return {
    Laning: clamp(34 + ranged * 7 + supports * 7 + nukers * 5 + saves * 3 - Math.max(0, carries - 3) * 5),
    Teamfight: clamp(28 + initiators * 10 + disablers * 6 + durable * 4 + supports * 2 + teamfightUltimates * 8),
    Pickoff: clamp(27 + disablers * 8 + nukers * 5 + escape * 3 + listCount(heroes, PICKOFF) * 7 + bkbPierce * 4),
    Push: clamp(24 + pushers * 10 + carries * 3 + splitPush * 6),
    Sustain: clamp(28 + supports * 8 + durable * 5 + saves * 9),
    Scaling: clamp(27 + carries * 8 + hardCarry * 11 + heroes.filter((h) => h.primaryAttr === 'agi').length * 3),
    Roshan: clamp(24 + listCount(heroes, ROSHAN) * 14 + carries * 4 + durable * 3),
    Execution: clamp(88 - micro * 14 - Math.max(0, carries - 2) * 7 + disablers * 2),
  }
}

function buildSpikes(heroes: Hero[]): PowerSpike[] {
  return heroes.flatMap((hero): PowerSpike[] => {
    if (inList(hero, BLINK)) return [{ hero, label: 'Blink Dagger initiation', minuteStart: 12, minuteEnd: 17, impact: 'major' }]
    if (inList(hero, SAVE)) return [{ hero, label: 'First save item / defensive level timing', minuteStart: 13, minuteEnd: 20, impact: 'major' }]
    if (inList(hero, BATTLE_FURY)) return [
      { hero, label: 'Farming accelerator', minuteStart: 12, minuteEnd: 16, impact: 'supporting' },
      { hero, label: 'BKB + damage threshold', minuteStart: 24, minuteEnd: 30, impact: 'major' },
    ]
    if (inList(hero, AURA)) return [{ hero, label: 'First team aura', minuteStart: 15, minuteEnd: 21, impact: 'major' }]
    if (inList(hero, ROSHAN)) return [{ hero, label: 'Roshan damage item / sustain threshold', minuteStart: 14, minuteEnd: 22, impact: 'major' }]
    if (inList(hero, SPLIT_PUSH)) return [{ hero, label: 'Wave-control and map-split timing', minuteStart: 18, minuteEnd: 26, impact: 'major' }]
    if (hero.roles.includes('Carry')) return [{ hero, label: 'BKB / second core item timing', minuteStart: 21, minuteEnd: 28, impact: 'major' }]
    if (hero.roles.includes('Support')) return [{ hero, label: 'Force / Glimmer / shard utility window', minuteStart: 16, minuteEnd: 23, impact: 'supporting' }]
    return [{ hero, label: 'First major utility item', minuteStart: 17, minuteEnd: 23, impact: 'supporting' }]
  }).sort((a, b) => a.minuteStart - b.minuteStart)
}

function strongest(scores: Record<Dimension, number>) {
  return (Object.entries(scores) as [Dimension, number][]).sort((a, b) => b[1] - a[1]).slice(0, 3)
}

// 15 for tagged supports, 10 for known support-flex picks, 0 otherwise — used wherever the
// heuristic needs a position 4/5 prior.
const supportAffinity = (hero: Hero) => hero.roles.includes('Support') ? 15 : inList(hero, SUPPORT_FLEX) ? 10 : 0

function coreScore(hero: Hero, position: 1 | 2 | 3) {
  const carry = hero.roles.includes('Carry') ? 12 : 0
  const nuker = hero.roles.includes('Nuker') ? 9 : 0
  const initiator = hero.roles.includes('Initiator') ? 10 : 0
  const durable = hero.roles.includes('Durable') ? 8 : 0
  const support = hero.roles.includes('Support') ? -7 : inList(hero, SUPPORT_FLEX) ? -5 : 0
  if (position === 1) return carry + (inList(hero, HARD_CARRY) ? 16 : 0) + (hero.primaryAttr === 'agi' ? 5 : 0) + support
  if (position === 2) return nuker + carry * 0.6 + (hero.roles.includes('Escape') ? 7 : 0) + (hero.attackType === 'Ranged' ? 3 : 0) + support
  return initiator + durable + (hero.primaryAttr === 'str' ? 4 : 0) + support * 0.3
}

function laneProbability(hero: Hero, lane: 0 | 1 | 2, meta?: RecentProMeta | null) {
  const supportFlex = supportAffinity(hero) ? 12 : 0
  const fallback = [coreScore(hero, 1) + supportFlex, coreScore(hero, 2), coreScore(hero, 3) + supportFlex]
  const shifted = fallback.map((value) => Math.max(1, value + 12))
  const heuristic = shifted[lane] / shifted.reduce((sum, value) => sum + value, 0)
  const observed = meta?.laneSignals?.[hero.id]
  if (!observed?.samples) return heuristic
  const values = [observed.safe + observed.roam * 0.5, observed.mid, observed.off + observed.roam * 0.5]
  const observedProbability = (values[lane] + 0.6) / (values.reduce((sum, value) => sum + value, 0) + 1.8)
  // A fraction of one decayed match should not override the role prior outright; blend by
  // evidence volume so tiny samples nudge rather than dictate the lane read.
  const evidenceWeight = Math.min(0.85, observed.samples / (observed.samples + 1.5))
  return heuristic * (1 - evidenceWeight) + observedProbability * evidenceWeight
}

function positionProbability(hero: Hero, position: 0 | 1 | 2 | 3 | 4, meta?: RecentProMeta | null) {
  const support = supportAffinity(hero)
  const disabler = hero.roles.includes('Disabler') ? 6 : 0
  const initiator = hero.roles.includes('Initiator') ? 6 : 0
  const fallback = [
    coreScore(hero, 1),
    coreScore(hero, 2),
    coreScore(hero, 3),
    support + disabler + initiator,
    support * 1.25 + disabler,
  ]
  const weights = fallback.map((value, index) => {
    const indexLane = index === 0 || index === 4 ? 0 : index === 1 ? 1 : 2
    return Math.exp(value / 12) * laneProbability(hero, indexLane, meta)
  })
  const heuristic = weights[position] / weights.reduce((sum, value) => sum + value, 0)
  const observed = meta?.positionSignals?.[hero.id]
  if (!observed?.samples) return heuristic
  const observedProbability = (observed.positions[position] + 0.7) / (observed.samples + 3.5)
  const evidenceWeight = Math.min(0.72, observed.samples / (observed.samples + 8))
  return heuristic * (1 - evidenceWeight) + observedProbability * evidenceWeight
}

function inferLanes(heroes: Hero[], meta?: RecentProMeta | null): { plan: LaneAssignment[]; evidence: string } {
  const assignments: Array<0 | 1 | 2 | 3 | 4> = []
  let bestPositions: Array<0 | 1 | 2 | 3 | 4> | null = null
  let bestScore = Number.NEGATIVE_INFINITY
  const search = (index: number) => {
    if (index === heroes.length) {
      if (new Set(assignments).size !== 5) return
      const score = assignments.reduce<number>((sum, position, heroIndex) => sum + Math.log(positionProbability(heroes[heroIndex], position, meta)), 0)
      if (score > bestScore) { bestScore = score; bestPositions = [...assignments] }
      return
    }
    for (const position of [0, 1, 2, 3, 4] as const) {
      assignments.push(position); search(index + 1); assignments.pop()
    }
  }
  search(0)
  const selected: Array<0 | 1 | 2 | 3 | 4> = bestPositions ?? [0, 1, 2, 3, 4]
  const laneNames = ['Safe lane', 'Mid lane', 'Off lane'] as const
  const lanePositions = [[0, 4], [1], [2, 3]]
  const observedHeroes = heroes.filter((hero) => (meta?.positionSignals?.[hero.id]?.samples ?? 0) >= 2.5).length
  const plan = laneNames.map((lane, laneIndex) => {
      const laneHeroes = heroes.filter((_, heroIndex) => lanePositions[laneIndex].includes(selected[heroIndex]))
      const fit = laneHeroes.reduce((sum, hero) => {
        const heroIndex = heroes.indexOf(hero)
        return sum + positionProbability(hero, selected[heroIndex], meta)
      }, 0) / Math.max(1, laneHeroes.length)
      return { lane, heroes: laneHeroes, evidence: fit < 0.25 ? `Low confidence · ${Math.round(fit * 100)}% fit` : `${Math.round(fit * 100)}% role fit` }
    })
  const hasRoleConflict = plan.some((lane) => lane.evidence.startsWith('Low confidence'))
  const evidence = hasRoleConflict ? 'Role conflict · no standard pro assignment' : observedHeroes >= 4 ? `Pro-role model · ${observedHeroes}/5 heroes observed` : observedHeroes >= 2 ? `Mixed role model · ${observedHeroes}/5 heroes observed` : 'Low evidence · role-tag estimate'
  return { evidence, plan }
}

function roleFitScore(lanePlan: LaneAssignment[]) {
  const fits = lanePlan.flatMap((lane) => {
    const match = lane.evidence.match(/(\d+)% fit/)
    return match ? Number(match[1]) : []
  })
  return fits.length ? mean(fits) : 50
}

function inferDamageProfile(heroes: Hero[]) {
  const magical = roleCount(heroes, 'Nuker') * 2 + heroes.filter((hero) => hero.primaryAttr === 'int').length
  const physical = roleCount(heroes, 'Carry') * 2 + heroes.filter((hero) => hero.primaryAttr === 'agi').length
  if (magical > physical + 3) return 'Magic-heavy burst'
  if (physical > magical + 3) return 'Physical-heavy damage'
  return 'Mixed damage'
}

function objectivePlan(scores: Record<Dimension, number>, peakWindow: string): ObjectiveStep[] {
  return [
    { window: '0–10', action: scores.Laning >= 65 ? 'Pressure lanes and secure both power runes.' : 'Protect core lanes; avoid forced rotations before levels.' },
    { window: '10–18', action: scores.Push >= 60 ? 'Use catapult waves to take the first two outer towers.' : 'Smoke behind a vision ward and convert one pickoff into a tower.' },
    { window: '18–26', action: scores.Roshan >= 60 ? 'Force Roshan after the first clean kill or major cooldown.' : 'Control Roshan vision, but play for a fight before entering the pit.' },
    { window: peakWindow, action: scores.Scaling >= 65 ? 'Take protected map control while cores complete their next item.' : 'Use the lineup peak to claim Aegis and break the outer map.' },
  ]
}

function inferArchetype(scores: Record<Dimension, number>) {
  if (scores.Push >= 68 && scores.Roshan >= 60) return 'Objective tempo'
  if (scores.Pickoff >= 68 && scores.Teamfight < scores.Pickoff) return 'Pickoff map control'
  if (scores.Scaling >= 70 && scores.Execution >= 55) return 'Late-game scaling'
  if (scores.Teamfight >= 68) return 'Five-on-five teamfight'
  if (scores.Sustain >= 65) return 'Reset and sustain'
  return 'Flexible mixed draft'
}

function pressureProfile(scores: Record<Dimension, number>) {
  const tempo = scores.Laning * 0.35 + scores.Push * 0.35 + scores.Pickoff * 0.3
  const late = scores.Scaling * 0.55 + scores.Sustain * 0.2 + scores.Teamfight * 0.25
  if (tempo > late + 10) return 'Wants first Roshan and outer towers before the enemy cores stabilize.'
  if (late > tempo + 10) return 'Comfortable absorbing pressure if the map is not lost before second items.'
  return 'Can play either direction, but needs clean objective conversion after won fights.'
}

interface TraitContext {
  heroes: Hero[]
  enemies: Hero[]
  drivers: Hero[]
  scores: Record<Dimension, number>
  tier: DraftTrait['tier']
  edge: DraftTrait['edge']
  peakWindow: string
}

const pick = (heroes: Hero[], list: string[]) => heroes.filter((hero) => inList(hero, list))
const byRole = (heroes: Hero[], role: string) => heroes.filter((hero) => hero.roles.includes(role))
// Subject-verb agreement: "Pudge + Lion hold the chain" but "Pudge holds the chain".
const many = (heroes: Hero[], limit = 2) => Math.min(heroes.length, limit) > 1
const verb = (heroes: Hero[], singular: string, plural: string, limit = 2) => many(heroes, limit) ? plural : singular

// Each trait blends the dimension scores that produce it, ranks the heroes that carry it by how
// central they actually are, and then writes its own read of the matchup. The wording is
// assembled from the heroes on both sides, so two different drafts do not get the same sentence.
const TRAIT_BLUEPRINTS: Array<{
  id: TraitId
  label: string
  weights: Partial<Record<Dimension, number>>
  // Relevance weight per hero: 0 excludes, higher sorts first. A Pudge is a pickoff hero in a
  // way a Medusa carrying the Disabler tag is not, and the report should name Pudge.
  driverWeight: (hero: Hero) => number
  // How many carrying heroes count as full credit for this pattern. One Lycan is a real
  // split-push threat; one lone save support is not real fight sustain.
  full?: number
  narrate: (context: TraitContext) => { detail: string; tactic: string }
}> = [
  {
    id: 'early-aggression',
    label: 'Early aggression',
    weights: { Laning: 0.55, Pickoff: 0.28, Push: 0.17 },
    driverWeight: (hero) => (hero.roles.includes('Nuker') ? 3 : 0) + (hero.roles.includes('Disabler') ? 2 : 0) + (hero.attackType === 'Ranged' ? 1 : 0),
    narrate: (c) => {
      const front = c.drivers
      const greedy = pick(c.enemies, HARD_CARRY)
      const enemySupports = byRole(c.enemies, 'Support')
      const enemyDurable = byRole(c.enemies, 'Durable')
      if (c.tier === 'situational') {
        return {
          detail: `${names(front, 2) || 'This lineup'} ${verb(front, 'can trade hits but has', 'can trade hits but have')} no kill threat before level 6, so lanes produce farm rather than pressure.`,
          tactic: greedy.length
            ? `Pull the small camp against ${greedy[0].localizedName} to hold equilibrium — deny the free farm rather than contest a lane you lose.`
            : 'Stack camps, hold equilibrium, and spend the first smoke defensively instead of on a rotation.',
        }
      }
      return {
        detail: enemyDurable.length >= 2
          ? `${names(front, 2)} ${verb(front, 'out-damages', 'out-damage')} the lane on paper, but ${names(enemyDurable, 2)} can absorb that burst and stay on the creep line.`
          : `${names(front, 2)} ${verb(front, 'out-trades', 'out-trade')} from level 3 and ${verb(front, 'turns', 'turn')} the level-6 timing into a kill rather than a zone.`,
        tactic: c.scores.Push >= 62
          ? 'Convert the first lane kill straight into the tower — this draft loses value the moment the game goes quiet.'
          : greedy.length
            ? `Push waves into ${greedy[0].localizedName} and rotate onto ${enemySupports[0]?.localizedName ?? 'the enemy support'} — denied farm is worth more here than an early tower.`
            : 'Take both power runes and force a defensive teleport before the first catapult wave.',
      }
    },
  },
  {
    id: 'teamfight',
    label: 'Big teamfights',
    weights: { Teamfight: 0.62, Sustain: 0.2, Execution: 0.18 },
    driverWeight: (hero) => (inList(hero, TEAMFIGHT_ULT) ? 3 : 0) + (hero.roles.includes('Initiator') ? 2 : 0) + (hero.roles.includes('Durable') ? 1 : 0),
    narrate: (c) => {
      const ults = pick(c.drivers, TEAMFIGHT_ULT)
      const front = ults.length ? ults : c.drivers
      const enemyUlts = pick(c.enemies, TEAMFIGHT_ULT)
      const enemySaves = pick(c.enemies, SAVE)
      const anchor = front[0]
      if (c.tier === 'situational') {
        return {
          detail: ults.length
            ? `${ults[0].localizedName} is the only real AoE ultimate here, so a fair five-on-five turns on who lands the first stun.`
            : 'No layered AoE ultimate: grouped fights are decided by positioning and cooldowns rather than by anything this draft initiates.',
          tactic: enemyUlts.length
            ? `Spread wide around ${names(enemyUlts, 2)} and take the fight only after that ultimate is spent or the enemy is a hero short.`
            : 'Only fight from a numbers advantage — a pickoff, a buyback gap, or a smoke that lands first.',
        }
      }
      return {
        detail: (many(front)
          ? `${names(front, 2)} chain into each other, so a clean initiation is worth more to this draft than any single item it buys.`
          : `${anchor.localizedName} is the fight-starter, and the draft is only as good as that ultimate's positioning.`)
          + (enemySaves.length ? ` ${enemySaves[0].localizedName} can undo the first kill, so count that save before committing.` : ''),
        tactic: c.edge === 'outmatched' && enemyUlts.length
          ? `${names(enemyUlts, 2)} win the fair version of this fight — engage only on ${anchor.localizedName}'s initiation and hold a dispel for theirs.`
          : c.scores.Roshan >= 62
            ? `Start fights at the pit: ${anchor.localizedName}'s initiation plus Aegis pressure forces the opponent to fight where this draft is strongest.`
            : `Group on ${anchor.localizedName}'s cooldown and fight before the enemy carry finishes BKB; that item closes this window.`,
      }
    },
  },
  {
    id: 'pickoff',
    label: 'Pickoffs',
    weights: { Pickoff: 0.68, Laning: 0.14, Execution: 0.18 },
    driverWeight: (hero) => (inList(hero, PICKOFF) ? 3 : 0) + (inList(hero, BLINK) ? 2 : 0) + (hero.roles.includes('Disabler') ? 1 : 0),
    narrate: (c) => {
      const chain = c.drivers
      const slippery = c.enemies.filter((hero) => inList(hero, SLIPPERY) || inList(hero, SPLIT_PUSH))
      const enemySaves = pick(c.enemies, SAVE)
      const enemySplit = pick(c.enemies, SPLIT_PUSH)
      const target = pick(c.enemies, HARD_CARRY)[0] ?? byRole(c.enemies, 'Carry')[0]
      if (c.tier === 'situational') {
        return {
          detail: slippery.length
            ? `Nothing here reliably catches ${names(slippery, 2)} — they can farm the map without being punished for it.`
            : 'Catch is thin: kills have to come out of a won fight rather than from hunting a single hero.',
          tactic: 'Trade the hunt for vision — deny camps and pull wards instead of chasing kills this draft cannot close.',
        }
      }
      return {
        detail: many(chain)
          ? `${names(chain, 2)} hold enough chained disable to delete an isolated core outright`
            + (enemySaves.length ? `, though ${enemySaves[0].localizedName} can buy that target back if the save is up.` : '.')
          : `${chain[0].localizedName} has to land the opening disable alone, which makes every hunt a one-cooldown gamble`
            + (enemySaves.length ? ` against ${enemySaves[0].localizedName}'s save.` : '.'),
        tactic: enemySplit.length
          ? `Hunt ${enemySplit[0].localizedName} on the side lane rather than the group — removing the second front is worth more than the wave.`
          : target
            ? `Smoke toward ${target.localizedName}'s farming triangle before the BKB timing; the same chain stops sticking once that item is finished.`
            : 'Smoke into deep vision and open on the enemy support first — blinding the map is what makes the next pickoff free.',
      }
    },
  },
  {
    id: 'push',
    label: 'Tower pressure',
    weights: { Push: 0.68, Teamfight: 0.18, Laning: 0.14 },
    driverWeight: (hero) => (inList(hero, PUSH) ? 3 : 0) + (hero.roles.includes('Pusher') ? 2 : 0),
    narrate: (c) => {
      const clear = c.enemies.filter((hero) => inList(hero, WAVE_CLEAR) || inList(hero, PUSH))
      const enemyDurable = byRole(c.enemies, 'Durable')
      if (c.tier === 'situational') {
        return {
          detail: clear.length
            ? `Towers need a full five-man commit, and ${names(clear, 2)} simply clear the wave that would do the damage.`
            : 'Tower damage is slow: won fights turn into farm and vision rather than into structures.',
          tactic: 'Take objectives only off a kill — otherwise bank the advantage as camps, wards, and position for the next fight.',
        }
      }
      return {
        detail: `${names(c.drivers, 2)} ${verb(c.drivers, 'melts', 'melt')} a tower alongside the catapult wave`
          + (enemyDurable.length ? `, and ${names(enemyDurable, 1)} is the only body that can realistically hold the ramp.` : ', which turns every won fight straight into map.'),
        tactic: clear.length
          ? `Bait ${clear[0].localizedName}'s clear on the first wave and commit on the second — that cooldown, not the fight, decides the tower.`
          : 'Push all three lanes to force teleports, then collapse five-man on the weakest side.',
      }
    },
  },
  {
    id: 'roshan',
    label: 'Roshan control',
    weights: { Roshan: 0.68, Sustain: 0.18, Teamfight: 0.14 },
    driverWeight: (hero) => (inList(hero, ROSHAN) ? 3 : 0),
    full: 1,
    narrate: (c) => {
      const enemyPit = pick(c.enemies, ROSHAN)
      const enemyCatch = pick(c.enemies, PICKOFF)
      if (c.tier === 'situational') {
        return {
          detail: enemyPit.length
            ? `The pit costs this draft a full team and a long window, while ${enemyPit[0].localizedName} clears it on a raw item timing.`
            : 'No fast pit damage: Aegis costs a five-man commit and a window the opponent can read in advance.',
          tactic: 'Ward the pit and contest rather than initiate — enter only after a kill or a burned buyback.',
        }
      }
      return {
        detail: `${names(c.drivers, 2)} ${verb(c.drivers, 'clears', 'clear')} the pit on an item timing instead of a five-man commit, which makes Aegis a repeatable resource rather than a gamble.`,
        tactic: enemyCatch.length
          ? `Clear ${names(enemyCatch, 2)}'s vision line before dropping in, and keep one teleport up for the counter-push.`
          : 'Take the pit on the first cooldown gap and spend the Aegis immediately on high ground.',
      }
    },
  },
  {
    id: 'split-push',
    label: 'Split push',
    weights: { Push: 0.42, Scaling: 0.32, Execution: 0.26 },
    driverWeight: (hero) => (inList(hero, SPLIT_PUSH) ? 3 : 0),
    full: 1,
    narrate: (c) => {
      const enemyCatch = c.enemies.filter((hero) => inList(hero, PICKOFF) || inList(hero, BLINK))
      if (c.tier === 'situational') {
        return {
          detail: 'No hero threatens a lane alone, so every point of pressure has to come from the group of five.',
          tactic: 'Play as one unit and buy the map with vision — a second front is not available to this draft.',
        }
      }
      return {
        detail: c.drivers.length > 1
          ? `${c.drivers[0].localizedName} can hold a lane alone with ${c.drivers[1].localizedName} threatening the opposite side, forcing the enemy to answer in two places at once.`
          : `${c.drivers[0].localizedName} can hold a lane alone and pull defenders away from the fight the rest of the team wants.`,
        tactic: enemyCatch.length
          ? `Keep a teleport and stay behind the wave whenever ${names(enemyCatch, 2)} are off the map — one caught splitter costs more than the lane gains.`
          : 'Split the moment the enemy groups, and make them choose between the tower and your other four.',
      }
    },
  },
  {
    id: 'scaling',
    label: 'Late-game scaling',
    weights: { Scaling: 0.66, Sustain: 0.16, Teamfight: 0.18 },
    driverWeight: (hero) => (inList(hero, HARD_CARRY) ? 3 : 0) + (hero.roles.includes('Carry') ? 1 : 0),
    full: 1,
    narrate: (c) => {
      const enemyLate = pick(c.enemies, HARD_CARRY)
      const enemyTempo = c.enemies.filter((hero) => inList(hero, PUSH) || inList(hero, PICKOFF))
      const anchor = c.drivers[0]
      if (c.tier === 'situational') {
        return {
          detail: `${anchor?.localizedName ?? 'The core'} peaks on a timing rather than on slots, and the lineup loses relative value once both sides are six-slotted.`,
          tactic: enemyLate.length
            ? `Close the map before ${enemyLate[0].localizedName} finishes a third item — every even trade after that favours them.`
            : 'Force the game to end inside your power window; a long game is a losing game here.',
        }
      }
      return {
        detail: `${names(c.drivers, 2)} ${verb(c.drivers, 'keeps', 'keep')} gaining value through six slots`
          + (enemyLate.length ? `, and the late-game fight is specifically against ${enemyLate[0].localizedName}.` : ' — every minute the base holds makes this draft stronger.'),
        tactic: enemyTempo.length
          ? `Concede map to ${names(enemyTempo, 2)} but never barracks or buyback; defensive fights on your own high ground are the win condition.`
          : `Trade space for farm and take fights near your own creep wave until ${anchor?.localizedName ?? 'the carry'} is online.`,
      }
    },
  },
  {
    id: 'sustain',
    label: 'Fight sustain',
    weights: { Sustain: 0.66, Teamfight: 0.2, Laning: 0.14 },
    driverWeight: (hero) => (inList(hero, SAVE) ? 3 : 0) + (hero.roles.includes('Support') ? 1 : 0),
    narrate: (c) => {
      const saves = pick(c.drivers, SAVE)
      const front = saves.length ? saves : c.drivers
      const burst = c.enemies.filter((hero) => inList(hero, BKB_PIERCING) || hero.roles.includes('Nuker'))
      const antiHeal = pick(c.enemies, ANTI_HEAL)
      if (c.tier === 'situational') {
        return {
          detail: `Only ${names(c.drivers, 1) || 'a lone support'} can answer a caught core, so the first death usually decides the fight.`,
          tactic: burst.length
            ? `Carry your own answer — Glimmer, Force Staff, or an early BKB against ${names(burst, 2)}.`
            : 'Spread positioning and hold buyback instead of relying on a save this draft does not have.',
        }
      }
      return {
        detail: `${names(front, 2)} ${verb(front, 'keeps', 'keep')} an initiated core alive through the first rotation of damage, which turns short fights into the long ones this draft wants.`,
        tactic: antiHeal.length
          ? `${antiHeal[0].localizedName} switches that healing off — bait the ultimate out, or take the fight before it comes back up.`
          : 'Extend engagements deliberately; the longer a fight runs, the more those save cooldowns are worth.',
      }
    },
  },
  {
    id: 'defense',
    label: 'Siege defense',
    weights: { Sustain: 0.34, Teamfight: 0.36, Push: 0.3 },
    driverWeight: (hero) => (inList(hero, WAVE_CLEAR) ? 3 : 0) + (inList(hero, PUSH) ? 2 : 0) + (hero.roles.includes('Durable') ? 1 : 0),
    narrate: (c) => {
      const siege = c.enemies.filter((hero) => inList(hero, PUSH) || hero.roles.includes('Pusher'))
      const split = pick(c.enemies, SPLIT_PUSH)
      if (c.tier === 'situational') {
        return {
          detail: siege.length
            ? `Thin wave clear and few bodies for the ramp against ${names(siege, 2)} — a lost mid-game turns into a lost base quickly.`
            : 'Little wave clear and no natural high-ground body: falling behind on towers is hard to reverse.',
          tactic: 'Do not trade barracks. Fight on the map, with wards and forced engagements, before the enemy reaches high ground at all.',
        }
      }
      return {
        detail: `${names(c.drivers, 2)} ${verb(c.drivers, 'clears waves and holds', 'clear waves and hold')} the ramp, so this draft can lose the mid-game and still stall to its own timing.`,
        tactic: split.length
          ? `${split[0].localizedName} is the real threat to that plan — keep a teleport and a clear cooldown for the second front, not the front door.`
          : 'Defend high ground, force the fight there, and use buyback to punish an over-extended siege.',
      }
    },
  },
]

const traitDrivers = (blueprint: typeof TRAIT_BLUEPRINTS[number], heroes: Hero[]) => heroes
  .map((hero) => ({ hero, weight: blueprint.driverWeight(hero) }))
  .filter((entry) => entry.weight > 0)
  .sort((a, b) => b.weight - a.weight)
  .map((entry) => entry.hero)

function buildTraits(heroes: Hero[], scores: Record<Dimension, number>): DraftTrait[] {
  return TRAIT_BLUEPRINTS.map((blueprint) => {
    const drivers = traitDrivers(blueprint, heroes)
    const blend = (Object.entries(blueprint.weights) as [Dimension, number][])
      .reduce((sum, [dimension, weight]) => sum + scores[dimension] * weight, 0)
    // Dimension scores alone can float a pattern the draft has no heroes for — a lineup with
    // decent push and scaling but zero split-pushers cannot split-push. Two carrying heroes
    // earn the full rating; none caps it well below the "solid" line.
    const strength = Math.round(blend * (0.55 + 0.45 * Math.min(1, drivers.length / (blueprint.full ?? 2))))
    const tier = strength >= 68 ? 'signature' : strength >= 55 ? 'solid' : 'situational'
    return {
      id: blueprint.id,
      label: blueprint.label,
      strength,
      tier,
      detail: '',
      tactic: '',
      drivers: drivers.slice(0, 3).map((hero) => hero.localizedName),
    } satisfies DraftTrait
  }).sort((a, b) => b.strength - a.strength)
}

// Narration is a separate pass because it reads the opposing lineup: the same 71-rated pickoff
// trait is written differently against a Dazzle than against a Faceless Void.
function narrateTraits(traits: DraftTrait[], heroes: Hero[], enemies: Hero[], scores: Record<Dimension, number>, peakWindow: string): DraftTrait[] {
  return traits.map((trait) => {
    const blueprint = TRAIT_BLUEPRINTS.find((candidate) => candidate.id === trait.id)
    if (!blueprint) return trait
    const drivers = traitDrivers(blueprint, heroes)
    if (!drivers.length && trait.tier !== 'situational') return trait
    const written = blueprint.narrate({ heroes, enemies, drivers, scores, tier: trait.tier, edge: trait.edge, peakWindow })
    return { ...trait, ...written }
  })
}

// The hero on the other side who most directly punishes a weakness, so the risk line can name a
// threat instead of gesturing at one.
function exploiter(trait: DraftTrait, enemies: Hero[]): Hero | undefined {
  switch (trait.id) {
    case 'roshan': return pick(enemies, ROSHAN)[0]
    case 'sustain': return pick(enemies, PICKOFF)[0] ?? byRole(enemies, 'Nuker')[0]
    case 'defense': return pick(enemies, PUSH)[0] ?? byRole(enemies, 'Pusher')[0]
    case 'scaling': return pick(enemies, HARD_CARRY)[0]
    case 'pickoff': return enemies.filter((hero) => inList(hero, SLIPPERY))[0] ?? pick(enemies, SPLIT_PUSH)[0]
    case 'teamfight': return pick(enemies, TEAMFIGHT_ULT)[0]
    case 'push': return byRole(enemies, 'Durable')[0]
    case 'split-push': return pick(enemies, PICKOFF)[0]
    case 'early-aggression': return byRole(enemies, 'Nuker').filter((hero) => hero.attackType === 'Ranged')[0]
    default: return undefined
  }
}

function identityText(traits: DraftTrait[], scores: Record<Dimension, number>, enemies: Hero[], peakWindow: string) {
  const leading = traits.filter((trait) => trait.tier !== 'situational').slice(0, 2)
  const weakest = traits[traits.length - 1]
  const headline = leading.length ? leading.map((trait) => trait.label).join(' + ') : 'No dominant pattern'
  const sentences: string[] = []

  if (leading.length) {
    const anchors = leading[0].drivers.slice(0, 2)
    sentences.push(`The advantage comes from ${leading[0].label.toLowerCase()}${anchors.length ? `, and it runs through ${anchors.join(' and ')}` : ''}.`)
    if (leading[1]) {
      // Name a hero the first sentence has not already used, so the second line adds information.
      const second = leading[1].drivers.find((driver) => !anchors.includes(driver))
      sentences.push(`${leading[1].label} is the follow-up once that lands${second ? ` — ${second} is what makes it available` : ', off the same heroes'}.`)
    }
  } else {
    sentences.push('No single pattern carries this draft, so it wins on map reads and clean execution rather than on a structural edge.')
  }

  const tempo = (scores.Laning + scores.Push + scores.Pickoff) / 3
  const late = (scores.Scaling + scores.Sustain) / 2
  const enemyLate = pick(enemies, HARD_CARRY)[0]
  if (tempo > late + 8) {
    sentences.push(`The clock works against it: ${peakWindow} is the window, and ${enemyLate ? `${enemyLate.localizedName} out-scales it afterwards` : 'there is no answer once both sides are six-slotted'}.`)
  } else if (late > tempo + 8) {
    sentences.push(`Time is an ally — reaching ${peakWindow} intact is itself a win condition, so surviving the mid-game counts as progress.`)
  } else {
    sentences.push(`No strong clock preference; ${peakWindow} is simply when the item timings line up best.`)
  }

  if (weakest && weakest.strength < 55) {
    const threat = exploiter(weakest, enemies)
    sentences.push(`The exposed side is ${weakest.label.toLowerCase()} at ${weakest.strength}/100${threat ? ` — ${threat.localizedName} is the hero that punishes it` : ', though the opponent has no obvious hero to punish it'}.`)
  }

  return { headline, summary: sentences.join(' ') }
}

function riskLevel(scores: Record<Dimension, number>, laneFit: number): TeamAnalysis['riskLevel'] {
  const risks = [
    scores.Scaling >= 68 && scores.Laning < 58,
    scores.Execution < 54,
    laneFit < 42,
  ].filter(Boolean).length
  return risks >= 2 ? 'High' : risks === 1 ? 'Medium' : 'Low'
}

// Safe lane faces the enemy off lane and vice versa; mid faces mid.
const OPPOSING_LANE = [2, 1, 0] as const

// Projected head-to-head read for one lane: observed hero counters where the sample exists,
// plus a role-based laning-power heuristic and the numbers advantage in that lane.
function laneMatchup(mine: Hero[], theirs: Hero[], meta?: RecentProMeta | null): string | undefined {
  if (!mine.length || !theirs.length) return undefined
  const observed: number[] = []
  for (const hero of mine) for (const enemy of theirs) {
    const value = meta?.counters?.[`${hero.id}:${enemy.id}`]
    if (value !== undefined) observed.push(value)
  }
  const power = (heroes: Hero[]) => heroes.reduce((sum, hero) => sum
    + (hero.attackType === 'Ranged' ? 2 : 0)
    + (hero.roles.includes('Nuker') ? 2 : 0)
    + (hero.roles.includes('Disabler') ? 1.5 : 0)
    + (hero.roles.includes('Durable') ? 1.2 : 0)
    + (supportAffinity(hero) ? 1 : 0), 0)
  const edgeScore = (observed.length ? mean(observed) * 22 : 0) + power(mine) - power(theirs) + (mine.length - theirs.length) * 2
  const label = edgeScore >= 2.5 ? 'Favored' : edgeScore <= -2.5 ? 'Tough' : 'Even'
  return `${label} vs ${names(theirs, 2)}`
}

function responseItems(opponent: TeamAnalysis, opponentHeroes: Hero[]) {
  const items: string[] = []
  const vs = (drivers: Hero[]) => drivers.length ? ` (${names(drivers, 2)})` : ''
  if (opponent.scores.Pickoff >= 65) items.push(`Force Staff / Linken’s Sphere${vs(opponentHeroes.filter((hero) => inList(hero, PICKOFF)))}`)
  if (opponent.scores.Teamfight >= 65) items.push(`Black King Bar / Pipe${vs(opponentHeroes.filter((hero) => inList(hero, TEAMFIGHT_ULT)))}`)
  if (opponent.scores.Sustain >= 65) items.push(`Spirit Vessel / Shiva’s Guard${vs(opponentHeroes.filter((hero) => inList(hero, SAVE)))}`)
  if (opponent.scores.Scaling >= 65) items.push(`Heaven’s Halberd / armor${vs(opponentHeroes.filter((hero) => inList(hero, HARD_CARRY)))}`)
  if (opponent.scores.Push >= 60) items.push(`Wave clear / Boots of Travel${vs(opponentHeroes.filter((hero) => inList(hero, PUSH) || hero.roles.includes('Pusher')))}`)
  if (opponent.scores.Roshan >= 65) items.push(`Early vision around Roshan${vs(opponentHeroes.filter((hero) => inList(hero, ROSHAN)))}`)
  return items.slice(0, 4).length ? items.slice(0, 4) : ['Flexible dispel and mobility items']
}

function matchupWinConditions(team: TeamAnalysis, opponent: TeamAnalysis, heroes: Hero[], opponentHeroes: Hero[]) {
  const cores = heroes.filter((hero) => hero.roles.includes('Carry'))
  const catchHeroes = heroes.filter((hero) => hero.roles.includes('Disabler') || inList(hero, PICKOFF))
  const enemyScalingCores = opponentHeroes.filter((hero) => hero.roles.includes('Carry') || inList(hero, HARD_CARRY))
  const conditions: string[] = []

  if (scoreDelta(team, opponent, 'Laning') >= 8) {
    conditions.push(`Win at least two lanes, then convert the lane lead into rune control and the first tower before ${names(enemyScalingCores, 1) || 'the enemy cores'} stabilize.`)
  } else if (scoreDelta(team, opponent, 'Laning') <= -8) {
    conditions.push(`Keep the first ten minutes low-loss: protect ${names(cores, 1) || 'the main core'} and avoid giving rotation kills into the enemy lane advantage.`)
  } else {
    conditions.push('Play lanes for parity; the draft edge comes from cleaner rotations and first objective conversion, not raw lane dominance.')
  }

  if (scoreDelta(team, opponent, 'Teamfight') >= 8) {
    conditions.push('Force grouped fights around vision and major cooldowns; do not let the opponent split the map before your initiation lands.')
  } else if (scoreDelta(team, opponent, 'Pickoff') >= 8) {
    conditions.push(`Use ${names(catchHeroes) || 'catch heroes'} to break formation first; every smoke should create a numbers advantage before towers or Roshan.`)
  } else if (team.scores.Push >= 62) {
    conditions.push('Convert catapult waves and won skirmishes into tower damage immediately; the draft loses value if kills do not become map control.')
  } else {
    conditions.push('Delay direct objective attempts until a key enemy cooldown or mobility spell is forced out.')
  }

  if (scoreDelta(team, opponent, 'Scaling') >= 8) {
    conditions.push(`Trade space intelligently and protect ${names(cores, 2) || 'core item timings'}; late-game structure favors this lineup if the map is not collapsed early.`)
  } else if (scoreDelta(team, opponent, 'Scaling') <= -8) {
    conditions.push('End the farming phase early: claim Roshan or two outer towers before the opponent reaches their third major core item.')
  } else {
    conditions.push(`Hit the ${team.peakWindow} window with smoke, wards, and buyback discipline; the draft is timing-sensitive rather than purely late-game favored.`)
  }

  return conditions
}

function matchupObjectivePlan(team: TeamAnalysis, opponent: TeamAnalysis, heroes: Hero[], opponentHeroes: Hero[]): ObjectiveStep[] {
  const laneDelta = scoreDelta(team, opponent, 'Laning')
  const pushDelta = scoreDelta(team, opponent, 'Push')
  const roshanDelta = scoreDelta(team, opponent, 'Roshan')
  const fightDelta = scoreDelta(team, opponent, 'Teamfight')
  // Name the heroes the plan actually revolves around so each window reads as an instruction,
  // not a template: our farming core, our catch/pit heroes, their carry and wave-clear.
  const ownCore = heroes.find((hero) => inList(hero, HARD_CARRY)) ?? heroes.find((hero) => hero.roles.includes('Carry'))
  const catchHero = heroes.find((hero) => inList(hero, PICKOFF)) ?? heroes.find((hero) => hero.roles.includes('Disabler'))
  const roshanHero = heroes.find((hero) => inList(hero, ROSHAN))
  const enemyCarry = opponentHeroes.find((hero) => inList(hero, HARD_CARRY)) ?? opponentHeroes.find((hero) => hero.roles.includes('Carry'))
  const enemyClear = opponentHeroes.find((hero) => inList(hero, PUSH)) ?? opponentHeroes.find((hero) => hero.roles.includes('Nuker') && hero.attackType === 'Ranged')

  return [
    {
      window: '0-10',
      action: laneDelta >= 8
        ? `Pressure both side lanes${enemyCarry ? `, deny ${enemyCarry.localizedName}'s opening farm,` : ', secure power runes,'} and force defensive teleports before the first catapult.`
        : laneDelta <= -8
          ? `Prioritize lane survival, pull equilibrium back, and shield ${ownCore ? ownCore.localizedName : 'the weakest core'} from first rotation pressure.`
          : 'Keep lanes even and save first smoke for the strongest level-six or first-ultimate timing.',
    },
    {
      window: '10-18',
      action: pushDelta >= 8
        ? 'Group with catapult waves and convert the first pickoff into two outer towers.'
        : team.scores.Pickoff >= opponent.scores.Teamfight
          ? `Smoke through deep vision${catchHero ? ` with ${catchHero.localizedName}` : ''}, remove ${enemyClear ? enemyClear.localizedName : 'the wave-clear hero'} first, then pressure the nearest tower.`
          : 'Avoid blind tower dives; farm toward the first defensive or teamfight item and fight on your ward line.',
    },
    {
      window: '18-26',
      action: roshanDelta >= 8
        ? `Set Roshan vision early, force one cooldown, then take the pit${roshanHero ? ` behind ${roshanHero.localizedName}'s pit speed` : ''} with buyback and teleport advantage.`
        : fightDelta >= 8
          ? 'Bait the opponent into a grouped fight outside Roshan before committing to the pit.'
          : `Cut waves and delay Roshan until a pickoff${enemyCarry ? ` on ${enemyCarry.localizedName}` : ''} or enemy smoke failure gives a safe entry.`,
    },
    {
      window: team.peakWindow,
      action: scoreDelta(team, opponent, 'Scaling') >= 8
        ? `Take protected map control while ${ownCore ? ownCore.localizedName : 'the cores'} completes late-game items; avoid coin-flip high-ground pushes.`
        : 'Use the lineup peak to claim Aegis, remove outer map access, and force high ground before scaling falls off.',
    },
  ]
}

function refineMatchupPlans(team: TeamAnalysis, opponent: TeamAnalysis, heroes: Hero[], opponentHeroes: Hero[], meta?: RecentProMeta | null) {
  team.winConditions = matchupWinConditions(team, opponent, heroes, opponentHeroes)
  team.objectivePlan = matchupObjectivePlan(team, opponent, heroes, opponentHeroes)
  team.lanePlan = team.lanePlan.map((lane, laneIndex) => {
    const enemyLane = opponent.lanePlan[OPPOSING_LANE[laneIndex]]
    const matchup = laneMatchup(lane.heroes, enemyLane?.heroes ?? [], meta)
    return matchup ? { ...lane, matchup } : lane
  })

  // A trait only matters relative to the other draft: 68 pickoff means little if the opponent
  // sits at 74, so each trait carries its head-to-head standing.
  team.traits = team.traits.map((trait) => {
    const rival = opponent.traits.find((candidate) => candidate.id === trait.id)
    if (!rival) return trait
    const delta = trait.strength - rival.strength
    return { ...trait, edge: delta >= 8 ? 'dominant' : delta <= -8 ? 'outmatched' : 'even' }
  })
  // Rewrite the trait read now that the opposing heroes are known: this is where "enough catch
  // to delete a core" becomes "…though Dazzle can buy that target back".
  team.traits = narrateTraits(team.traits, heroes, opponentHeroes, team.scores, team.peakWindow)
  const identity = identityText(team.traits, team.scores, opponentHeroes, team.peakWindow)
  team.identityHeadline = identity.headline
  team.identitySummary = identity.summary
  // Only warn about the two traits the identity headline is built on — a lesser trait being
  // outmatched is already visible on its own row.
  const contested = team.traits.filter((trait) => trait.tier !== 'situational').slice(0, 2)
    .find((trait) => trait.edge === 'outmatched')
  if (contested) {
    const rival = opponent.traits.find((candidate) => candidate.id === contested.id)
    team.identitySummary += ` Note that ${contested.label.toLowerCase()} is also the opponent's best pattern${rival ? ` (${rival.strength} to ${contested.strength}${rival.drivers[0] ? `, through ${rival.drivers[0]}` : ''})` : ''}, so it has to be set up rather than walked into.`
  }

  if (scoreDelta(team, opponent, 'Roshan') <= -10) {
    team.gaps.unshift('Roshan access is contested; this lineup likely needs a pickoff or ward advantage before entering the pit.')
  }
  if (scoreDelta(team, opponent, 'Teamfight') <= -10 && team.scores.Pickoff < 62) {
    team.gaps.unshift('Teamfight deficit without enough catch means the draft must dodge fair five-on-five engagements.')
  }
  if (scoreDelta(team, opponent, 'Push') <= -10) {
    team.gaps.unshift('Tower damage is slower than the opponent; objective conversion must come from clean kills or Aegis.')
  }

  team.gaps = Array.from(new Set(team.gaps)).slice(0, 5)
}

function analyzeTeam(heroes: Hero[], meta?: RecentProMeta | null): TeamAnalysis {
  const scores = scoreTeam(heroes)
  const lanes = inferLanes(heroes, meta)
  const laneFit = roleFitScore(lanes.plan)
  const strengths = strongest(scores).map(([dimension, score]) => `${dimension} is a clear asset (${score}/100).`)
  const gaps: string[] = []
  if (scores.Teamfight < 50) gaps.push('No dependable large-scale initiation; fights may start on the opponent’s terms.')
  if (scores.Push < 50) gaps.push('Limited tower conversion; successful kills may not become objectives.')
  if (scores.Pickoff < 50) gaps.push('Low catch density against split-push or mobile cores.')
  if (scores.Sustain < 50) gaps.push('Little reset or save; long engagements become difficult.')
  if (scores.Scaling < 52) gaps.push('The lineup loses relative value if the game reaches late six-slot fights.')
  if (scores.Execution < 52) gaps.push('High execution burden: summons, cooldown layering, or greedy resource distribution must be clean.')
  if (!gaps.length) gaps.push('No structural hole, but the lineup still depends on hitting its item windows on time.')

  const peakScore = (scores.Teamfight + scores.Push + scores.Pickoff) / 3
  const peakWindow = scores.Scaling > peakScore + 8 ? '32–45 min' : peakScore > scores.Scaling + 8 ? '16–28 min' : '22–36 min'
  const winConditions = [
    scores.Push >= 60 ? 'Turn the first won fight into towers or Roshan immediately.' : 'Create vision-led kills before attempting protected objectives.',
    scores.Teamfight >= scores.Pickoff ? 'Fight around major ultimates and force the opponent into grouped engagements.' : 'Keep the map open and isolate targets before five-on-five fights begin.',
    scores.Scaling >= 65 ? 'Protect core farm until the second and third major items arrive.' : `Accelerate the game during the ${peakWindow} power window.`,
  ]

  // Standalone read: refineMatchupPlans rewrites both of these once the opposing draft is known.
  const traits = narrateTraits(buildTraits(heroes, scores), heroes, [], scores, peakWindow)
  const identity = identityText(traits, scores, [], peakWindow)

  return {
    scores,
    archetype: inferArchetype(scores),
    pressureProfile: pressureProfile(scores),
    riskLevel: riskLevel(scores, laneFit),
    strengths,
    gaps,
    winConditions,
    spikes: buildSpikes(heroes),
    peakWindow,
    lanePlan: lanes.plan,
    laneEvidence: lanes.evidence,
    damageProfile: inferDamageProfile(heroes),
    responseItems: [],
    objectivePlan: objectivePlan(scores, peakWindow),
    traits,
    identityHeadline: identity.headline,
    identitySummary: identity.summary,
  }
}

function edge(a: number, b: number): Team | 'even' {
  if (Math.abs(a - b) < 5) return 'even'
  return a > b ? 'radiant' : 'dire'
}

function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function observedDraftScore(team: Hero[], enemies: Hero[], meta?: RecentProMeta | null) {
  if (!meta) return 0
  const evidence: number[] = []
  for (let i = 0; i < team.length; i += 1) {
    for (let j = i + 1; j < team.length; j += 1) {
      const key = team[i].id < team[j].id ? `${team[i].id}:${team[j].id}` : `${team[j].id}:${team[i].id}`
      if (meta.synergy[key] !== undefined) evidence.push(meta.synergy[key])
    }
    for (const enemy of enemies) {
      const value = meta.counters[`${team[i].id}:${enemy.id}`]
      if (value !== undefined) evidence.push(value)
    }
  }
  return evidence.length ? evidence.reduce((sum, value) => sum + value, 0) / evidence.length * 8 : 0
}

function proCoverage(heroes: Hero[], meta?: RecentProMeta | null) {
  if (!meta) return 0
  return heroes.filter((hero) => {
    const signal = meta.heroSignals[hero.id]
    return signal && signal.picks + signal.bans >= 1
  }).length
}

function heroMetaScore(heroes: Hero[], meta?: RecentProMeta | null) {
  if (!meta?.publicHeroSignals) return 0
  const total = heroes.reduce((sum, hero) => {
    const signal = meta.publicHeroSignals?.[hero.id]
    if (!signal || signal.picks <= 0) return sum
    const winRate = signal.wins / signal.picks
    const credibility = signal.picks / (signal.picks + 6)
    return sum + (winRate - 0.5) * 2 * credibility
  }, 0)
  return total * 6
}

function publicCoverage(heroes: Hero[], meta?: RecentProMeta | null) {
  if (!meta?.publicHeroSignals) return 0
  return heroes.filter((hero) => (meta.publicHeroSignals?.[hero.id]?.picks ?? 0) >= 2).length
}

// Observed hero win rates conditioned on game length (short/mid/long) sharpen each stage's
// base strength beyond what role tags imply — e.g. a hard carry's actual long-game record.
function stageMetaScore(heroes: Hero[], meta: RecentProMeta | null | undefined, bucket: 'short' | 'mid' | 'long') {
  if (!meta?.durationSignals) return 0
  const total = heroes.reduce((sum, hero) => {
    const signal = meta.durationSignals?.[hero.id]?.[bucket]
    if (!signal || signal.picks <= 0) return sum
    const winRate = signal.wins / signal.picks
    const credibility = signal.picks / (signal.picks + 5)
    return sum + (winRate - 0.5) * 2 * credibility
  }, 0)
  return total * 5
}

function durationWeights(radiant: TeamAnalysis, dire: TeamAnalysis) {
  const tempo = (radiant.scores.Laning + dire.scores.Laning) * 0.2
    + (radiant.scores.Push + dire.scores.Push) * 0.25
    + (radiant.scores.Pickoff + dire.scores.Pickoff) * 0.15
  const scaling = (radiant.scores.Scaling + dire.scores.Scaling) * 0.28
    + (radiant.scores.Sustain + dire.scores.Sustain) * 0.12
  const early = Math.max(0.18, Math.min(0.42, 0.26 + (tempo - scaling) / 420))
  const late = Math.max(0.16, Math.min(0.36, 0.24 + (scaling - tempo) / 460))
  return { early, mid: Math.max(0.34, 1 - early - late), late }
}

function rolePenalty(team: TeamAnalysis) {
  const fit = roleFitScore(team.lanePlan)
  const confidencePenalty = fit < 35 ? 4.5 : fit < 48 ? 2.5 : 0
  const riskPenalty = team.riskLevel === 'High' ? 3 : team.riskLevel === 'Medium' ? 1.4 : 0
  return confidencePenalty + riskPenalty
}

function dimensionImpact(dimension: Dimension) {
  switch (dimension) {
    case 'Laning': return 'stronger opening lanes should decide rune control and the first tower tempo'
    case 'Teamfight': return 'cleaner five-on-five tools make Roshan and high-ground fights easier to force'
    case 'Pickoff': return 'better catch can create numbers advantages before committing to objectives'
    case 'Push': return 'tower damage converts won fights into map control faster'
    case 'Sustain': return 'more save/reset tools should extend fights and punish over-commitment'
    case 'Scaling': return 'the draft has a clearer late-game insurance policy if the map stays playable'
    case 'Roshan': return 'Aegis access is easier, especially after the first clean kill or cooldown trade'
    case 'Execution': return 'the lineup is easier to execute under pressure and less punished by messy fights'
    default: return 'this edge changes how the draft should be played'
  }
}

export function analyzeDraft(radiantHeroes: Hero[], direHeroes: Hero[], meta?: RecentProMeta | null): MatchupAnalysis {
  const radiant = analyzeTeam(radiantHeroes, meta)
  const dire = analyzeTeam(direHeroes, meta)
  radiant.responseItems = responseItems(dire, direHeroes)
  dire.responseItems = responseItems(radiant, radiantHeroes)
  refineMatchupPlans(radiant, dire, radiantHeroes, direHeroes, meta)
  refineMatchupPlans(dire, radiant, direHeroes, radiantHeroes, meta)
  const observedR = observedDraftScore(radiantHeroes, direHeroes, meta)
  const observedD = observedDraftScore(direHeroes, radiantHeroes, meta)
  const laneFitR = roleFitScore(radiant.lanePlan)
  const laneFitD = roleFitScore(dire.lanePlan)
  const matchupFitR = observedR + heroMetaScore(radiantHeroes, meta) + (laneFitR - 50) * 0.06 - rolePenalty(radiant)
  const matchupFitD = observedD + heroMetaScore(direHeroes, meta) + (laneFitD - 50) * 0.06 - rolePenalty(dire)
  const earlyR = radiant.scores.Laning * 0.5 + radiant.scores.Pickoff * 0.22 + radiant.scores.Push * 0.18 + radiant.scores.Sustain * 0.1 + matchupFitR + stageMetaScore(radiantHeroes, meta, 'short')
  const earlyD = dire.scores.Laning * 0.5 + dire.scores.Pickoff * 0.22 + dire.scores.Push * 0.18 + dire.scores.Sustain * 0.1 + matchupFitD + stageMetaScore(direHeroes, meta, 'short')
  const midR = radiant.scores.Teamfight * 0.32 + radiant.scores.Pickoff * 0.22 + radiant.scores.Push * 0.22 + radiant.scores.Roshan * 0.16 + radiant.scores.Execution * 0.08 + matchupFitR * 0.75 + stageMetaScore(radiantHeroes, meta, 'mid')
  const midD = dire.scores.Teamfight * 0.32 + dire.scores.Pickoff * 0.22 + dire.scores.Push * 0.22 + dire.scores.Roshan * 0.16 + dire.scores.Execution * 0.08 + matchupFitD * 0.75 + stageMetaScore(direHeroes, meta, 'mid')
  const lateR = radiant.scores.Scaling * 0.48 + radiant.scores.Teamfight * 0.25 + radiant.scores.Sustain * 0.18 + radiant.scores.Execution * 0.09 + matchupFitR * 0.35 + stageMetaScore(radiantHeroes, meta, 'long')
  const lateD = dire.scores.Scaling * 0.48 + dire.scores.Teamfight * 0.25 + dire.scores.Sustain * 0.18 + dire.scores.Execution * 0.09 + matchupFitD * 0.35 + stageMetaScore(direHeroes, meta, 'long')
  const seed = [...radiantHeroes, ...direHeroes].reduce((sum, hero, index) => sum + hero.id * (index + 3), 17)
  const random = seeded(seed)
  const simulationRuns = 25_000
  const weights = durationWeights(radiant, dire)
  let radiantWins = 0

  for (let run = 0; run < simulationRuns; run += 1) {
    const durationRoll = random()
    const baseR = durationRoll < weights.early ? earlyR : durationRoll < weights.early + weights.mid ? midR : lateR
    const baseD = durationRoll < weights.early ? earlyD : durationRoll < weights.early + weights.mid ? midD : lateD
    const executionR = (radiant.scores.Execution - 50) * 0.1
    const executionD = (dire.scores.Execution - 50) * 0.1
    const chaos = 15 - (radiant.scores.Execution + dire.scores.Execution - 100) * 0.035
    const varianceR = (random() + random() + random() - 1.5) * chaos
    const varianceD = (random() + random() + random() - 1.5) * chaos
    if (baseR + executionR + varianceR > baseD + executionD + varianceD) radiantWins += 1
  }

  const rawRadiantProbability = Math.max(8, Math.min(92, radiantWins / simulationRuns * 100))
  // Backtest-derived shrink: raw simulation edges overstate real outcomes, so scale the
  // displayed edge by the factor measured against stored match results.
  const shrink = meta?.calibration ? Math.max(0.1, Math.min(1, meta.calibration.shrink)) : 1
  const radiantProbability = Math.round(50 + (rawRadiantProbability - 50) * shrink)
  const direProbability = 100 - radiantProbability
  const samplingMargin = Math.max(1, Math.ceil(1.96 * Math.sqrt((radiantProbability / 100) * (1 - radiantProbability / 100) / simulationRuns) * 100))
  const favored: Team | 'even' = Math.abs(radiantProbability - 50) < 4 ? 'even' : radiantProbability > 50 ? 'radiant' : 'dire'
  const stageEdge = { early: edge(earlyR, earlyD), mid: edge(midR, midD), late: edge(lateR, lateD) }
  const favoriteName = favored === 'even' ? 'Neither team' : favored === 'radiant' ? 'Radiant' : 'Dire'
  const headline = favored === 'even'
    ? 'The draft is structurally even; execution and the first major objective should decide it.'
    : `${favoriteName} holds the cleaner overall path, but the advantage changes across game stages.`

  const dimensions = (Object.keys(radiant.scores) as Dimension[])
    .map((dimension) => ({ dimension, delta: radiant.scores[dimension] - dire.scores[dimension] }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3)
  const decidingFactors = dimensions.map(({ dimension, delta }) => {
    const leader = delta > 0 ? 'Radiant' : 'Dire'
    return `${leader} leads ${dimension.toLowerCase()} by ${Math.abs(delta)}: ${dimensionImpact(dimension)}.`
  })
  const confidence = Math.abs(radiantProbability - 50) >= 14 ? 'high' : Math.abs(radiantProbability - 50) >= 8 ? 'moderate' : 'thin'
  const laneFitInsight = `Lane model confidence: Radiant ${Math.round(laneFitR)}% fit (${radiant.laneEvidence}) vs Dire ${Math.round(laneFitD)}% fit (${dire.laneEvidence}).`
  const simulationInsights = [
    `Win estimate confidence is ${confidence}; read small edges as draft pressure, not a guaranteed result.`,
    `Duration model: ${Math.round(weights.early * 100)}% early, ${Math.round(weights.mid * 100)}% mid, ${Math.round(weights.late * 100)}% late-game trials.`,
    laneFitInsight,
    `Role pressure: Radiant ${radiant.riskLevel.toLowerCase()} risk vs Dire ${dire.riskLevel.toLowerCase()} risk.`,
    meta ? `Pro overlap: Radiant ${proCoverage(radiantHeroes, meta)}/5 heroes and Dire ${proCoverage(direHeroes, meta)}/5 heroes appear in the current patch sample.` : 'Pro overlap is unavailable, so this run uses role-tag estimates only.',
  ]
  if (meta?.publicMatchesAnalyzed) {
    simulationInsights.push(`High-rank sample: ${meta.publicMatchesAnalyzed} ranked Divine+ matches back hero win rates (Radiant ${publicCoverage(radiantHeroes, meta)}/5, Dire ${publicCoverage(direHeroes, meta)}/5 heroes well-sampled).`)
  }
  if (meta?.matchesWithDuration) {
    simulationInsights.push(`Stage model uses game-length win rates from ${meta.matchesWithDuration.toLocaleString()} matches with known durations.`)
  }
  if (meta?.calibration) {
    simulationInsights.push(`Backtest: the model's favored side won ${Math.round(meta.calibration.accuracy * 100)}% of ${meta.calibration.matches.toLocaleString()} stored real matches (Brier ${meta.calibration.brier.toFixed(3)}).`)
  }

  const modelBasis = meta
    ? `${meta.matchesAnalyzed} current-patch pro drafts${meta.matchesWithPositions ? ` · ${meta.matchesWithPositions} with role data` : ''}${meta.publicMatchesAnalyzed ? ` · ${meta.publicMatchesAnalyzed} high-rank ranked matches` : ''}${meta.calibration ? ` · ${Math.round(meta.calibration.accuracy * 100)}% backtest accuracy on ${meta.calibration.matches.toLocaleString()} matches` : ''}`
    : 'Role-tag estimates only'
  return { radiant, dire, probability: { radiant: radiantProbability, dire: direProbability }, stageEdge, favored, headline, decidingFactors, simulationInsights, simulationRuns, samplingMargin, modelBasis }
}
