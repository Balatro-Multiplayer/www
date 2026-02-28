import { Chance } from '@/app/_components/chance'
import { Chips } from '@/app/_components/chips'
import { Hands } from '@/app/_components/hands'
import { JokerCard } from '@/app/_components/joker-card'
import { Money } from '@/app/_components/money'
import { Mult } from '@/app/_components/mult'
import { Nemesis } from '@/app/_components/nemesis'
import { Spectral } from '@/app/_components/spectral'
import { Xmult } from '@/app/_components/xmult'
import { Button } from '@/components/ui/button'
import { CDN_URL } from '@/shared/constants'
import { ImageZoom } from 'fumadocs-ui/components/image-zoom'
import defaultMdxComponents from 'fumadocs-ui/mdx'
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/page'
import { notFound } from 'next/navigation'
import type { ComponentProps } from 'react'
import { metadataImage } from '../../../../lib/metadata'
import { source } from '../../../../lib/source'

type ImageZoomProps = ComponentProps<typeof ImageZoom>
type ButtonProps = ComponentProps<typeof Button>
type JokerCardProps = ComponentProps<typeof JokerCard>
type ChipsProps = ComponentProps<typeof Chips>
type HandsProps = ComponentProps<typeof Hands>
type ChanceProps = ComponentProps<typeof Chance>
type MoneyProps = ComponentProps<typeof Money>
type XmultProps = ComponentProps<typeof Xmult>
type SpectralProps = ComponentProps<typeof Spectral>
type MultProps = ComponentProps<typeof Mult>
type NemesisProps = ComponentProps<typeof Nemesis>

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>
}) {
  const params = await props.params
  const page = source.getPage(params.slug)
  if (!page) notFound()

  const MDX = page.data.body

  return (
    <DocsPage
      toc={page.data.toc}
      tableOfContent={{
        style: 'clerk',
      }}
      full={page.data.full}
    >
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX
          components={{
            ...defaultMdxComponents,
            img: (props) => {
              const isDev =
                process.env.NODE_ENV === 'development' ||
                process.env.IS_PREVIEW === 'true'
              if (isDev) {
                return <ImageZoom {...(props as ImageZoomProps)} />
              }

              const typedProps = props as ImageZoomProps
              const src =
                typeof typedProps.src === 'string' ? typedProps.src : undefined
              return (
                <ImageZoom
                  {...typedProps}
                  src={src?.startsWith('/') ? `${CDN_URL}${src}` : typedProps.src}
                />
              )
            },
            Button: (props) => <Button {...(props as ButtonProps)} />,
            JokerCard: (props) => <JokerCard {...(props as JokerCardProps)} />,
            Chips: (props) => <Chips {...(props as ChipsProps)} />,
            Hands: (props) => <Hands {...(props as HandsProps)} />,
            Chance: (props) => <Chance {...(props as ChanceProps)} />,
            Money: (props) => <Money {...(props as MoneyProps)} />,
            Xmult: (props) => <Xmult {...(props as XmultProps)} />,
            Spectral: (props) => <Spectral {...(props as SpectralProps)} />,
            Mult: (props) => <Mult {...(props as MultProps)} />,
            Nemesis: (props) => <Nemesis {...(props as NemesisProps)} />,
          }}
        />
      </DocsBody>
    </DocsPage>
  )
}

export async function generateStaticParams() {
  return source.generateParams()
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>
}) {
  const params = await props.params
  const page = source.getPage(params.slug)
  if (!page) notFound()

  return metadataImage.withImage(page.slugs, {
    title: page.data.title,
    description: page.data.description,
  })
}
