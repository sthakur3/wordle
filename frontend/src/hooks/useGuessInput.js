import { useCallback, useEffect, useRef, useState } from 'react'

const SHAKE_MS = 450

/**
 * Owns the guess being typed: the letter buffer, the invalid-guess shake and
 * the key handler. The buffer resets whenever a different game is shown.
 */
export function useGuessInput({ game, busy, blocked, submit, setMessage }) {
  const [currentGuess, setCurrentGuess] = useState('')
  const [shake, setShake] = useState(false)
  const shakeTimer = useRef(null)

  useEffect(() => () => {
    if (shakeTimer.current) window.clearTimeout(shakeTimer.current)
  }, [])

  const showShake = useCallback(() => {
    setShake(false)
    window.requestAnimationFrame(() => setShake(true))
    if (shakeTimer.current) window.clearTimeout(shakeTimer.current)
    shakeTimer.current = window.setTimeout(() => setShake(false), SHAKE_MS)
  }, [])

  const gameId = game?.game_id
  const [guessGameId, setGuessGameId] = useState(gameId)
  if (guessGameId !== gameId) {
    setGuessGameId(gameId)
    setCurrentGuess('')
  }

  const inProgress = game?.status === 'IN_PROGRESS'
  const active = inProgress && !blocked

  const handleSubmit = useCallback(async () => {
    if (!game || !inProgress || busy) return
    if (currentGuess.length !== game.word_length) {
      setMessage('Not enough letters')
      showShake()
      return
    }
    const { ok, clearGuess } = await submit(currentGuess)
    if (clearGuess) setCurrentGuess('')
    if (!ok) showShake()
  }, [game, inProgress, busy, currentGuess, submit, setMessage, showShake])

  const handleKey = useCallback((key) => {
    if (!game || !active || busy) return

    if (key === 'Enter') {
      handleSubmit()
    } else if (key === 'Backspace') {
      setCurrentGuess((guess) => guess.slice(0, -1))
      setMessage('')
    } else if (/^[a-z]$/.test(key)) {
      setCurrentGuess((guess) => (guess.length < game.word_length ? guess + key : guess))
      setMessage('')
    }
  }, [game, active, busy, handleSubmit, setMessage])

  return { currentGuess, shake, handleKey, inProgress, active }
}
