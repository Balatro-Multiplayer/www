'use client'

import { LuaToJsonConverter } from '@/app/(home)/log-parser/lua-parser'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dropzone,
  DropzoneDescription,
  DropzoneGroup,
  DropzoneInput,
  DropzoneTitle,
  DropzoneUploadIcon,
  DropzoneZone,
} from '@/components/ui/dropzone'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { jokers } from '@/shared/jokers'
import { vouchers } from '@/shared/vouchers'
import { useFormatter } from 'next-intl'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { Fragment, useEffect, useState } from 'react'
import { type PvpBlind, PvpBlindsCard } from './_components/pvp-blinds'
// Define the structure for individual log events within a game
type LogEvent = {
  timestamp: Date
  text: string
  type: 'event' | 'status' | 'system' | 'shop' | 'action' | 'error' | 'info'
  img?: string
}
const STAKE = {
  1: 'White Stake',
  2: 'Red Stake',
  3: 'Green Stake',
  4: 'Black Stake',
  5: 'Blue Stake',
  6: 'Purple Stake',
  7: 'Orange Stake',
  8: 'Gold Stake',
}
const STAKE_IMG = {
  1: '/stakes/white_stake.png',
  2: '/stakes/red_stake.png',
  3: '/stakes/green_stake.png',
  4: '/stakes/black_stake.png',
  5: '/stakes/blue_stake.png',
  6: '/stakes/purple_stake.png',
  7: '/stakes/orange_stake.png',
  8: '/stakes/gold_stake.png',
}
// PVP blind types (PvpBlind and HandScore) are now imported from the PvpBlindsCard component

// Define the structure for game options parsed from lobbyOptions
type GameOptions = {
  back?: string | null // Deck
  custom_seed?: string | null
  ruleset?: string | null
  different_decks?: boolean | null
  different_seeds?: boolean | null
  death_on_round_loss?: boolean | null
  gold_on_life_loss?: boolean | null
  no_gold_on_round_loss?: boolean | null
  starting_lives?: number | null
  stake?: number | null
}

type Game = {
  id: number // Simple identifier for keys
  host: string | null
  guest: string | null
  logOwnerName: string | null // Name of the player whose log this is for this game
  opponentName: string | null // Name of the opponent relative to the log owner
  hostMods: string[]
  guestMods: string[]
  isHost: boolean | null // Log owner's role in lobby creation
  deck: string | null
  seed: string | null
  options: GameOptions | null
  moneyGained: number // Log owner's gains
  moneySpent: number // Log owner's spending
  opponentMoneySpent: number // Opponent's reported spending (from got message)
  startDate: Date
  endDate: Date | null
  durationSeconds: number | null
  opponentLastLives: number // Opponent's last known lives (from enemyInfo)
  opponentLastSkips: number // Opponent's last known skip count (from enemyInfo)
  moneySpentPerShop: (number | null)[] // Log owner's spending/skips per shop
  moneySpentPerShopOpponent: (number | null)[] // Opponent's spending/skips per shop
  logOwnerFinalJokers: string[] // Log owner's final jokers
  opponentFinalJokers: string[] // Opponent's final jokers
  events: LogEvent[]
  rerolls: number // Log owner's reroll count
  rerollCostTotal: number // Log owner's total reroll cost
  logOwnerVouchers: string[] // Log owner's vouchers
  opponentRerolls: number // Opponent's reroll count
  opponentRerollCostTotal: number // Opponent's total reroll cost
  opponentVouchers: string[] // Opponent's vouchers
  winner: 'logOwner' | 'opponent' | null // Who won the game
  pvpBlinds: PvpBlind[] // PVP blind data
  currentPvpBlind: number | null // Current PVP blind number
}

// Helper to initialize a new game object
const initGame = (id: number, startDate: Date): Game => ({
  id,
  host: null,
  guest: null,
  logOwnerName: null, // Initialize
  opponentName: null, // Initialize
  hostMods: [],
  guestMods: [],
  isHost: null,
  deck: null,
  seed: null,
  options: null,
  moneyGained: 0,
  moneySpent: 0,
  opponentMoneySpent: 0,
  startDate,
  endDate: null,
  durationSeconds: null,
  opponentLastLives: 4,
  opponentLastSkips: 0,
  moneySpentPerShop: [],
  moneySpentPerShopOpponent: [],
  logOwnerFinalJokers: [],
  opponentFinalJokers: [],
  events: [],
  rerolls: 0,
  rerollCostTotal: 0,
  logOwnerVouchers: [],
  opponentRerolls: 0,
  opponentRerollCostTotal: 0,
  opponentVouchers: [],
  winner: null,
  pvpBlinds: [],
  currentPvpBlind: null,
})

