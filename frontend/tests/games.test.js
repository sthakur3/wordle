import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  REQUEST_TIMEOUT_MS,
  createGame,
  getGame,
  isAbortError,
  submitGuess,
} from '../src/api/games'

const API_BASE = 'http://localhost:8000/api/v1'

function jsonResponse(body, { status = 200, ok = status >= 200 && status < 300 } = {}) {
  return {
    ok,
    status,
    text: vi.fn().mockResolvedValue(body == null ? '' : JSON.stringify(body)),
  }
}

function textResponse(text, { status = 200, ok = status >= 200 && status < 300 } = {}) {
  return {
    ok,
    status,
    text: vi.fn().mockResolvedValue(text),
  }
}

describe('games API', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('ApiError', () => {
    it('sets name, message, status, and code', () => {
      const error = new ApiError('Game not found.', { status: 404, code: 'not_found' })

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(ApiError)
      expect(error.name).toBe('ApiError')
      expect(error.message).toBe('Game not found.')
      expect(error.status).toBe(404)
      expect(error.code).toBe('not_found')
    })

    it('defaults status to 0 and code to null', () => {
      const error = new ApiError('Something went wrong.')

      expect(error.status).toBe(0)
      expect(error.code).toBeNull()
    })
  })

  describe('createGame', () => {
    it('posts the word length and returns the parsed game', async () => {
      const game = { game_id: 'abc', word_length: 5, status: 'IN_PROGRESS' }
      fetch.mockResolvedValue(jsonResponse(game))

      await expect(createGame(5)).resolves.toEqual(game)

      expect(fetch).toHaveBeenCalledWith(`${API_BASE}/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word_length: 5 }),
        signal: expect.any(AbortSignal),
      })
    })
  })

  describe('getGame', () => {
    it('gets a game without a body or content type', async () => {
      const game = { game_id: 'abc', guesses: [] }
      fetch.mockResolvedValue(jsonResponse(game))

      await expect(getGame('abc')).resolves.toEqual(game)

      expect(fetch).toHaveBeenCalledWith(`${API_BASE}/games/abc`, {
        method: 'GET',
        headers: undefined,
        body: undefined,
        signal: expect.any(AbortSignal),
      })
    })

    it('encodes the game id', async () => {
      fetch.mockResolvedValue(jsonResponse({ game_id: 'a/b c' }))

      await getGame('a/b c')

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/games/${encodeURIComponent('a/b c')}`,
        expect.objectContaining({ method: 'GET' }),
      )
    })

    it('rejects a successful response with an empty body', async () => {
      fetch.mockResolvedValue(textResponse(''))

      await expect(getGame('abc')).rejects.toMatchObject({
        name: 'ApiError',
        status: 200,
        code: 'bad_response',
      })
    })

    it('rejects a successful response that is not JSON', async () => {
      fetch.mockResolvedValue(textResponse('<html>oops</html>'))

      await expect(getGame('abc')).rejects.toMatchObject({ code: 'bad_response' })
    })
  })

  describe('submitGuess', () => {
    it('posts the guess and returns the updated game', async () => {
      const game = { game_id: 'abc', guesses: ['crane'] }
      fetch.mockResolvedValue(jsonResponse(game))

      await expect(submitGuess('abc', 'crane')).resolves.toEqual(game)

      expect(fetch).toHaveBeenCalledWith(`${API_BASE}/games/abc/guess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guess: 'crane' }),
        signal: expect.any(AbortSignal),
      })
    })

    it('encodes the game id', async () => {
      fetch.mockResolvedValue(jsonResponse({ game_id: 'a/b c' }))

      await submitGuess('a/b c', 'crane')

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/games/${encodeURIComponent('a/b c')}/guess`,
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  describe('request errors', () => {
    it('throws a network ApiError when fetch rejects', async () => {
      fetch.mockRejectedValue(new TypeError('Failed to fetch'))

      await expect(getGame('abc')).rejects.toMatchObject({
        name: 'ApiError',
        message: 'Could not reach the server. Check that the API is running.',
        status: 0,
        code: 'network_error',
      })
    })

    it('uses a string detail and the error code from the body', async () => {
      fetch.mockResolvedValue(
        jsonResponse(
          { detail: 'Word is not in the dictionary.', error_code: 'invalid_guess' },
          { status: 400 },
        ),
      )

      await expect(submitGuess('abc', 'zzzzz')).rejects.toMatchObject({
        message: 'Word is not in the dictionary.',
        status: 400,
        code: 'invalid_guess',
      })
    })

    it('ignores a blank string detail and a non-string error code', async () => {
      fetch.mockResolvedValue(
        jsonResponse({ detail: '   ', error_code: 404 }, { status: 404 }),
      )

      await expect(getGame('missing')).rejects.toMatchObject({
        message: 'Game not found.',
        status: 404,
        code: null,
      })
    })

    it('falls back when the body is not an object', async () => {
      fetch.mockResolvedValue(jsonResponse('nope', { status: 500 }))

      await expect(getGame('abc')).rejects.toMatchObject({
        message: 'Something went wrong. Please try again.',
        status: 500,
        code: null,
      })
    })

    it('falls back when the body is not valid JSON', async () => {
      fetch.mockResolvedValue(textResponse('<html>bad gateway</html>', { status: 502 }))

      await expect(getGame('abc')).rejects.toMatchObject({
        message: 'Something went wrong. Please try again.',
        status: 502,
        code: null,
      })
    })

    it('falls back when an array detail has no usable messages', async () => {
      fetch.mockResolvedValue(jsonResponse({ detail: [null, { loc: ['guess'] }] }, { status: 409 }))

      await expect(submitGuess('abc', 'crane')).rejects.toMatchObject({
        message: 'This game is already finished.',
        status: 409,
        code: null,
      })
    })

    it('uses the storage fallback for a 503 with no detail', async () => {
      fetch.mockResolvedValue(jsonResponse({}, { status: 503 }))

      await expect(createGame(5)).rejects.toMatchObject({
        message: 'Storage service is temporarily unavailable. Please try again shortly.',
        status: 503,
        code: null,
      })
    })
  })

  describe('timeouts and aborts', () => {
    it('fails with a timeout error when the server never answers', async () => {
      vi.useFakeTimers()
      try {
        fetch.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')))
        }))

        const result = expect(getGame('abc')).rejects.toMatchObject({
          code: 'timeout',
          name: 'ApiError',
        })
        await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1)
        await result
      } finally {
        vi.useRealTimers()
      }
    })

    it('rethrows an abort from the caller as an AbortError', async () => {
      fetch.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')))
      }))
      const controller = new AbortController()

      const result = getGame('abc', { signal: controller.signal })
      controller.abort()

      await expect(result).rejects.toSatisfy(isAbortError)
    })
  })
})
