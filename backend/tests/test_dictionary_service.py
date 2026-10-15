import json
from pathlib import Path

import pytest

from app.services.dictionary_service import DictionaryService


def write_word_list(directory: Path, name: str, words: object) -> None:
    (directory / name).write_text(json.dumps(words), encoding="utf-8")


def test_loads_allowed_and_target_words(tmp_path: Path) -> None:
    write_word_list(tmp_path, "allowed_5.json", ["crane", "plane"])
    write_word_list(tmp_path, "target_5.json", ["crane", "smile"])
    write_word_list(tmp_path, "allowed_6.json", ["planet"])

    dictionary = DictionaryService(tmp_path)

    assert dictionary.words_of_length(5) == {"crane", "plane", "smile"}
    assert dictionary.target_words_of_length(5) == {"crane", "smile"}
    assert dictionary.words_of_length(6) == {"planet"}
    assert dictionary.target_words_of_length(6) == set()
    assert dictionary.is_valid_word("plane")
    assert dictionary.is_valid_word("smile")
    assert not dictionary.is_valid_word("zzzzz")


def test_is_valid_word_normalizes_case_and_whitespace(tmp_path: Path) -> None:
    write_word_list(tmp_path, "allowed_5.json", ["  Apple "])

    dictionary = DictionaryService(tmp_path)

    assert dictionary.is_valid_word("APPLE")
    assert dictionary.is_valid_word("  apple")
    assert dictionary.words_of_length(5) == {"apple"}


def test_skips_blank_words(tmp_path: Path) -> None:
    write_word_list(tmp_path, "target_5.json", ["crane", "", "   "])

    dictionary = DictionaryService(tmp_path)

    assert dictionary.words_of_length(5) == {"crane"}
    assert dictionary.target_words_of_length(5) == {"crane"}


def test_groups_words_by_actual_length(tmp_path: Path) -> None:
    write_word_list(tmp_path, "target_5.json", ["crane", "planet"])

    dictionary = DictionaryService(tmp_path)

    assert dictionary.target_words_of_length(5) == {"crane"}
    assert dictionary.target_words_of_length(6) == {"planet"}


def test_missing_directory_raises(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError, match="Dictionary directory not found"):
        DictionaryService(tmp_path / "missing")


def test_skips_non_alphabetic_words(tmp_path: Path) -> None:
    write_word_list(tmp_path, "target_5.json", ["crane", "cr4ne", "caf\u00e9s", "a-bcd"])

    dictionary = DictionaryService(tmp_path)

    assert dictionary.words_of_length(5) == {"crane"}
    assert dictionary.target_words_of_length(5) == {"crane"}


def test_ensure_ready_passes_when_every_length_has_targets(tmp_path: Path) -> None:
    write_word_list(tmp_path, "target_5.json", ["crane", "planet"])

    DictionaryService(tmp_path).ensure_ready(5, 6)


def test_ensure_ready_names_lengths_without_targets(tmp_path: Path) -> None:
    write_word_list(tmp_path, "target_5.json", ["crane"])
    write_word_list(tmp_path, "allowed_6.json", ["planet"])

    with pytest.raises(RuntimeError, match=r"\[6, 7\]"):
        DictionaryService(tmp_path).ensure_ready(5, 7)


def test_rejects_a_file_that_is_not_a_json_array(tmp_path: Path) -> None:
    write_word_list(tmp_path, "allowed_5.json", {"crane": True})

    with pytest.raises(ValueError, match="allowed_5.json must contain a JSON array"):
        DictionaryService(tmp_path)


def test_lookups_return_copies(tmp_path: Path) -> None:
    write_word_list(tmp_path, "target_5.json", ["crane"])
    dictionary = DictionaryService(tmp_path)

    dictionary.words_of_length(5).add("plane")
    dictionary.target_words_of_length(5).add("smile")

    assert dictionary.words_of_length(5) == {"crane"}
    assert dictionary.target_words_of_length(5) == {"crane"}


def test_reload_replaces_previous_words(tmp_path: Path) -> None:
    write_word_list(tmp_path, "allowed_5.json", ["crane"])
    dictionary = DictionaryService(tmp_path)

    write_word_list(tmp_path, "allowed_5.json", ["plane"])
    dictionary.load()

    assert dictionary.words_of_length(5) == {"plane"}
    assert not dictionary.is_valid_word("crane")


def test_failed_reload_keeps_previous_words(tmp_path: Path) -> None:
    write_word_list(tmp_path, "target_5.json", ["crane"])
    dictionary = DictionaryService(tmp_path)

    write_word_list(tmp_path, "bad.json", {"not": "a list"})
    with pytest.raises(ValueError):
        dictionary.load()

    assert dictionary.target_words_of_length(5) == {"crane"}
    assert dictionary.is_valid_word("crane")
