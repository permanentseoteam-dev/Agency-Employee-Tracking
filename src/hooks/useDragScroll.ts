import { useEffect, useState } from 'react'

/** A drag must move this far before it scrolls, so a plain click (e.g. on a button) still works. */
const THRESHOLD = 5

/**
 * Press-and-drag sideways scrolling for a wide area whose scrollbar is hidden.
 * Touch keeps its native pan; the arrow keys scroll when the area has focus.
 * Returns a callback ref plus whether there is more to see on each side (for edge fades).
 */
export function useDragScroll<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null)
  const [edges, setEdges] = useState({ atStart: true, atEnd: true })

  useEffect(() => {
    if (!el) return
    let down: { x: number; left: number; id: number; moved: boolean } | null = null

    const update = () => {
      const max = el.scrollWidth - el.clientWidth
      const atStart = el.scrollLeft <= 2
      const atEnd = el.scrollLeft >= max - 2
      setEdges((prev) => (prev.atStart === atStart && prev.atEnd === atEnd ? prev : { atStart, atEnd }))
    }
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || e.pointerType === 'touch') return
      down = { x: e.clientX, left: el.scrollLeft, id: e.pointerId, moved: false }
    }
    const onMove = (e: PointerEvent) => {
      if (!down || e.pointerId !== down.id) return
      const dx = e.clientX - down.x
      if (!down.moved && Math.abs(dx) > THRESHOLD) {
        down.moved = true
        el.setPointerCapture(down.id)
        el.dataset.dragging = 'true'
      }
      if (down.moved) el.scrollLeft = down.left - dx
    }
    const onUp = (e: PointerEvent) => {
      if (!down || e.pointerId !== down.id) return
      const dragged = down.moved
      down = null
      delete el.dataset.dragging
      if (dragged) {
        // The drag must not also click whatever is under the pointer.
        const swallow = (ev: MouseEvent) => {
          ev.stopPropagation()
          ev.preventDefault()
        }
        window.addEventListener('click', swallow, { capture: true, once: true })
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.target !== el) return
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        el.scrollBy({ left: e.key === 'ArrowRight' ? 140 : -140, behavior: 'smooth' })
        e.preventDefault()
      }
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('lostpointercapture', onUp)
    el.addEventListener('keydown', onKey)
    el.addEventListener('scroll', update, { passive: true })
    const resize = new ResizeObserver(update)
    resize.observe(el)
    update()
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('lostpointercapture', onUp)
      el.removeEventListener('keydown', onKey)
      el.removeEventListener('scroll', update)
      resize.disconnect()
    }
  }, [el])

  return { ref: setEl, el, ...edges }
}