// Helper to format duration
const formatDuration = (seconds: number | null): string => {
  if (seconds === null || seconds < 0) return 'N/A'
  if (seconds === 0) return '0s'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  const parts = []
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`)

  return parts.join(' ')
}

// Helper to convert boolean strings
function boolStrToText(str: string | boolean | undefined | null): string {
  if (str === null || str === undefined) return 'Unknown'
  if (typeof str === 'boolean') return str ? 'Yes' : 'No'
  const lower = str.toLowerCase()
  if (lower === 'true') return 'Yes'
  if (lower === 'false') return 'No'
  return str
}

// Helper function to convert date strings to Date objects recursively
function convertDates<T>(obj: T): T {
  if (!obj || typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => convertDates(item)) as unknown as T
  }

  const result = { ...obj } as any

  // Process each property
  for (const key in result) {
    const value = result[key]

    // Check if the value is a date string (ISO format)
    if (
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)
    ) {
      result[key] = new Date(value)
    }
    // Also handle date strings in the format used in the logs (YYYY-MM-DD HH:MM:SS)
    else if (
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value)
    ) {
      result[key] = new Date(value)
    }
    // Recursively process nested objects and arrays
    else if (value && typeof value === 'object') {
      result[key] = convertDates(value)
    }
  }

  return result
}

// Main component
export default function LogParser() {
  const formatter = useFormatter()
  const searchParams = useSearchParams()
  const [parsedGames, setParsedGames] = useState<Game[]>([])
  console.log(parsedGames)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Check for logId query parameter and load the parsed data if it exists
  useEffect(() => {
    const logId = searchParams.get('logId')
    const fileUrl = searchParams.get('fileUrl')

    if (logId) {
      // If logId is provided, fetch the parsed data from the database
      setIsLoading(true)
      setError(null)
      setParsedGames([])

      fetch(`/api/logs?id=${logId}`)
        .then((response) => {
          if (!response.ok) {
            throw new Error('Failed to fetch log file')
          }
          return response.json()
        })
        .then((data) => {
          // Use the parsed JSON data directly from the database
          if (data.parsedJson && Array.isArray(data.parsedJson)) {
            const parsedGamesWithDates = convertDates(data.parsedJson)
            setParsedGames(parsedGamesWithDates)
          } else {
            setError('No parsed games found in the log file.')
          }
          setIsLoading(false)
        })
        .catch((err) => {
          console.error('Error loading log file:', err)
          setError(`Failed to load log file: ${err.message}`)
          setIsLoading(false)
        })
    } else if (fileUrl) {
      // For backward compatibility, still support fileUrl
      // But this should be deprecated in favor of logId
      setIsLoading(true)
      setError(null)
      setParsedGames([])

      fetch(fileUrl)
        .then((response) => {
          if (!response.ok) {
            throw new Error('Failed to fetch log file')
          }
          return response.text()
        })
        .then((content) => {
          // Create a File object from the content
          const file = new File([content], 'log.txt', { type: 'text/plain' })
          // Parse the file
          parseLogFile(file, true)
        })
        .catch((err) => {
          console.error('Error loading log file:', err)
          setError(`Failed to load log file: ${err.message}`)
          setIsLoading(false)
        })
    }
  }, [searchParams])

  const parseLogFile = async (file: File, skipUpload?: boolean) => {
    setIsLoading(true)
    setError(null)
    setParsedGames([])
    let logFileId = null

    try {
      // Create a FormData object to send the file
      const formData = new FormData()
      formData.append('file', file)

      if (!skipUpload) {
        const response = await fetch('/api/logs/upload', {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to upload log file')
        }

        const responseData = await response.json()
        logFileId = responseData.id
      }
      // Upload the file to the server

      // Get the file content
      const content = await file.text()
      const logLines = content.split('\n')

      const games: Game[] = []
      let currentGame: Game | null = null
      let lastSeenLobbyOptions: GameOptions | null = null
      let gameCounter = 0

      const gameStartInfos = extractGameStartInfo(logLines)
      let gameInfoIndex = 0
      let lastProcessedTimestamp: Date | null = null
      for (const line of logLines) {
        if (!line.trim()) continue
        const timeMatch = line.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/)
        const timestamp = timeMatch?.[1] ? new Date(timeMatch[1]) : new Date()
        const lineLower = line.toLowerCase()
        const sentPayload = parseClientSentPayload(line)
        const sentAction = getPayloadString(sentPayload, 'action')
        lastProcessedTimestamp = timestamp
        // --- Game Lifecycle ---
        if (line.includes('Client got receiveEndGameJokers message')) {
          if (currentGame) {
            // Mark end date if not already set
            if (!currentGame.endDate) {
              currentGame.endDate = timestamp
            }
            // Extract Opponent Jokers
            const keysMatch = line.match(/\(keys: ([^)]+)\)/)
            if (keysMatch?.[1]) {
              const str = keysMatch?.[1]
              currentGame.opponentFinalJokers = await parseJokersFromString(str)
            }
            // Extract Seed (often found here)
            const seedMatch = line.match(/seed: ([A-Z0-9]+)/)
            if (!currentGame.seed && seedMatch?.[1]) {
              currentGame.seed = seedMatch[1]
            }
          }
          continue
        }
        if (line.includes('Client got nemesisEndGameStats message')) {
          if (currentGame) {
            // Extract Opponent Reroll Count
            const rerollCountMatch = line.match(/\(reroll_count: (\d+)\)/)
            if (rerollCountMatch?.[1]) {
              currentGame.opponentRerolls = Number.parseInt(
                rerollCountMatch[1],
                10
              )
            }

            // Extract Opponent Reroll Cost Total
            const rerollCostMatch = line.match(/\(reroll_cost_total: (\d+)\)/)
            if (rerollCostMatch?.[1]) {
              currentGame.opponentRerollCostTotal = Number.parseInt(
                rerollCostMatch[1],
                10
              )
            }

            // Extract Opponent Vouchers
            const vouchersMatch = line.match(/\(vouchers: ([^)]+)\)/)
            if (vouchersMatch?.[1]) {
              currentGame.opponentVouchers = vouchersMatch[1].split('-')
            }
          }
          continue
        }
        if (sentAction === 'receiveEndGameJokers') {
          if (currentGame) {
            // Mark end date if not already set (might happen slightly before 'got')
            if (!currentGame.endDate) {
              currentGame.endDate = timestamp
            }
            // Extract Log Owner Jokers
            const str = getPayloadString(sentPayload, 'keys')
            if (str) {
              currentGame.logOwnerFinalJokers = await parseJokersFromString(str)
            }
          }
          continue
        }
        if (sentAction === 'nemesisEndGameStats') {
          if (currentGame) {
            // Extract Log Owner Reroll Count
            const rerollCount = getPayloadNumber(sentPayload, 'reroll_count')
            if (rerollCount !== null) {
              currentGame.rerolls = rerollCount
            }

            // Extract Log Owner Reroll Cost Total
            const rerollCostTotal = getPayloadNumber(
              sentPayload,
              'reroll_cost_total'
            )
            if (rerollCostTotal !== null) {
              currentGame.rerollCostTotal = rerollCostTotal
            }

            // Extract Log Owner Vouchers
            const vouchers = getPayloadString(sentPayload, 'vouchers')
            if (vouchers) {
              currentGame.logOwnerVouchers = vouchers.split('-')
            }
          }
          continue
        }
        if (lineLower.includes('startgame message')) {
          if (currentGame) {
            if (!currentGame.endDate) currentGame.endDate = timestamp
            currentGame.durationSeconds = currentGame.endDate
              ? (currentGame.endDate.getTime() -
                  currentGame.startDate.getTime()) /
                1000
              : null
            games.push(currentGame)
          }

          gameCounter++
          currentGame = initGame(gameCounter, timestamp)
          const currentInfo =
            gameStartInfos[gameInfoIndex++] ?? ({} as GameStartInfo)

          // Assign host/guest first
          currentGame.host = currentInfo.lobbyInfo?.host ?? null
          currentGame.guest = currentInfo.lobbyInfo?.guest ?? null
          currentGame.hostMods = currentInfo.lobbyInfo?.hostHash ?? []
          currentGame.guestMods = currentInfo.lobbyInfo?.guestHash ?? []
          currentGame.isHost = currentInfo.lobbyInfo?.isHost ?? null // Log owner's role

          // *** Determine Log Owner and Opponent Names based on isHost ***
          if (currentGame.isHost !== null) {
            if (currentGame.isHost) {
              // Log owner was the host
              currentGame.logOwnerName = currentGame.host
              currentGame.opponentName = currentGame.guest
            } else {
              // Log owner was the guest
              currentGame.logOwnerName = currentGame.guest
              currentGame.opponentName = currentGame.host
            }
          }
          // Fallback if names are missing but role is known
          if (!currentGame.logOwnerName && currentGame.isHost !== null) {
            currentGame.logOwnerName = currentGame.isHost ? 'Host' : 'Guest'
          }
          if (!currentGame.opponentName && currentGame.isHost !== null) {
            currentGame.opponentName = currentGame.isHost ? 'Guest' : 'Host'
          }

          currentGame.options = lastSeenLobbyOptions
          currentGame.deck = lastSeenLobbyOptions?.back ?? null
          currentGame.seed = currentInfo.seed ?? null
          if (currentGame.options?.starting_lives) {
            currentGame.opponentLastLives = currentGame.options.starting_lives
          }

          currentGame.events.push({
            timestamp,
            text: `Game ${gameCounter} Started`,
            type: 'system',
          })
          continue
        }

        if (line.includes('Client got receiveEndGameJokers')) {
          if (currentGame && !currentGame.endDate) {
            currentGame.endDate = timestamp
            const seedMatch = line.match(/seed: ([A-Z0-9]+)/)
            if (!currentGame.seed && seedMatch?.[1]) {
              currentGame.seed = seedMatch[1]
            }
          }
          continue
        }

        // --- Lobby and Options Parsing ---
        if (lineLower.includes('lobbyoptions')) {
          const parsedSentOptions =
            sentAction === 'lobbyOptions' && sentPayload
              ? parseLobbyOptions(sentPayload)
              : null
          const optionsStr = parsedSentOptions
            ? null
            : line.includes('Client got lobbyOptions message:')
              ? line
                  .split(' Client got lobbyOptions message:  ')[1]
                  ?.trim()
                  ?.replaceAll('(', '')
                  ?.replaceAll(')', ',')
              : line.split(' Client sent message:')[1]?.trim()
          const parsedOptions = parsedSentOptions
            ? parsedSentOptions
            : optionsStr
              ? parseLobbyOptions(optionsStr)
              : null
          if (parsedOptions) {
            lastSeenLobbyOptions = parsedOptions
            if (currentGame && !currentGame.options) {
              currentGame.options = lastSeenLobbyOptions
              currentGame.deck = lastSeenLobbyOptions.back ?? currentGame.deck
              if (lastSeenLobbyOptions.starting_lives) {
                currentGame.opponentLastLives =
                  lastSeenLobbyOptions.starting_lives
              }
            }
          }
          continue
        }

        // --- In-Game Event Parsing (requires currentGame) ---
        if (!currentGame) continue

        // enemyInfo ALWAYS refers to the opponent from the log owner's perspective
        if (lineLower.includes('enemyinfo')) {
          // Parse opponent lives
          const livesMatch = line.match(/lives: *(\d+)/)
          if (livesMatch?.[1]) {
            const newLives = Number.parseInt(livesMatch[1], 10)
            if (
              !Number.isNaN(newLives) &&
              newLives < currentGame.opponentLastLives
            ) {
              currentGame.events.push({
                timestamp,
                text: `Opponent lost a life (${currentGame.opponentLastLives} -> ${newLives})`,
                type: 'event',
              })
            }
            currentGame.opponentLastLives = newLives
          }

          // Parse opponent skips
          const skipsMatch = line.match(/skips: *(\d+)/)
          if (skipsMatch?.[1]) {
            const newSkips = Number.parseInt(skipsMatch[1], 10)
            if (
              !Number.isNaN(newSkips) &&
              newSkips > currentGame.opponentLastSkips
            ) {
              const numSkipsOccurred = newSkips - currentGame.opponentLastSkips
              for (let i = 0; i < numSkipsOccurred; i++) {
                currentGame.moneySpentPerShopOpponent.push(null)
              }
              currentGame.events.push({
                timestamp,
                text: `Opponent skipped ${numSkipsOccurred} shop${numSkipsOccurred > 1 ? 's' : ''} (Total: ${newSkips})`,
                type: 'shop',
              })
              currentGame.opponentLastSkips = newSkips
            } else if (!Number.isNaN(newSkips)) {
              currentGame.opponentLastSkips = newSkips
            }
          }

          // Parse opponent score for PVP blind
          if (currentGame.currentPvpBlind !== null) {
            const scoreMatch = line.match(/score: *(\d+)/)
            const handsLeftMatch = line.match(/handsLeft: *(\d+)/)

            if (scoreMatch?.[1]) {
              const totalScore = Number.parseInt(scoreMatch[1], 10)
              const handsLeft = handsLeftMatch?.[1]
                ? Number.parseInt(handsLeftMatch[1], 10)
                : 0

              if (!Number.isNaN(totalScore)) {
                const currentBlindIndex = currentGame.currentPvpBlind - 1
                if (
                  currentBlindIndex >= 0 &&
                  currentBlindIndex < currentGame.pvpBlinds.length
                ) {
                  const currentBlind = currentGame.pvpBlinds[currentBlindIndex]
                  if (!currentBlind) {
                    continue
                  }
                  // Update opponent score in current blind
                  const gainedScore = totalScore - currentBlind.opponentScore
                  currentBlind.opponentScore = totalScore

                  // Add hand score
                  currentBlind.handScores.push({
                    timestamp,
                    gainedScore,
                    totalScore,
                    handsLeft,
                    isLogOwner: false,
                  })

                  // Add event for opponent score only if gainedScore > 0
                  if (gainedScore > 0) {
                    currentGame.events.push({
                      timestamp,
                      text: `Opponent scored: ${gainedScore} (Total: ${totalScore}, hands left: ${handsLeft})`,
                      type: 'event',
                    })
                  }
                }
              }
            }
          }

          continue
        }
        if (sentAction === 'soldCard') {
          const card = getPayloadString(sentPayload, 'card')
          if (card) {
            currentGame.events.push({
              timestamp,
              text: `Sold ${card}`,
              type: 'shop',
            })
          }
          continue
        }
        if (
          line.includes('Client got soldJoker message:  (action: soldJoker)')
        ) {
          currentGame.events.push({
            timestamp,
            text: 'Opponent sold a joker',
            type: 'shop',
          })
        }
        // This message indicates opponent's spending report
        if (line.includes(' Client got spentLastShop message')) {
          const match = line.match(/amount: (\d+)/)
          if (match?.[1]) {
            const amount = Number.parseInt(match[1], 10)
            if (!Number.isNaN(amount)) {
              currentGame.opponentMoneySpent += amount
              currentGame.moneySpentPerShopOpponent.push(amount)
              currentGame.events.push({
                timestamp,
                text: `Opponent spent $${amount} in shop`,
                type: 'shop',
              })
            }
          }
          continue
        }

        // This message indicates the log owner reporting their spending
        if (sentAction === 'spentLastShop') {
          const amount = getPayloadNumber(sentPayload, 'amount')
          if (amount !== null) {
            currentGame.moneySpentPerShop.push(amount)
            currentGame.events.push({
              timestamp,
              text: `Reported spending $${amount} last shop`,
              type: 'shop',
            })
          }
          continue
        }

        // This message indicates the log owner skipped
        if (sentAction === 'skip') {
          currentGame.moneySpentPerShop.push(null)
          currentGame.events.push({
            timestamp,
            text: 'Skipped shop',
            type: 'shop',
          })
          continue
        }

        // Detect win/lose game messages
        if (line.includes('Client got winGame message:  (action: winGame)')) {
          currentGame.winner = 'logOwner'
          currentGame.events.push({
            timestamp,
            text: 'You won the game!',
            type: 'system',
          })
          continue
        }

        if (line.includes('Client got loseGame message:  (action: loseGame)')) {
          currentGame.winner = 'opponent'
          currentGame.events.push({
            timestamp,
            text: 'You lost the game.',
            type: 'system',
          })
          continue
        }

        // Detect disconnect message
        if (
          line.includes(
            'Client got disconnected message:  (action: disconnected)'
          )
        ) {
          currentGame.events.push({
            timestamp,
            text: 'Log owner disconnected',
            type: 'system',
          })
          continue
        }

        // Parse endPvP messages to determine the winner of each blind
        if (line.includes('Client got endPvP message')) {
          if (currentGame.currentPvpBlind !== null) {
            const lostMatch = line.match(/lost: (true|false)/)
            if (lostMatch?.[1]) {
              const lost = lostMatch[1].toLowerCase() === 'true'
              const currentBlindIndex = currentGame.currentPvpBlind - 1

              if (
                currentBlindIndex >= 0 &&
                currentBlindIndex < currentGame.pvpBlinds.length
              ) {
                const currentBlind = currentGame.pvpBlinds[currentBlindIndex]
                if (!currentBlind) {
                  continue
                }
                // Set the winner
                currentBlind.winner = lost ? 'opponent' : 'logOwner'

                // Set the end timestamp
                currentBlind.endTimestamp = timestamp

                // Add event for blind end
                currentGame.events.push({
                  timestamp,
                  text: `Ended Blind #${currentBlind.blindNumber} - ${lost ? 'You lost' : 'You won'} (Your score: ${currentBlind.logOwnerScore}, Opponent score: ${currentBlind.opponentScore})`,
                  type: 'event',
                })

                // Reset current blind
                currentGame.currentPvpBlind = null
              }
            }
          }
          continue
        }

        // --- Log Owner Actions/Events (Client sent ...) ---
        if (lineLower.includes('client sent')) {
          // Log owner gained/spent money directly
          if (sentAction === 'moneyMoved') {
            const amount = getPayloadNumber(sentPayload, 'amount')
            if (amount !== null) {
              if (amount >= 0) {
                currentGame.moneyGained += amount
                currentGame.events.push({
                  timestamp,
                  text: `Gained $${amount}`,
                  type: 'event',
                })
              } else {
                const spent = Math.abs(amount)
                currentGame.moneySpent += spent
                currentGame.events.push({
                  timestamp,
                  text: `Spent $${spent}`,
                  type: 'event',
                })
              }
            }
          } else if (sentAction === 'boughtCardFromShop') {
            // Log owner bought card
            const cardRaw =
              getPayloadString(sentPayload, 'card') ?? 'Unknown Card'
            const cardClean = cardRaw.replace(/^(c_mp_|j_mp_)/, '')
            const cost = getPayloadNumber(sentPayload, 'cost') ?? 0
            currentGame.events.push({
              timestamp,
              img: jokers[cardRaw]?.file,
              text: `Bought ${cardClean}${cost > 0 ? ` for $${cost}` : ''}`,
              type: 'shop',
            })
          } else if (sentAction === 'rerollShop') {
            // Log owner rerolled
            const cost = getPayloadNumber(sentPayload, 'cost')
            if (cost !== null) {
              currentGame.events.push({
                timestamp,
                text: `Rerolled shop for $${cost}`,
                type: 'shop',
              })
            }
            currentGame.rerolls++
          } else if (sentAction === 'usedCard') {
            // Log owner used card
            const raw = getPayloadString(sentPayload, 'card')
            if (raw) {
              const clean = raw
                .replace(/^(c_mp_|j_mp_)/, '')
                .replace(/_/g, ' ')
                .replace(
                  /\w\S*/g,
                  (txt) =>
                    txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
                )
              currentGame.events.push({
                timestamp,
                text: `Used ${clean}`,
                type: 'action',
              })
            }
          } else if (sentAction === 'playHand') {
            // Log owner played a hand
            if (currentGame.currentPvpBlind !== null) {
              const totalScore = getPayloadNumber(sentPayload, 'score')
              const handsLeft = getPayloadNumber(sentPayload, 'handsLeft') ?? 0

              if (totalScore !== null) {
                const currentBlindIndex = currentGame.currentPvpBlind - 1
                if (
                  currentBlindIndex >= 0 &&
                  currentBlindIndex < currentGame.pvpBlinds.length
                ) {
                  const currentBlind = currentGame.pvpBlinds[currentBlindIndex]
                  if (!currentBlind) {
                    continue
                  }
                  // Update log owner score in current blind
                  const gainedScore = totalScore - currentBlind.logOwnerScore
                  currentBlind.logOwnerScore = totalScore

                  // Add hand score
                  currentBlind.handScores.push({
                    timestamp,
                    gainedScore,
                    totalScore,
                    handsLeft,
                    isLogOwner: true,
                  })

                  // Add event for log owner score only if gainedScore > 0
                  if (gainedScore > 0) {
                    currentGame.events.push({
                      timestamp,
                      text: `You scored: ${gainedScore} (Total: ${totalScore}, hands left: ${handsLeft})`,
                      type: 'event',
                    })
                  }
                }
              }
            }
          } else if (sentAction === 'setLocation') {
            // Log owner changed location
            const locCode = getPayloadString(sentPayload, 'location')
            if (locCode && locCode !== 'loc_selecting') {
              currentGame.events.push({
                timestamp,
                text: `Moved to ${formatLocation(locCode)}`,
                type: 'status',
              })

              // Check if this is a blind location
              if (locCode.startsWith('loc_playing-bl_')) {
                // Increment blind counter
                const blindNumber = currentGame.pvpBlinds.length + 1

                // Create a new PVP blind
                currentGame.pvpBlinds.push({
                  blindNumber,
                  startTimestamp: timestamp,
                  logOwnerScore: 0,
                  opponentScore: 0,
                  handScores: [],
                  winner: null,
                })

                // Set as current blind
                currentGame.currentPvpBlind = blindNumber

                // Add event for blind start
                currentGame.events.push({
                  timestamp,
                  text: `Started ${formatLocation(locCode)} (Blind #${blindNumber})`,
                  type: 'event',
                })
              }
            }
          }
        }
      } // End of line processing loop

      if (currentGame) {
        if (currentGame.endDate) {
          currentGame.durationSeconds =
            (currentGame.endDate.getTime() - currentGame.startDate.getTime()) /
            1000

          games.push(currentGame)
        }
      }

      if (games.length === 0) {
        setError('No games found in the log file.')
      }

      // Send the parsed games to the server
      if (!skipUpload) {
        console.log('Sending parsed games to server...')
        const uploadResponse = await fetch('/api/logs/upload', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            logFileId,
            parsedGames: games,
          }),
        })

        if (!uploadResponse.ok) {
          console.error('Failed to save parsed games')
        }
      }

      setParsedGames(games)
    } catch (err) {
      console.error('Error parsing log:', err)
      setError(
        `Failed to parse log file. ${err instanceof Error ? err.message : 'Unknown error'}`
      )
      setParsedGames([])
    } finally {
      setIsLoading(false)
    }
  }

  // Generate a default tab value using determined names or fallbacks
  const defaultTabValue =
    parsedGames.length > 0
      ? `game-${parsedGames!.at(-1)!.id}-${parsedGames!.at(-1)!.logOwnerName || 'LogOwner'}-vs-${parsedGames!.at(-1)!.opponentName || 'Opponent'}`
      : ''

  return (
    <TooltipProvider>
      <div
        className={
          'mx-auto flex w-[calc(100%-1rem)] max-w-fd-container flex-col gap-4 pt-16'
        }
      >
        <Dropzone
          onDropAccepted={(files) => {
            const file = files[0]
            if (file instanceof File) {
              parseLogFile(file)
            }
          }}
          disabled={isLoading}
        >
          <DropzoneZone className={'w-full'}>
            <DropzoneInput />
            <DropzoneGroup className='gap-4'>
              <DropzoneUploadIcon />
              <DropzoneGroup>
                <DropzoneTitle>Drop log file here or click</DropzoneTitle>
                <DropzoneDescription>
                  Upload your logs file.
                </DropzoneDescription>
              </DropzoneGroup>
            </DropzoneGroup>
          </DropzoneZone>
        </Dropzone>

        {isLoading && <p>Loading and parsing log...</p>}
        {error && <p className='text-red-500'>{error}</p>}

        {parsedGames.length > 0 && (
          <Tabs
            defaultValue={defaultTabValue}
            className='flex flex-1 flex-col px-0 py-4 md:py-6'
          >
            <TabsList
              className={
                'grid h-auto w-full grid-cols-1 gap-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
              }
            >
              {parsedGames.map((game) => {
                // Determine labels for the tab trigger, handling potential name conflicts
                const useGenericLabels =
                  game.logOwnerName &&
                  game.opponentName &&
                  game.logOwnerName === game.opponentName
                const opponentLabel = useGenericLabels
                  ? 'Opponent'
                  : game.opponentName || 'P2'

                return (
                  <TabsTrigger
                    key={`${game.id}-trigger`}
                    value={`game-${game.id}-${game.logOwnerName || 'LogOwner'}-vs-${game.opponentName || 'Opponent'}`}
                  >
                    Game {game.id} vs{' '}
                    {game.winner === 'opponent'
                      ? `${opponentLabel} 🏆`
                      : opponentLabel}
                    {game.winner === 'logOwner' ? ' 🏆' : ''}
                  </TabsTrigger>
                )
              })}
            </TabsList>

            {parsedGames.map((game) => {
              // Determine labels for the content, handling potential name conflicts
              const useGenericLabels =
                game.logOwnerName &&
                game.opponentName &&
                game.logOwnerName === game.opponentName
              const ownerLabel = useGenericLabels
                ? 'Log Owner'
                : game.logOwnerName || 'Log Owner' // Fallback for display
              const opponentLabel = useGenericLabels
                ? 'Opponent'
                : game.opponentName || 'Opponent' // Fallback for display

              return (
                <TabsContent
                  key={`${game.id}-content`}
                  value={`game-${game.id}-${game.logOwnerName || 'LogOwner'}-vs-${game.opponentName || 'Opponent'}`}
                  className='mt-4'
                >
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        Game {game.id}: {ownerLabel} vs {opponentLabel}
                      </CardTitle>
                      <CardDescription>
                        Started:{' '}
                        {formatter.dateTime(
                          game.startDate instanceof Date
                            ? game.startDate
                            : new Date(game.startDate),
                          {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          }
                        )}{' '}
                        | Ended:{' '}
                        {game.endDate
                          ? formatter.dateTime(
                              game.endDate instanceof Date
                                ? game.endDate
                                : new Date(game.endDate),
                              {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              }
                            )
                          : 'N/A'}{' '}
                        | Duration: {formatDuration(game.durationSeconds)}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className='grid grid-cols-1 gap-6 md:grid-cols-2'>
                      {/* Column 1: Game Info & Events */}
                      <div className='flex flex-col gap-4'>
                        <Card>
                          <CardHeader>
                            <CardTitle className='text-lg'>
                              Game Details
                            </CardTitle>
                          </CardHeader>
                          <CardContent className='space-y-1 text-base'>
                            {/* Show Log Owner's Role */}
                            <p>
                              <strong>Log Owner's Role:</strong>{' '}
                              {game.isHost === null
                                ? 'Unknown'
                                : game.isHost
                                  ? 'Host'
                                  : 'Guest'}{' '}
                              ({ownerLabel})
                            </p>
                            {/* Show Winner */}
                            <p>
                              <strong>Winner:</strong>{' '}
                              {game.winner === null
                                ? 'Unknown'
                                : game.winner === 'logOwner'
                                  ? ownerLabel
                                  : opponentLabel}
                            </p>
                            <p>
                              <strong>{ownerLabel} Rerolls:</strong>{' '}
                              {game.rerolls || 'Unknown'}
                              {game.rerollCostTotal
                                ? ` (Cost: ${game.rerollCostTotal})`
                                : ''}
                            </p>
                            <p>
                              <strong>{opponentLabel} Rerolls:</strong>{' '}
                              {game.opponentRerolls || 'Unknown'}
                              {game.opponentRerollCostTotal
                                ? ` (Cost: ${game.opponentRerollCostTotal})`
                                : ''}
                            </p>
                            <p>
                              <strong>Deck:</strong> {game.deck || 'Unknown'}
                            </p>
                            <p>
                              <strong>Seed:</strong> {game.seed || 'Unknown'}
                            </p>
                            <p>
                              <strong>Ruleset:</strong>{' '}
                              {game.options?.ruleset || 'Default'}
                            </p>
                            <div className={'flex gap-1.5'}>
                              <strong>Stake:</strong>{' '}
                              {game.options?.stake && (
                                <div className={'flex items-center gap-1.5'}>
                                  {/*@ts-ignore*/}
                                  {STAKE_IMG[game.options.stake] && (
                                    <img
                                      className={'size-5 shrink-0'}
                                      width={20}
                                      height={20}
                                      // @ts-ignore
                                      src={STAKE_IMG[game.options.stake]}
                                      alt={'Stake'}
                                    />
                                  )}
                                  {/*@ts-ignore*/}
                                  {STAKE[game.options?.stake] ?? 'Unknown'}
                                </div>
                              )}
                            </div>
                            <p>
                              <strong>Different Decks:</strong>{' '}
                              {boolStrToText(game.options?.different_decks)}
                            </p>
                            <p>
                              <strong>Different Seeds:</strong>{' '}
                              {boolStrToText(game.options?.different_seeds)}
                            </p>
                            <p>
                              <strong>Death on Round Loss:</strong>{' '}
                              {boolStrToText(game.options?.death_on_round_loss)}
                            </p>
                            <p>
                              <strong>Gold on Life Loss:</strong>{' '}
                              {boolStrToText(game.options?.gold_on_life_loss)}
                            </p>
                            <p>
                              <strong>No Gold on Round Loss:</strong>{' '}
                              {boolStrToText(
                                game.options?.no_gold_on_round_loss
                              )}
                            </p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader>
                            <CardTitle className='text-lg'>Events</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ScrollArea className='h-[90vh]'>
                              <div className='space-y-2 pr-4'>
                                {game.events.map((event, index) => {
                                  return (
                                    // biome-ignore lint/suspicious/noArrayIndexKey: simple list
                                    <Fragment key={index}>
                                      <div
                                        // biome-ignore lint/suspicious/noArrayIndexKey: Simple list rendering
                                        key={index}
                                        className={`text-base ${getEventColor(event.type)} ${
                                          event.text.includes('Opponent')
                                            ? 'flex flex-row-reverse text-right'
                                            : 'flex'
                                        }`}
                                      >
                                        <span
                                          className={`${event.text.includes('Opponent') ? 'ml-2' : 'mr-2'} font-mono`}
                                        >
                                          {formatter.dateTime(
                                            event.timestamp instanceof Date
                                              ? event.timestamp
                                              : new Date(event.timestamp),
                                            {
                                              timeStyle: 'medium',
                                            }
                                          )}
                                        </span>
                                        <span>{event.text}</span>
                                      </div>
                                      {event.img && (
                                        <div
                                          className={`${event.text.includes('Opponent') ? 'flex justify-end' : ''}`}
                                        >
                                          <Image
                                            width={142}
                                            height={190}
                                            src={event.img}
                                            alt={event.img}
                                          />
                                        </div>
                                      )}
                                    </Fragment>
                                  )
                                })}
                              </div>
                            </ScrollArea>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Column 2: Money & Mods */}
                      <div className='flex flex-col gap-4'>
                        <Card>
                          <CardHeader>
                            <CardTitle className='text-lg'>
                              Shop Spending
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            {/* Pass game and determined labels to the table */}
                            <ShopSpendingTable
                              game={game}
                              ownerLabel={ownerLabel}
                              opponentLabel={opponentLabel}
                            />
                          </CardContent>
                        </Card>
                        {/* PVP Blinds Card */}
                        <PvpBlindsCard
                          game={game}
                          ownerLabel={ownerLabel}
                          opponentLabel={opponentLabel}
                        />

                        <Card>
                          <CardHeader>
                            <CardTitle className='text-lg'>
                              Final Jokers
                            </CardTitle>
                          </CardHeader>
                          <CardContent className='space-y-3 text-sm'>
                            <div>
                              <strong>
                                {ownerLabel}
                                {game.winner === 'logOwner' ? ' 🏆' : ''}:
                              </strong>
                              {game.logOwnerFinalJokers.length > 0 ? (
                                <ul className='mt-3 ml-4 flex list-inside gap-3'>
                                  {game.logOwnerFinalJokers.map((joker, i) => {
                                    const jokerName = joker.split('-')[0] // Remove any suffix after the key
                                    if (!jokerName) {
                                      return null
                                    }
                                    const cleanName =
                                      jokers[jokerName]?.name ??
                                      cleanJokerKey(jokerName)
                                    return (
                                      // biome-ignore lint/suspicious/noArrayIndexKey: Simple list
                                      <li key={i} className={'list-none'}>
                                        <div
                                          className={
                                            'flex flex-col items-center justify-center gap-2'
                                          }
                                        >
                                          <Image
                                            src={`/cards/${jokerName}.${jokerName === 'j_hologram' ? 'gif' : 'png'}`}
                                            alt={cleanName}
                                            width={142}
                                            height={190}
                                          />
                                          <span>{cleanName}</span>
                                        </div>
                                      </li>
                                    )
                                  })}
                                </ul>
                              ) : (
                                <p className='text-gray-500 italic'>
                                  No data found.
                                </p>
                              )}
                            </div>
                            <div>
                              <strong>
                                {opponentLabel}
                                {game.winner === 'opponent' ? ' 🏆' : ''}:
                              </strong>
                              {game.opponentFinalJokers.length > 0 ? (
                                <ul className='mt-3 ml-4 flex list-inside gap-3'>
                                  {game.opponentFinalJokers.map((joker, i) => {
                                    const jokerName = joker.split('-')[0] // Remove any suffix after the key
                                    if (!jokerName) {
                                      return null
                                    }
                                    const cleanName =
                                      jokers[jokerName]?.name ??
                                      cleanJokerKey(jokerName)
                                    return (
                                      // biome-ignore lint/suspicious/noArrayIndexKey: Simple list
                                      <li key={i} className={'list-none'}>
                                        <div
                                          className={
                                            'flex flex-col items-center justify-center gap-2'
                                          }
                                        >
                                          <Image
                                            src={`/cards/${jokerName}.${jokerName === 'j_hologram' ? 'gif' : 'png'}`}
                                            alt={cleanName}
                                            width={142}
                                            height={190}
                                          />
                                          <span>{cleanName}</span>
                                        </div>
                                      </li>
                                    )
                                  })}
                                </ul>
                              ) : (
                                <p className='text-gray-500 italic'>
                                  No data found.
                                </p>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader>
                            <CardTitle className='text-lg'>Vouchers</CardTitle>
                          </CardHeader>
                          <CardContent className='space-y-3 text-sm'>
                            <div>
                              <strong>
                                {ownerLabel}
                                {game.winner === 'logOwner' ? ' 🏆' : ''}:
                              </strong>
                              {game.logOwnerVouchers?.length > 0 ? (
                                <ul className='mt-3 ml-4 flex list-inside gap-3'>
                                  {game.logOwnerVouchers.map((voucher, i) => {
                                    if (!voucher) {
                                      return null
                                    }
                                    const cleanName =
                                      vouchers[voucher]?.name ??
                                      cleanVoucherKey(voucher)
                                    return (
                                      // biome-ignore lint/suspicious/noArrayIndexKey: Simple list
                                      <li key={i} className={'list-none'}>
                                        <div
                                          className={
                                            'flex flex-col items-center justify-center gap-2'
                                          }
                                        >
                                          <Image
                                            src={`/cards/${voucher}.png`}
                                            alt={cleanName}
                                            width={142}
                                            height={190}
                                          />
                                          <span>{cleanName}</span>
                                        </div>
                                      </li>
                                    )
                                  })}
                                </ul>
                              ) : (
                                <p className='text-gray-500 italic'>
                                  No data found.
                                </p>
                              )}
                            </div>
                            <div>
                              <strong>
                                {opponentLabel}
                                {game.winner === 'opponent' ? ' 🏆' : ''}:
                              </strong>
                              {game.opponentVouchers?.length > 0 ? (
                                <ul className='mt-3 ml-4 flex list-inside gap-3'>
                                  {game.opponentVouchers.map((voucher, i) => {
                                    if (!voucher) {
                                      return null
                                    }
                                    const cleanName =
                                      vouchers[voucher]?.name ??
                                      cleanVoucherKey(voucher)
                                    return (
                                      // biome-ignore lint/suspicious/noArrayIndexKey: Simple list
                                      <li key={i} className={'list-none'}>
                                        <div
                                          className={
                                            'flex flex-col items-center justify-center gap-2'
                                          }
                                        >
                                          <Image
                                            src={`/cards/${voucher}.png`}
                                            alt={cleanName}
                                            width={142}
                                            height={190}
                                          />
                                          <span>{cleanName}</span>
                                        </div>
                                      </li>
                                    )
                                  })}
                                </ul>
                              ) : (
                                <p className='text-gray-500 italic'>
                                  No data found.
                                </p>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader>
                            <CardTitle className='text-lg'>Mods</CardTitle>
                          </CardHeader>
                          <CardContent className='space-y-2 text-base'>
                            <div>
                              <strong>
                                Host Mods ({game.host || 'Unknown'}):
                              </strong>
                              {game.hostMods.length > 0 ? (
                                <ul className='ml-4 list-inside list-disc font-mono text-base'>
                                  {game.hostMods.map((mod, i) => (
                                    // biome-ignore lint/suspicious/noArrayIndexKey: Simple list
                                    <li key={`host-mod-${i}`}>{mod}</li>
                                  ))}
                                </ul>
                              ) : (
                                <p className='text-gray-500 italic'>
                                  None detected
                                </p>
                              )}
                            </div>
                            <div>
                              <strong>
                                Guest Mods ({game.guest || 'Unknown'}):
                              </strong>
                              {game.guestMods.length > 0 ? (
                                <ul className='ml-4 list-inside list-disc font-mono text-base'>
                                  {game.guestMods.map((mod, i) => (
                                    // biome-ignore lint/suspicious/noArrayIndexKey: Simple list
                                    <li key={`guest-mod-${i}`}>{mod}</li>
                                  ))}
                                </ul>
                              ) : (
                                <p className='text-gray-500 italic'>
                                  None detected
                                </p>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              )
            })}
          </Tabs>
        )}
      </div>
    </TooltipProvider>
  )
}

// --- Helper Functions ---

function ShopSpendingTable({
  game,
  ownerLabel,
  opponentLabel,
}: {
  game: Game
  ownerLabel: string
  opponentLabel: string
}) {
  const maxShops = Math.max(
    game.moneySpentPerShop.length,
    game.moneySpentPerShopOpponent.length
  )

  if (
    maxShops === 0 &&
    game.moneySpent === 0 &&
    game.opponentMoneySpent === 0
  ) {
    return (
      <p className='text-gray-500 text-sm italic'>
        No shop spending data recorded.
      </p>
    )
  }

  return (
    <div className='overflow-hidden rounded-lg border bg-background'>
      <div className='overflow-x-auto'>
        <Table>
          <TableHeader className='sticky top-0 z-10 bg-background'>
            <TableRow className='bg-muted/50'>
              <TableHead className='w-[60px] text-right font-mono'>Shop</TableHead>
              <TableHead className='text-right font-mono'>
                {ownerLabel}
                {game.winner === 'logOwner' ? ' 🏆' : ''}
              </TableHead>
              <TableHead className='text-right font-mono'>
                {opponentLabel}
                {game.winner === 'opponent' ? ' 🏆' : ''}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: maxShops }).map((_, j) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: Simple table rendering
              <TableRow key={j}>
                <TableCell className='text-right font-mono'>{j + 1}</TableCell>
                <TableCell className='text-right font-mono'>
                  {game.moneySpentPerShop[j] === null
                    ? 'Skipped'
                    : game.moneySpentPerShop[j] !== undefined
                      ? `$${game.moneySpentPerShop[j]}`
                      : '-'}
                </TableCell>
                <TableCell className='text-right font-mono'>
                  {game.moneySpentPerShopOpponent[j] === null
                    ? 'Skipped'
                    : game.moneySpentPerShopOpponent[j] !== undefined
                      ? `$${game.moneySpentPerShopOpponent[j]}`
                      : '-'}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className='font-bold'>
              <TableCell>Total Reported</TableCell>
              <TableCell className='text-right font-mono'>
                $
                {game.moneySpentPerShop
                  .filter((v): v is number => v !== null)
                  .reduce((a, b) => a + b, 0)}
              </TableCell>
              <TableCell className='text-right font-mono'>
                $
                {game.moneySpentPerShopOpponent
                  .filter((v): v is number => v !== null)
                  .reduce((a, b) => a + b, 0)}
              </TableCell>
            </TableRow>
            <TableRow className='border-t-2 font-bold'>
              <TableCell>Total Actual</TableCell>
              <TableCell className='text-right font-mono'>
                <Tooltip>
                  <TooltipTrigger className='cursor-help border-gray-500 border-b border-dashed'>
                    ${game.moneySpent}
                  </TooltipTrigger>
                  <TooltipContent>
                    Sum of money {ownerLabel} spent via buy/reroll actions detected
                    in this log.
                  </TooltipContent>
                </Tooltip>
              </TableCell>
              <TableCell className='text-right font-mono'>
                <Tooltip>
                  <TooltipTrigger className='cursor-help border-gray-500 border-b border-dashed'>
                    ${game.opponentMoneySpent}
                  </TooltipTrigger>
                  <TooltipContent>
                    Sum of money {opponentLabel} reported spending via network
                    messages received by {ownerLabel}.
                  </TooltipContent>
                </Tooltip>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// PVP blinds components are now imported from the PvpBlindsCard component

type ParsedSentPayload = Record<string, string | number | boolean | null>

function parseClientSentPayload(line: string): ParsedSentPayload | null {
  const marker = 'Client sent message:'
  const markerIndex = line.indexOf(marker)
  if (markerIndex === -1) {
    return null
  }

  const payload = line.slice(markerIndex + marker.length).trim()
  if (!payload) {
    return null
  }

  if (payload.startsWith('{') && payload.endsWith('}')) {
    try {
      const parsed = JSON.parse(payload) as Record<string, unknown>
      const normalized: ParsedSentPayload = {}
      for (const [key, value] of Object.entries(parsed)) {
        if (
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean' ||
          value === null
        ) {
          normalized[key] = value
        }
      }
      return normalized
    } catch {
      return null
    }
  }

  const parsedPayload: ParsedSentPayload = {}
  for (const match of payload.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*):([^,]*)/g)) {
    const key = match[1]?.trim()
    const rawValue = match[2]?.trim()
    if (!key || rawValue === undefined) {
      continue
    }

    if (rawValue.toLowerCase() === 'true') {
      parsedPayload[key] = true
      continue
    }
    if (rawValue.toLowerCase() === 'false') {
      parsedPayload[key] = false
      continue
    }
    if (/^-?\d+$/.test(rawValue)) {
      parsedPayload[key] = Number.parseInt(rawValue, 10)
      continue
    }
    parsedPayload[key] = rawValue
  }

  return Object.keys(parsedPayload).length > 0 ? parsedPayload : null
}

function getPayloadString(
  payload: ParsedSentPayload | null,
  key: string
): string | null {
  if (!payload || !(key in payload)) {
    return null
  }
  const value = payload[key]
  if (value === null || value === undefined) {
    return null
  }
  return String(value)
}

function getPayloadNumber(
  payload: ParsedSentPayload | null,
  key: string
): number | null {
  if (!payload || !(key in payload)) {
    return null
  }
  const value = payload[key]
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function applyLobbyOption(
  options: GameOptions,
  rawKey: string,
  rawValue: string | number | boolean | null | undefined
) {
  if (rawValue === null || rawValue === undefined) {
    return
  }

  const trimmedKey = rawKey.trim().replace(/^['"]/, '').replace(/['"]$/, '')
  if (!trimmedKey) {
    return
  }

  const normalizedRaw =
    typeof rawValue === 'string'
      ? rawValue.trim().replace(/^['"]/, '').replace(/['"]$/, '')
      : rawValue

  const normalizedString =
    typeof normalizedRaw === 'string' ? normalizedRaw : String(normalizedRaw)

  switch (trimmedKey) {
    case 'back':
      options.back = normalizedString
      break
    case 'custom_seed':
      options.custom_seed = normalizedString
      break
    case 'ruleset':
      options.ruleset = normalizedString
      break
    case 'different_decks':
    case 'different_seeds':
    case 'death_on_round_loss':
    case 'gold_on_life_loss':
    case 'no_gold_on_round_loss':
      if (typeof normalizedRaw === 'boolean') {
        options[trimmedKey] = normalizedRaw
      } else {
        options[trimmedKey] = normalizedString.toLowerCase() === 'true'
      }
      break
    case 'starting_lives':
    case 'stake': {
      const numValue =
        typeof normalizedRaw === 'number'
          ? normalizedRaw
          : Number.parseInt(normalizedString, 10)
      if (!Number.isNaN(numValue)) {
        options[trimmedKey] = numValue
      }
      break
    }
  }
}

function parseLobbyOptions(
  optionsInput: string | ParsedSentPayload
): GameOptions | null {
  const options: GameOptions = {}

  if (typeof optionsInput === 'string') {
    const trimmedInput = optionsInput.trim()

    if (trimmedInput.startsWith('{') && trimmedInput.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmedInput) as ParsedSentPayload
        for (const [key, value] of Object.entries(parsed)) {
          applyLobbyOption(options, key, value)
        }
      } catch {
        return null
      }
    } else {
      for (const param of trimmedInput.split(',')) {
        const separatorIndex = param.indexOf(':')
        if (separatorIndex === -1) {
          continue
        }
        const key = param.slice(0, separatorIndex)
        const value = param.slice(separatorIndex + 1)
        applyLobbyOption(options, key, value)
      }
    }
  } else {
    for (const [key, value] of Object.entries(optionsInput)) {
      applyLobbyOption(options, key, value)
    }
  }

  return Object.keys(options).length > 0 ? options : null
}

// formatNumber function moved to PvpBlindsCard component

// Helper to format location codes (no changes needed)
function formatLocation(locCode: string): string {
  if (locCode === 'loc_shop') {
    return 'Shop'
  }
  if (locCode === 'loc_playing-bl_mp_nemesis') {
    return 'PvP Blind'
  }
  if (locCode.startsWith('loc_playing-')) {
    const subcode = locCode.slice('loc_playing-'.length)
    if (subcode.startsWith('bl_')) {
      const blindName = subcode
        .slice(3)
        .replace(/_/g, ' ')
        .replace(
          /\w\S*/g,
          (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
        )
      return `${blindName} Blind`
    }
    {
      const readable = subcode
        .replace(/_/g, ' ')
        .replace(
          /\w\S*/g,
          (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
        )
      return `Playing ${readable}`
    }
  }
  return locCode
    .replace(/_/g, ' ')
    .replace(
      /\w\S*/g,
      (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    )
}

function getEventColor(type: LogEvent['type']): string {
  switch (type) {
    case 'event':
      return 'text-blue-400'
    case 'status':
      return 'text-green-400'
    case 'system':
      return 'text-purple-400'
    case 'shop':
      return 'text-yellow-400'
    case 'action':
      return 'text-cyan-400'
    case 'info':
      return 'text-gray-400'
    case 'error':
      return 'text-red-500'
    default:
      return 'text-gray-500'
  }
}

type ParsedLobbyInfo = {
  timestamp: Date
  host: string | null
  guest: string | null
  hostHash: string[]
  guestHash: string[]
  isHost: boolean | null
}

type GameStartInfo = {
  lobbyInfo: ParsedLobbyInfo | null
  seed: string | null
}

function extractGameStartInfo(lines: string[]): GameStartInfo[] {
  const gameInfos: GameStartInfo[] = []
  let latestLobbyInfo: ParsedLobbyInfo | null = null
  let nextGameSeed: string | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) {
      continue
    }
    const lineLower = line.toLowerCase()

    if (line.includes('Client got lobbyInfo message')) {
      try {
        latestLobbyInfo = parseLobbyInfoLine(line)
      } catch (e) {
        console.warn('Could not parse lobbyInfo line:', line, e)
        latestLobbyInfo = null
      }
    }

    if (lineLower.includes('startgame message')) {
      const seedMatch = line.match(/seed:\s*([^) ]+)/)
      const startGameSeed = seedMatch?.[1] || null

      gameInfos.push({
        lobbyInfo: latestLobbyInfo,
        seed: startGameSeed ?? nextGameSeed,
      })
      latestLobbyInfo = null
      nextGameSeed = null
    }
  }
  return gameInfos
}

function parseLobbyInfoLine(line: string): ParsedLobbyInfo | null {
  const timeMatch = line.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/)
  const timestamp = timeMatch?.[1] ? new Date(timeMatch[1]) : new Date()

  const hostMatch = line.match(/host: ([^ )]+)/)
  const guestMatch = line.match(/guest: ([^ )]+)/)
  const hostHashMatch = line.match(/hostHash: ([^)]+)/)
  const guestHashMatch = line.match(/guestHash: ([^)]+)/)
  const isHostMatch = line.match(/isHost: (true|false)/)

  const cleanHash = (hashStr: string | null | undefined) => {
    if (!hashStr) return []
    return hashStr
      .replace(/[()]/g, '')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  return {
    timestamp,
    host: hostMatch?.[1] || null,
    guest: guestMatch?.[1] || null,
    hostHash: cleanHash(hostHashMatch?.[1]),
    guestHash: cleanHash(guestHashMatch?.[1]),
    isHost: isHostMatch ? isHostMatch[1] === 'true' : null,
  }
}

function cleanJokerKey(key: string): string {
  if (!key) return ''
  return key
    .trim()
    .replace(/^j_mp_|^j_/, '') // Remove prefixes j_mp_ or j_
    .replace(/_/g, ' ') // Replace underscores with spaces
    .replace(
      /\w\S*/g, // Capitalize each word (Title Case)
      (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    )
}

function cleanVoucherKey(key: string): string {
  if (!key) return ''
  return key
    .trim()
    .replace(/^v_/, '') // Remove prefix v_
    .replace(/_/g, ' ') // Replace underscores with spaces
    .replace(
      /\w\S*/g, // Capitalize each word (Title Case)
      (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    )
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

async function luaTableToJson(luaString: string) {
  const str = luaString.replace(/^return\s*/, '')
  return LuaToJsonConverter.convert(str)
}

async function decodePackedString(encodedString: string): Promise<JsonValue> {
  try {
    // Step 1: Decode base64
    const binaryString = atob(encodedString)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    // Step 2: Decompress using gzip
    const ds = new DecompressionStream('gzip')
    const decompressedStream = new Blob([bytes]).stream().pipeThrough(ds)
    const decompressedBlob = await new Response(decompressedStream).blob()
    const decompressedString = await decompressedBlob.text()

    // Basic security check
    if (/[^"'\w_]function[^"'\w_]/.test(decompressedString)) {
      throw new Error('Function keyword detected')
    }

    // Convert Lua table to JSON
    const jsonString = await luaTableToJson(decompressedString)
    const result = JSON.parse(jsonString) as JsonValue
    return result
  } catch (error) {
    console.error('Failed string:', encodedString)
    console.error('Conversion error:', error)
    throw error
  }
}

async function parseJokersFromString(str: string) {
  // Check if the string starts with 'H4' indicating a packed string
  // This is a common prefix for base64 encoded gzip strings
  try {
    if (str.startsWith('H4')) {
      const decoded = await decodePackedString(str)
      if (decoded && typeof decoded === 'object' && 'cards' in decoded) {
        return Object.values(decoded.cards as any).map(
          (c: any) => c.save_fields.center
        )
      }
    }
  } catch (e) {
    console.error('Failed to parse jokers from string:', str, e)
    return []
  }
  return str.split(';').filter(Boolean) // Remove empty strings if any
}
