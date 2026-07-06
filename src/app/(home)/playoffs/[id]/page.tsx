import { notFound } from 'next/navigation'
import { BracketView } from '@/app/_components/bracket-view'
import { api } from '@/trpc/server'
import { createMetadata } from '../../../../../lib/metadata'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const bracket = await loadBracket(params)
  return createMetadata({
    title: bracket ? bracket.name : 'Playoffs',
    description: 'Balatro Multiplayer playoff bracket and results.',
    path: `/playoffs/${bracket?.id ?? ''}`,
  })
}

async function loadBracket(params: Promise<{ id: string }>) {
  const { id } = await params
  const numericId = Number.parseInt(id, 10)
  if (!Number.isInteger(numericId) || numericId <= 0) return null
  return api.brackets.getPublic({ id: numericId }).catch(() => null)
}

export default async function PlayoffBracketPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const bracket = await loadBracket(params)
  if (!bracket) {
    notFound()
  }

  return (
    <div className='mx-auto flex w-[calc(100%-1rem)] max-w-fd-container flex-col gap-6 pt-8 pb-16'>
      <div className='flex flex-col gap-2'>
        <h1 className='font-bold text-3xl'>{bracket.name}</h1>
        <p className='text-muted-foreground text-sm'>
          Follow the playoff bracket as results come in.
        </p>
      </div>
      <BracketView bracket={bracket} />
    </div>
  )
}
