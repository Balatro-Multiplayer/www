import type { Metadata } from 'next'
import { source } from './source'

type DocPage = NonNullable<ReturnType<typeof source.getPage>>
const ROOT_DOCS_OG_SLUG = '_index'

function getImagePath(slugs?: string[]) {
  const routeSlugs = slugs && slugs.length > 0 ? slugs : [ROOT_DOCS_OG_SLUG]
  const path = routeSlugs.join('/')
  return `/docs-og/${path}`
}

export const metadataImage = {
  createAPI(render: (page: DocPage) => Response | Promise<Response>) {
    return async (
      _request: Request,
      context: { params: Promise<{ slug?: string[] }> }
    ) => {
      const { slug } = await context.params
      const normalizedSlug =
        slug?.length === 1 && slug[0] === ROOT_DOCS_OG_SLUG ? [] : slug
      const page = source.getPage(normalizedSlug)

      if (!page) {
        return new Response('Not found', { status: 404 })
      }

      return render(page as DocPage)
    }
  },
  generateParams() {
    return source.generateParams().map((params) => ({
      ...params,
      slug:
        params.slug && params.slug.length > 0
          ? params.slug
          : [ROOT_DOCS_OG_SLUG],
    }))
  },
  withImage(
    slugs: string[] | undefined,
    metadata: Pick<Metadata, 'title' | 'description'>
  ): Metadata {
    const image = getImagePath(slugs)

    return {
      ...metadata,
      openGraph: {
        images: [image],
      },
      twitter: {
        card: 'summary_large_image',
        images: [image],
      },
    }
  },
}
