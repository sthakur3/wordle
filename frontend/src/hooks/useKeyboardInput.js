import { useEffect, useRef } from 'react'

// Focused controls handle Enter themselves. The on-screen keys are the
// exception: they stay focused after a click, and Enter should still submit.
const OWN_ENTER = 'button:not(.key), a[href], input, textarea, select, [contenteditable]'

function handlesOwnEnter(target) {
  return target instanceof Element && Boolean(target.closest(OWN_ENTER))
}

/** Forwards physical key presses to onKey while enabled. */
export function useKeyboardInput(onKey, enabled) {
  const handler = useRef(onKey)
  useEffect(() => {
    handler.current = onKey
  }, [onKey])

  useEffect(() => {
    if (!enabled) return undefined

    function onKeyDown(event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'Enter') {
        if (handlesOwnEnter(event.target)) return
        event.preventDefault()
        handler.current('Enter')
      } else if (event.key === 'Backspace') {
        event.preventDefault()
        handler.current('Backspace')
      } else if (/^[a-zA-Z]$/.test(event.key)) {
        event.preventDefault()
        handler.current(event.key.toLowerCase())
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
