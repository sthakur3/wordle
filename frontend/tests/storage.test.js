import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearSavedGameId, getSavedGameId, saveGameId } from '../src/storage'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('storage', () => {
  it('saves, reads and clears the game id', () => {
    expect(getSavedGameId()).toBeNull()

    saveGameId('abc')
    expect(getSavedGameId()).toBe('abc')

    clearSavedGameId()
    expect(getSavedGameId()).toBeNull()
  })

  it('does not throw when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    expect(getSavedGameId()).toBeNull()
    expect(() => saveGameId('abc')).not.toThrow()
    expect(() => clearSavedGameId()).not.toThrow()
  })
})
