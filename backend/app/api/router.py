from fastapi import APIRouter

from app.api import games

api_v1_router = APIRouter()
api_v1_router.include_router(games.router)
