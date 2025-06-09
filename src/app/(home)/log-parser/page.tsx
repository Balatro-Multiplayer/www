'use client'

import { OptimizedImage } from '@/components/optimized-image'
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
import { useFormatter } from 'next-intl'
import { Fragment, useState } from 'react'
import { type PvpBlind, PvpBlindsCard } from './_components/pvp-blinds'

// Define the structure for individual log events within a game
type LogEvent = {
  timestamp: Date
  text: string
  type: 'event' | 'status' | 'system' | 'shop' | 'action' | 'error' | 'info'
  img?: string
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
  rerolls: number
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

// Main component
export default function LogParser() {
  const formatter = useFormatter()
  const [parsedGames, setParsedGames] = useState<Game[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const parseLogFile = async (file: File) => {
    setIsLoading(true)
    setError(null)
    setParsedGames([])

    try {
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
        if (line.includes('Client sent message: action:receiveEndGameJokers')) {
          if (currentGame) {
            // Mark end date if not already set (might happen slightly before 'got')
            if (!currentGame.endDate) {
              currentGame.endDate = timestamp
            }
            // Extract Log Owner Jokers
            const keysMatch = line.match(/keys:(.+)$/) // Match from keys: to end of line
            if (keysMatch?.[1]) {
              const str = keysMatch?.[1]
              currentGame.logOwnerFinalJokers = await parseJokersFromString(str)
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
          const optionsStr = line.split(' Client sent message:')[1]?.trim()
          if (optionsStr) {
            lastSeenLobbyOptions = parseLobbyOptions(optionsStr)
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
          const livesMatch = line.match(/lives:(\d+)/)
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
              const score = Number.parseInt(scoreMatch[1], 10)
              const handsLeft = handsLeftMatch?.[1]
                ? Number.parseInt(handsLeftMatch[1], 10)
                : 0

              if (!Number.isNaN(score)) {
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
                  currentBlind.opponentScore += score

                  // Add hand score
                  currentBlind.handScores.push({
                    timestamp,
                    score,
                    handsLeft,
                    isLogOwner: false,
                  })

                  // Add event for opponent score only if score > 0
                  if (score > 0) {
                    currentGame.events.push({
                      timestamp,
                      text: `Opponent score: ${score} (Hands left: ${handsLeft})`,
                      type: 'event',
                    })
                  }
                }
              }
            }
          }

          continue
        }
        if (line.includes('Client sent message: action:soldCard')) {
          const match = line.match(/card:(.+)$/)
          if (match?.[1]) {
            const card = match[1].trim()
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
        if (line.includes('Client sent message: action:spentLastShop')) {
          const match = line.match(/amount:(\d+)/)
          if (match?.[1]) {
            const amount = Number.parseInt(match[1], 10)
            if (!Number.isNaN(amount)) {
              currentGame.moneySpentPerShop.push(amount)
              currentGame.events.push({
                timestamp,
                text: `Reported spending $${amount} last shop`,
                type: 'shop',
              })
            }
          }
          continue
        }

        // This message indicates the log owner skipped
        if (line.includes('Client sent message: action:skip')) {
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
          if (lineLower.includes('moneymoved')) {
            const match = line.match(/amount: *(-?\d+)/)
            if (match?.[1]) {
              const amount = Number.parseInt(match[1], 10)
              if (!Number.isNaN(amount)) {
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
            }
          } else if (line.includes('boughtCardFromShop')) {
            // Log owner bought card
            const cardMatch = line.match(/card:([^,\n]+)/i)
            const costMatch = line.match(/cost: *(\d+)/i)
            const cardRaw = cardMatch?.[1]?.trim() ?? 'Unknown Card'
            const cardClean = cardRaw.replace(/^(c_mp_|j_mp_)/, '')
            const cost = costMatch?.[1] ? Number.parseInt(costMatch[1], 10) : 0
            currentGame.events.push({
              timestamp,
              img: jokers[cardRaw]?.file,
              text: `Bought ${cardClean}${cost > 0 ? ` for $${cost}` : ''}`,
              type: 'shop',
            })
          } else if (line.includes('rerollShop')) {
            // Log owner rerolled
            const costMatch = line.match(/cost: *(\d+)/i)
            if (costMatch?.[1]) {
              const cost = Number.parseInt(costMatch[1], 10)
              if (!Number.isNaN(cost)) {
                currentGame.events.push({
                  timestamp,
                  text: `Rerolled shop for $${cost}`,
                  type: 'shop',
                })
              }
            }
            currentGame.rerolls++
          } else if (lineLower.includes('usedcard')) {
            // Log owner used card
            const match = line.match(/card:([^,\n]+)/i)
            if (match?.[1]) {
              const raw = match[1].trim()
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
          } else if (lineLower.includes('playhand')) {
            // Log owner played a hand
            if (currentGame.currentPvpBlind !== null) {
              const scoreMatch = line.match(/score:(\d+)/)
              const handsLeftMatch = line.match(/handsLeft:(\d+)/)

              if (scoreMatch?.[1]) {
                const score = Number.parseInt(scoreMatch[1], 10)
                const handsLeft = handsLeftMatch?.[1]
                  ? Number.parseInt(handsLeftMatch[1], 10)
                  : 0

                if (!Number.isNaN(score)) {
                  const currentBlindIndex = currentGame.currentPvpBlind - 1
                  if (
                    currentBlindIndex >= 0 &&
                    currentBlindIndex < currentGame.pvpBlinds.length
                  ) {
                    const currentBlind =
                      currentGame.pvpBlinds[currentBlindIndex]
                    if (!currentBlind) {
                      continue
                    }
                    // Update log owner score in current blind
                    currentBlind.logOwnerScore += score

                    // Add hand score
                    currentBlind.handScores.push({
                      timestamp,
                      score,
                      handsLeft,
                      isLogOwner: true,
                    })

                    // Add event for log owner score only if score > 0
                    if (score > 0) {
                      currentGame.events.push({
                        timestamp,
                        text: `Your score: ${score} (Hands left: ${handsLeft})`,
                        type: 'event',
                      })
                    }
                  }
                }
              }
            }
          } else if (lineLower.includes('setlocation')) {
            // Log owner changed location
            const locMatch = line.match(/location:([a-zA-Z0-9_-]+)/)
            if (locMatch?.[1]) {
              const locCode = locMatch[1]
              if (locCode !== 'loc_selecting' && locCode) {
                currentGame.events.push({
                  timestamp,
                  text: `Moved to ${formatLocation(locCode)}`,
                  type: 'status',
                })

                // Check if this is a blind location
                if (locCode.startsWith('loc_playing-bl_')) {
                  // Extract blind name
                  const blindName = locCode.slice('loc_playing-bl_'.length)

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
        }
      } // End of line processing loop

      if (currentGame) {
        if (!currentGame.endDate) {
          const lastEventTime =
            currentGame.events.length > 0
              ? currentGame.events[currentGame.events.length - 1]?.timestamp
              : null
          currentGame.endDate =
            lastEventTime ?? lastProcessedTimestamp ?? currentGame.startDate // Fallback chain
        }
        currentGame.durationSeconds = currentGame.endDate
          ? (currentGame.endDate.getTime() - currentGame.startDate.getTime()) /
            1000
          : null
        games.push(currentGame)
      }

      if (games.length === 0) {
        setError('No games found in the log file.')
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
          <Tabs defaultValue={defaultTabValue} className='mt-6 w-full'>
            <TabsList className='grid h-auto w-full grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'>
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
                        {formatter.dateTime(game.startDate, {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}{' '}
                        | Ended:{' '}
                        {game.endDate
                          ? formatter.dateTime(game.endDate, {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })
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
                              <strong>Rerolls:</strong>{' '}
                              {game.rerolls || 'Unknown'}
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
                            <p>
                              <strong>Stake:</strong>{' '}
                              {game.options?.stake ?? 'Unknown'}
                            </p>
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
                                          {formatter.dateTime(event.timestamp, {
                                            timeStyle: 'medium',
                                          })}
                                        </span>
                                        <span>{event.text}</span>
                                      </div>
                                      {event.img && (
                                        <div
                                          className={`${event.text.includes('Opponent') ? 'flex justify-end' : ''}`}
                                        >
                                          <OptimizedImage src={event.img} />
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
                          formatter={formatter}
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
                                          <OptimizedImage
                                            src={`/cards/${jokerName}.png`}
                                            alt={cleanName}
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
                                          <OptimizedImage
                                            src={`/cards/${jokerName}.png`}
                                            alt={cleanName}
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
    <Table>
      <TableHeader>
        <TableRow>
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
            {/* Log Owner Data */}
            <TableCell className='text-right font-mono'>
              {game.moneySpentPerShop[j] === null
                ? 'Skipped'
                : game.moneySpentPerShop[j] !== undefined
                  ? `$${game.moneySpentPerShop[j]}`
                  : '-'}
            </TableCell>
            {/* Opponent Data */}
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
  )
}

// PVP blinds components are now imported from the PvpBlindsCard component

// Helper to parse lobby options string (no changes needed)
function parseLobbyOptions(optionsStr: string): GameOptions {
  const options: GameOptions = {}
  const params = optionsStr.split(',')
  for (const param of params) {
    const [key, value] = param.split(':')
    const trimmedKey = key?.trim()
    const trimmedValue = value?.trim()
    if (!trimmedKey || !trimmedValue) continue

    switch (trimmedKey) {
      case 'back':
        options.back = trimmedValue
        break
      case 'custom_seed':
        options.custom_seed = trimmedValue
        break
      case 'ruleset':
        options.ruleset = trimmedValue
        break
      case 'different_decks':
      case 'different_seeds':
      case 'death_on_round_loss':
      case 'gold_on_life_loss':
      case 'no_gold_on_round_loss':
        options[trimmedKey] = trimmedValue.toLowerCase() === 'true'
        break
      case 'starting_lives':
      case 'stake':
        const numValue = Number.parseInt(trimmedValue, 10)
        if (!Number.isNaN(numValue)) {
          options[trimmedKey] = numValue
        }
        break
    }
  }
  return options
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
  const isHostMatch = line.includes('isHost: true')

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
    isHost: isHostMatch,
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

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

function luaTableToJson(luaString: string): string {
  let str = luaString.replace(/^return\s*/, '')

  // Handle nested tables closing properly
  str = str.replace(/,(\s*})/g, '$1')

  // Handle array-style table entries [1] = value
  str = str.replace(/\[(\d+)\]\s*=/g, '"$1":')

  // Handle string keys ["key"] = value
  str = str.replace(/\[(["'][^"']+["'])\]\s*=/g, '$1:')

  // Handle regular key = value
  str = str.replace(/(\w+)\s*=/g, '"$1":')

  // Replace single quotes with double quotes
  str = str.replace(/'/g, '"')

  // Clean up empty tables
  str = str.replace(/{}/g, '{}')

  // Remove trailing commas inside objects
  str = str.replace(/,(\s*[}\]])/g, '$1')

  return str
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
    const jsonString = luaTableToJson(decompressedString)
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
  if (str.startsWith('H4')) {
    const decoded = await decodePackedString(str)
    if (decoded && typeof decoded === 'object' && 'cards' in decoded) {
      return Object.values(decoded.cards as any).map(
        (c: any) => c.save_fields.center
      )
    }
  }
  return str.split(';').filter(Boolean) // Remove empty strings if any
}
