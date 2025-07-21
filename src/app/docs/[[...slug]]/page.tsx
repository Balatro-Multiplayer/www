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
import { metadataImage } from '../../../../lib/metadata'
import { source } from '../../../../lib/source'

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
                return <ImageZoom {...props} />
              }

              return (
                <ImageZoom
                  {...(props as any)}
                  src={
                    props.src.startsWith('/')
                      ? `${CDN_URL}${props.src}`
                      : props.src
                  }
                />
              )
            },
            Button: (props) => <Button {...(props as any)} />,
            JokerCard: (props) => <JokerCard {...(props as any)} />,
            Chips: (props) => <Chips {...(props as any)} />,
            Hands: (props) => <Hands {...(props as any)} />,
            Chance: (props) => <Chance {...(props as any)} />,
            Money: (props) => <Money {...(props as any)} />,
            Xmult: (props) => <Xmult {...(props as any)} />,
            Spectral: (props) => <Spectral {...(props as any)} />,
            Mult: (props) => <Mult {...(props as any)} />,
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
