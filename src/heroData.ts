import type { Hero } from './types'

type ApiHero = {
  id: number
  name: string
  localized_name: string
  primary_attr: Hero['primaryAttr']
  attack_type: string
  roles: string[]
  img: string
  icon: string
  pro_pick?: number
  pro_ban?: number
  pro_win?: number
}

export type DataSource = 'live' | 'bundled'

function apiHeroes(payload: ApiHero[] | { heroes?: ApiHero[] }): ApiHero[] {
  const heroes = Array.isArray(payload) ? payload : payload.heroes
  if (!Array.isArray(heroes) || heroes.length === 0) throw new Error('Hero data is empty or invalid')
  return heroes
}

function dataSource(response: Response): DataSource {
  return response.headers.get('x-draftgg-data-source') === 'bundled' ? 'bundled' : 'live'
}

function mapHeroes(data: ApiHero[]): Hero[] {
  return data.map((hero) => ({
    id: hero.id,
    name: hero.name,
    localizedName: hero.localized_name,
    primaryAttr: hero.primary_attr,
    attackType: hero.attack_type,
    roles: hero.roles,
    image: `https://cdn.cloudflare.steamstatic.com${hero.img}`,
    icon: `https://cdn.cloudflare.steamstatic.com${hero.icon}`,
    proPick: hero.pro_pick ?? 0,
    proBan: hero.pro_ban ?? 0,
    proWin: hero.pro_win ?? 0,
  }))
}

