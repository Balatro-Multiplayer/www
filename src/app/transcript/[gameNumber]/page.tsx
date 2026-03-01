import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/server/auth'

type Props = {
  params: Promise<{
    gameNumber: string
  }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const gameNumber = Number.parseInt((await params).gameNumber, 10)
  return {
    title: `Game Transcript #${gameNumber}`,
  }
}

export default async function TranscriptPage({ params }: Props) {
  const session = await auth()

  if (!session?.user || session.user.role === 'user') {
    redirect('/api/auth/signin')
  }

  const gameNumber = Number.parseInt((await params).gameNumber, 10)

  return (
    <iframe
      src={`/api/transcript/${gameNumber}`}
      className='h-screen w-screen border-none'
      title={`Game Transcript #${gameNumber}`}
    />
  )
}
