'use client'

import { Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { startTransition, useState } from 'react'
import { toast } from 'sonner'
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
import { Checkbox } from '@/components/ui/checkbox'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { BRACKET_SIZES } from '@/lib/bracket'
import { formatDate } from '@/lib/utils'
import { api } from '@/trpc/react'

export type BracketListRow = {
  id: number
  name: string
  size: number
  isPublished: boolean
  seedCount: number
  createdAt: string
}

export function BracketsClient({ brackets }: { brackets: BracketListRow[] }) {
  const router = useRouter()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [size, setSize] = useState('16')
  const [hasThirdPlace, setHasThirdPlace] = useState(true)
  const [seedsText, setSeedsText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<BracketListRow | null>(
    null
  )

  const createBracket = api.brackets.create.useMutation({
    onSuccess: ({ id }) => {
      setIsCreateOpen(false)
      resetForm()
      toast.success('Bracket created')
      router.push(`/admin/brackets/${id}`)
    },
    onError: (err) => toast.error(err.message),
  })

  const deleteBracket = api.brackets.delete.useMutation({
    onSuccess: () => {
      setPendingDelete(null)
      toast.success('Bracket deleted')
      startTransition(() => router.refresh())
    },
    onError: (err) => toast.error(err.message),
  })

  function resetForm() {
    setName('')
    setSize('16')
    setHasThirdPlace(true)
    setSeedsText('')
    setError(null)
  }

  function handleDialogChange(open: boolean) {
    setIsCreateOpen(open)
    if (!open) resetForm()
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const sizeNumber = Number.parseInt(size, 10)
    const seeds = seedsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    if (!name.trim()) {
      setError('Name is required')
      return
    }
    if (seeds.length > sizeNumber) {
      setError(
        `Too many players: ${seeds.length} listed for a ${sizeNumber}-player bracket`
      )
      return
    }
    setError(null)

    createBracket.mutate({
      name: name.trim(),
      size: sizeNumber,
      hasThirdPlace,
      seeds: seeds.length > 0 ? seeds : undefined,
    })
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex justify-end'>
        <Button onClick={() => setIsCreateOpen(true)}>New Bracket</Button>
      </div>

      <div className='rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Players</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className='w-24' />
            </TableRow>
          </TableHeader>
          <TableBody>
            {brackets.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className='py-10 text-center text-muted-foreground'
                >
                  No brackets yet. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              brackets.map((bracket) => (
                <TableRow key={bracket.id}>
                  <TableCell>
                    <Link
                      href={`/admin/brackets/${bracket.id}`}
                      className='font-medium text-primary underline-offset-4 hover:underline'
                    >
                      {bracket.name}
                    </Link>
                  </TableCell>
                  <TableCell>{bracket.size}</TableCell>
                  <TableCell>
                    {bracket.seedCount}/{bracket.size}
                  </TableCell>
                  <TableCell>
                    {bracket.isPublished ? (
                      <Badge>Published</Badge>
                    ) : (
                      <Badge variant='secondary'>Draft</Badge>
                    )}
                  </TableCell>
                  <TableCell>{formatDate(bracket.createdAt)}</TableCell>
                  <TableCell>
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={() => setPendingDelete(bracket)}
                      aria-label={`Delete ${bracket.name}`}
                    >
                      <Trash2 className='size-4' />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isCreateOpen} onOpenChange={handleDialogChange}>
        <DialogContent className='max-h-[85vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>New Bracket</DialogTitle>
            <DialogDescription>
              Single-elimination playoff bracket. You can add or edit players
              later.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className='flex flex-col gap-4'>
            <div className='flex flex-col gap-2'>
              <Label htmlFor='bracket-name'>Name</Label>
              <Input
                id='bracket-name'
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='Season 7 Playoffs'
              />
            </div>
            <div className='flex items-end gap-4'>
              <div className='flex flex-col gap-2'>
                <Label>Players</Label>
                <Select value={size} onValueChange={setSize}>
                  <SelectTrigger className='w-28'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BRACKET_SIZES.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='flex items-center gap-2 pb-2.5'>
                <Checkbox
                  id='bracket-third-place'
                  checked={hasThirdPlace}
                  onCheckedChange={(checked) =>
                    setHasThirdPlace(checked === true)
                  }
                />
                <Label htmlFor='bracket-third-place'>Third place match</Label>
              </div>
            </div>
            <div className='flex flex-col gap-2'>
              <Label htmlFor='bracket-seeds'>
                Players (one per line, in seed order)
              </Label>
              <Textarea
                id='bracket-seeds'
                value={seedsText}
                onChange={(e) => setSeedsText(e.target.value)}
                rows={8}
                placeholder={'Dunk\ntomf\nPiton\nStarToad\n…'}
              />
              <p className='text-muted-foreground text-xs'>
                Lines 1–2 play each other in the first round, then 3–4, and so
                on. Leave empty to fill in later.
              </p>
            </div>
            {error ? <p className='text-destructive text-sm'>{error}</p> : null}
            <DialogFooter>
              <Button type='submit' disabled={createBracket.isPending}>
                {createBracket.isPending ? 'Creating…' : 'Create Bracket'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete bracket?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes “{pendingDelete?.name}” including all
              players and results.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) {
                  deleteBracket.mutate({ id: pendingDelete.id })
                }
              }}
              disabled={deleteBracket.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
