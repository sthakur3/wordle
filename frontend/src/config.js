// Word-length bounds mirror the backend's MIN_WORD_LENGTH / MAX_WORD_LENGTH.
export const MIN_WORD_LENGTH = Number(import.meta.env.VITE_MIN_WORD_LENGTH ?? 5)
export const MAX_WORD_LENGTH = Number(import.meta.env.VITE_MAX_WORD_LENGTH ?? 8)
export const DEFAULT_WORD_LENGTH = MIN_WORD_LENGTH

export const WORD_LENGTHS = Array.from(
  { length: MAX_WORD_LENGTH - MIN_WORD_LENGTH + 1 },
  (_, index) => MIN_WORD_LENGTH + index,
)

// The backend gives one more turn than letters. Played games use max_turns
// from the API; this only previews the count before a game exists.
export function turnsForLength(wordLength) {
  return wordLength + 1
}

// Timing of the row-flip animation, shared by the board and the win celebration.
export const FLIP_MS = 600
export const FLIP_STAGGER_MS = 280

export function flipDurationMs(wordLength) {
  return FLIP_MS + Math.max(wordLength - 1, 0) * FLIP_STAGGER_MS
}

// Winning-row bounce: stagger across tiles plus one bounce, used to delay the dialog.
export const WIN_BOUNCE_MS = 1100
