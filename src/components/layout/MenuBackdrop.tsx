import { createPortal } from 'react-dom'

/**
 * A see-through layer over the whole window while a top-bar menu is open. The top bar is a
 * window-drag area, and Electron never passes clicks there to the page, so without this a
 * click beside the menu would not close it. `no-drag` lifts the drag area while it is open.
 */
export function MenuBackdrop({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div aria-hidden data-menu-backdrop className="no-drag fixed inset-0 z-40" style={{ pointerEvents: 'auto' }} onPointerDown={onClose} />,
    document.body
  )
}
