import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadConfig() {
  vi.resetModules()
  return import('../src/config')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('config', () => {
  it('defaults to word lengths 5 to 8', async () => {
    const config = await loadConfig()

    expect(config.MIN_WORD_LENGTH).toBe(5)
    expect(config.MAX_WORD_LENGTH).toBe(8)
    expect(config.DEFAULT_WORD_LENGTH).toBe(5)
    expect(config.WORD_LENGTHS).toEqual([5, 6, 7, 8])
  })

  it('reads the bounds from the environment', async () => {
    vi.stubEnv('VITE_MIN_WORD_LENGTH', '4')
    vi.stubEnv('VITE_MAX_WORD_LENGTH', '6')

    const config = await loadConfig()

    expect(config.WORD_LENGTHS).toEqual([4, 5, 6])
    expect(config.DEFAULT_WORD_LENGTH).toBe(4)
  })

  it('previews one more turn than letters', async () => {
    const { turnsForLength } = await loadConfig()

    expect(turnsForLength(5)).toBe(6)
    expect(turnsForLength(8)).toBe(9)
  })
})
