import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useKeyboardInput } from '../src/hooks/useKeyboardInput'

function press(key, options = {}, target = window) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })
  target.dispatchEvent(event)
  return event
}

describe('useKeyboardInput', () => {
  it('forwards letters (lowercased), Enter and Backspace', () => {
    const onKey = vi.fn()
    renderHook(() => useKeyboardInput(onKey, true))

    press('A')
    press('b')
    press('Enter')
    press('Backspace')

    expect(onKey.mock.calls.map(([key]) => key)).toEqual(['a', 'b', 'Enter', 'Backspace'])
  })

  it('ignores other keys and modifier shortcuts', () => {
    const onKey = vi.fn()
    renderHook(() => useKeyboardInput(onKey, true))

    press('1')
    press('Tab')
    press('ab')
    press('c', { ctrlKey: true })
    press('c', { metaKey: true })
    press('c', { altKey: true })

    expect(onKey).not.toHaveBeenCalled()
  })

  it('does nothing while disabled', () => {
    const onKey = vi.fn()
    renderHook(() => useKeyboardInput(onKey, false))

    press('a')

    expect(onKey).not.toHaveBeenCalled()
  })

  it('stops listening after unmount', () => {
    const onKey = vi.fn()
    const { unmount } = renderHook(() => useKeyboardInput(onKey, true))
    unmount()

    press('a')

    expect(onKey).not.toHaveBeenCalled()
  })

  it('uses the latest handler without re-subscribing', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ handler }) => useKeyboardInput(handler, true), {
      initialProps: { handler: first },
    })

    rerender({ handler: second })
    press('a')

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith('a')
  })

  it('leaves Enter to focused buttons and inputs but not to on-screen keys', () => {
    const onKey = vi.fn()
    renderHook(() => useKeyboardInput(onKey, true))
    const button = document.body.appendChild(document.createElement('button'))
    const input = document.body.appendChild(document.createElement('input'))
    const screenKey = document.body.appendChild(document.createElement('button'))
    screenKey.className = 'key'

    const onButton = press('Enter', {}, button)
    press('Enter', {}, input)
    expect(onKey).not.toHaveBeenCalled()
    expect(onButton.defaultPrevented).toBe(false)

    const onKeyButton = press('Enter', {}, screenKey)
    expect(onKey).toHaveBeenCalledWith('Enter')
    expect(onKeyButton.defaultPrevented).toBe(true)

    button.remove()
    input.remove()
    screenKey.remove()
  })
})
