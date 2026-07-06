'use client'

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, X } from 'lucide-react'
import { signIn } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/trpc/react'

type Option = { id: number; label: string }

type Poll = {
  uuid: string
  title: string
  description: string | null
  status: string
  closesAt: string | null
  isClosed: boolean
  options: Option[]
  totalBallots: number
}

/** Human "23h 40m 12s"-style remaining string, or null once elapsed. */
function formatCountdown(msRemaining: number): string | null {
  if (msRemaining <= 0) return null
  const totalSeconds = Math.floor(msRemaining / 1000)
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (days > 0 || hours > 0) parts.push(`${hours}h`)
  parts.push(`${minutes}m`)
  if (days === 0 && hours === 0) parts.push(`${seconds}s`)
  return parts.join(' ')
}

function initials(name: string | null) {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function SortableRankRow({
  option,
  position,
  disabled,
  onRemove,
}: {
  option: Option
  position: number
  disabled: boolean
  onRemove: (id: number) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: option.id, disabled })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-md border bg-card p-2 ${
        isDragging ? 'relative z-10 shadow-sm' : ''
      }`}
    >
      <span className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-medium text-primary text-xs'>
        {position}
      </span>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='h-7 w-7 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing'
        disabled={disabled}
        aria-label={`Reorder ${option.label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className='h-4 w-4' />
      </Button>
      <span className='flex-1 text-sm'>{option.label}</span>
      <Button
        type='button'
        variant='ghost'
        size='sm'
        className='shrink-0 text-muted-foreground'
        disabled={disabled}
        onClick={() => onRemove(option.id)}
        aria-label={`Remove ${option.label}`}
      >
        <X className='h-4 w-4' />
      </Button>
    </div>
  )
}

