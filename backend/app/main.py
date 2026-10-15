import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_v1_router
from app.core.config import settings
from app.repositories.database import engine
from app.core.exception_handlers import register_exception_handlers
from app.services.dictionary_service import DictionaryService


def run_migrations() -> None:
    """Apply Alembic migrations before the API serves traffic."""
    backend_dir = Path(__file__).resolve().parents[1]
    alembic_cfg = Config(str(backend_dir / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    alembic_cfg.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
    command.upgrade(alembic_cfg, "head")


@asynccontextmanager
async def lifespan(app: FastAPI):
    dictionary = DictionaryService()
    dictionary.ensure_ready(settings.MIN_WORD_LENGTH, settings.MAX_WORD_LENGTH)
    app.state.dictionary = dictionary
    await asyncio.to_thread(run_migrations)
    yield
    await engine.dispose()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
register_exception_handlers(app)
app.include_router(api_v1_router, prefix=settings.API_V1_STR)
