import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useGuessInput } from '../src/hooks/useGuessInput'

const GAME = { game_id: 'g1', word_length: 5, status: 'IN_PROGRESS', guesses: [] }

function setup(overrides = {}) {
  const props = {
    game: GAME,
    busy: false,
    blocked: false,
    submit: vi.fn().mockResolvedValue({ ok: true, clearGuess: true }),
    setMessage: vi.fn(),
    ...overrides,
  }
  const hook = renderHook((p) => useGuessInput(p), { initialProps: props })
  return { ...hook, props }
}

function type(result, text) {
  act(() => {
    for (const letter of text) result.current.handleKey(letter)
  })
}

describe('useGuessInput', () => {
  it('builds the guess up to the word length and supports backspace', () => {
    const { result, props } = setup()

    type(result, 'cranes')
    expect(result.current.currentGuess).toBe('crane')

    act(() => result.current.handleKey('Backspace'))
    expect(result.current.currentGuess).toBe('cran')
    expect(props.setMessage).toHaveBeenCalledWith('')
  })

  it('ignores keys that are not letters, Enter or Backspace', () => {
    const { result } = setup()

    act(() => {
      result.current.handleKey('1')
      result.current.handleKey('A')
      result.current.handleKey('Tab')
    })

    expect(result.current.currentGuess).toBe('')
  })

  it('rejects a short guess with a message and a shake', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 1
    })
    const { result, props } = setup()
    type(result, 'cra')

    await act(async () => result.current.handleKey('Enter'))

    expect(props.setMessage).toHaveBeenCalledWith('Not enough letters')
    expect(props.submit).not.toHaveBeenCalled()
    expect(result.current.shake).toBe(true)
    vi.restoreAllMocks()
  })

  it('submits a full guess and clears it when accepted', async () => {
    const { result, props } = setup()
    type(result, 'crane')

    await act(async () => result.current.handleKey('Enter'))

    expect(props.submit).toHaveBeenCalledWith('crane')
    expect(result.current.currentGuess).toBe('')
  })

  it('keeps the guess when the submit asks to keep it', async () => {
    const submit = vi.fn().mockResolvedValue({ ok: false, clearGuess: false })
    const { result } = setup({ submit })
    type(result, 'crane')

    await act(async () => result.current.handleKey('Enter'))

    expect(result.current.currentGuess).toBe('crane')
  })

  it('ignores keys while busy, blocked or finished', () => {
    for (const overrides of [
      { busy: true },
      { blocked: true },
      { game: { ...GAME, status: 'WON' } },
      { game: null },
    ]) {
      const { result } = setup(overrides)
      type(result, 'cr')
      expect(result.current.currentGuess).toBe('')
    }
  })

  it('reports whether input is active', () => {
    expect(setup().result.current.active).toBe(true)
    expect(setup({ blocked: true }).result.current.active).toBe(false)
    expect(setup({ game: { ...GAME, status: 'LOST' } }).result.current.inProgress).toBe(false)
  })

  it('resets the guess when a different game is shown', () => {
    const { result, rerender, props } = setup()
    type(result, 'cra')

    rerender({ ...props, game: { ...GAME, game_id: 'g2' } })

    expect(result.current.currentGuess).toBe('')
  })
})
