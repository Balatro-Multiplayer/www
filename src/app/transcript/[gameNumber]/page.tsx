import { api } from '@/trpc/server'
import type { Metadata } from 'next'

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
  const gameNumber = Number.parseInt((await params).gameNumber, 10)

  try {
    const transcript = await api.history.getTranscript({ gameNumber })

    if (!transcript) {
      return (
        <div className='flex h-screen w-screen items-center justify-center'>
          <p>Transcript not found for game #{gameNumber}.</p>
        </div>
      )
    }

    return (
      <div className='transcript-container whitespace-pre-line p-8'>
        {transcript}
      </div>
    )
  } catch (error) {
    return (
      <div className='flex h-screen w-screen items-center justify-center'>
        <p className='text-red-500'>
          Failed to load transcript: {(error as Error).message}
        </p>
      </div>
    )
  }
}
