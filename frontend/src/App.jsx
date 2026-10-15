import { useCallback, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import Modal from './components/Modal'
import { useGame } from './hooks/useGame'
import './App.css'
import './styles/shared.css'

/** Layout: header, message banner, abandon dialog; pages render in the Outlet. */
export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const controller = useGame()
  const { game, status, message, setMessage, abandon } = controller
  const [confirmOpen, setConfirmOpen] = useState(false)

  const isPlayRoute = location.pathname === '/play'

  const handleNewGame = useCallback(() => {
    setMessage('')
    if (isPlayRoute && game?.status === 'IN_PROGRESS') {
      setConfirmOpen(true)
      return
    }
    navigate('/new')
  }, [isPlayRoute, game, navigate, setMessage])

  const handleAbandon = useCallback(() => {
    abandon()
    setConfirmOpen(false)
    navigate('/new')
  }, [abandon, navigate])

  return (
    <div className="app">
      <header className="topbar">
        <h1>Wordle</h1>
        <button
          type="button"
          className="text-button"
          onClick={handleNewGame}
          disabled={status === 'loading'}
        >
          New game
        </button>
      </header>

      {message && (
        <div className="message" role="alert">
          <span>{message}</span>
          <button
            type="button"
            className="dismiss"
            onClick={() => setMessage('')}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      <Outlet context={{ controller, confirmOpen }} />

      {confirmOpen && (
        <Modal
          onClose={() => setConfirmOpen(false)}
          title="Start a new game?"
          actions={(
            <>
              <button type="button" className="start" onClick={handleAbandon}>
                Start new game
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setConfirmOpen(false)}
              >
                Keep playing
              </button>
            </>
          )}
        />
      )}
    </div>
  )
}
