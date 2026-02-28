import { auth } from '@/server/auth'
import { api } from '@/trpc/server'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import {
  SeasonDetailClient,
  type SeasonDetailPageData,
  type SeasonSnapshotPageData,
} from './season-detail-client'

async function loadSeason(
  seasonId: number
): Promise<SeasonDetailPageData | null> {
  const season = await api.seasons
    .list()
    .then((rows) => rows.find((row) => row.id === seasonId) ?? null)

  if (!season) {
    return null
  }

  return {
    id: season.id,
    name: season.name,
    startDate: season.startDate.toISOString(),
    endDate: season.endDate?.toISOString() ?? null,
    isActive: season.isActive,
  }
}

async function loadSnapshots(
  seasonId: number
): Promise<SeasonSnapshotPageData[]> {
  return api.seasons.list_snapshots({ seasonId })
}

export default async function AdminSeasonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()

  if (session?.user.role !== 'owner') {
    redirect('/')
  }

  const { id } = await params
  const seasonId = Number.parseInt(id, 10)

  if (!Number.isInteger(seasonId) || seasonId <= 0) {
    notFound()
  }

  const season = await loadSeason(seasonId)

  if (!season) {
    notFound()
  }

  const snapshots = await loadSnapshots(seasonId)

  return (
    <div className='mx-auto flex w-[calc(100%-1rem)] max-w-fd-container flex-col gap-6 pt-8'>
      <div className='flex flex-col gap-2'>
        <Link
          href='/admin/seasons'
          className='text-muted-foreground text-sm hover:text-foreground'
        >
          Back to seasons
        </Link>
        <h1 className='font-bold text-3xl'>{season.name}</h1>
        <p className='text-muted-foreground text-sm'>
          Edit season metadata and manage leaderboard snapshot files.
        </p>
      </div>

      <SeasonDetailClient season={season} snapshots={snapshots} />
    </div>
  )
}
