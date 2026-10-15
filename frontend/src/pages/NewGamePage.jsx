import { useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import LengthPicker from '../components/LengthPicker'
import Modal from '../components/Modal'

export default function NewGamePage() {
  const { controller } = useOutletContext()
  const navigate = useNavigate()
  const { game, wordLength, setWordLength, busy, status, startGame } = controller
  const [confirming, setConfirming] = useState(false)

  async function start() {
    setConfirming(false)
    if (await startGame(wordLength)) navigate('/play')
  }

  function handleStart() {
    if (game?.status === 'IN_PROGRESS') setConfirming(true)
    else start()
  }

  return (
    <>
      <LengthPicker
        wordLength={wordLength}
        onChange={setWordLength}
        onStart={handleStart}
        busy={busy || status === 'loading'}
      />
      {confirming && (
        <Modal
          title="Replace your game in progress?"
          onClose={() => setConfirming(false)}
          actions={(
            <>
              <button type="button" className="start" onClick={start}>
                Start new game
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setConfirming(false)
                  navigate('/play')
                }}
              >
                Keep playing
              </button>
            </>
          )}
        />
      )}
    </>
  )
}
