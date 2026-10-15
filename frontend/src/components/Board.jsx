import { useEffect, useState } from 'react'
import { FLIP_STAGGER_MS, flipDurationMs } from '../config'
import './Board.css'

export default function Board({ game, currentGuess, shake }) {
  const [flipRow, setFlipRow] = useState(null)
  const [trackedGuesses, setTrackedGuesses] = useState(game.guesses.length)
  const [winRow, setWinRow] = useState(null)

  if (game.guesses.length !== trackedGuesses) {
    setTrackedGuesses(game.guesses.length)
    const added = game.guesses.length > trackedGuesses
    setFlipRow(added ? game.guesses.length - 1 : null)
    setWinRow(added && game.status === 'WON' ? game.guesses.length - 1 : null)
  }

  useEffect(() => {
    if (flipRow === null) return undefined
    const timer = window.setTimeout(() => setFlipRow(null), flipDurationMs(game.word_length) + 40)
    return () => window.clearTimeout(timer)
  }, [flipRow, game.word_length])

  const rows = []

  for (let row = 0; row < game.max_turns; row += 1) {
    const submitted = game.guesses[row]
    const isCurrent =
      !submitted && row === game.guesses.length && game.status === 'IN_PROGRESS'
    const letters = submitted
      ? submitted.word.split('')
      : isCurrent
        ? currentGuess.split('')
        : []
    const evaluation = submitted?.evaluation ?? []

    rows.push(
      <div
        className={`row${isCurrent && shake ? ' shake' : ''}`}
        key={row}
        role="group"
        aria-label={`Guess ${row + 1}`}
      >
        {Array.from({ length: game.word_length }, (_, column) => {
          const letter = letters[column] || ''
          const mark = evaluation[column] || ''
          const label = letter
            ? `${letter.toUpperCase()}${mark ? `, ${mark}` : ''}`
            : 'Empty'
          const flipping = Boolean(submitted) && flipRow === row && mark
          if (flipping) {
            return (
              <div
                key={column}
                className="tile-scene"
                role="img"
                aria-label={label}
              >
                <div
                  className="tile-inner"
                  style={{ animationDelay: `${column * FLIP_STAGGER_MS}ms` }}
                >
                  <div className="tile-face tile-front filled" aria-hidden="true">{letter}</div>
                  <div className={`tile-face tile-back ${mark}`} aria-hidden="true">{letter}</div>
                </div>
              </div>
            )
          }
          const bounce = winRow === row && flipRow === null
          return (
            <div
              key={column}
              className={`tile${letter ? ' filled' : ''}${mark ? ` ${mark}` : ''}${bounce ? ' bounce' : ''}`}
              style={bounce ? { animationDelay: `${column * 90}ms` } : undefined}
              role="img"
              aria-label={label}
            >
              {letter}
            </div>
          )
        })}
      </div>,
    )
  }

  return (
    <div className="board" aria-label="Guesses">
      {rows}
    </div>
  )
}
