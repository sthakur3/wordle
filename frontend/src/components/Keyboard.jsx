import './Keyboard.css'

const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']

const RANK = { absent: 1, present: 2, correct: 3 }

function letterColors(guesses) {
  const colors = {}
  for (const guess of guesses) {
    guess.word.toLowerCase().split('').forEach((letter, index) => {
      const result = guess.evaluation[index]
      if (!RANK[result]) return
      if (!colors[letter] || RANK[result] > RANK[colors[letter]]) {
        colors[letter] = result
      }
    })
  }
  return colors
}

export default function Keyboard({ guesses, disabled, onKey }) {
  const colors = letterColors(guesses)

  return (
    <div className="keyboard">
      {KEY_ROWS.map((row, rowIndex) => (
        <div className="key-row" key={row}>
          {rowIndex === KEY_ROWS.length - 1 && (
            <button
              type="button"
              className="key wide"
              disabled={disabled}
              onClick={() => onKey('Enter')}
            >
              Enter
            </button>
          )}
          {row.split('').map((letter) => (
            <button
              key={letter}
              type="button"
              className={`key${colors[letter] ? ` ${colors[letter]}` : ''}`}
              disabled={disabled}
              onClick={() => onKey(letter)}
            >
              {letter}
            </button>
          ))}
          {rowIndex === KEY_ROWS.length - 1 && (
            <button
              type="button"
              className="key wide"
              disabled={disabled}
              aria-label="Backspace"
              onClick={() => onKey('Backspace')}
            >
              ⌫
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
