import { auth } from '@/server/auth'
import { botlatro_service } from '@/server/services/botlatro.service'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ gameNumber: string }> }
) {
  const session = await auth()

  if (!session?.user || session.user.role === 'user') {
    return new Response('Forbidden', { status: 403 })
  }

  const gameNumber = Number.parseInt((await params).gameNumber, 10)

  if (Number.isNaN(gameNumber)) {
    return new Response('Invalid game number', { status: 400 })
  }

  try {
    const transcript = await botlatro_service.get_transcript(gameNumber)

    if (!transcript) {
      return new Response('Transcript not found', { status: 404 })
    }

    return new Response(transcript, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    })
  } catch (error) {
    console.error(`Error fetching transcript #${gameNumber}:`, error)
    return new Response('Failed to fetch transcript', { status: 500 })
  }
}