const fallbackNames = [
  ['antimage', 'Anti-Mage', 'agi', 'Carry'], ['axe', 'Axe', 'str', 'Initiator'],
  ['bane', 'Bane', 'all', 'Support'], ['bloodseeker', 'Bloodseeker', 'agi', 'Carry'],
  ['crystal_maiden', 'Crystal Maiden', 'int', 'Support'], ['drow_ranger', 'Drow Ranger', 'agi', 'Carry'],
  ['earthshaker', 'Earthshaker', 'str', 'Initiator'], ['juggernaut', 'Juggernaut', 'agi', 'Carry'],
  ['mirana', 'Mirana', 'all', 'Support'], ['morphling', 'Morphling', 'agi', 'Carry'],
  ['nevermore', 'Shadow Fiend', 'agi', 'Carry'], ['phantom_lancer', 'Phantom Lancer', 'agi', 'Carry'],
  ['puck', 'Puck', 'int', 'Initiator'], ['pudge', 'Pudge', 'str', 'Disabler'],
  ['razor', 'Razor', 'agi', 'Carry'], ['sand_king', 'Sand King', 'all', 'Initiator'],
  ['storm_spirit', 'Storm Spirit', 'int', 'Escape'], ['sven', 'Sven', 'str', 'Carry'],
  ['tiny', 'Tiny', 'str', 'Nuker'], ['vengefulspirit', 'Vengeful Spirit', 'agi', 'Support'],
  ['windrunner', 'Windranger', 'all', 'Carry'], ['zuus', 'Zeus', 'int', 'Nuker'],
  ['kunkka', 'Kunkka', 'str', 'Initiator'], ['lina', 'Lina', 'int', 'Nuker'],
  ['lion', 'Lion', 'int', 'Support'], ['shadow_shaman', 'Shadow Shaman', 'int', 'Support'],
  ['slardar', 'Slardar', 'str', 'Initiator'], ['tidehunter', 'Tidehunter', 'str', 'Initiator'],
  ['witch_doctor', 'Witch Doctor', 'int', 'Support'], ['lich', 'Lich', 'int', 'Support'],
  ['enigma', 'Enigma', 'all', 'Initiator'], ['tinker', 'Tinker', 'int', 'Carry'],
  ['sniper', 'Sniper', 'agi', 'Carry'], ['necrolyte', 'Necrophos', 'int', 'Carry'],
  ['warlock', 'Warlock', 'int', 'Support'], ['beastmaster', 'Beastmaster', 'all', 'Initiator'],
  ['queenofpain', 'Queen of Pain', 'int', 'Carry'], ['venomancer', 'Venomancer', 'all', 'Support'],
  ['faceless_void', 'Faceless Void', 'agi', 'Carry'], ['skeleton_king', 'Wraith King', 'str', 'Carry'],
  ['death_prophet', 'Death Prophet', 'int', 'Carry'], ['phantom_assassin', 'Phantom Assassin', 'agi', 'Carry'],
  ['pugna', 'Pugna', 'int', 'Nuker'], ['templar_assassin', 'Templar Assassin', 'agi', 'Carry'],
  ['viper', 'Viper', 'agi', 'Carry'], ['luna', 'Luna', 'agi', 'Carry'],
  ['dragon_knight', 'Dragon Knight', 'str', 'Carry'], ['dazzle', 'Dazzle', 'all', 'Support'],
  ['rattletrap', 'Clockwerk', 'str', 'Initiator'], ['leshrac', 'Leshrac', 'int', 'Carry'],
  ['furion', "Nature's Prophet", 'int', 'Carry'], ['life_stealer', 'Lifestealer', 'str', 'Carry'],
  ['dark_seer', 'Dark Seer', 'all', 'Initiator'], ['clinkz', 'Clinkz', 'agi', 'Carry'],
  ['omniknight', 'Omniknight', 'str', 'Support'], ['enchantress', 'Enchantress', 'int', 'Support'],
  ['huskar', 'Huskar', 'str', 'Carry'], ['night_stalker', 'Night Stalker', 'str', 'Initiator'],
  ['broodmother', 'Broodmother', 'all', 'Carry'], ['bounty_hunter', 'Bounty Hunter', 'agi', 'Escape'],
  ['weaver', 'Weaver', 'agi', 'Carry'], ['jakiro', 'Jakiro', 'int', 'Support'],
  ['batrider', 'Batrider', 'all', 'Initiator'], ['chen', 'Chen', 'int', 'Support'],
  ['spectre', 'Spectre', 'agi', 'Carry'], ['doom_bringer', 'Doom', 'str', 'Initiator'],
  ['ancient_apparition', 'Ancient Apparition', 'int', 'Support'], ['ursa', 'Ursa', 'agi', 'Carry'],
  ['spirit_breaker', 'Spirit Breaker', 'str', 'Initiator'], ['gyrocopter', 'Gyrocopter', 'agi', 'Carry'],
  ['alchemist', 'Alchemist', 'str', 'Carry'], ['invoker', 'Invoker', 'all', 'Carry'],
  ['silencer', 'Silencer', 'int', 'Support'], ['obsidian_destroyer', 'Outworld Destroyer', 'int', 'Carry'],
  ['lycan', 'Lycan', 'all', 'Carry'], ['brewmaster', 'Brewmaster', 'all', 'Initiator'],
  ['shadow_demon', 'Shadow Demon', 'int', 'Support'], ['lone_druid', 'Lone Druid', 'all', 'Carry'],
  ['chaos_knight', 'Chaos Knight', 'str', 'Carry'], ['meepo', 'Meepo', 'agi', 'Carry'],
  ['treant', 'Treant Protector', 'str', 'Support'], ['ogre_magi', 'Ogre Magi', 'str', 'Support'],
  ['undying', 'Undying', 'str', 'Support'], ['rubick', 'Rubick', 'int', 'Support'],
  ['disruptor', 'Disruptor', 'int', 'Support'], ['nyx_assassin', 'Nyx Assassin', 'all', 'Disabler'],
  ['naga_siren', 'Naga Siren', 'agi', 'Carry'], ['keeper_of_the_light', 'Keeper of the Light', 'int', 'Support'],
  ['wisp', 'Io', 'all', 'Support'], ['visage', 'Visage', 'all', 'Carry'],
  ['slark', 'Slark', 'agi', 'Carry'], ['medusa', 'Medusa', 'agi', 'Carry'],
  ['troll_warlord', 'Troll Warlord', 'agi', 'Carry'], ['centaur', 'Centaur Warrunner', 'str', 'Initiator'],
  ['magnataur', 'Magnus', 'all', 'Initiator'], ['shredder', 'Timbersaw', 'str', 'Carry'],
  ['bristleback', 'Bristleback', 'str', 'Carry'], ['tusk', 'Tusk', 'str', 'Initiator'],
  ['skywrath_mage', 'Skywrath Mage', 'int', 'Support'], ['abaddon', 'Abaddon', 'all', 'Support'],
  ['elder_titan', 'Elder Titan', 'str', 'Initiator'], ['legion_commander', 'Legion Commander', 'str', 'Initiator'],
  ['techies', 'Techies', 'all', 'Support'], ['ember_spirit', 'Ember Spirit', 'agi', 'Carry'],
  ['earth_spirit', 'Earth Spirit', 'str', 'Initiator'], ['abyssal_underlord', 'Underlord', 'str', 'Support'],
  ['terrorblade', 'Terrorblade', 'agi', 'Carry'], ['phoenix', 'Phoenix', 'all', 'Support'],
  ['oracle', 'Oracle', 'int', 'Support'], ['winter_wyvern', 'Winter Wyvern', 'all', 'Support'],
  ['arc_warden', 'Arc Warden', 'agi', 'Carry'], ['monkey_king', 'Monkey King', 'agi', 'Carry'],
  ['pangolier', 'Pangolier', 'all', 'Initiator'], ['dark_willow', 'Dark Willow', 'all', 'Support'],
  ['grimstroke', 'Grimstroke', 'int', 'Support'], ['hoodwink', 'Hoodwink', 'agi', 'Support'],
  ['void_spirit', 'Void Spirit', 'all', 'Carry'], ['snapfire', 'Snapfire', 'all', 'Support'],
  ['mars', 'Mars', 'str', 'Initiator'], ['dawnbreaker', 'Dawnbreaker', 'str', 'Carry'],
  ['marci', 'Marci', 'all', 'Support'], ['primal_beast', 'Primal Beast', 'str', 'Initiator'],
  ['muerta', 'Muerta', 'int', 'Carry'], ['ringmaster', 'Ringmaster', 'int', 'Support'],
  ['kez', 'Kez', 'agi', 'Carry'],
] as const

