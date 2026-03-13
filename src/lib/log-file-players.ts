type ParsedGameLike = {
  guest?: unknown
  host?: unknown
  guestMods?: unknown
  hostMods?: unknown
  isHost?: unknown
  logOwnerName?: unknown
}

function collectUniqueNames(
  parsedGames: unknown,
  selector: (game: ParsedGameLike) => unknown | unknown[],
  options?: { skip?: string[] }
) {
  if (!Array.isArray(parsedGames)) {
    return []
  }

  const skip = new Set(
    (options?.skip ?? []).map((value) => value.toLowerCase())
  )
  const seen = new Set<string>()
  const names: string[] = []

  for (const game of parsedGames) {
    if (!game || typeof game !== 'object') {
      continue
    }

    const values = selector(game as ParsedGameLike)

    for (const value of Array.isArray(values) ? values : [values]) {
      if (typeof value !== 'string') {
        continue
      }

      const name = value.trim()
      if (!name) {
        continue
      }

      const normalizedName = name.toLowerCase()
      if (skip.has(normalizedName) || seen.has(normalizedName)) {
        continue
      }

      seen.add(normalizedName)
      names.push(name)
    }
  }

  return names
}

export function extractLogFilePlayers(parsedGames: unknown) {
  return collectUniqueNames(parsedGames, (game) => [game.host, game.guest]).map(
    (playerName) => ({
      playerName,
      playerNameLower: playerName.toLowerCase(),
    })
  )
}

export function extractLogOwnerNames(parsedGames: unknown) {
  return collectUniqueNames(parsedGames, (game) => game.logOwnerName, {
    skip: ['Host', 'Guest'],
  })
}

function getModsForLogOwner(game: ParsedGameLike) {
  const logOwnerName =
    typeof game.logOwnerName === 'string' ? game.logOwnerName.trim() : null
  const host = typeof game.host === 'string' ? game.host.trim() : null
  const guest = typeof game.guest === 'string' ? game.guest.trim() : null

  const ownerIsHost =
    typeof game.isHost === 'boolean'
      ? game.isHost
      : logOwnerName && host && logOwnerName === host
        ? true
        : logOwnerName && guest && logOwnerName === guest
          ? false
          : null

  if (ownerIsHost === true) {
    return Array.isArray(game.hostMods) ? game.hostMods : []
  }

  if (ownerIsHost === false) {
    return Array.isArray(game.guestMods) ? game.guestMods : []
  }

  return []
}

function extractConnectionIdsFromMods(mods: unknown) {
  if (!Array.isArray(mods)) {
    return []
  }

  const seen = new Set<string>()
  const connectionIds: string[] = []

  for (const modEntry of mods) {
    if (typeof modEntry !== 'string') {
      continue
    }

    const match = modEntry.match(/^serversideConnectionID=(.+)$/i)
    if (!match?.[1]) {
      continue
    }

    const connectionId = match[1].trim()
    if (!connectionId) {
      continue
    }

    const normalizedConnectionId = connectionId.toLowerCase()
    if (seen.has(normalizedConnectionId)) {
      continue
    }

    seen.add(normalizedConnectionId)
    connectionIds.push(connectionId)
  }

  return connectionIds
}

export function extractLogConnectionIds(parsedGames: unknown) {
  if (!Array.isArray(parsedGames)) {
    return []
  }

  const seen = new Set<string>()
  const connectionIds: string[] = []

  for (const game of parsedGames) {
    if (!game || typeof game !== 'object') {
      continue
    }

    const parsedGame = game as ParsedGameLike
    const ids = [
      ...extractConnectionIdsFromMods(parsedGame.hostMods),
      ...extractConnectionIdsFromMods(parsedGame.guestMods),
    ]

    for (const connectionId of ids) {
      const normalizedConnectionId = connectionId.toLowerCase()
      if (seen.has(normalizedConnectionId)) {
        continue
      }

      seen.add(normalizedConnectionId)
      connectionIds.push(connectionId)
    }
  }

  return connectionIds
}

export function extractLogOwnerConnectionIds(parsedGames: unknown) {
  if (!Array.isArray(parsedGames)) {
    return []
  }

  const seen = new Set<string>()
  const connectionIds: string[] = []

  for (const game of parsedGames) {
    if (!game || typeof game !== 'object') {
      continue
    }

    for (const connectionId of extractConnectionIdsFromMods(
      getModsForLogOwner(game as ParsedGameLike)
    )) {
      const normalizedConnectionId = connectionId.toLowerCase()
      if (seen.has(normalizedConnectionId)) {
        continue
      }

      seen.add(normalizedConnectionId)
      connectionIds.push(connectionId)
    }
  }

  return connectionIds
}
