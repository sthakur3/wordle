import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Board from '../src/components/Board.jsx'

const FLIP_MS = 600
const FLIP_STAGGER_MS = 280

function game(overrides = {}) {
  return {
    word_length: 5,
    max_turns: 6,
    status: 'IN_PROGRESS',
    guesses: [],
    ...overrides,
  }
}

function tilesIn(row) {
  return [...row.querySelectorAll('.tile, .tile-scene')]
}

function flipDuration(wordLength) {
  return FLIP_MS + Math.max(wordLength - 1, 0) * FLIP_STAGGER_MS + 40
}

afterEach(() => {
  vi.useRealTimers()
})

const WIN = { word: 'crane', evaluation: ['correct', 'correct', 'correct', 'correct', 'correct'] }

describe('Board', () => {
  it('bounces the winning row once the flip finishes, but not on a reloaded win', () => {
    vi.useFakeTimers()
    const { container, rerender } = render(<Board game={game()} currentGuess="" shake={false} />)
    rerender(<Board game={game({ status: 'WON', guesses: [WIN] })} currentGuess="" shake={false} />)
    expect(container.querySelector('.bounce')).toBeNull()
    act(() => vi.advanceTimersByTime(flipDuration(5)))
    expect(container.querySelectorAll('.bounce')).toHaveLength(5)

    const reloaded = render(<Board game={game({ status: 'WON', guesses: [WIN] })} currentGuess="" shake={false} />)
    expect(reloaded.container.querySelector('.bounce')).toBeNull()
  })

  it('renders an empty row of tiles for every turn', () => {
    render(<Board game={game()} currentGuess="" shake={false} />)

    expect(screen.getByLabelText('Guesses')).toBeInTheDocument()
    const rows = screen.getAllByRole('group')
    expect(rows).toHaveLength(6)

    rows.forEach((row, index) => {
      expect(row).toHaveAccessibleName(`Guess ${index + 1}`)
      const tiles = tilesIn(row)
      expect(tiles).toHaveLength(5)
      tiles.forEach((tile) => {
        expect(tile).toHaveAccessibleName('Empty')
        expect(tile).toHaveTextContent('')
      })
    })
  })

  it('fills the current row with the in-progress guess', () => {
    render(<Board game={game()} currentGuess="ca" shake={false} />)

    const tiles = tilesIn(screen.getByRole('group', { name: 'Guess 1' }))
    expect(tiles[0]).toHaveTextContent('c')
    expect(tiles[0]).toHaveClass('tile', 'filled')
    expect(tiles[0]).toHaveAccessibleName('C')
    expect(tiles[1]).toHaveTextContent('a')
    expect(tiles[1]).toHaveClass('filled')
    expect(tiles[2]).toHaveAccessibleName('Empty')
    expect(tiles[0].className).not.toMatch(/correct|present|absent/)
    expect(tiles[1].className).not.toMatch(/correct|present|absent/)
  })

  it('shakes only the current row of an in-progress game', () => {
    const { rerender } = render(
      <Board game={game()} currentGuess="ca" shake />,
    )

    expect(screen.getByRole('group', { name: 'Guess 1' })).toHaveClass('shake')
    expect(screen.getByRole('group', { name: 'Guess 2' })).not.toHaveClass('shake')

    rerender(
      <Board
        game={game({ status: 'WON' })}
        currentGuess="ca"
        shake
      />,
    )

    const finishedRow = screen.getByRole('group', { name: 'Guess 1' })
    expect(finishedRow).not.toHaveClass('shake')
    tilesIn(finishedRow).forEach((tile) => {
      expect(tile).toHaveAccessibleName('Empty')
    })
  })

  it('shows submitted letters and marks without flipping on first paint', () => {
    render(
      <Board
        game={game({
          guesses: [{
            word: 'crane',
            evaluation: ['correct', 'present', 'absent', 'correct', 'present'],
          }],
        })}
        currentGuess=""
        shake={false}
      />,
    )

    const row = screen.getByRole('group', { name: 'Guess 1' })
    expect(row.querySelector('.tile-scene')).toBeNull()

    const tiles = tilesIn(row)
    expect(tiles[0]).toHaveClass('tile', 'filled', 'correct')
    expect(tiles[0]).toHaveAccessibleName('C, correct')
    expect(tiles[1]).toHaveClass('present')
    expect(tiles[1]).toHaveAccessibleName('R, present')
    expect(tiles[2]).toHaveClass('absent')
    expect(tiles[2]).toHaveAccessibleName('A, absent')
    expect(tiles[3]).toHaveTextContent('n')
    expect(tiles[4]).toHaveTextContent('e')
  })

  it('flips a newly submitted row, then settles to marked tiles', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const submitted = game({
      guesses: [{
        word: 'crane',
        evaluation: ['correct', 'present', 'absent', 'correct', 'present'],
      }],
    })
    const { rerender } = render(
      <Board game={game()} currentGuess="" shake={false} />,
    )

    rerender(<Board game={submitted} currentGuess="" shake={false} />)

    const row = screen.getByRole('group', { name: 'Guess 1' })
    const scenes = row.querySelectorAll('.tile-scene')
    expect(scenes).toHaveLength(5)
    expect([...row.querySelectorAll('.tile-inner')].map((tile) => tile.style.animationDelay))
      .toEqual(['0ms', '280ms', '560ms', '840ms', '1120ms'])
    expect(scenes[0]).toHaveAccessibleName('C, correct')
    expect(scenes[0].querySelector('.tile-front')).toHaveClass('filled')
    expect(scenes[0].querySelector('.tile-back')).toHaveClass('correct')
    expect(scenes[1].querySelector('.tile-back')).toHaveClass('present')
    expect(scenes[2].querySelector('.tile-back')).toHaveClass('absent')

    act(() => {
      vi.advanceTimersByTime(flipDuration(submitted.word_length))
    })

    const settled = screen.getByRole('group', { name: 'Guess 1' })
    expect(settled.querySelector('.tile-scene')).toBeNull()
    const tiles = tilesIn(settled)
    expect(tiles[0]).toHaveClass('tile', 'filled', 'correct')
    expect(tiles[1]).toHaveClass('present')
    expect(tiles[2]).toHaveClass('absent')
  })

  it('clears the board when guesses shrink', () => {
    const submitted = game({
      guesses: [{
        word: 'crane',
        evaluation: ['correct', 'present', 'absent', 'correct', 'present'],
      }],
    })
    const { rerender } = render(
      <Board game={submitted} currentGuess="" shake={false} />,
    )

    rerender(<Board game={game()} currentGuess="" shake={false} />)

    const row = screen.getByRole('group', { name: 'Guess 1' })
    expect(row.querySelector('.tile-scene')).toBeNull()
    tilesIn(row).forEach((tile) => {
      expect(tile).toHaveAccessibleName('Empty')
      expect(tile).not.toHaveClass('correct', 'present', 'absent', 'filled')
    })
  })
})
