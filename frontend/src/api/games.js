export const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1'
export const REQUEST_TIMEOUT_MS = 10000

const NETWORK_MESSAGE = 'Could not reach the server. Check that the API is running.'
const TIMEOUT_MESSAGE = 'The server took too long to respond. Please try again.'

export const ERROR_CODES = {
  GAME_ALREADY_FINISHED: 'game_already_finished',
  GAME_BUSY: 'game_busy',
  NETWORK: 'network_error',
  BAD_RESPONSE: 'bad_response',
  TIMEOUT: 'timeout',
}

export class ApiError extends Error {
  constructor(message, { status = 0, code = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export function isAbortError(error) {
  return error?.name === 'AbortError'
}

function fallbackMessage(status) {
  if (status === 404) return 'Game not found.'
  if (status === 409) return 'This game is already finished.'
  if (status === 503) {
    return 'Storage service is temporarily unavailable. Please try again shortly.'
  }
  return 'Something went wrong. Please try again.'
}

function messageFromBody(body, status) {
  if (body && typeof body === 'object' && typeof body.detail === 'string' && body.detail.trim()) {
    return body.detail
  }
  return fallbackMessage(status)
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, REQUEST_TIMEOUT_MS)
  const abortFromCaller = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', abortFromCaller, { once: true })
  }

  try {
    let response
    let text
    try {
      response = await fetch(`${API_BASE}${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body,
        signal: controller.signal,
      })
      text = await response.text()
    } catch (error) {
      if (timedOut) throw new ApiError(TIMEOUT_MESSAGE, { code: ERROR_CODES.TIMEOUT })
      if (controller.signal.aborted) throw error
      throw new ApiError(NETWORK_MESSAGE, { status: 0, code: ERROR_CODES.NETWORK })
    }

    let payload = null
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = null
      }
    }

    if (!response.ok) {
      throw new ApiError(messageFromBody(payload, response.status), {
        status: response.status,
        code: payload && typeof payload.error_code === 'string' ? payload.error_code : null,
      })
    }

    if (payload === null) {
      throw new ApiError('The server sent an unexpected response. Please try again.', {
        status: response.status,
        code: ERROR_CODES.BAD_RESPONSE,
      })
    }

    return payload
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abortFromCaller)
  }
}

export function createGame(wordLength, options) {
  return request('/games', {
    ...options,
    method: 'POST',
    body: JSON.stringify({ word_length: wordLength }),
  })
}

export function getGame(gameId, options) {
  return request(`/games/${encodeURIComponent(gameId)}`, options)
}

export function submitGuess(gameId, guess, options) {
  return request(`/games/${encodeURIComponent(gameId)}/guess`, {
    ...options,
    method: 'POST',
    body: JSON.stringify({ guess }),
  })
}
