import { useEffect, useState } from 'react'
import './Confetti.css'

const COLORS = ['#538d4e', '#b59f3b', '#e8e8e8', '#6aaa64', '#f2c94c']
const PIECES = 70
const DURATION_MS = 2600

function makePieces() {
  return Array.from({ length: PIECES }, (_, index) => ({
    id: index,
    left: Math.random() * 100,
    drift: (Math.random() - 0.5) * 240,
    spin: 360 + Math.random() * 720,
    delay: Math.random() * 500,
    duration: 1800 + Math.random() * (DURATION_MS - 1800),
    color: COLORS[index % COLORS.length],
  }))
}

/** One-shot confetti burst. Starts after delayMs, then calls onDone. */
export default function Confetti({ delayMs = 0, onDone }) {
  const [pieces] = useState(makePieces)

  useEffect(() => {
    const timer = window.setTimeout(() => onDone?.(), delayMs + 500 + DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [delayMs, onDone])

  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className="confetti-piece"
          style={{
            left: `${piece.left}%`,
            background: piece.color,
            animationDelay: `${delayMs + piece.delay}ms`,
            animationDuration: `${piece.duration}ms`,
            '--drift': `${piece.drift}px`,
            '--spin': `${piece.spin}deg`,
          }}
        />
      ))}
    </div>
  )
}
