import Link from 'next/link'
import { createMetadata, siteConfig } from '../../../../../lib/metadata'
import { ASSETS } from './registry'

/**
 * Convenience index of the unlisted asset endpoints. noindex and not linked
 * from anywhere on the site; it exists purely to make the direct links easy to
 * copy when filling out Discord's privileged-intent form.
 */
export const metadata = createMetadata({
  title: 'Privileged Intent Assets',
  description:
    'Direct links to the demonstration pages for Discord privileged-intent verification.',
  path: '/privacy/assets',
  noIndex: true,
})

export default function AssetsIndexPage() {
  return (
    <div className='mx-auto w-[calc(100%-1rem)] max-w-3xl flex-1 py-10'>
      <div className='mb-6'>
        <h1 className='font-bold text-2xl tracking-tight'>
          Privileged Intent Assets
        </h1>
        <p className='mt-2 text-muted-foreground'>
          Direct links to the demonstration pages for Discord&rsquo;s
          privileged-intent verification. These pages are not indexed and are
          not linked from anywhere else on the site.
        </p>
      </div>

      <ul className='space-y-4'>
        {Object.entries(ASSETS).map(([id, asset]) => {
          const url = `${siteConfig.url}/privacy/assets/${id}`

          return (
            <li key={id} className='rounded-lg border bg-card p-4'>
              <Link
                href={`/privacy/assets/${id}`}
                className='font-medium text-foreground underline'
              >
                {asset.title}
              </Link>
              <p className='mt-1 break-all text-muted-foreground text-sm'>
                {url}
              </p>
              {asset.description ? (
                <p className='mt-2 text-muted-foreground text-sm'>
                  {asset.description}
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
