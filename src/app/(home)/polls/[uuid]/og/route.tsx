import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ImageResponse } from 'next/og'
import { accentColorForUuid, formatCloseLabel } from '@/lib/poll-embed'
import { pollMethodLabel } from '@/lib/poll-method'
import { api } from '@/trpc/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const WIDTH = 1200
const HEIGHT = 630
const BG = '#101014'
const FG = '#fafafa'
const MUTED = '#a1a1aa'

// Load brand assets from public/ (copied wholesale into the standalone output;
// cwd is the app root at runtime). Cached across requests, with safe fallbacks.
function loadFont(): ArrayBuffer | null {
  try {
    const file = readFileSync(path.join(process.cwd(), 'public', 'm6x11.ttf'))
    return file.buffer.slice(
      file.byteOffset,
      file.byteOffset + file.byteLength
    ) as ArrayBuffer
  } catch {
    return null
  }
}

function loadLogoDataUrl(): string | null {
  try {
    const file = readFileSync(path.join(process.cwd(), 'public', 'logo.png'))
    return `data:image/png;base64,${file.toString('base64')}`
  } catch {
    return null
  }
}

const FONT = loadFont()
const LOGO = loadLogoDataUrl()

function truncate(value: string, max: number): string {
  const trimmed = value.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ uuid: string }> }
) {
  const { uuid } = await params
  const poll = await api.polls.getPublic({ uuid }).catch(() => null)

  const accent = accentColorForUuid(uuid)
  const fonts = FONT
    ? [
        {
          name: 'm6x11',
          data: FONT,
          weight: 400 as const,
          style: 'normal' as const,
        },
      ]
    : undefined

  if (!poll) {
    return new ImageResponse(
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: BG,
          color: FG,
          fontSize: 64,
        }}
      >
        Poll not found
      </div>,
      { width: WIDTH, height: HEIGHT, fonts }
    )
  }

  const closeLabel = formatCloseLabel(poll)
  const methodLabel = pollMethodLabel(poll.method)
  const title = truncate(poll.title, 90)
  const description = poll.description
    ? truncate(poll.description, 160)
    : poll.method === 'approval'
      ? 'Pick any options. Vote and see live results.'
      : 'Rank the options. Vote and see live results.'

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '64px',
        backgroundColor: BG,
        backgroundImage: `linear-gradient(135deg, ${accent}33, transparent 55%)`,
        color: FG,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        {LOGO ? (
          // biome-ignore lint/performance/noImgElement: satori renders <img> in OG images
          <img src={LOGO} width={64} height={64} alt='' />
        ) : null}
        <div
          style={{ display: 'flex', flexDirection: 'column', color: accent }}
        >
          <span style={{ fontSize: 40, fontWeight: 700 }}>
            Balatro Multiplayer
          </span>
          <span style={{ fontSize: 28, color: MUTED }}>{methodLabel} poll</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05 }}>
          {title}
        </div>
        <div style={{ fontSize: 34, color: 'rgba(240,240,240,0.85)' }}>
          {description}
        </div>
      </div>

      {/* Footer chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div
          style={{
            display: 'flex',
            fontSize: 28,
            padding: '10px 22px',
            borderRadius: 9999,
            border: `2px solid ${accent}`,
            color: FG,
          }}
        >
          {poll.options.length} options
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 28,
            padding: '10px 22px',
            borderRadius: 9999,
            border: '2px solid rgba(255,255,255,0.25)',
            color: MUTED,
          }}
        >
          {closeLabel}
        </div>
        <div
          style={{
            display: 'flex',
            marginLeft: 'auto',
            fontSize: 28,
            color: accent,
          }}
        >
          Vote &amp; see live results →
        </div>
      </div>
    </div>,
    { width: WIDTH, height: HEIGHT, fonts }
  )
}
