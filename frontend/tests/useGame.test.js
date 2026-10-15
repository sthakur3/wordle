import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, createGame, getGame, submitGuess } from '../src/api/games'
import { useGame } from '../src/hooks/useGame'

vi.mock('../src/api/games', async (importOriginal) => ({
  ...(await importOriginal()),
  createGame: vi.fn(),
  getGame: vi.fn(),
  submitGuess: vi.fn(),
}))

const GAME = {
  game_id: 'g1',
  word_length: 5,
  max_turns: 6,
  status: 'IN_PROGRESS',
  guesses: [],
}
const WITH_GUESS = {
  ...GAME,
  guesses: [{ word: 'crane', evaluation: ['absent', 'absent', 'absent', 'absent', 'absent'] }],
}

afterEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function withSavedGame() {
  localStorage.setItem('wordle-game-id', GAME.game_id)
  getGame.mockResolvedValue(GAME)
}

describe('useGame loading', () => {
  it('is missing without a saved game and does not call the API', () => {
    const { result } = renderHook(() => useGame())

    expect(result.current.status).toBe('missing')
    expect(getGame).not.toHaveBeenCalled()
  })

  it('loads the saved game', async () => {
    withSavedGame()
    const { result } = renderHook(() => useGame())

    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.game).toEqual(GAME)
    expect(result.current.wordLength).toBe(5)
  })

  it('clears the saved id and reports missing on 404', async () => {
    localStorage.setItem('wordle-game-id', 'gone')
    getGame.mockRejectedValue(new ApiError('Game not found.', { status: 404 }))
    const { result } = renderHook(() => useGame())

    await waitFor(() => expect(result.current.status).toBe('missing'))
    expect(localStorage.getItem('wordle-game-id')).toBeNull()
    expect(result.current.message).toBe('Game not found.')
  })

  it('fails with the API message, then recovers on retry', async () => {
    localStorage.setItem('wordle-game-id', GAME.game_id)
    getGame.mockRejectedValueOnce(new ApiError('Boom.', { status: 500 }))
    getGame.mockResolvedValueOnce(GAME)
    const { result } = renderHook(() => useGame())

    await waitFor(() => expect(result.current.status).toBe('failed'))
    expect(result.current.message).toBe('Boom.')

    act(() => result.current.retryLoad())
    expect(result.current.status).toBe('loading')
    expect(result.current.message).toBe('')
    await waitFor(() => expect(result.current.status).toBe('ready'))
  })

  it('uses a network message for non-API errors', async () => {
    localStorage.setItem('wordle-game-id', GAME.game_id)
    getGame.mockRejectedValue(new TypeError('x'))
    const { result } = renderHook(() => useGame())

    await waitFor(() => expect(result.current.status).toBe('failed'))
    expect(result.current.message).toMatch(/Could not reach the server/)
  })
})

describe('useGame startGame and abandon', () => {
  it('starts a game and saves its id', async () => {
    createGame.mockResolvedValue({ ...GAME, game_id: 'fresh', word_length: 6 })
    const { result } = renderHook(() => useGame())

    let started
    await act(async () => {
      started = await result.current.startGame(6)
    })

    expect(started).toBe(true)
    expect(createGame).toHaveBeenCalledWith(6, { signal: expect.any(AbortSignal) })
    expect(result.current.status).toBe('ready')
    expect(result.current.wordLength).toBe(6)
    expect(localStorage.getItem('wordle-game-id')).toBe('fresh')
    expect(result.current.busy).toBe(false)
  })

  it('reports failure and a message when creating fails', async () => {
    createGame.mockRejectedValue(new ApiError('Storage down.', { status: 503 }))
    const { result } = renderHook(() => useGame())

    let started
    await act(async () => {
      started = await result.current.startGame(5)
    })

    expect(started).toBe(false)
    expect(result.current.message).toBe('Storage down.')
    expect(result.current.game).toBeNull()
  })

  it('runs only one server action at a time', async () => {
    const pending = deferred()
    createGame.mockReturnValue(pending.promise)
    const { result } = renderHook(() => useGame())

    let first
    let second
    await act(async () => {
      first = result.current.startGame(5)
      second = await result.current.startGame(5)
    })
    expect(second).toBe(false)
    expect(createGame).toHaveBeenCalledTimes(1)

    await act(async () => {
      pending.resolve(GAME)
      await first
    })
  })

  it('abandon clears state and drops a late create response', async () => {
    const pending = deferred()
    createGame.mockImplementation((_length, { signal }) => {
      signal.addEventListener('abort', () => pending.reject(new DOMException('x', 'AbortError')))
      return pending.promise
    })
    const { result } = renderHook(() => useGame())

    let started
    await act(async () => {
      started = result.current.startGame(5)
      result.current.abandon()
      await started
    })

    expect(await started).toBe(false)
    expect(result.current.game).toBeNull()
    expect(result.current.status).toBe('missing')
    expect(result.current.busy).toBe(false)
    expect(localStorage.getItem('wordle-game-id')).toBeNull()
  })
})

