'use client'

import { Copy, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { startTransition, useState } from 'react'
import { toast } from 'sonner'
import { TableShell } from '@/app/_components/table-shell'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { formatDate } from '@/lib/utils'
import { api } from '@/trpc/react'

export type PollListRow = {
  id: number
  uuid: string
  title: string
  status: string
  optionCount: number
  ballotCount: number
  createdAt: string
}

function publicPollUrl(uuid: string) {
  if (typeof window === 'undefined') return `/polls/${uuid}`
  return `${window.location.origin}/polls/${uuid}`
}

export function PollsClient({ polls }: { polls: PollListRow[] }) {
  const router = useRouter()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [options, setOptions] = useState<string[]>(['', ''])
  const [durationHours, setDurationHours] = useState('24')
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PollListRow | null>(null)

  const createPoll = api.polls.create.useMutation({
    onSuccess: ({ id }) => {
      setIsCreateOpen(false)
      resetForm()
      toast.success('Poll created')
      router.push(`/admin/polls/${id}`)
    },
    onError: (err) => toast.error(err.message),
  })

  const deletePoll = api.polls.delete.useMutation({
    onSuccess: () => {
      setPendingDelete(null)
      toast.success('Poll deleted')
      startTransition(() => router.refresh())
    },
    onError: (err) => toast.error(err.message),
  })

  function resetForm() {
    setTitle('')
    setDescription('')
    setOptions(['', ''])
    setDurationHours('24')
    setError(null)
  }

  function handleDialogChange(open: boolean) {
    setIsCreateOpen(open)
    if (!open) resetForm()
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const cleanedOptions = options.map((o) => o.trim()).filter(Boolean)

    if (!title.trim()) {
      setError('Title is required')
      return
    }
    if (cleanedOptions.length < 2) {
      setError('At least two non-empty options are required')
      return
    }
    const hours = Number.parseInt(durationHours, 10)
    if (!Number.isInteger(hours) || hours < 1) {
      setError('Duration must be a whole number of hours (1 or more)')
      return
    }
    setError(null)

    createPoll.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      options: cleanedOptions,
      durationHours: hours,
    })
  }

  async function copyLink(uuid: string) {
    try {
      await navigator.clipboard.writeText(publicPollUrl(uuid))
      toast.success('Public link copied')
    } catch {
      toast.error('Could not copy link')
    }
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <p className='text-muted-foreground text-sm'>
          {polls.length} poll{polls.length === 1 ? '' : 's'}
        </p>
        <Button onClick={() => setIsCreateOpen(true)}>New Poll</Button>
      </div>

      <TableShell className='overflow-hidden'>
        <Table>
          <TableHeader className='bg-muted/50'>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Options</TableHead>
              <TableHead>Votes</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {polls.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className='text-muted-foreground'>
                  No polls yet
                </TableCell>
              </TableRow>
            ) : (
              polls.map((poll) => (
                <TableRow key={poll.id}>
                  <TableCell className='font-medium'>{poll.title}</TableCell>
                  <TableCell>
                    {poll.status === 'open' ? (
                      <Badge>Open</Badge>
                    ) : (
                      <Badge variant='outline'>Closed</Badge>
                    )}
                  </TableCell>
                  <TableCell>{poll.optionCount}</TableCell>
                  <TableCell>{poll.ballotCount}</TableCell>
                  <TableCell>{formatDate(poll.createdAt)}</TableCell>
                  <TableCell>
                    <div className='flex justify-end gap-2'>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => copyLink(poll.uuid)}
                      >
                        <Copy className='h-4 w-4' />
                      </Button>
                      <Button variant='outline' size='sm' asChild>
                        <Link href={`/admin/polls/${poll.id}`}>Manage</Link>
                      </Button>
                      <Button variant='outline' size='sm' asChild>
                        <Link href={`/polls/${poll.uuid}`}>View</Link>
                      </Button>
                      <Button
                        variant='ghost'
                        size='sm'
                        className='text-destructive'
                        onClick={() => setPendingDelete(poll)}
                      >
                        <Trash2 className='h-4 w-4' />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableShell>

      <Dialog open={isCreateOpen} onOpenChange={handleDialogChange}>
        <DialogContent className='max-h-[85vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>New Poll</DialogTitle>
            <DialogDescription>
              Add a title, an optional description, and at least two options.
            </DialogDescription>
          </DialogHeader>

          <form className='flex flex-col gap-4' onSubmit={handleSubmit}>
            <div className='grid gap-2'>
              <Label htmlFor='poll-title'>Title</Label>
              <Input
                id='poll-title'
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder='Which map should we play next?'
                disabled={createPoll.isPending}
              />
            </div>

            <div className='grid gap-2'>
              <Label htmlFor='poll-description'>Description (optional)</Label>
              <Textarea
                id='poll-description'
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder='Any context voters should read before ranking.'
                disabled={createPoll.isPending}
              />
            </div>

            <div className='grid gap-2'>
              <Label htmlFor='poll-duration'>Duration (hours)</Label>
              <Input
                id='poll-duration'
                type='number'
                min={1}
                value={durationHours}
                onChange={(event) => setDurationHours(event.target.value)}
                disabled={createPoll.isPending}
              />
              <p className='text-muted-foreground text-xs'>
                Voting closes automatically after this many hours. You can
                change or clear this later.
              </p>
            </div>

            <div className='grid gap-2'>
              <Label>Options</Label>
              <div className='flex flex-col gap-2'>
                {options.map((option, index) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: option inputs are positional
                    key={index}
                    className='flex items-center gap-2'
                  >
                    <Input
                      value={option}
                      onChange={(event) => {
                        const next = [...options]
                        next[index] = event.target.value
                        setOptions(next)
                      }}
                      placeholder={`Option ${index + 1}`}
                      disabled={createPoll.isPending}
                    />
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      className='text-destructive'
                      disabled={options.length <= 2 || createPoll.isPending}
                      onClick={() =>
                        setOptions(options.filter((_, i) => i !== index))
                      }
                    >
                      <Trash2 className='h-4 w-4' />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='self-start'
                disabled={createPoll.isPending}
                onClick={() => setOptions([...options, ''])}
              >
                Add option
              </Button>
            </div>

            {error ? <p className='text-destructive text-sm'>{error}</p> : null}

            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => handleDialogChange(false)}
                disabled={createPoll.isPending}
              >
                Cancel
              </Button>
              <Button type='submit' disabled={createPoll.isPending}>
                {createPoll.isPending ? 'Creating...' : 'Create Poll'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this poll?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingDelete?.title}” and all of its options and votes will be
              permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePoll.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) deletePoll.mutate({ id: pendingDelete.id })
              }}
              disabled={deletePoll.isPending}
            >
              {deletePoll.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