export function PollVoteClient({
  poll,
  isLoggedIn,
}: {
  poll: Poll
  isLoggedIn: boolean
}) {
  const closesAtMs = poll.closesAt ? new Date(poll.closesAt).getTime() : null
  const [now, setNow] = useState<number | null>(null)
  const [tab, setTab] = useState(poll.isClosed ? 'results' : 'vote')
  const [ranking, setRanking] = useState<number[]>([])
  const [isHydrated, setIsHydrated] = useState(false)

  const optionById = new Map(poll.options.map((o) => [o.id, o]))
  const utils = api.useUtils()

  // `now` stays null through SSR/first paint (avoids hydration mismatch), then
  // ticks so the countdown updates and the poll flips to closed at expiry.
  useEffect(() => {
    setIsHydrated(true)
    setNow(Date.now())
    if (poll.status === 'closed' || closesAtMs === null) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [poll.status, closesAtMs])

  const isClosed =
    poll.status === 'closed' ||
    poll.isClosed ||
    (closesAtMs !== null && now !== null && now >= closesAtMs)
  const countdown =
    !isClosed && closesAtMs !== null && now !== null
      ? formatCountdown(closesAtMs - now)
      : null

  // If the timer elapses while the user is on the vote tab, move them to results.
  useEffect(() => {
    if (isClosed && tab === 'vote') setTab('results')
  }, [isClosed, tab])

  const myBallot = api.polls.getMyBallot.useQuery(
    { uuid: poll.uuid },
    { enabled: isLoggedIn }
  )

  // Seed the ranking from the saved ballot once it loads.
  useEffect(() => {
    if (myBallot.data) {
      setRanking(myBallot.data.rankedOptionIds.filter((id) => optionById.has(id)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myBallot.data])

  const results = api.polls.getResults.useQuery(
    { uuid: poll.uuid },
    { enabled: tab === 'results' }
  )

  const submitBallot = api.polls.submitBallot.useMutation({
    onSuccess: async () => {
      toast.success('Your ballot has been saved')
      await Promise.all([
        utils.polls.getResults.invalidate({ uuid: poll.uuid }),
        utils.polls.getMyBallot.invalidate({ uuid: poll.uuid }),
        utils.polls.getPublic.invalidate({ uuid: poll.uuid }),
      ])
      setTab('results')
    },
    onError: (err) => toast.error(err.message),
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const rankedOptions = ranking
    .map((id) => optionById.get(id))
    .filter((o): o is Option => Boolean(o))
  const availableOptions = poll.options.filter((o) => !ranking.includes(o.id))

  function addOption(id: number) {
    setRanking((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }
  function removeOption(id: number) {
    setRanking((prev) => prev.filter((x) => x !== id))
  }
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = ranking.findIndex((id) => id === active.id)
    const newIndex = ranking.findIndex((id) => id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    setRanking((prev) => arrayMove(prev, oldIndex, newIndex))
  }

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-col gap-2'>
        <div className='flex flex-wrap items-center gap-3'>
          <h1 className='font-bold text-3xl'>{poll.title}</h1>
          {isClosed ? (
            <Badge variant='outline'>Closed</Badge>
          ) : countdown ? (
            <Badge variant='secondary'>Closes in {countdown}</Badge>
          ) : null}
        </div>
        {poll.description ? (
          <p className='whitespace-pre-wrap text-muted-foreground'>
            {poll.description}
          </p>
        ) : null}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value='vote' disabled={isClosed}>
            Vote
          </TabsTrigger>
          <TabsTrigger value='results'>Results</TabsTrigger>
        </TabsList>

        <TabsContent value='vote' className='pt-4'>
          {isClosed ? (
            <p className='text-muted-foreground text-sm'>
              This poll is closed. See the results tab.
            </p>
          ) : !isLoggedIn ? (
            <Card>
              <CardContent className='flex flex-col items-start gap-4 pt-6'>
                <p className='text-sm'>
                  Sign in with Discord to cast your ranked ballot. You can edit
                  it any time while the poll is open.
                </p>
                <div className='flex gap-2'>
                  <Button onClick={() => signIn('discord')}>
                    Sign in with Discord
                  </Button>
                  <Button variant='outline' onClick={() => setTab('results')}>
                    Skip to results
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className='flex flex-col gap-4'>
              <p className='text-muted-foreground text-sm'>
                Click options to add them to your ranking, then drag to order
                them (1 = most preferred). You don't have to rank every option.
              </p>

              <div className='grid gap-4 sm:grid-cols-2'>
                <Card>
                  <CardHeader>
                    <CardTitle className='text-base'>Options</CardTitle>
                  </CardHeader>
                  <CardContent className='flex flex-col gap-2'>
                    {availableOptions.length === 0 ? (
                      <p className='text-muted-foreground text-sm'>
                        All options ranked.
                      </p>
                    ) : (
                      availableOptions.map((option) => (
                        <Button
                          key={option.id}
                          type='button'
                          variant='outline'
                          className='justify-start'
                          onClick={() => addOption(option.id)}
                        >
                          <Plus className='mr-2 h-4 w-4' />
                          {option.label}
                        </Button>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className='text-base'>Your ranking</CardTitle>
                  </CardHeader>
                  <CardContent className='flex flex-col gap-2'>
                    {rankedOptions.length === 0 ? (
                      <p className='text-muted-foreground text-sm'>
                        No options ranked yet.
                      </p>
                    ) : isHydrated ? (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext
                          items={ranking}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className='flex flex-col gap-2'>
                            {rankedOptions.map((option, index) => (
                              <SortableRankRow
                                key={option.id}
                                option={option}
                                position={index + 1}
                                disabled={submitBallot.isPending}
                                onRemove={removeOption}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    ) : (
                      <div className='flex flex-col gap-2'>
                        {rankedOptions.map((option, index) => (
                          <div
                            key={option.id}
                            className='rounded-md border bg-card p-2 text-sm'
                          >
                            {index + 1}. {option.label}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className='flex flex-wrap items-center gap-2'>
                <Button
                  onClick={() =>
                    submitBallot.mutate({
                      uuid: poll.uuid,
                      rankedOptionIds: ranking,
                    })
                  }
                  disabled={submitBallot.isPending}
                >
                  {submitBallot.isPending
                    ? 'Saving...'
                    : myBallot.data?.hasVoted
                      ? 'Update my ballot'
                      : 'Submit ballot'}
                </Button>
                {ranking.length > 0 ? (
                  <Button
                    variant='ghost'
                    onClick={() => setRanking([])}
                    disabled={submitBallot.isPending}
                  >
                    Clear
                  </Button>
                ) : null}
                <Button variant='outline' onClick={() => setTab('results')}>
                  View results
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value='results' className='pt-4'>
          {results.isLoading ? (
            <p className='text-muted-foreground text-sm'>Loading results…</p>
          ) : results.data ? (
            <div className='flex flex-col gap-6'>
              <Card>
                <CardHeader>
                  <CardTitle className='text-base'>Ranking</CardTitle>
                  <CardDescription>
                    {results.data.totalBallots} vote
                    {results.data.totalBallots === 1 ? '' : 's'}
                  </CardDescription>
                </CardHeader>
                <CardContent className='flex flex-col gap-2'>
                  {results.data.ranking.map((row) => (
                    <div
                      key={row.optionId}
                      className='flex items-center gap-3 rounded-md border p-2'
                    >
                      <span className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary text-sm'>
                        {row.position}
                      </span>
                      <span className='flex-1 font-medium text-sm'>
                        {row.label}
                      </span>
                      <span className='text-muted-foreground text-xs'>
                        {row.ballotsRanking} ranked
                        {row.averageRank !== null
                          ? ` · avg ${row.averageRank.toFixed(1)}`
                          : ''}
                      </span>
                      <Badge variant='secondary'>{row.points} pts</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className='text-base'>
                    Every ballot ({results.data.ballots.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className='flex flex-col gap-3'>
                  {results.data.ballots.length === 0 ? (
                    <p className='text-muted-foreground text-sm'>
                      No votes yet.
                    </p>
                  ) : (
                    results.data.ballots.map((ballot) => (
                      <div
                        key={ballot.userId}
                        className='flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center'
                      >
                        <div className='flex min-w-[160px] items-center gap-2'>
                          <Avatar className='h-7 w-7'>
                            {ballot.image ? (
                              <AvatarImage
                                src={ballot.image}
                                alt={ballot.name ?? 'Voter'}
                              />
                            ) : null}
                            <AvatarFallback className='text-xs'>
                              {initials(ballot.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className='font-medium text-sm'>
                            {ballot.name ?? 'Unknown'}
                          </span>
                        </div>
                        <div className='flex flex-wrap gap-1'>
                          {ballot.choices.length === 0 ? (
                            <span className='text-muted-foreground text-xs'>
                              (empty ballot)
                            </span>
                          ) : (
                            ballot.choices.map((choice) => (
                              <Badge
                                key={choice.optionId}
                                variant='outline'
                                className='font-normal'
                              >
                                {choice.rank}. {choice.label}
                              </Badge>
                            ))
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <p className='text-muted-foreground text-sm'>
              Could not load results.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
