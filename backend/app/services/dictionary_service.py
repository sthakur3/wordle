import json
import logging
from pathlib import Path

from app.core.config import settings
from app.domain.rules import is_playable_word


logger = logging.getLogger(__name__)


class DictionaryService:
    """Loads JSON word lists into memory and validates guesses against them.

    Each file in dictionary_files should be a JSON array of words, for example
    ["apple", "grape"]. Words are grouped by length.
    """

    def __init__(self, dictionary_dir: Path | None = None) -> None:
        self.dictionary_dir = dictionary_dir or settings.dictionary_dir
        self._words_by_length: dict[int, set[str]] = {}
        self._targets_by_length: dict[int, set[str]] = {}
        self.load()

    def load(self) -> None:
        words_by_length: dict[int, set[str]] = {}
        targets_by_length: dict[int, set[str]] = {}
        if not self.dictionary_dir.is_dir():
            raise FileNotFoundError(
                f"Dictionary directory not found: {self.dictionary_dir}"
            )

        for path in sorted(self.dictionary_dir.glob("*.json")):
            with path.open(encoding="utf-8") as handle:
                words = json.load(handle)
            if not isinstance(words, list):
                raise ValueError(f"{path.name} must contain a JSON array of words")
            is_target_list = path.name.startswith("target_")
            for word in words:
                normalized = str(word).strip().lower()
                if not normalized:
                    continue
                if not is_playable_word(normalized):
                    logger.warning(
                        "Skipping non-alphabetic word %r in %s", normalized, path.name
                    )
                    continue
                length = len(normalized)
                words_by_length.setdefault(length, set()).add(normalized)
                if is_target_list:
                    targets_by_length.setdefault(length, set()).add(normalized)

        # Swap in only after every file loaded, so a failed reload keeps the old data.
        self._words_by_length = words_by_length
        self._targets_by_length = targets_by_length

    def ensure_ready(self, min_length: int, max_length: int) -> None:
        """Fail fast when a supported word length has no target words."""
        missing = [
            length
            for length in range(min_length, max_length + 1)
            if not self._targets_by_length.get(length)
        ]
        if missing:
            raise RuntimeError(
                f"No target words loaded from {self.dictionary_dir} "
                f"for word lengths: {missing}"
            )

    def is_valid_word(self, word: str) -> bool:
        normalized = word.strip().lower()
        return normalized in self._words_by_length.get(len(normalized), set())

    def words_of_length(self, length: int) -> set[str]:
        return set(self._words_by_length.get(length, set()))

    def target_words_of_length(self, length: int) -> set[str]:
        return set(self._targets_by_length.get(length, set()))
