import Link from 'next/link'
import { BracketView } from '@/app/_components/bracket-view'
import { api } from '@/trpc/server'
import { createMetadata } from '../../../../lib/metadata'

export const metadata = createMetadata({
  title: 'Playoffs',
  description: 'Balatro Multiplayer playoff brackets and results.',
  path: '/playoffs',
})

export const dynamic = 'force-dynamic'

export default async function PlayoffsPage() {
  const published = await api.brackets.listPublic()
  const latest = published[0]
  const bracket = latest
    ? await api.brackets.getPublic({ id: latest.id }).catch(() => null)
    : null

  return (
    <div className='mx-auto flex w-[calc(100%-1rem)] max-w-fd-container flex-col gap-6 pt-8 pb-16'>
      <div className='flex flex-col gap-2'>
        <h1 className='font-bold text-3xl'>{bracket?.name ?? 'Playoffs'}</h1>
        <p className='text-muted-foreground text-sm'>
          Follow the playoff bracket as results come in.
        </p>
      </div>

      {bracket ? (
        <BracketView bracket={bracket} />
      ) : (
        <div className='rounded-lg border border-dashed px-6 py-16 text-center text-muted-foreground'>
          No playoff bracket is live right now. Check back soon!
        </div>
      )}

      {published.length > 1 ? (
        <div className='flex flex-col gap-2'>
          <h2 className='font-semibold text-lg'>Past brackets</h2>
          <ul className='flex flex-col gap-1'>
            {published.slice(1).map((item) => (
              <li key={item.id}>
                <Link
                  href={`/playoffs/${item.id}`}
                  className='text-primary text-sm underline-offset-4 hover:underline'
                >
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
