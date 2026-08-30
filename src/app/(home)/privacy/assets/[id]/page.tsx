import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createMetadata } from '../../../../../../lib/metadata'
import { ASSETS, isVideo } from '../registry'

/**
 * Unlisted media pages for Discord's privileged-intent verification. They exist
 * only to host media at a stable URL that can be pasted into Discord's form:
 * deliberately noindex, and reachable only from the `/privacy/assets` index or
 * a direct link. Unknown ids 404.
 *
 * Plain <img>/<video> tags are used intentionally: the site's custom next/image
 * loader rewrites URLs to remote object storage, which would break these
 * locally-served /public files.
 */
export function generateStaticParams() {
  return Object.keys(ASSETS).map((id) => ({ id }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const asset = ASSETS[id]

  return createMetadata({
    title: asset ? asset.title : 'Asset',
    description: asset?.description,
    path: `/privacy/assets/${id}`,
    noIndex: true,
  })
}

export default async function AssetPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const asset = ASSETS[id]

  if (!asset) {
    notFound()
  }

  return (
    <div className='mx-auto w-[calc(100%-1rem)] max-w-4xl flex-1 py-10'>
      <div className='mb-6'>
        <h1 className='font-bold text-2xl tracking-tight'>{asset.title}</h1>
        {asset.description ? (
          <p className='mt-2 text-muted-foreground'>{asset.description}</p>
        ) : null}
      </div>

      <div className='space-y-6'>
        {asset.media.map((item) => (
          <figure key={item.src} className='space-y-2'>
            <div className='overflow-hidden rounded-lg border bg-card'>
              {isVideo(item.src) ? (
                // biome-ignore lint/a11y/useMediaCaption: intent-justification recordings have no caption track
                <video controls preload='metadata' className='h-auto w-full'>
                  <source src={item.src} />
                  Your browser does not support the video tag.
                </video>
              ) : (
                // biome-ignore lint/performance/noImgElement: custom next/image loader targets remote storage, not /public
                <img src={item.src} alt={item.alt} className='h-auto w-full' />
              )}
            </div>
            <figcaption className='text-muted-foreground text-sm'>
              {item.alt}{' '}
              <Link href={item.src} className='text-foreground underline'>
                (direct link)
              </Link>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}
