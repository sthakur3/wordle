import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ApiError,
  ERROR_CODES,
  createGame,
  getGame,
  isAbortError,
  submitGuess,
} from '../api/games'
import { DEFAULT_WORD_LENGTH } from '../config'
import { clearSavedGameId, getSavedGameId, saveGameId } from '../storage'

function throwIfAborted(signal) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
}

const NETWORK_MESSAGE = 'Could not reach the server. Check that the API is running.'

function errorMessage(error) {
  return error instanceof ApiError ? error.message : NETWORK_MESSAGE
}

/**
 * Owns the server-side game state: loading the saved game, starting,
 * abandoning and guessing. Each action runs under an AbortController, and
 * abandon() cancels whatever is in flight so a late response cannot bring an
 * abandoned game back.
 */
export function useGame() {
  const [game, setGame] = useState(null)
  const [wordLength, setWordLength] = useState(DEFAULT_WORD_LENGTH)
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState(() => (getSavedGameId() ? 'loading' : 'missing'))
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const inflight = useRef(null)

  useEffect(() => {
    const savedId = getSavedGameId()
    if (!savedId) {
      setStatus('missing')
      return undefined
    }

    const controller = new AbortController()
    getGame(savedId, { signal: controller.signal })
      .then((state) => {
        setGame(state)
        setWordLength(state.word_length)
        setStatus('ready')
      })
      .catch((error) => {
        if (controller.signal.aborted || isAbortError(error)) return
        if (error instanceof ApiError && error.status === 404) {
          clearSavedGameId()
          setMessage('Game not found.')
          setStatus('missing')
        } else {
          setMessage(errorMessage(error))
          setStatus('failed')
        }
      })

    return () => controller.abort()
  }, [loadAttempt])

  const retryLoad = useCallback(() => {
    setMessage('')
    setStatus('loading')
    setLoadAttempt((attempt) => attempt + 1)
  }, [])

  // Runs one exclusive server action; returns undefined if one is already running.
  const run = useCallback(async (action) => {
    if (busyRef.current) return undefined
    const controller = new AbortController()
    inflight.current = controller
    busyRef.current = true
    setBusy(true)
    try {
      return await action(controller.signal)
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return undefined
      throw error
    } finally {
      if (inflight.current === controller) {
        inflight.current = null
        busyRef.current = false
        setBusy(false)
      }
    }
  }, [])

  const startGame = useCallback(async (length) => {
    setMessage('')
    const started = await run(async (signal) => {
      try {
        const created = await createGame(length, { signal })
        throwIfAborted(signal)
        saveGameId(created.game_id)
        setGame(created)
        setWordLength(created.word_length)
        setStatus('ready')
        return true
      } catch (error) {
        if (isAbortError(error)) throw error
        setMessage(errorMessage(error))
        return false
      }
    })
    return Boolean(started)
  }, [run])

  const abandon = useCallback(() => {
    inflight.current?.abort()
    inflight.current = null
    busyRef.current = false
    setBusy(false)
    clearSavedGameId()
    setGame(null)
    setStatus('missing')
  }, [])

  /**
   * Submits a guess. Resolves to { ok, clearGuess }: the guess is kept for a
   * retry when the game was merely busy, and cleared once it is accepted or
   * the game turns out to be finished.
   */
  const submit = useCallback(async (guess) => {
    if (!game || game.status !== 'IN_PROGRESS') return { ok: false, clearGuess: false }
    const result = await run(async (signal) => {
      try {
        const next = await submitGuess(game.game_id, guess, { signal })
        throwIfAborted(signal)
        setGame(next)
        setMessage('')
        return { ok: true, clearGuess: true }
      } catch (error) {
        if (isAbortError(error)) throw error
        setMessage(errorMessage(error))
        if (
          error instanceof ApiError
          && (error.code === ERROR_CODES.TIMEOUT || error.code === ERROR_CODES.NETWORK)
        ) {
          // The server may have applied the guess before the connection failed; reconcile.
          try {
            const fresh = await getGame(game.game_id, { signal })
            throwIfAborted(signal)
            if (fresh.guesses.length > game.guesses.length) {
              setGame(fresh)
              setMessage('')
              return { ok: true, clearGuess: true }
            }
          } catch (refreshError) {
            if (isAbortError(refreshError)) throw refreshError
          }
          return { ok: false, clearGuess: false }
        }
        if (error instanceof ApiError && error.code === ERROR_CODES.GAME_ALREADY_FINISHED) {
          try {
            const fresh = await getGame(game.game_id, { signal })
            throwIfAborted(signal)
            setGame(fresh)
          } catch (refreshError) {
            if (isAbortError(refreshError)) throw refreshError
            // Keep the finished-game message if refreshing the board fails.
          }
          return { ok: false, clearGuess: true }
        }
        return { ok: false, clearGuess: false }
      }
    })
    return result ?? { ok: false, clearGuess: false }
  }, [game, run])

  return {
    game,
    wordLength,
    setWordLength,
    message,
    setMessage,
    status,
    busy,
    retryLoad,
    startGame,
    abandon,
    submit,
  }
}
