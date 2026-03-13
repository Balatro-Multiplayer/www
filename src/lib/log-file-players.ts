type ParsedGameLike = {
  guest?: unknown
  host?: unknown
}

export function extractLogFilePlayers(parsedGames: unknown) {
  if (!Array.isArray(parsedGames)) {
    return []
  }

  const seen = new Set<string>()
  const players: Array<{ playerName: string; playerNameLower: string }> = []

  for (const game of parsedGames) {
    if (!game || typeof game !== 'object') {
      continue
    }

    const { host, guest } = game as ParsedGameLike

    for (const value of [host, guest]) {
      if (typeof value !== 'string') {
        continue
      }

      const playerName = value.trim()
      if (!playerName) {
        continue
      }

      const playerNameLower = playerName.toLowerCase()
      if (seen.has(playerNameLower)) {
        continue
      }

      seen.add(playerNameLower)
      players.push({ playerName, playerNameLower })
    }
  }

  return players
}
