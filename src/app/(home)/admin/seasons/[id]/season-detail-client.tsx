'use client'

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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDate } from '@/lib/utils'
import {
  LEGACY_QUEUE_ID,
  RANKED_QUEUE_ID,
  SMALLWORLD_QUEUE_ID,
  VANILLA_QUEUE_ID,
} from '@/shared/constants'
import { api } from '@/trpc/react'
import { useRouter } from 'next/navigation'
import {
  type ChangeEvent,
  type FormEvent,
  startTransition,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'

export type SeasonDetailPageData = {
  id: number
  name: string
  startDate: string
  endDate: string | null
  isActive: boolean
}

export type SeasonSnapshotPageData = {
  id: number
  seasonId: number
  queueType: string
  queueId: string
  minioKey: string | null
  uploadedBy: string | null
  createdAt: string
}

type QueueConfig = {
  queueType: string
  label: string
  queueId: string
}

type SnapshotTableRow = QueueConfig & {
  snapshot: SeasonSnapshotPageData | null
}

const KNOWN_QUEUES: QueueConfig[] = [
  { queueType: 'ranked', label: 'Standard Ranked', queueId: RANKED_QUEUE_ID },
  {
    queueType: 'smallworld',
    label: 'Smallworld',
    queueId: SMALLWORLD_QUEUE_ID,
  },
  { queueType: 'vanilla', label: 'Vanilla', queueId: VANILLA_QUEUE_ID },
  { queueType: 'legacy', label: 'Legacy Ranked', queueId: LEGACY_QUEUE_ID },
]

function toDateInputValue(value: string | null) {
  if (!value) return ''
  return value.split('T')[0] ?? ''
}

function buildSnapshotRows(
  snapshots: SeasonSnapshotPageData[]
): SnapshotTableRow[] {
  const snapshotMap = new Map(
    snapshots.map((snapshot) => [snapshot.queueType, snapshot] as const)
  )

  const knownRows = KNOWN_QUEUES.map((queue) => ({
    ...queue,
    snapshot: snapshotMap.get(queue.queueType) ?? null,
  }))

  const extraRows = snapshots
    .filter(
      (snapshot) =>
        !KNOWN_QUEUES.some((queue) => queue.queueType === snapshot.queueType)
    )
    .map((snapshot) => ({
      queueType: snapshot.queueType,
      label: snapshot.queueType,
      queueId: snapshot.queueId,
      snapshot,
    }))

  return [...knownRows, ...extraRows]
}

function getUploadDate(snapshot: SeasonSnapshotPageData | null) {
  if (!snapshot?.minioKey) {
    return '—'
  }

  const match = snapshot.minioKey.match(/-(\d+)\.json$/)

  if (!match) {
    return formatDate(snapshot.createdAt)
  }

  const timestampValue = match[1]

  if (!timestampValue) {
    return formatDate(snapshot.createdAt)
  }

  const timestamp = Number.parseInt(timestampValue, 10)

  if (Number.isNaN(timestamp)) {
    return formatDate(snapshot.createdAt)
  }

  return formatDate(new Date(timestamp))
}

function truncateMinioKey(value: string | null) {
  if (!value) return '—'
  if (value.length <= 48) return value
  return `${value.slice(0, 24)}...${value.slice(-16)}`
}

export function SeasonDetailClient({
  season,
  snapshots,
}: {
  season: SeasonDetailPageData
  snapshots: SeasonSnapshotPageData[]
}) {
  const router = useRouter()
  const uploadInputsRef = useRef<Record<string, HTMLInputElement | null>>({})
  const [name, setName] = useState(season.name)
  const [startDate, setStartDate] = useState(toDateInputValue(season.startDate))
  const [endDate, setEndDate] = useState(toDateInputValue(season.endDate))
  const [isActive, setIsActive] = useState(season.isActive)
  const [formError, setFormError] = useState<string | null>(null)
  const [uploadingQueueType, setUploadingQueueType] = useState<string | null>(
    null
  )
  const [invalidatingQueueType, setInvalidatingQueueType] = useState<
    string | null
  >(null)
  const [deleteTarget, setDeleteTarget] = useState<SnapshotTableRow | null>(
    null
  )

  const rows = buildSnapshotRows(snapshots)

  const updateSeason = api.seasons.update.useMutation({
    onSuccess: () => {
      toast.success('Season updated')
      startTransition(() => {
        router.refresh()
      })
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const uploadSnapshot = api.seasons.upload_snapshot.useMutation({
    onSuccess: () => {
      setUploadingQueueType(null)
      toast.success('Snapshot uploaded')
      startTransition(() => {
        router.refresh()
      })
    },
    onError: (error) => {
      setUploadingQueueType(null)
      toast.error(error.message)
    },
  })

  const invalidateCache = api.seasons.invalidate_cache.useMutation({
    onSuccess: () => {
      setInvalidatingQueueType(null)
      toast.success('Cache invalidated')
    },
    onError: (error) => {
      setInvalidatingQueueType(null)
      toast.error(error.message)
    },
  })

  const deleteSnapshot = api.seasons.delete_snapshot.useMutation({
    onSuccess: () => {
      setDeleteTarget(null)
      toast.success('Snapshot deleted')
      startTransition(() => {
        router.refresh()
      })
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  function handleSeasonSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!name.trim()) {
      setFormError('Name required')
      return
    }

    if (!startDate) {
      setFormError('Start date required')
      return
    }

    setFormError(null)
    updateSeason.mutate({
      id: season.id,
      name: name.trim(),
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      isActive,
    })
  }

  async function handleUpload(
    row: SnapshotTableRow,
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    if (!file.name.endsWith('.json')) {
      toast.error('Only .json files allowed')
      return
    }

    try {
      setUploadingQueueType(row.queueType)

      const text = await file.text()
      JSON.parse(text)

      const fileBytes = Array.from(new Uint8Array(await file.arrayBuffer()))

      uploadSnapshot.mutate({
        seasonId: season.id,
        queueType: row.queueType,
        queueId: row.snapshot?.queueId ?? row.queueId,
        fileName: file.name,
        contentType: file.type || 'application/json',
        buffer: fileBytes,
      })
    } catch {
      setUploadingQueueType(null)
      toast.error('Invalid JSON file')
    }
  }

  function handleInvalidate(row: SnapshotTableRow) {
    setInvalidatingQueueType(row.queueType)
    invalidateCache.mutate({
      seasonId: season.id,
      queueId: row.snapshot?.queueId ?? row.queueId,
    })
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) {
      return
    }

    deleteSnapshot.mutate({
      seasonId: season.id,
      queueType: deleteTarget.queueType,
    })
  }

  return (
    <div className='flex flex-col gap-6'>
      <TableShell className='p-4'>
        <form
          className='grid gap-4 md:grid-cols-2'
          onSubmit={handleSeasonSubmit}
        >
          <div className='grid gap-2'>
            <Label htmlFor='season-name'>Name</Label>
            <Input
              id='season-name'
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={updateSeason.isPending}
            />
          </div>

          <div className='grid gap-2'>
            <Label htmlFor='season-active'>Active season</Label>
            <div className='flex min-h-9 items-center gap-3 rounded-md border px-3'>
              <Switch
                id='season-active'
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={updateSeason.isPending}
              />
              <span className='text-sm'>
                {isActive ? 'This season is active' : 'Inactive'}
              </span>
            </div>
          </div>

          <div className='grid gap-2'>
            <Label htmlFor='season-start-date'>Start date</Label>
            <Input
              id='season-start-date'
              type='date'
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              disabled={updateSeason.isPending}
            />
          </div>

          <div className='grid gap-2'>
            <Label htmlFor='season-end-date'>End date</Label>
            <Input
              id='season-end-date'
              type='date'
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              disabled={updateSeason.isPending}
            />
          </div>

          <div className='md:col-span-2'>
            <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
              <div className='flex items-center gap-2'>
                <Badge variant={isActive ? 'default' : 'outline'}>
                  {isActive ? 'Active' : 'Inactive'}
                </Badge>
                <span className='text-muted-foreground text-sm'>
                  Season #{season.id}
                </span>
              </div>

              <Button type='submit' disabled={updateSeason.isPending}>
                {updateSeason.isPending ? 'Saving...' : 'Save Season'}
              </Button>
            </div>

            {formError ? (
              <p className='pt-3 text-destructive text-sm'>{formError}</p>
            ) : null}
          </div>
        </form>
      </TableShell>

      <TableShell className='overflow-hidden'>
        <div className='border-b px-4 py-3'>
          <h2 className='font-semibold text-lg'>Snapshots</h2>
          <p className='text-muted-foreground text-sm'>
            Upload season-end leaderboard JSON, invalidate cache, or remove a
            stored snapshot.
          </p>
        </div>

        <Table>
          <TableHeader className='bg-muted/50'>
            <TableRow>
              <TableHead>Queue</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Queue ID</TableHead>
              <TableHead>MinIO key</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const hasSnapshot = Boolean(row.snapshot?.minioKey)
              const isUploading = uploadingQueueType === row.queueType
              const isInvalidating = invalidatingQueueType === row.queueType
              const isDeleting =
                deleteSnapshot.isPending &&
                deleteTarget?.queueType === row.queueType

              return (
                <TableRow key={row.queueType}>
                  <TableCell className='font-medium'>{row.label}</TableCell>
                  <TableCell>
                    {hasSnapshot ? (
                      <Badge>Uploaded</Badge>
                    ) : (
                      <Badge variant='outline'>Not uploaded</Badge>
                    )}
                  </TableCell>
                  <TableCell>{row.snapshot?.queueId ?? row.queueId}</TableCell>
                  <TableCell className='max-w-[260px] truncate font-mono text-xs'>
                    {truncateMinioKey(row.snapshot?.minioKey ?? null)}
                  </TableCell>
                  <TableCell>{getUploadDate(row.snapshot)}</TableCell>
                  <TableCell>
                    <div className='flex flex-wrap gap-2'>
                      <input
                        ref={(node) => {
                          uploadInputsRef.current[row.queueType] = node
                        }}
                        type='file'
                        accept='.json,application/json'
                        className='hidden'
                        onChange={(event) => handleUpload(row, event)}
                      />

                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() =>
                          uploadInputsRef.current[row.queueType]?.click()
                        }
                        disabled={isUploading}
                      >
                        {isUploading
                          ? 'Uploading...'
                          : hasSnapshot
                            ? 'Replace'
                            : 'Upload'}
                      </Button>

                      <Button
                        type='button'
                        variant='secondary'
                        size='sm'
                        onClick={() => handleInvalidate(row)}
                        disabled={isInvalidating}
                      >
                        {isInvalidating
                          ? 'Invalidating...'
                          : 'Invalidate Cache'}
                      </Button>

                      <Button
                        type='button'
                        variant='destructive'
                        size='sm'
                        onClick={() => setDeleteTarget(row)}
                        disabled={!hasSnapshot || isDeleting}
                      >
                        {isDeleting ? 'Deleting...' : 'Delete'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableShell>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete snapshot?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `This removes the stored JSON for ${deleteTarget.label} and clears its cached leaderboard.`
                : 'This removes the stored snapshot.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSnapshot.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteSnapshot.isPending}
            >
              {deleteSnapshot.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
