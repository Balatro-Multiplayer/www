export const RANK_IMAGES = {
  foil: '/ranks/foil.png',
  glass: '/ranks/glass2.png',
  gold: '/ranks/gold.png',
  holographic: '/ranks/holo.png',
  lucky: '/ranks/lucky.png',
  negative: '/ranks/negative.png',
  polychrome: '/ranks/poly.png',
  steel: '/ranks/steel.png',
  stone: '/ranks/stone.png',
  pebble: '/ranks/pebble.png',
  ferrite: '/ranks/ferrite.png',
  pyrite: '/ranks/pyrite.png',
  jade: '/ranks/jade.png',
  crystal: '/ranks/crystal.png',
  milk: '/ranks/milk.png',
  strawberry: '/ranks/strawberry.png',
  chocolate: '/ranks/chocolate.png',
  mint: '/ranks/mint.png',
  bubblegum: '/ranks/bubblegum.png',
}

export const EDITION_THRESHOLD = {
  FOIL: 50,
  HOLOGRAPHIC: 10,
  POLYCHROME: 3,
  NEGATIVE: 1,
  ANTIMATTER: 1,
}

type ThresholdSet = {
  enhancement: { STEEL: number; GOLD: number; LUCKY: number; GLASS: number }
  smallworld: {
    PEBBLE: number
    FERRITE: number
    PYRITE: number
    JADE: number
    CRYSTAL: number
  }
  legacy: {
    MILK: number
    STRAWBERRY: number
    CHOCOLATE: number
    MINT: number
    BUBBLEGUM: number
  }
}

// Thresholds used for seasons 1-6 (before the +300 rank bump).
const OLD_THRESHOLDS: ThresholdSet = {
  enhancement: { STEEL: 230, GOLD: 320, LUCKY: 460, GLASS: 620 },
  smallworld: { PEBBLE: 0, FERRITE: 225, PYRITE: 325, JADE: 425, CRYSTAL: 550 },
  legacy: {
    MILK: 0,
    STRAWBERRY: 225,
    CHOCOLATE: 325,
    MINT: 425,
    BUBBLEGUM: 550,
  },
}

// Current thresholds (season 7 onward, +300 bump). Used as the default for any
// season not explicitly mapped below — including future seasons.
const NEW_THRESHOLDS: ThresholdSet = {
  enhancement: { STEEL: 530, GOLD: 620, LUCKY: 760, GLASS: 920 },
  smallworld: { PEBBLE: 0, FERRITE: 525, PYRITE: 625, JADE: 725, CRYSTAL: 850 },
  legacy: {
    MILK: 0,
    STRAWBERRY: 525,
    CHOCOLATE: 625,
    MINT: 725,
    BUBBLEGUM: 850,
  },
}

const DEFAULT_THRESHOLDS = NEW_THRESHOLDS

// Season number -> threshold set. Any season not listed (undefined season, or a
// newer season than we've mapped) falls back to DEFAULT_THRESHOLDS.
const SEASON_THRESHOLDS: Record<number, ThresholdSet> = {
  1: OLD_THRESHOLDS,
  2: OLD_THRESHOLDS,
  3: OLD_THRESHOLDS,
  4: OLD_THRESHOLDS,
  5: OLD_THRESHOLDS,
  6: OLD_THRESHOLDS,
}

function resolveSeasonNumber(season?: string | number): number | undefined {
  if (season === undefined || season === null) return undefined
  if (typeof season === 'number') {
    return Number.isInteger(season) ? season : undefined
  }
  const match = /^season(\d+)$/.exec(season)
  return match ? Number(match[1]) : undefined
}

export function getThresholdsForSeason(season?: string | number): ThresholdSet {
  const seasonNumber = resolveSeasonNumber(season)
  if (seasonNumber === undefined) return DEFAULT_THRESHOLDS
  return SEASON_THRESHOLDS[seasonNumber] ?? DEFAULT_THRESHOLDS
}

export const getRankData = (
  mmr: number,
  queueType?: string,
  season?: string | number
) => {
  const thresholds = getThresholdsForSeason(season)
  const ENHANCEMENT_THRESHOLD = thresholds.enhancement
  const SMALLWORLD_THRESHOLD = thresholds.smallworld
  const LEGACY_THRESHOLD = thresholds.legacy

  if (queueType === 'vanilla') {
    return null
  }

  if (queueType === 'legacy') {
    let enhancement = RANK_IMAGES.milk
    let tooltip = 'Milk'
    if (mmr >= LEGACY_THRESHOLD.STRAWBERRY) {
      enhancement = RANK_IMAGES.strawberry
      tooltip = 'Strawberry'
    }
    if (mmr >= LEGACY_THRESHOLD.CHOCOLATE) {
      enhancement = RANK_IMAGES.chocolate
      tooltip = 'Chocolate'
    }
    if (mmr >= LEGACY_THRESHOLD.MINT) {
      enhancement = RANK_IMAGES.mint
      tooltip = 'Mint'
    }
    if (mmr >= LEGACY_THRESHOLD.BUBBLEGUM) {
      enhancement = RANK_IMAGES.bubblegum
      tooltip = 'Bubblegum'
    }
    return { enhancement, tooltip }
  }

  if (queueType === 'smallworld') {
    let enhancement = RANK_IMAGES.pebble
    let tooltip = 'Pebble'
    if (mmr >= SMALLWORLD_THRESHOLD.FERRITE) {
      enhancement = RANK_IMAGES.ferrite
      tooltip = 'Ferrite'
    }
    if (mmr >= SMALLWORLD_THRESHOLD.PYRITE) {
      enhancement = RANK_IMAGES.pyrite
      tooltip = 'Pyrite'
    }
    if (mmr >= SMALLWORLD_THRESHOLD.JADE) {
      enhancement = RANK_IMAGES.jade
      tooltip = 'Jade'
    }
    if (mmr >= SMALLWORLD_THRESHOLD.CRYSTAL) {
      enhancement = RANK_IMAGES.crystal
      tooltip = 'Crystal'
    }
    return { enhancement, tooltip }
  }

  let enhancement = RANK_IMAGES.stone
  let tooltip = 'Stone'
  if (mmr >= ENHANCEMENT_THRESHOLD.STEEL) {
    enhancement = RANK_IMAGES.steel
    tooltip = 'Steel'
  }
  if (mmr >= ENHANCEMENT_THRESHOLD.GOLD) {
    enhancement = RANK_IMAGES.gold
    tooltip = 'Gold'
  }
  if (mmr >= ENHANCEMENT_THRESHOLD.LUCKY) {
    enhancement = RANK_IMAGES.lucky
    tooltip = 'Lucky'
  }
  if (mmr >= ENHANCEMENT_THRESHOLD.GLASS) {
    enhancement = RANK_IMAGES.glass
    tooltip = 'Glass'
  }
  return { enhancement, tooltip }
}
