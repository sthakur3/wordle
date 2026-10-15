from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    connect_args={
        "server_settings": {
            "lock_timeout": str(settings.DB_LOCK_TIMEOUT_MS),
            "statement_timeout": str(settings.DB_STATEMENT_TIMEOUT_MS),
        }
    },
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    """Yield a session. Writers commit explicitly through GameStore.commit(),
    because teardown after a yield may run after the response is sent."""
    async with SessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
