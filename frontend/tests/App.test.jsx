import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routes } from '../src/routes.jsx'
import { ApiError, createGame, getGame, submitGuess } from '../src/api/games.js'

vi.mock('../src/api/games.js', async (importOriginal) => ({
  ...(await importOriginal()),
  createGame: vi.fn(),
  getGame: vi.fn(),
  submitGuess: vi.fn(),
}))

const GAME = {
  game_id: 'game-1',
  word_length: 5,
  max_turns: 6,
  status: 'IN_PROGRESS',
  guesses: [],
}

function tilesIn(row) {
  return [...row.querySelectorAll('.tile, .tile-scene')]
}

afterEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

function renderAt(path) {
  return render(
    <RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />,
  )
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('App', () => {
  it('redirects /play to /new when no game has been created', async () => {
    renderAt('/play')

    expect(await screen.findByRole('radiogroup', { name: 'Word length' })).toBeInTheDocument()
    expect(getGame).not.toHaveBeenCalled()
  })

  it('stays on /play when a saved game loads', async () => {
    localStorage.setItem('wordle-game-id', GAME.game_id)
    getGame.mockResolvedValue(GAME)

    renderAt('/play')

    expect(await screen.findByRole('group', { name: 'Guess 1' })).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Word length' })).not.toBeInTheDocument()
    expect(localStorage.getItem('wordle-game-id')).toBe(GAME.game_id)
  })

  it('redirects /play to /new when the saved game no longer exists', async () => {
    localStorage.setItem('wordle-game-id', 'gone')
    getGame.mockRejectedValue(new ApiError('Game not found.', { status: 404 }))

    renderAt('/play')

    expect(await screen.findByRole('radiogroup', { name: 'Word length' })).toBeInTheDocument()
    expect(localStorage.getItem('wordle-game-id')).toBeNull()
  })

  it('clears the saved game when the player abandons it', async () => {
    localStorage.setItem('wordle-game-id', GAME.game_id)
    getGame.mockResolvedValue(GAME)
    const user = userEvent.setup()

    renderAt('/play')
    await screen.findByRole('group', { name: 'Guess 1' })

    await user.click(screen.getByRole('button', { name: 'New game' }))
    await user.click(screen.getByRole('button', { name: 'Start new game' }))

    expect(localStorage.getItem('wordle-game-id')).toBeNull()
    expect(await screen.findByRole('radiogroup', { name: 'Word length' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Guess 1' })).not.toBeInTheDocument()
  })

  it('keeps the saved game when abandon is cancelled', async () => {
    localStorage.setItem('wordle-game-id', GAME.game_id)
    getGame.mockResolvedValue(GAME)
    const user = userEvent.setup()

    renderAt('/play')
    await screen.findByRole('group', { name: 'Guess 1' })

    await user.click(screen.getByRole('button', { name: 'New game' }))
    await user.click(screen.getByRole('button', { name: 'Keep playing' }))

    expect(localStorage.getItem('wordle-game-id')).toBe(GAME.game_id)
    expect(screen.getByRole('group', { name: 'Guess 1' })).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Word length' })).not.toBeInTheDocument()
  })

  it('celebrates a win made on this page but not a reloaded win', async () => {
    const WIN = { word: 'crane', evaluation: Array(5).fill('correct') }
    localStorage.setItem('wordle-game-id', GAME.game_id)
    getGame.mockResolvedValue(GAME)
    submitGuess.mockResolvedValue({ ...GAME, status: 'WON', target_word: 'crane', guesses: [WIN] })
    const user = userEvent.setup()

    const { container, unmount } = renderAt('/play')
    await screen.findByRole('group', { name: 'Guess 1' })
    await user.keyboard('crane{Enter}')
    await waitFor(() => expect(container.querySelector('.confetti')).toBeInTheDocument())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByRole('dialog', {}, { timeout: 5000 })).toHaveTextContent('You won.')
    unmount()

    getGame.mockResolvedValue({ ...GAME, status: 'WON', target_word: 'crane', guesses: [WIN] })
    const reloaded = renderAt('/play')
    expect(await screen.findByRole('dialog')).toHaveTextContent('You won.')
    expect(reloaded.container.querySelector('.confetti')).toBeNull()
  }, 10000)

  it('ignores a non-letter word typed on the physical keyboard', async () => {
    localStorage.setItem('wordle-game-id', GAME.game_id)
    getGame.mockResolvedValue(GAME)
    const user = userEvent.setup()

    renderAt('/play')

    const row = await screen.findByRole('group', { name: 'Guess 1' })
    await user.keyboard('12!@#')

    tilesIn(row).forEach((tile) => {
      expect(tile).toHaveAccessibleName('Empty')
      expect(tile).toHaveTextContent('')
    })
    expect(submitGuess).not.toHaveBeenCalled()

    await user.keyboard('ab')
    const filled = tilesIn(screen.getByRole('group', { name: 'Guess 1' }))
    expect(filled[0]).toHaveTextContent('a')
    expect(filled[1]).toHaveTextContent('b')
    expect(filled[2]).toHaveAccessibleName('Empty')
  })

  it('lets Enter activate a focused button instead of submitting the guess', async () => {
    localStorage.setItem('wordle-game-id', GAME.game_id)
    getGame.mockResolvedValue(GAME)
    const user = userEvent.setup()

    renderAt('/play')
    await screen.findByRole('group', { name: 'Guess 1' })

    await user.tab()
    expect(screen.getByRole('button', { name: 'New game' })).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(
      await screen.findByRole('button', { name: 'Start new game' }),
    ).toBeInTheDocument()
  })

  it('shows a retry button when the saved game cannot be loaded', async () => {
    localStorage.setItem('wordle-game-id', GAME.game_id)
    getGame.mockRejectedValueOnce(new ApiError('Could not reach the server.'))
    getGame.mockResolvedValueOnce(GAME)
    const user = userEvent.setup()

    renderAt('/play')

    await user.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('group', { name: 'Guess 1' })).toBeInTheDocument()
    expect(localStorage.getItem('wordle-game-id')).toBe(GAME.game_id)
  })

  it('lets the player dismiss the finished dialog to view the board', async () => {
    localStorage.setItem('wordle-game-id', GAME.game_id)
    getGame.mockResolvedValue({
      ...GAME,
      status: 'LOST',
      target_word: 'crane',
      guesses: [{ word: 'slate', evaluation: ['absent', 'absent', 'present', 'absent', 'correct'] }],
    })
    const user = userEvent.setup()

    renderAt('/play')

    expect(await screen.findByRole('dialog')).toHaveTextContent('You lost. The word was CRANE.')
    await user.click(screen.getByRole('button', { name: 'View board' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Guess 1' })).toBeInTheDocument()
    expect(screen.getByText('You lost. The word was CRANE.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play again' })).toBeEnabled()
  })

  it('keeps the typed guess when the game is busy', async () => {
    localStorage.setItem('wordle-game-id', GAME.game_id)
    getGame.mockResolvedValue(GAME)
    submitGuess.mockRejectedValue(
      new ApiError('The game is busy with another request. Please retry.', {
        status: 409,
        code: 'game_busy',
      }),
    )
    const user = userEvent.setup()

    renderAt('/play')
    const row = await screen.findByRole('group', { name: 'Guess 1' })
    await user.keyboard('crane{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('busy')
    expect(tilesIn(row)[0]).toHaveTextContent('c')
    expect(getGame).toHaveBeenCalledTimes(1)
  })

  it('refreshes and clears the guess when the game is already finished', async () => {
    localStorage.setItem('wordle-game-id', GAME.game_id)
    getGame.mockResolvedValueOnce(GAME)
    getGame.mockResolvedValueOnce({ ...GAME, status: 'LOST', target_word: 'crane' })
    submitGuess.mockRejectedValue(
      new ApiError('This game is already finished.', {
        status: 409,
        code: 'game_already_finished',
      }),
    )
    const user = userEvent.setup()

    renderAt('/play')
    await screen.findByRole('group', { name: 'Guess 1' })
    await user.keyboard('plane{Enter}')

    expect(await screen.findByRole('dialog')).toHaveTextContent('The word was CRANE.')
    expect(getGame).toHaveBeenCalledTimes(2)
  })

  it('ignores a guess response that arrives after the game was abandoned', async () => {
    localStorage.setItem('wordle-game-id', GAME.game_id)
    getGame.mockResolvedValue(GAME)
    const pending = deferred()
    submitGuess.mockImplementation((_id, _guess, { signal }) => {
      signal.addEventListener('abort', () => {
        pending.reject(new DOMException('Aborted', 'AbortError'))
      })
      return pending.promise
    })
    const user = userEvent.setup()

    renderAt('/play')
    await screen.findByRole('group', { name: 'Guess 1' })
    await user.keyboard('crane{Enter}')
    await user.click(screen.getByRole('button', { name: 'New game' }))
    await user.click(screen.getByRole('button', { name: 'Start new game' }))

    expect(await screen.findByRole('radiogroup', { name: 'Word length' })).toBeInTheDocument()
    expect(localStorage.getItem('wordle-game-id')).toBeNull()
    expect(screen.queryByRole('group', { name: 'Guess 1' })).not.toBeInTheDocument()
  })

  it('starts a game from /new and moves to /play', async () => {
    createGame.mockResolvedValue({ ...GAME, game_id: 'fresh' })
    const user = userEvent.setup()

    renderAt('/new')
    await user.click(await screen.findByRole('button', { name: 'Start game' }))

    expect(await screen.findByRole('group', { name: 'Guess 1' })).toBeInTheDocument()
    expect(localStorage.getItem('wordle-game-id')).toBe('fresh')
  })

  it('accepts a guess the server applied before the request timed out', async () => {
    localStorage.setItem('wordle-game-id', GAME.game_id)
    const applied = {
      ...GAME,
      guesses: [{ word: 'crane', evaluation: ['absent', 'absent', 'absent', 'absent', 'absent'] }],
    }
    getGame.mockResolvedValueOnce(GAME).mockResolvedValueOnce(applied)
    submitGuess.mockRejectedValue(new ApiError('Too slow.', { code: 'timeout' }))
    const user = userEvent.setup()

    renderAt('/play')
    await screen.findByRole('group', { name: 'Guess 1' })
    await user.keyboard('crane{Enter}')

    expect(await screen.findByRole('img', { name: 'C, absent' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps the guess when a timed-out guess was not applied', async () => {
    localStorage.setItem('wordle-game-id', GAME.game_id)
    getGame.mockResolvedValue(GAME)
    submitGuess.mockRejectedValue(new ApiError('Too slow.', { code: 'timeout' }))
    const user = userEvent.setup()

    renderAt('/play')
    await screen.findByRole('group', { name: 'Guess 1' })
    await user.keyboard('crane{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('Too slow.')
    expect(screen.getByRole('img', { name: 'C' })).toBeInTheDocument()
  })

  it('moves focus into the abandon dialog, inerts the page and restores focus on Escape', async () => {
    localStorage.setItem('wordle-game-id', GAME.game_id)
    getGame.mockResolvedValue(GAME)
    const user = userEvent.setup()

    renderAt('/play')
    await screen.findByRole('group', { name: 'Guess 1' })
    const opener = screen.getByRole('button', { name: 'New game' })
    await user.click(opener)

    const abandon = screen.getByRole('button', { name: 'Start new game' })
    expect(abandon).toHaveFocus()
    expect(document.querySelector('.topbar')).toHaveAttribute('inert')
    expect(document.querySelector('main.play')).toHaveAttribute('inert')

    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Keep playing' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.querySelector('.topbar')).not.toHaveAttribute('inert')
    expect(opener).toHaveFocus()
  })

  it('clears a stale message when New game is pressed', async () => {
    localStorage.setItem('wordle-game-id', GAME.game_id)
    getGame.mockRejectedValue(new ApiError('Boom.', { status: 500 }))
    const user = userEvent.setup()

    renderAt('/play')
    expect(await screen.findByRole('alert')).toHaveTextContent('Boom.')

    await user.click(screen.getByRole('button', { name: 'New game' }))

    expect(await screen.findByRole('radiogroup', { name: 'Word length' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('asks before replacing a game in progress from /new', async () => {
    localStorage.setItem('wordle-game-id', GAME.game_id)
    getGame.mockResolvedValue(GAME)
    createGame.mockResolvedValue({ ...GAME, game_id: 'fresh' })
    const user = userEvent.setup()

    renderAt('/new')
    await waitFor(() => expect(getGame).toHaveBeenCalled())

    await user.click(screen.getByRole('button', { name: 'Start game' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Replace your game in progress?')
    expect(createGame).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Start new game' }))
    expect(await screen.findByRole('group', { name: 'Guess 1' })).toBeInTheDocument()
    expect(localStorage.getItem('wordle-game-id')).toBe('fresh')
  })
})
