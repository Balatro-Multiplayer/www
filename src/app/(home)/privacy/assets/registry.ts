/**
 * Registry of unlisted asset endpoints for Discord's privileged-intent
 * verification. Shared by the `/privacy/assets` index and the
 * `/privacy/assets/[id]` media pages so there is one source of truth.
 *
 * To add a new one, drop the file in `public/privacy-assets/` (or host it
 * anywhere and use its full URL), then add an entry below keyed by the id you
 * want in the URL. `media` accepts images or videos; the kind is inferred from
 * the file extension, so a screenshot can be swapped for an mp4 later with no
 * other change.
 */
export type AssetMedia = {
  src: string
  alt: string
}

export type Asset = {
  title: string
  description?: string
  media: AssetMedia[]
}

export const ASSETS: Record<string, Asset> = {
  'message-content': {
    title: 'Message Content Intent',
    description:
      'Botlatro requires the Message Content privileged intent so it can read text commands (for example "!queue") and archive the messages sent in temporary match channels into a match transcript.',
    media: [
      {
        src: '/privacy-assets/queue-command.png',
        alt: 'A member asks how to queue, another runs the !queue text command, and the bot reads it and responds with guidance.',
      },
      {
        src: '/privacy-assets/match-history-transcript-link.png',
        alt: 'A match in the website history table with a link to its saved transcript.',
      },
      {
        src: '/privacy-assets/game-transcript.png',
        alt: 'A saved match-channel transcript showing the message content the bot captured.',
      },
      {
        src: '/privacy-assets/deck-parsing.png',
        alt: 'Players negotiate a deck and stake in the match channel; the bot reads the message content to parse the requested deck/stake.',
      },
    ],
  },
  'server-members': {
    title: 'Server Members Intent',
    description:
      'Botlatro requires the Server Members privileged intent so it can sync the guild member list and read member display names and roles, which drive queue access, matchmaking, leaderboards, and moderation.',
    media: [
      {
        src: '/privacy-assets/leaderboard.png',
        alt: 'A leaderboard on the website showing member display names and avatars synced from the guild member list.',
      },
    ],
  },
  misc: {
    title: 'Miscellaneous',
    description:
      'General screenshots of the bot in use that are not tied to a specific privileged intent.',
    media: [
      {
        src: '/privacy-assets/queue-embed.png',
        alt: 'The queue embed the bot posts, showing the current player count in each queue.',
      },
      {
        src: '/privacy-assets/member-roles.png',
        alt: 'A member profile card showing rank and access roles (e.g. Gold, RankedGamer) the bot assigns via the Manage Roles permission, which does not require a privileged intent.',
      },
    ],
  },
}

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.ogv']

export function isVideo(src: string) {
  return VIDEO_EXTENSIONS.some((ext) => src.toLowerCase().endsWith(ext))
}
