import { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate, useOutletContext } from 'react-router-dom'
import Board from '../components/Board'
import Confetti from '../components/Confetti'
import Keyboard from '../components/Keyboard'
import Modal from '../components/Modal'
import { WIN_BOUNCE_MS, flipDurationMs } from '../config'
import { useGuessInput } from '../hooks/useGuessInput'
import { useKeyboardInput } from '../hooks/useKeyboardInput'
import './PlayPage.css'

function finishedSummary(game) {
  if (game.status === 'LOST') {
    const word = game.target_word
      ? ` The word was ${game.target_word.toUpperCase()}.`
      : ''
    return `You lost.${word}`
  }
  return 'You won.'
}

export default function PlayPage() {
  const { controller, confirmOpen } = useOutletContext()
  const navigate = useNavigate()
  const { game, status, busy, retryLoad, startGame, submit, setMessage } = controller
  const [viewingId, setViewingId] = useState(null)
  const [celebrating, setCelebrating] = useState(false)
  const [dialogHeldId, setDialogHeldId] = useState(null)
  const [seenStatus, setSeenStatus] = useState(game?.status)
  const [seenId, setSeenId] = useState(game?.game_id)
  if (game && (seenId !== game.game_id || seenStatus !== game.status)) {
    // Celebrate only a win that happens on this page, not a reloaded finished game.
    const justWon = seenId === game.game_id && seenStatus === 'IN_PROGRESS' && game.status === 'WON'
    setSeenId(game.game_id)
    setSeenStatus(game.status)
    setCelebrating(justWon)
    setDialogHeldId(justWon ? game.game_id : null)
  }
  const heldWordLength = dialogHeldId ? game?.word_length : null
  useEffect(() => {
    if (!heldWordLength) return undefined
    // Keep the dialog back until the winning row has flipped and bounced.
    const timer = window.setTimeout(
      () => setDialogHeldId(null),
      flipDurationMs(heldWordLength) + WIN_BOUNCE_MS,
    )
    return () => window.clearTimeout(timer)
  }, [heldWordLength])
  const stopCelebrating = useCallback(() => setCelebrating(false), [])
  const { currentGuess, shake, handleKey, inProgress, active } = useGuessInput({
    game,
    busy,
    blocked: confirmOpen,
    submit,
    setMessage,
  })

  useKeyboardInput(handleKey, Boolean(game) && active)

  if (status === 'loading') return <p className="status-line">Loading game…</p>
  if (!game && status === 'failed') {
    return (
      <section className="setup">
        <p>The game could not be loaded.</p>
        <button type="button" className="start" onClick={retryLoad}>
          Try again
        </button>
      </section>
    )
  }
  if (!game) return <Navigate to="/new" replace />

  const viewingBoard = viewingId === game.game_id

  return (
    <>
      {celebrating && (
        <Confetti delayMs={flipDurationMs(game.word_length)} onDone={stopCelebrating} />
      )}
      <main className="play">
        {!inProgress && viewingBoard && (
          <div className="result-bar">
            <span>{finishedSummary(game)}</span>
            <button
              type="button"
              className="start"
              onClick={() => startGame(game.word_length)}
              disabled={busy}
            >
              {busy ? 'Starting…' : 'Play again'}
            </button>
          </div>
        )}
        <Board game={game} currentGuess={currentGuess} shake={shake} />
        <Keyboard
          guesses={game.guesses}
          disabled={busy || confirmOpen || !inProgress}
          onKey={handleKey}
        />
      </main>

      {!inProgress && !viewingBoard && dialogHeldId !== game.game_id && (
        <Modal
          title={finishedSummary(game)}
          onClose={() => setViewingId(game.game_id)}
          actions={(
            <>
              <button
                type="button"
                className="start"
                onClick={() => startGame(game.word_length)}
                disabled={busy}
              >
                {busy ? 'Starting…' : 'Play again'}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => navigate('/new')}
                disabled={busy}
              >
                Start new game
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setViewingId(game.game_id)}
                disabled={busy}
              >
                View board
              </button>
            </>
          )}
        />
      )}
    </>
  )
}