function imageUrl(name: string) {
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${name}.png`
}

export const fallbackHeroes: Hero[] = fallbackNames.map(([name, localizedName, attr, role], index) => ({
  id: index + 1,
  name: `npc_dota_hero_${name}`,
  localizedName,
  primaryAttr: attr,
  attackType: ['Support', 'Nuker'].includes(role) ? 'Ranged' : 'Melee',
  roles: role === 'Support' ? ['Support', 'Disabler'] : [role],
  image: imageUrl(name),
  icon: imageUrl(name),
  proPick: 0,
  proBan: 0,
  proWin: 0,
}))

export async function loadHeroes(): Promise<{ heroes: Hero[]; source: DataSource }> {
  try {
    const response = await fetch('/api/heroes')
    if (!response.ok) throw new Error('OpenDota unavailable')
    const data = apiHeroes(await response.json() as ApiHero[] | { heroes?: ApiHero[] })
    return {
      source: dataSource(response),
      heroes: mapHeroes(data),
    }
  } catch {
    try {
      const response = await fetch('/data/heroes.json')
      if (!response.ok) throw new Error('Bundled hero data unavailable')
      const data = apiHeroes(await response.json() as ApiHero[] | { heroes?: ApiHero[] })
      return {
        source: 'bundled',
        heroes: mapHeroes(data),
      }
    } catch {
      return { heroes: fallbackHeroes, source: 'bundled' }
    }
  }
}
