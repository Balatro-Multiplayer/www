import { BracketView } from '@/app/_components/bracket-view'
import { seedNames, seedPlayerLinks } from '@/lib/bracket'
import { api } from '@/trpc/server'
import { createMetadata } from '../../../../lib/metadata'
import { BracketPicker } from './_components/bracket-picker'

export const metadata = createMetadata({
  title: 'Playoffs',
  description: 'Balatro Multiplayer playoff brackets and results.',
  path: '/playoffs',
})

// Cached and revalidated on demand by bracket admin mutations; the timer is
// only a safety net.
export const revalidate = 300

export default async function PlayoffsPage() {
  const published = await api.brackets.listPublic()
  // The active season's playoffs front the page; otherwise the newest season.
  const featured = published.find((row) => row.seasonIsActive) ?? published[0]
  const bracket = featured
    ? await api.brackets.getPublic({ id: featured.id }).catch(() => null)
    : null

  return (
    <div className='mx-auto flex w-[calc(100%-1rem)] max-w-[1600px] flex-col gap-6 pt-8 pb-16'>
      <div className='flex flex-col gap-2'>
        <h1 className='font-bold text-3xl'>{bracket?.name ?? 'Playoffs'}</h1>
        <p className='text-muted-foreground text-sm'>
          Follow the playoff bracket as results come in.
        </p>
      </div>

      {bracket ? (
        <BracketPicker brackets={published} activeId={bracket.id} />
      ) : null}

      {bracket ? (
        <BracketView
          bracket={{ ...bracket, seeds: seedNames(bracket.seeds) }}
          playerLinks={seedPlayerLinks(bracket.seeds)}
        />
      ) : (
        <div className='rounded-lg border border-dashed px-6 py-16 text-center text-muted-foreground'>
          No playoff bracket is live right now. Check back soon!
        </div>
      )}
    </div>
  )
}
