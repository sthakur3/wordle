import asyncio
import uuid
from dataclasses import replace
from datetime import datetime

import pytest
import pytest_asyncio
from sqlalchemy import delete, func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.domain.game_store import GameNotLockedError
from app.repositories.game_store import PostgresGameStore
from app.domain.game import GameState, GameStatus, GuessResult
from app.models.game import Base, Game

TEST_DATABASE_URL = "postgresql+asyncpg://wordle:wordle@localhost:5432/wordle_test"
TEST_DATABASE_NAME = "wordle_test"


def new_game_state(**overrides: object) -> GameState:
    return replace(
        GameState.new(game_id=str(uuid.uuid4()), target_word="crane"),
        **overrides,
    )


async def locked_update(session, game: GameState) -> None:
    store = PostgresGameStore(session)
    await store.load(game.game_id, lock=True)
    await store.update(game)


async def _ensure_test_database() -> None:
    """Create wordle_test on the local Postgres server. Tests never open the app database."""
    admin_url = make_url(TEST_DATABASE_URL).set(database="postgres")
    admin_engine = create_async_engine(
        admin_url,
        isolation_level="AUTOCOMMIT",
        pool_pre_ping=True,
    )
    try:
        async with admin_engine.connect() as connection:
            exists = await connection.scalar(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {"name": TEST_DATABASE_NAME},
            )
            if not exists:
                await connection.execute(text(f"CREATE DATABASE {TEST_DATABASE_NAME}"))
    finally:
        await admin_engine.dispose()


@pytest_asyncio.fixture
async def store_db():
    try:
        await _ensure_test_database()
    except Exception as exc:
        pytest.skip(f"Postgres is not available: {exc}")

    engine = create_async_engine(TEST_DATABASE_URL, pool_pre_ping=True)
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
    except Exception as exc:
        await engine.dispose()
        pytest.skip(f"Postgres is not available: {exc}")

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, expire_on_commit=False)
    game_ids: list[uuid.UUID] = []
    try:
        yield factory, game_ids
    finally:
        async with factory() as session:
            if game_ids:
                await session.execute(delete(Game).where(Game.id.in_(game_ids)))
                await session.commit()
        await engine.dispose()


@pytest.mark.asyncio
async def test_create_inserts_game_and_load_returns_it(store_db) -> None:
    factory, game_ids = store_db
    state = new_game_state(
        guesses=[GuessResult(word="plane", evaluation=("absent",) * 5)],
    )
    game_ids.append(uuid.UUID(state.game_id))

    async with factory() as session:
        await PostgresGameStore(session).create(state)
        await session.commit()

    async with factory() as session:
        loaded = await PostgresGameStore(session).load(state.game_id)

    assert loaded == state


@pytest.mark.asyncio
async def test_create_stores_empty_guesses(store_db) -> None:
    factory, game_ids = store_db
    state = new_game_state()
    game_ids.append(uuid.UUID(state.game_id))

    async with factory() as session:
        await PostgresGameStore(session).create(state)
        await session.commit()

    async with factory() as session:
        loaded = await PostgresGameStore(session).load(state.game_id)

    assert loaded is not None
    assert loaded.guesses == []


@pytest.mark.asyncio
async def test_update_changes_existing_game_in_place(store_db) -> None:
    factory, game_ids = store_db
    state = new_game_state()
    game_id = uuid.UUID(state.game_id)
    game_ids.append(game_id)

    async with factory() as session:
        await PostgresGameStore(session).create(state)
        await session.commit()

    async with factory() as session:
        created = await session.get(Game, game_id)
        assert created is not None
        created_at = created.updated_at

    await asyncio.sleep(0.01)
    updated = replace(
        state,
        remaining_turns=5,
        guesses=[
            GuessResult(
                word="slate",
                evaluation=("present", "absent", "absent", "absent", "correct"),
            ),
        ],
    )
    async with factory() as session:
        await locked_update(session, updated)
        await session.commit()

    async with factory() as session:
        loaded = await PostgresGameStore(session).load(state.game_id)
        row_count = await session.scalar(
            select(func.count()).select_from(Game).where(Game.id == game_id)
        )
        stored = await session.get(Game, game_id)

    assert row_count == 1
    assert loaded == updated
    assert stored is not None
    assert isinstance(stored.updated_at, datetime)
    assert stored.updated_at > created_at


@pytest.mark.asyncio
async def test_update_persists_finished_status(store_db) -> None:
    factory, game_ids = store_db
    state = new_game_state()
    game_ids.append(uuid.UUID(state.game_id))

    async with factory() as session:
        await PostgresGameStore(session).create(state)
        await session.commit()

    state.apply_guess(GuessResult(word="crane", evaluation=("correct",) * 5))
    async with factory() as session:
        await locked_update(session, state)
        await session.commit()

    async with factory() as session:
        loaded = await PostgresGameStore(session).load(state.game_id)

    assert loaded is not None
    assert loaded.status is GameStatus.WON


