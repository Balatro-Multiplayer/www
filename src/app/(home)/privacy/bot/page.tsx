import Link from 'next/link'
import { createMetadata } from '../../../../../lib/metadata'

export const metadata = createMetadata({
  title: 'Botlatro Bot Privacy Policy',
  description:
    'How the Botlatro Multiplayer Discord bot collects, uses, and stores your data.',
  path: '/privacy/bot',
})

const LAST_UPDATED = 'August 30, 2026'

const DISCORD_INVITE = 'https://discord.gg/bBb5eU2gWc'

const CONTACT_EMAIL = 'casper_jb@icloud.com'

export default function BotPrivacyPolicyPage() {
  return (
    <div className='mx-auto w-[calc(100%-1rem)] max-w-3xl flex-1 py-10'>
      <div className='mb-10'>
        <h1 className='font-bold text-4xl tracking-tight'>
          Botlatro Privacy Policy
        </h1>
        <p className='mt-3 text-muted-foreground'>
          How the Botlatro Multiplayer Discord bot handles your data.
        </p>
        <p className='mt-1 text-muted-foreground text-sm'>
          Last updated: {LAST_UPDATED}
        </p>
      </div>

      <div className='space-y-8 text-muted-foreground leading-relaxed'>
        <section className='space-y-3'>
          <p>
            This policy explains what information the Botlatro Multiplayer
            Discord bot (&ldquo;Botlatro&rdquo;, &ldquo;the bot&rdquo;,
            &ldquo;we&rdquo;) collects when you use it, why we collect it, and
            how it is stored and shared. Botlatro is the matchmaking and queue
            bot for the Balatro Multiplayer Discord community. It is a
            community-run, unofficial project and is not affiliated with
            LocalThunk or Playstack.
          </p>
          <p>
            By interacting with the bot &mdash; joining a queue, playing ranked
            matches, or using its commands &mdash; you consent to the handling
            of data as described below.
          </p>
        </section>

        <section className='space-y-3'>
          <h2 className='font-semibold text-2xl text-foreground tracking-tight'>
            Information we collect
          </h2>
          <p>
            Botlatro only stores the data it needs to run matchmaking, keep
            rankings, and moderate the community. We do{' '}
            <strong className='text-foreground'>not</strong> collect email
            addresses, passwords, IP addresses, payment details, or any Discord
            data beyond what is listed here.
          </p>
          <ul className='list-disc space-y-2 pl-6'>
            <li>
              <strong className='text-foreground'>
                Discord account identifiers.
              </strong>{' '}
              Your Discord user ID and current display name, so we can identify
              you across queues, matches, and leaderboards.
            </li>
            <li>
              <strong className='text-foreground'>
                Queue and ranking data.
              </strong>{' '}
              Your rating (ELO), peak rating, wins, losses, games played, win
              streaks, and the times you join queues.
            </li>
            <li>
              <strong className='text-foreground'>Match records.</strong> The
              matches you take part in, including your team, opponents, rating
              changes, and in-game choices such as decks and stakes.
            </li>
            <li>
              <strong className='text-foreground'>Party data.</strong> The
              parties you form or join in order to queue together with other
              players.
            </li>
            <li>
              <strong className='text-foreground'>Moderation records.</strong>{' '}
              Bans and strikes issued to your account, including the reason, who
              issued them, when they were issued, when they expire, and the
              match or channel they relate to. This may include queue-specific
              restrictions such as deck bans.
            </li>
            <li>
              <strong className='text-foreground'>Match transcripts.</strong>{' '}
              When a match channel is closed, the bot may save an archive of the
              messages sent in that channel. Transcripts can include the display
              names of participants, the text of messages, timestamps, and links
              to any attachments shared in the channel.
            </li>
            <li>
              <strong className='text-foreground'>Feedback you submit.</strong>{' '}
              If you use the bot&rsquo;s feedback feature, we store your rating
              and any written comments you provide, linked to your Discord user
              ID.
            </li>
            <li>
              <strong className='text-foreground'>Your preferences.</strong>{' '}
              Settings you choose, such as whether the bot may send you direct
              messages.
            </li>
          </ul>
        </section>

        <section className='space-y-3'>
          <h2 className='font-semibold text-2xl text-foreground tracking-tight'>
            How we use your data
          </h2>
          <ul className='list-disc space-y-2 pl-6'>
            <li>To match you with other players and run queues fairly.</li>
            <li>
              To calculate and display your rating, statistics, and position on
              leaderboards.
            </li>
            <li>To record match history and resolve disputes.</li>
            <li>
              To enforce community rules through bans, strikes, and other
              moderation actions.
            </li>
            <li>
              To send you match and queue notifications via Discord direct
              messages, where you have not disabled them.
            </li>
            <li>To improve the bot and the community using your feedback.</li>
          </ul>
          <p>
            Some of this information &mdash; such as your display name, rating,
            statistics, and match history &mdash; is shown publicly, both within
            the Discord server and on{' '}
            <Link href='/' className='text-foreground underline'>
              balatromp.com
            </Link>{' '}
            (for example on player profiles and leaderboards).
          </p>
        </section>

        <section className='space-y-3'>
          <h2 className='font-semibold text-2xl text-foreground tracking-tight'>
            How your data is stored
          </h2>
          <p>
            Your data is stored in a private database on servers operated by the
            Balatro Multiplayer team. Access is limited to the bot itself and to
            the maintainers and moderators who run the community. We take
            reasonable steps to protect the data, but no system can be
            guaranteed to be completely secure.
          </p>
          <p>
            Botlatro operates on Discord, and your use of Discord is also
            governed by{' '}
            <Link
              href='https://discord.com/privacy'
              target='_blank'
              rel='noopener noreferrer'
              className='text-foreground underline'
            >
              Discord&rsquo;s Privacy Policy
            </Link>
            .
          </p>
        </section>

        <section className='space-y-3'>
          <h2 className='font-semibold text-2xl text-foreground tracking-tight'>
            Data sharing
          </h2>
          <p>
            We do not sell your data or share it with advertisers. Data is
            shared only:
          </p>
          <ul className='list-disc space-y-2 pl-6'>
            <li>
              Publicly, where it is part of leaderboards, player profiles, match
              history, and other features on the Discord server and
              balatromp.com.
            </li>
            <li>
              With the maintainers and moderators of the Balatro Multiplayer
              community, for the purposes described above.
            </li>
            <li>Where we are required to do so by law.</li>
          </ul>
        </section>

        <section className='space-y-3'>
          <h2 className='font-semibold text-2xl text-foreground tracking-tight'>
            Data retention
          </h2>
          <p>
            We keep your data for as long as it is needed to run matchmaking,
            maintain rankings and match history, and moderate the community.
            Moderation records may be retained after they expire so that
            repeated behaviour can be handled fairly. You may request deletion
            of your data as described below, though some records may be kept
            where there is a genuine need (for example, an active ban).
          </p>
        </section>

        <section className='space-y-3'>
          <h2 className='font-semibold text-2xl text-foreground tracking-tight'>
            Your choices and rights
          </h2>
          <p>
            You can ask us to access, correct, or delete the data we hold about
            you. You can also control whether the bot sends you direct messages
            through its settings. To make a request, email us at{' '}
            <Link
              href={`mailto:${CONTACT_EMAIL}`}
              className='text-foreground underline'
            >
              {CONTACT_EMAIL}
            </Link>
            , or contact any one of our moderators in the{' '}
            <Link
              href={DISCORD_INVITE}
              target='_blank'
              rel='noopener noreferrer'
              className='text-foreground underline'
            >
              Discord server
            </Link>
            .
          </p>
        </section>

        <section className='space-y-3'>
          <h2 className='font-semibold text-2xl text-foreground tracking-tight'>
            Children
          </h2>
          <p>
            Botlatro is used through Discord, which requires users to be at
            least 13 years old (or older in some countries). The bot is not
            intended for anyone below the minimum age required to use Discord.
          </p>
        </section>

        <section className='space-y-3'>
          <h2 className='font-semibold text-2xl text-foreground tracking-tight'>
            Changes to this policy
          </h2>
          <p>
            We may update this policy from time to time. When we do, we will
            update the &ldquo;Last updated&rdquo; date at the top of this page.
            Significant changes may also be announced in the Discord server.
          </p>
        </section>

        <section className='space-y-3'>
          <h2 className='font-semibold text-2xl text-foreground tracking-tight'>
            Contact
          </h2>
          <p>
            If you have questions about this policy or how your data is handled,
            email us at{' '}
            <Link
              href={`mailto:${CONTACT_EMAIL}`}
              className='text-foreground underline'
            >
              {CONTACT_EMAIL}
            </Link>
            , or contact any one of our moderators in the{' '}
            <Link
              href={DISCORD_INVITE}
              target='_blank'
              rel='noopener noreferrer'
              className='text-foreground underline'
            >
              Discord server
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  )
}
