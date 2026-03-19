import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { env } from '@/env'
import { detectCheatFlags } from '@/lib/log-cheat-flags'
import {
  extractGameRows,
  extractLogConnectionIds,
  extractLogFilePlayers,
  extractLogLobbyCodes,
  extractLogOwnerConnectionIds,
} from '@/lib/log-file-players'
import { auth } from '@/server/auth'
import { db } from '@/server/db'
import {
  games,
  logFileConnections,
  logFileLobbyCodes,
  logFileOwnerConnections,
  logFilePlayers,
  logFiles,
} from '@/server/db/schema'
import { uploadFile } from '@/server/minio'
import { botlatro_service } from '@/server/services/botlatro.service'

function getSiteBaseUrl() {
  if (env.NODE_ENV === 'production') return 'https://balatromp.com'
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`

  return `http://localhost:${env.PORT ?? 3000}`
}

function formatCurrency(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2)
}

function formatWarningDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return `<t:${Math.floor(date.getTime() / 1000)}:F>`
}

const DECK_NAMES: Record<string, string> = {
  abandoned: 'Abandoned Deck',
  anaglyph: 'Anaglyph Deck',
  black: 'Black Deck',
  blue: 'Blue Deck',
  checkered: 'Checkered Deck',
  cocktail: 'Cocktail Deck',
  echo: 'Echo Deck',
  echodeck: 'Echo Deck',
  erratic: 'Erratic Deck',
  ghost: 'Ghost Deck',
  gradient: 'Gradient Deck',
  green: 'Green Deck',
  heidelberg: 'Heidelberg Deck',
  indigo: 'Indigo Deck',
  magic: 'Magic Deck',
  nebula: 'Nebula Deck',
  orange: 'Orange Deck',
  oracle: 'Oracle Deck',
  painted: 'Painted Deck',
  plasma: 'Plasma Deck',
  red: 'Red Deck',
  violet: 'Violet Deck',
  white: 'White Deck',
  yellow: 'Yellow Deck',
  zodiac: 'Zodiac Deck',
}

const RULESET_NAMES: Record<string, string> = {
  badlatro: 'Badlatro',
  blitz: 'Standard',
  legacyranked: 'Legacy Ranked',
  legacy_ranked: 'Legacy Ranked',
  majorleague: 'Major League',
  minorleague: 'Minor League',
  sandbox: 'Sandbox: Extra Credit',
  smallworld: 'Small World',
  speedlatro: 'Speedlatro',
  standardranked: 'Standard Ranked',
  standard_ranked: 'Standard Ranked',
  traditional: 'Traditional',
  vanilla: 'Vanilla',
  weekly: 'Weekly',
}

function normalizeLookupKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^ruleset_mp_/, '')
    .replace(/^b_mp_/, '')
    .replace(/^b_/, '')
    .replace(/ deck$/i, '')
    .replace(/[^a-z0-9_]+/g, '')
}

function formatDeckName(deck: string) {
  const normalizedKey = normalizeLookupKey(deck)
  if (DECK_NAMES[normalizedKey]) {
    return DECK_NAMES[normalizedKey]
  }

  if (/deck$/i.test(deck)) {
    return deck
  }

  return `${deck} Deck`
}

function formatRulesetName(gameMode: string) {
  const normalizedKey = normalizeLookupKey(gameMode)
  return RULESET_NAMES[normalizedKey] ?? gameMode
}

function formatCheatFlagDetails(
  flag: ReturnType<typeof detectCheatFlags>[number],
  issueNumber: number
) {
  if (flag.type === 'first_round_overearn') {
    return [
      `- Issue ${issueNumber}: first-round over-earn`,
      `  Blind: ${flag.blindName}`,
      `  Player: ${flag.playerName} earned $${formatCurrency(flag.actualEarned)} before first shop (max $${formatCurrency(flag.expectedEarned)})`,
      `  Total money: $${formatCurrency(flag.actualMoney)} (max $${formatCurrency(flag.expectedMoney)})`,
    ]
  }

  return [
    `- Issue ${issueNumber}: first-shop overspend`,
    `  Threshold: $${formatCurrency(flag.threshold)}`,
    ...flag.offenders.map(
      (offender) =>
        `  ${offender.playerName}: spent $${formatCurrency(offender.amount)}`
    ),
  ]
}

function formatGroupedCheatWarningLines(
  flags: ReturnType<typeof detectCheatFlags>,
  logUrl: string
) {
  const groupedFlags = new Map<number, ReturnType<typeof detectCheatFlags>>()

  for (const flag of flags) {
    const existing = groupedFlags.get(flag.gameIndex)
    if (existing) {
      existing.push(flag)
      continue
    }

    groupedFlags.set(flag.gameIndex, [flag])
  }

  const lines: string[] = []

  for (const [index, gameFlags] of [...groupedFlags.entries()].sort(
    ([left], [right]) => left - right
  )) {
    const firstFlag = gameFlags[0]
    if (!firstFlag) {
      continue
    }

    if (lines.length > 0) {
      lines.push('---')
    }

    const gameUrl = new URL(logUrl)
    gameUrl.searchParams.set('game', index.toString())

    lines.push(`**Game ${index + 1}**`)
    lines.push(`- Deck: ${formatDeckName(firstFlag.deck)}`)
    lines.push(`- Ruleset: ${formatRulesetName(firstFlag.gameMode)}`)
    lines.push(`- Stake: ${firstFlag.stake}`)

    if (firstFlag.startDate) {
      lines.push(`- Start: ${formatWarningDate(firstFlag.startDate)}`)
    }

    for (const [issueIndex, flag] of gameFlags.entries()) {
      if (issueIndex > 0) {
        lines.push('  -----')
      }
      lines.push(...formatCheatFlagDetails(flag, issueIndex + 1))
    }

    lines.push(`- View: ${gameUrl.toString()}`)
  }

  return lines
}