@pytest.mark.asyncio
async def test_update_requires_a_prior_locked_load(store_db) -> None:
    factory, game_ids = store_db
    state = new_game_state()
    game_ids.append(uuid.UUID(state.game_id))
    async with factory() as session:
        await PostgresGameStore(session).create(state)
        await session.commit()

    async with factory() as session:
        store = PostgresGameStore(session)
        with pytest.raises(GameNotLockedError):
            await store.update(state)
        await store.load(state.game_id)
        with pytest.raises(GameNotLockedError):
            await store.update(state)
        await store.load(state.game_id, lock=True)
        await store.update(state)
        await store.commit()
        with pytest.raises(GameNotLockedError):
            await store.update(state)


@pytest.mark.asyncio
async def test_update_raises_for_unknown_game(store_db) -> None:
    factory, _game_ids = store_db

    async with factory() as session:
        with pytest.raises(GameNotLockedError):
            await locked_update(session, new_game_state())


@pytest.mark.asyncio
async def test_update_does_not_change_immutable_fields(store_db) -> None:
    factory, game_ids = store_db
    state = new_game_state()
    game_ids.append(uuid.UUID(state.game_id))

    async with factory() as session:
        await PostgresGameStore(session).create(state)
        await session.commit()

    async with factory() as session:
        await locked_update(session, 
            replace(state, target_word="other", word_length=9, max_turns=1)
        )
        await session.commit()

    async with factory() as session:
        loaded = await PostgresGameStore(session).load(state.game_id)

    assert loaded.target_word == "crane"
    assert loaded.word_length == 5
    assert loaded.max_turns == 6


@pytest.mark.asyncio
async def test_load_returns_none_for_unknown_id(store_db) -> None:
    factory, _game_ids = store_db

    async with factory() as session:
        loaded = await PostgresGameStore(session).load(str(uuid.uuid4()))

    assert loaded is None


@pytest.mark.asyncio
async def test_load_returns_none_for_non_uuid(store_db) -> None:
    factory, _game_ids = store_db

    async with factory() as session:
        loaded = await PostgresGameStore(session).load("missing-id")

    assert loaded is None


@pytest.mark.asyncio
async def test_locked_load_blocks_until_the_holder_commits(store_db) -> None:
    factory, game_ids = store_db
    state = new_game_state()
    game_ids.append(uuid.UUID(state.game_id))

    async with factory() as session:
        await PostgresGameStore(session).create(state)
        await session.commit()

    async with factory() as holder:
        held = await PostgresGameStore(holder).load(state.game_id, lock=True)
        assert held is not None

        async with factory() as waiter_session:
            waiter = asyncio.create_task(
                PostgresGameStore(waiter_session).load(state.game_id, lock=True)
            )
            try:
                await _wait_until_blocked(factory)
                finished, _pending = await asyncio.wait({waiter}, timeout=0.3)
                assert waiter not in finished

                await holder.commit()
                loaded = await asyncio.wait_for(waiter, timeout=2)
            finally:
                if not waiter.done():
                    await holder.commit()
                    waiter.cancel()
                    try:
                        await waiter
                    except asyncio.CancelledError:
                        pass

    assert loaded == state


async def _wait_until_blocked(factory) -> None:
    for _ in range(40):
        async with factory() as session:
            waiting = await session.scalar(
                text(
                    """
                    SELECT COUNT(*)
                    FROM pg_stat_activity
                    WHERE wait_event_type = 'Lock'
                      AND query ILIKE '%games%'
                    """
                )
            )
        if waiting:
            return
        await asyncio.sleep(0.05)
    pytest.fail("locked load did not block")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "overrides",
    [
        {"status": "BOGUS"},
        {"remaining_turns": -1},
        {"remaining_turns": 7},
        {"word_length": 6},
    ],
)
async def test_database_rejects_invalid_rows(store_db, overrides) -> None:
    from sqlalchemy.exc import IntegrityError

    factory, game_ids = store_db
    values = dict(
        id=uuid.uuid4(),
        word_length=5,
        target_word="crane",
        max_turns=6,
        remaining_turns=6,
        status="IN_PROGRESS",
        guesses=[],
    )
    values.update(overrides)
    async with factory() as session:
        session.add(Game(**values))
        with pytest.raises(IntegrityError):
            await session.flush()


@pytest.mark.asyncio
async def test_lock_timeout_raises_instead_of_waiting_forever(store_db) -> None:
    from sqlalchemy.exc import DBAPIError

    from app.core.exception_handlers import LOCK_NOT_AVAILABLE, _sqlstate

    factory, game_ids = store_db
    state = new_game_state()
    game_ids.append(uuid.UUID(state.game_id))
    async with factory() as session:
        await PostgresGameStore(session).create(state)
        await session.commit()

    async with factory() as holder:
        await PostgresGameStore(holder).load(state.game_id, lock=True)
        async with factory() as waiter:
            await waiter.execute(text("SET LOCAL lock_timeout = '200ms'"))
            with pytest.raises(DBAPIError) as info:
                await PostgresGameStore(waiter).load(state.game_id, lock=True)
    assert _sqlstate(info.value) == LOCK_NOT_AVAILABLE
