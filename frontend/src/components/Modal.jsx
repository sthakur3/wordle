import { useEffect, useRef } from 'react'
import './Modal.css'

const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Modal dialog. Moves focus inside, traps Tab, makes the rest of the page
 * inert, restores focus on close and calls onClose on Escape.
 */
export default function Modal({ title, children, actions, onClose }) {
  const backdrop = useRef(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const node = backdrop.current
    const opener = document.activeElement
    const inerted = [...node.parentElement.children].filter(
      (el) => el !== node && !el.hasAttribute('inert'),
    )
    inerted.forEach((el) => el.setAttribute('inert', ''))
    node.querySelector(FOCUSABLE)?.focus()

    function onKeyDown(event) {
      if (event.key === 'Escape' && onCloseRef.current) {
        event.preventDefault()
        onCloseRef.current()
      } else if (event.key === 'Tab') {
        const items = [...node.querySelectorAll(FOCUSABLE)]
        if (items.length === 0) return
        const first = items[0]
        const last = items[items.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      inerted.forEach((el) => el.removeAttribute('inert'))
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])

  return (
    <div className="modal-backdrop" ref={backdrop}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <h2 id="modal-title">{title}</h2>
        {children}
        <div className="modal-actions">{actions}</div>
      </div>
    </div>
  )
}