export async function POST(req: NextRequest) {
  try {
    // Check if user is authenticated (optional)
    const session = await auth()
    const userId = session?.user?.id

    // Parse the multipart form data
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Convert the file to a buffer and text
    const buffer = Buffer.from(await file.arrayBuffer())
    const _fileContent = await file.text()

    // Upload the file to MinIO
    const fileUrl = await uploadFile(buffer, file.name, file.type)

    // Store the information in the database with an empty JSON object for now
    // The actual parsed games will be updated via PUT request
    const [logFile] = await db
      .insert(logFiles)
      .values({
        userId,
        fileName: file.name,
        fileUrl,
        parsedJson: {},
      })
      .returning()
    if (!logFile) {
      return NextResponse.json(
        { error: 'This should never happen, hopefully' },
        { status: 500 }
      )
    }
    // Return the log file information
    return NextResponse.json({
      id: logFile.id,
      fileName: logFile.fileName,
      fileUrl: logFile.fileUrl,
      createdAt: logFile.createdAt,
      userId,
      userName: session?.user?.name ?? null,
      userEmail: session?.user?.email ?? null,
    })
  } catch (error) {
    console.error('Error uploading log file:', error)
    return NextResponse.json(
      { error: 'Failed to upload log file' },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  try {
    // Check if user is authenticated (optional)
    const _session = await auth()

    // Parse the JSON data
    const data = await req.json()
    const { logFileId, parsedGames } = data

    if (!logFileId) {
      return NextResponse.json(
        { error: 'No log file ID provided' },
        { status: 400 }
      )
    }

    if (!parsedGames || !Array.isArray(parsedGames)) {
      return NextResponse.json(
        { error: 'Invalid parsed games data' },
        { status: 400 }
      )
    }

    const players = extractLogFilePlayers(parsedGames)
    const allConnectionIds = extractLogConnectionIds(parsedGames)
    const connectionIds = extractLogOwnerConnectionIds(parsedGames)
    const lobbyCodes = extractLogLobbyCodes(parsedGames)
    const gameRows = extractGameRows(parsedGames, logFileId)
    const cheatFlags = detectCheatFlags(parsedGames)
    const existingLogFile = await db.query.logFiles.findFirst({
      columns: {
        parsedJson: true,
      },
      where: eq(logFiles.id, logFileId),
    })
    const shouldSendCheatWarning =
      cheatFlags.length > 0 && !Array.isArray(existingLogFile?.parsedJson)

    await db.transaction(async (tx) => {
      await tx
        .update(logFiles)
        .set({
          parsedJson: parsedGames,
        })
        .where(eq(logFiles.id, logFileId))

      await tx
        .delete(logFilePlayers)
        .where(eq(logFilePlayers.logFileId, logFileId))

      await tx
        .delete(logFileConnections)
        .where(eq(logFileConnections.logFileId, logFileId))

      await tx
        .delete(logFileLobbyCodes)
        .where(eq(logFileLobbyCodes.logFileId, logFileId))

      await tx
        .delete(logFileOwnerConnections)
        .where(eq(logFileOwnerConnections.logFileId, logFileId))

      await tx.delete(games).where(eq(games.logFileId, logFileId))

      if (players.length > 0) {
        await tx.insert(logFilePlayers).values(
          players.map((player) => ({
            logFileId,
            playerName: player.playerName,
            playerNameLower: player.playerNameLower,
          }))
        )
      }

      if (connectionIds.length > 0) {
        await tx.insert(logFileOwnerConnections).values(
          connectionIds.map((connectionId) => ({
            logFileId,
            connectionId,
            connectionIdLower: connectionId.toLowerCase(),
          }))
        )
      }

      if (allConnectionIds.length > 0) {
        await tx.insert(logFileConnections).values(
          allConnectionIds.map((connectionId) => ({
            logFileId,
            connectionId,
            connectionIdLower: connectionId.toLowerCase(),
          }))
        )
      }

      if (lobbyCodes.length > 0) {
        await tx.insert(logFileLobbyCodes).values(
          lobbyCodes.map((lobbyCode) => ({
            logFileId,
            lobbyCode,
            lobbyCodeLower: lobbyCode.toLowerCase(),
          }))
        )
      }

      if (gameRows.length > 0) {
        await tx.insert(games).values(gameRows)
      }
    })

    if (shouldSendCheatWarning) {
      const logUrl = `${getSiteBaseUrl()}/log-parser?logId=${logFileId}`

      botlatro_service
        .sendWarning({
          title: `Warning: suspicious early economy detected in uploaded log #${logFileId}`,
          lines: [`Log: ${logUrl}`, ...formatGroupedCheatWarningLines(cheatFlags, logUrl)],
        })
        .catch((error) => {
          console.error(
            `Failed to send cheat warning for log ${logFileId}:`,
            error
          )
        })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating parsed games:', error)
    return NextResponse.json(
      { error: 'Failed to update parsed games' },
      { status: 500 }
    )
  }
}
