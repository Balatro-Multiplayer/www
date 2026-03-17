import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { env } from '@/env'
import { detectFirstShopOverspends } from '@/lib/log-cheat-flags'
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
    const cheatFlags = detectFirstShopOverspends(parsedGames)
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
        .sendFirstShopOverspendWarning({
          log_file_id: logFileId,
          log_url: logUrl,
          flags: cheatFlags.map((flag) => ({
            game_index: flag.gameIndex,
            deck: flag.deck,
            game_mode: flag.gameMode,
            threshold: flag.threshold,
            offenders: flag.offenders.map((offender) => ({
              player_name: offender.playerName,
              amount: offender.amount,
              role: offender.role,
            })),
            start_date: flag.startDate,
          })),
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
