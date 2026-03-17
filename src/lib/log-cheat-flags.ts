type ParsedGameLike = {
  deck?: unknown
  gameIndex?: unknown
  logOwnerName?: unknown
  moneySpentPerShop?: unknown
  moneySpentPerShopOpponent?: unknown
  options?: unknown
  opponentName?: unknown
  ruleset?: unknown
  startDate?: unknown
}

export type FirstShopOverspendFlag = {
  gameIndex: number
  deck: string
  gameMode: string
  threshold: number
  offenders: Array<{
    playerName: string
    amount: number
    role: 'logOwner' | 'opponent'
  }>
  startDate: string | null
}

const DEFAULT_THRESHOLD = 20
const YELLOW_DECK_THRESHOLD = 30

function normalizeString(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized ? normalized : null
}

function normalizeDeck(value: unknown) {
  const deck = normalizeString(value)
  if (!deck) {
    return 'Unknown'
  }

  return deck.replace(/deck$/i, '').trim() || deck
}

function normalizeGameMode(value: unknown) {
  const mode = normalizeString(value)
  return mode ?? 'Unknown'
}

function normalizeSpend(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

function isYellowDeck(deck: string) {
  return deck.trim().toLowerCase() === 'yellow'
}

export function detectFirstShopOverspends(parsedGames: unknown) {
  if (!Array.isArray(parsedGames)) {
    return [] as FirstShopOverspendFlag[]
  }

  return parsedGames.flatMap((game, index) => {
    if (!game || typeof game !== 'object') {
      return []
    }

    const parsedGame = game as ParsedGameLike
    const options =
      parsedGame.options && typeof parsedGame.options === 'object'
        ? (parsedGame.options as { ruleset?: unknown })
        : null
    const deck = normalizeDeck(parsedGame.deck)
    const gameMode = normalizeGameMode(parsedGame.ruleset ?? options?.ruleset)
    const threshold = isYellowDeck(deck)
      ? YELLOW_DECK_THRESHOLD
      : DEFAULT_THRESHOLD
    const logOwnerSpend = Array.isArray(parsedGame.moneySpentPerShop)
      ? normalizeSpend(parsedGame.moneySpentPerShop[0])
      : null
    const opponentSpend = Array.isArray(parsedGame.moneySpentPerShopOpponent)
      ? normalizeSpend(parsedGame.moneySpentPerShopOpponent[0])
      : null

    const offenders = [
      logOwnerSpend !== null && logOwnerSpend > threshold
        ? {
            playerName:
              normalizeString(parsedGame.logOwnerName) ?? 'Unknown player',
            amount: logOwnerSpend,
            role: 'logOwner' as const,
          }
        : null,
      opponentSpend !== null && opponentSpend > threshold
        ? {
            playerName:
              normalizeString(parsedGame.opponentName) ?? 'Unknown player',
            amount: opponentSpend,
            role: 'opponent' as const,
          }
        : null,
    ].filter((value) => value !== null)

    if (offenders.length === 0) {
      return []
    }

    const startDate =
      typeof parsedGame.startDate === 'string'
        ? new Date(parsedGame.startDate)
        : parsedGame.startDate instanceof Date
          ? parsedGame.startDate
          : null

    return [
      {
        gameIndex:
          typeof parsedGame.gameIndex === 'number' &&
          Number.isInteger(parsedGame.gameIndex)
            ? parsedGame.gameIndex
            : index,
        deck,
        gameMode,
        threshold,
        offenders,
        startDate:
          startDate && !Number.isNaN(startDate.getTime())
            ? startDate.toISOString()
            : null,
      },
    ]
  })
}
