import { WORD_LENGTHS, turnsForLength } from '../config'
import './LengthPicker.css'

export default function LengthPicker({ wordLength, onChange, onStart, busy }) {
  return (
    <section className="setup">
      <p>Pick your challenge level:</p>
      <div className="lengths" role="radiogroup" aria-label="Word length">
        {WORD_LENGTHS.map((length) => (
          <button
            key={length}
            type="button"
            role="radio"
            aria-checked={length === wordLength}
            className={`length${length === wordLength ? ' selected' : ''}`}
            onClick={() => onChange(length)}
            disabled={busy}
          >
            {length}
          </button>
        ))}
      </div>
      <p>You get {turnsForLength(wordLength)} turns to guess the word.</p>
      <button type="button" className="start" onClick={onStart} disabled={busy}>
        {busy ? 'Starting…' : 'Start game'}
      </button>
    </section>
  )
}
