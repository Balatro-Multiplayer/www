'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

type FitLayout = { scale: number; width: number; height: number }

/** Live width of a container, for JS-driven responsive layout switches. */
export function useContainerWidth() {
  const ref = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState<number | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => setWidth(element.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, width }
}

/**
 * Scales its content down (never up) so it fits the container's width —
 * no horizontal scrolling until the scale floor is hit, below which the
 * container scrolls rather than becoming unreadably small.
 */
export function FitToWidth({
  children,
  minScale = 0.4,
  onScaleChange,
}: {
  children: React.ReactNode
  minScale?: number
  onScaleChange?: (scale: number) => void
}) {
  const outerRef = useRef<HTMLDivElement | null>(null)
  const innerRef = useRef<HTMLDivElement | null>(null)
  const [layout, setLayout] = useState<FitLayout | null>(null)
  const notify = useRef(onScaleChange)
  notify.current = onScaleChange

  useEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return

    const measure = () => {
      const available = outer.clientWidth
      const contentWidth = inner.scrollWidth
      const contentHeight = inner.scrollHeight
      if (!available || !contentWidth) return
      // 1px safety margin so subpixel rounding can never cause overflow.
      const scale = Math.max(
        minScale,
        Math.min(1, (available - 1) / contentWidth)
      )
      setLayout({
        scale,
        width: contentWidth * scale,
        height: contentHeight * scale,
      })
      notify.current?.(scale)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(outer)
    observer.observe(inner)
    return () => observer.disconnect()
  }, [minScale])

  // Fitted content never needs a scrollbar; only show one when the scale
  // floor forces the content wider than the container.
  const clampedAtFloor = layout !== null && layout.scale <= minScale
  return (
    <div
      ref={outerRef}
      className={cn(
        'w-full',
        clampedAtFloor ? 'overflow-x-auto' : 'overflow-x-hidden'
      )}
    >
      <div
        style={
          layout
            ? {
                width: layout.width,
                height: layout.height,
                marginInline: 'auto',
              }
            : undefined
        }
      >
        <div
          ref={innerRef}
          style={{
            width: 'max-content',
            transform: layout ? `scale(${layout.scale})` : undefined,
            transformOrigin: 'top left',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