describe('useGame submit', () => {
  async function ready() {
    withSavedGame()
    const hook = renderHook(() => useGame())
    await waitFor(() => expect(hook.result.current.status).toBe('ready'))
    return hook
  }

  it('applies an accepted guess', async () => {
    const { result } = await ready()
    submitGuess.mockResolvedValue(WITH_GUESS)

    let outcome
    await act(async () => {
      outcome = await result.current.submit('crane')
    })

    expect(outcome).toEqual({ ok: true, clearGuess: true })
    expect(result.current.game).toEqual(WITH_GUESS)
    expect(result.current.message).toBe('')
  })

  it('does nothing when there is no game in progress', async () => {
    const { result } = renderHook(() => useGame())

    let outcome
    await act(async () => {
      outcome = await result.current.submit('crane')
    })

    expect(outcome).toEqual({ ok: false, clearGuess: false })
    expect(submitGuess).not.toHaveBeenCalled()
  })

  it('keeps the guess on a validation error', async () => {
    const { result } = await ready()
    submitGuess.mockRejectedValue(
      new ApiError('Not in word list.', { status: 400, code: 'invalid_word' }),
    )

    let outcome
    await act(async () => {
      outcome = await result.current.submit('zzzzz')
    })

    expect(outcome).toEqual({ ok: false, clearGuess: false })
    expect(result.current.message).toBe('Not in word list.')
  })

  it('keeps the guess when the game is busy', async () => {
    const { result } = await ready()
    submitGuess.mockRejectedValue(new ApiError('Busy.', { status: 409, code: 'game_busy' }))

    let outcome
    await act(async () => {
      outcome = await result.current.submit('crane')
    })

    expect(outcome).toEqual({ ok: false, clearGuess: false })
    expect(getGame).toHaveBeenCalledTimes(1)
  })

  it('refetches and clears the guess when the game is already finished', async () => {
    const { result } = await ready()
    const finished = { ...GAME, status: 'LOST' }
    submitGuess.mockRejectedValue(
      new ApiError('Finished.', { status: 409, code: 'game_already_finished' }),
    )
    getGame.mockResolvedValue(finished)

    let outcome
    await act(async () => {
      outcome = await result.current.submit('crane')
    })

    expect(outcome).toEqual({ ok: false, clearGuess: true })
    expect(result.current.game).toEqual(finished)
    expect(result.current.message).toBe('Finished.')
  })

  it('keeps the finished message when the refresh also fails', async () => {
    const { result } = await ready()
    submitGuess.mockRejectedValue(
      new ApiError('Finished.', { status: 409, code: 'game_already_finished' }),
    )
    getGame.mockRejectedValue(new ApiError('Down.', { status: 503 }))

    let outcome
    await act(async () => {
      outcome = await result.current.submit('crane')
    })

    expect(outcome).toEqual({ ok: false, clearGuess: true })
    expect(result.current.message).toBe('Finished.')
  })

  it('accepts a timed-out guess that the server applied', async () => {
    const { result } = await ready()
    submitGuess.mockRejectedValue(new ApiError('Too slow.', { code: 'timeout' }))
    getGame.mockResolvedValue(WITH_GUESS)

    let outcome
    await act(async () => {
      outcome = await result.current.submit('crane')
    })

    expect(outcome).toEqual({ ok: true, clearGuess: true })
    expect(result.current.game).toEqual(WITH_GUESS)
    expect(result.current.message).toBe('')
  })

  it('accepts a guess the server applied before the connection dropped', async () => {
    const { result } = await ready()
    submitGuess.mockRejectedValue(new ApiError('Could not reach the server.', { code: 'network_error' }))
    getGame.mockResolvedValue(WITH_GUESS)

    let outcome
    await act(async () => {
      outcome = await result.current.submit('crane')
    })

    expect(outcome).toEqual({ ok: true, clearGuess: true })
    expect(result.current.game).toEqual(WITH_GUESS)
    expect(result.current.message).toBe('')
  })

  it('keeps a timed-out guess that was not applied', async () => {
    const { result } = await ready()
    submitGuess.mockRejectedValue(new ApiError('Too slow.', { code: 'timeout' }))
    getGame.mockResolvedValue(GAME)

    let outcome
    await act(async () => {
      outcome = await result.current.submit('crane')
    })

    expect(outcome).toEqual({ ok: false, clearGuess: false })
    expect(result.current.message).toBe('Too slow.')
  })
})
