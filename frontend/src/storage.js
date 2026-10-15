const STORAGE_KEY = 'wordle-game-id'

// Storage can throw when blocked (private mode, disabled cookies).
export function getSavedGameId() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function saveGameId(gameId) {
  try {
    localStorage.setItem(STORAGE_KEY, gameId)
  } catch {
    // The game still works for this page load.
  }
}

export function clearSavedGameId() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clear.
  }
}
