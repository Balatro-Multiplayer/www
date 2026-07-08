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
import { Copy, GripVertical, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { type PollMethod, pollMethodLabel } from '@/lib/poll-method'
import { api } from '@/trpc/react'

type Option = { id: number; label: string }

/** Format a Date as a `datetime-local` input value in the browser's local time. */
function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

type Poll = {
  id: number
  uuid: string
  title: string
  description: string | null
  method: PollMethod
  status: string
  closesAt: string | null
  ballotCount: number
  options: Option[]
}

function publicPollUrl(uuid: string) {
  if (typeof window === 'undefined') return `/polls/${uuid}`
  return `${window.location.origin}/polls/${uuid}`
}

function SortableOptionRow({
  option,
  disabled,
  onLabelChange,
  onLabelCommit,
  onRemove,
  removeDisabled,
}: {
  option: Option
  disabled: boolean
  onLabelChange: (id: number, label: string) => void
  onLabelCommit: (id: number) => void
  onRemove: (id: number) => void
  removeDisabled: boolean
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
      <Input
        value={option.label}
        onChange={(event) => onLabelChange(option.id, event.target.value)}
        onBlur={() => onLabelCommit(option.id)}
      />
      <Button
        type='button'
        variant='ghost'
        size='sm'
        className='shrink-0 text-destructive'
        disabled={removeDisabled}
        onClick={() => onRemove(option.id)}
      >
        <Trash2 className='h-4 w-4' />
      </Button>
    </div>
  )
}

export function PollDetailClient({ poll }: { poll: Poll }) {
  const [title, setTitle] = useState(poll.title)
  const [description, setDescription] = useState(poll.description ?? '')
  const [status, setStatus] = useState(poll.status)
  const [closesAt, setClosesAt] = useState<Date | null>(
    poll.closesAt ? new Date(poll.closesAt) : null
  )
  const [options, setOptions] = useState<Option[]>(poll.options)
  const [newOption, setNewOption] = useState('')
  const [isHydrated, setIsHydrated] = useState(false)

  // Last-persisted labels, to detect edits on blur.
  const savedLabels = useRef(new Map(poll.options.map((o) => [o.id, o.label])))

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const applyOptions = (next: Option[]) => {
    setOptions(next)
    savedLabels.current = new Map(next.map((o) => [o.id, o.label]))
  }

  const updatePoll = api.polls.update.useMutation({
    onError: (err) => toast.error(err.message),
  })
  const reorderOptions = api.polls.reorderOptions.useMutation({
    onError: (err) => toast.error(err.message),
  })
  const setPollStatus = api.polls.setStatus.useMutation({
    onError: (err) => toast.error(err.message),
  })

  const busy =
    updatePoll.isPending || reorderOptions.isPending || setPollStatus.isPending

  function saveMeta() {
    updatePoll.mutate(
      {
        id: poll.id,
        title: title.trim() || poll.title,
        description: description.trim() ? description.trim() : null,
      },
      { onSuccess: () => toast.success('Poll details saved') }
    )
  }

  // Persist the close time only when the user commits (blur / clear), not on
  // every keystroke, and skip no-op saves.
  const savedClosesAt = useRef<number | null>(
    poll.closesAt ? new Date(poll.closesAt).getTime() : null
  )

  function commitCloseTime(next: Date | null) {
    const nextMs = next ? next.getTime() : null
    if (nextMs === savedClosesAt.current) return
    savedClosesAt.current = nextMs
    updatePoll.mutate(
      { id: poll.id, closesAt: next },
      {
        onSuccess: () =>
          toast.success(
            next ? 'Auto-close time updated' : 'Auto-close disabled'
          ),
      }
    )
  }

  function handleLabelChange(id: number, label: string) {
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, label } : o)))
  }

  function handleLabelCommit(id: number) {
    const option = options.find((o) => o.id === id)
    if (!option) return
    const label = option.label.trim()
    if (!label) {
      // Restore previous label if cleared.
      const prev = savedLabels.current.get(id) ?? ''
      setOptions((list) =>
        list.map((o) => (o.id === id ? { ...o, label: prev } : o))
      )
      return
    }
    if (label === savedLabels.current.get(id)) return
    updatePoll.mutate(
      { id: poll.id, renameOptions: [{ id, label }] },
      {
        onSuccess: (res) => {
          applyOptions(res.options.map((o) => ({ id: o.id, label: o.label })))
          toast.success('Option renamed')
        },
      }
    )
  }

  function handleRemove(id: number) {
    updatePoll.mutate(
      { id: poll.id, removeOptionIds: [id] },
      {
        onSuccess: (res) => {
          applyOptions(res.options.map((o) => ({ id: o.id, label: o.label })))
          toast.success('Option removed')
        },
      }
    )
  }

  function handleAddOption() {
    const label = newOption.trim()
    if (!label) return
    updatePoll.mutate(
      { id: poll.id, addOptions: [label] },
      {
        onSuccess: (res) => {
          applyOptions(res.options.map((o) => ({ id: o.id, label: o.label })))
          setNewOption('')
          toast.success('Option added')
        },
      }
    )
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = options.findIndex((o) => o.id === active.id)
    const newIndex = options.findIndex((o) => o.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const previous = options
    const next = arrayMove(options, oldIndex, newIndex)
    setOptions(next)
    reorderOptions.mutate(
      { pollId: poll.id, optionIds: next.map((o) => o.id) },
      {
        onSuccess: (res) =>
          applyOptions(res.map((o) => ({ id: o.id, label: o.label }))),
        onError: () => setOptions(previous),
      }
    )
  }

  function handleStatusToggle(open: boolean) {
    const nextStatus = open ? 'open' : 'closed'
    setStatus(nextStatus)
    setPollStatus.mutate(
      { id: poll.id, status: nextStatus },
      {
        onSuccess: () => toast.success(open ? 'Poll opened' : 'Poll closed'),
        onError: () => setStatus(status),
      }
    )
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicPollUrl(poll.uuid))
      toast.success('Public link copied')
    } catch {
      toast.error('Could not copy link')
    }
  }

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-col gap-2'>
        <div className='flex items-center gap-3'>
          <h1 className='font-bold text-3xl'>Manage Poll</h1>
          <Badge variant='secondary'>{pollMethodLabel(poll.method)}</Badge>
          {status === 'open' ? (
            <Badge>Open</Badge>
          ) : (
            <Badge variant='outline'>Closed</Badge>
          )}
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Button variant='outline' size='sm' onClick={copyLink}>
            <Copy className='mr-2 h-4 w-4' /> Copy public link
          </Button>
          <Button variant='outline' size='sm' asChild>
            <Link href={`/polls/${poll.uuid}`}>View public poll</Link>
          </Button>
          <Button variant='ghost' size='sm' asChild>
            <Link href='/admin/polls'>Back to polls</Link>
          </Button>
        </div>
        <p className='text-muted-foreground text-sm'>
          {poll.ballotCount} vote{poll.ballotCount === 1 ? '' : 's'} cast
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>
            Title and description shown to voters.
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <div className='grid gap-2'>
            <Label htmlFor='detail-title'>Title</Label>
            <Input
              id='detail-title'
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={busy}
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='detail-description'>Description</Label>
            <Textarea
              id='detail-description'
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={busy}
            />
          </div>
          <div className='flex items-center justify-between rounded-md border p-3'>
            <div>
              <p className='font-medium text-sm'>Voting open</p>
              <p className='text-muted-foreground text-xs'>
                Closing a poll freezes voting but keeps results visible.
              </p>
            </div>
            <Switch
              checked={status === 'open'}
              onCheckedChange={handleStatusToggle}
              disabled={setPollStatus.isPending}
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='detail-closes-at'>Auto-close time</Label>
            <div className='flex items-center gap-2'>
              <Input
                id='detail-closes-at'
                type='datetime-local'
                className='w-auto'
                // Empty until hydrated so SSR and client match (local-time based).
                value={
                  isHydrated && closesAt ? toDatetimeLocalValue(closesAt) : ''
                }
                // Prevent picking a time in the past (which would close instantly).
                min={isHydrated ? toDatetimeLocalValue(new Date()) : undefined}
                onChange={(event) => {
                  const value = event.target.value
                  setClosesAt(value ? new Date(value) : null)
                }}
                onBlur={() => commitCloseTime(closesAt)}
                disabled={busy}
              />
              {closesAt ? (
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  disabled={busy}
                  onClick={() => {
                    setClosesAt(null)
                    commitCloseTime(null)
                  }}
                >
                  Clear
                </Button>
              ) : null}
            </div>
            <p className='text-muted-foreground text-xs'>
              Voting stops automatically at this time (your local time zone).
              Clear it for a poll that never auto-closes.
            </p>
          </div>
          <div>
            <Button onClick={saveMeta} disabled={busy}>
              {updatePoll.isPending ? 'Saving...' : 'Save details'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Options</CardTitle>
          <CardDescription>
            Drag to reorder. Options with existing votes cannot be removed.
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          {isHydrated ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={options.map((o) => o.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className='flex flex-col gap-2'>
                  {options.map((option) => (
                    <SortableOptionRow
                      key={option.id}
                      option={option}
                      disabled={busy}
                      onLabelChange={handleLabelChange}
                      onLabelCommit={handleLabelCommit}
                      onRemove={handleRemove}
                      removeDisabled={busy || options.length <= 2}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className='flex flex-col gap-2'>
              {options.map((option) => (
                <div
                  key={option.id}
                  className='rounded-md border bg-card p-2 text-sm'
                >
                  {option.label}
                </div>
              ))}
            </div>
          )}

          <div className='flex items-center gap-2'>
            <Input
              value={newOption}
              onChange={(event) => setNewOption(event.target.value)}
              placeholder='Add another option'
              disabled={busy}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleAddOption()
                }
              }}
            />
            <Button
              type='button'
              variant='outline'
              onClick={handleAddOption}
              disabled={busy || !newOption.trim()}
            >
              Add
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
