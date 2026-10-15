import json
import re
from pathlib import Path
import spacy
from better_profanity import profanity
from wordfreq import zipf_frequency

# Configuration Constants
SOURCE_FILE = "wow_24_full_word_list.txt"  # Input text file path
OUTPUT_DIR = Path("dictionary_files")

MIN_LEN = 5
MAX_LEN = 8

# Zipf score threshold (0-8 scale). Scores >= 3.8 represent common, recognizable English words.
ZIPF_TARGET_THRESHOLD = 3.8

# Load lightweight spaCy model for POS tagging and lemmatization
nlp = spacy.load("en_core_web_sm", disable=["ner", "parser"])

profanity.load_censor_words()


def load_and_clean_words(file_path: str) -> list[str]:
    """Reads source text file and returns clean, unique 5-8 letter alphabetic words."""
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Source file '{file_path}' not found. Please create it or update SOURCE_FILE.")

    with open(path, "r", encoding="utf-8") as f:
        text = f.read()

    # Extract all purely alphabetic tokens
    raw_words = re.findall(r"\b[a-zA-Z]+\b", text)

    # Filter by length limits and normalize to lowercase
    unique_words = sorted(set(
        w.lower() for w in raw_words
        if MIN_LEN <= len(w) <= MAX_LEN
    ))
    return unique_words


def is_plural(doc) -> bool:
    """
    Identifies whether a token is a plural noun using spaCy Part-Of-Speech tags and lemmatization.
    Preserves non-plural words ending in 's' (e.g., 'cactus', 'focus', 'canvas').
    """
    token = doc[0]

    # 1. Standard spaCy plural tag check (NNS = Noun plural, NNPS = Proper noun plural)
    if token.tag_ in {"NNS", "NNPS"}:
        return True

    # 2. Lemma comparison check for inflection patterns (e.g., 'boxes' -> 'box', 'cats' -> 'cat')
    word = token.text.lower()
    lemma = token.lemma_.lower()
    if word.endswith("s") and lemma != word:
        if word[:-1] == lemma or word[:-2] == lemma:
            return True

    return False


def is_profane(word: str) -> bool:
    """Returns whether a word is on the better-profanity censor list."""
    return profanity.contains_profanity(word)


def process_words():
    print(f"Reading words from '{SOURCE_FILE}'...")
    candidates = load_and_clean_words(SOURCE_FILE)
    #print(f"Loaded {len(candidates):,} unique candidate words (lengths {MIN_LEN}–{MAX_LEN}).")

    # Initialize dictionaries keyed by length
    allowed_words = {length: [] for length in range(MIN_LEN, MAX_LEN + 1)}
    target_words = {length: [] for length in range(MIN_LEN, MAX_LEN + 1)}
    profane_skipped = 0

    # Batch process through spaCy pipe for high efficiency
    print("Evaluating word frequencies and checking for plurals...")
    docs = nlp.pipe(candidates, batch_size=2000)

    for word, doc in zip(candidates, docs):
        word_len = len(word)

        # 1. All valid candidate words are added to the Allowed Guesses list (including plurals)
        allowed_words[word_len].append(word)

        # 2. Target words must not be plural, must not be profane, and must meet the frequency threshold
        if is_plural(doc):
            continue
        if is_profane(word):
            profane_skipped += 1
            continue
        freq_score = zipf_frequency(word, "en")
        if freq_score >= ZIPF_TARGET_THRESHOLD:
            target_words[word_len].append(word)

    # Ensure destination directory exists
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Export separate JSON files for each length (5, 6, 7, 8)
    print("\nWriting wordle_game/words/ JSON files...")
    for length in range(MIN_LEN, MAX_LEN + 1):
        # Save Allowed Words JSON file
        allowed_path = OUTPUT_DIR / f"allowed_{length}.json"
        with open(allowed_path, "w", encoding="utf-8") as f:
            json.dump(allowed_words[length], f, indent=2)

        # Save Target Words JSON file
        target_path = OUTPUT_DIR / f"target_{length}.json"
        with open(target_path, "w", encoding="utf-8") as f:
            json.dump(target_words[length], f, indent=2)

    # Output report
    print("Dictionary creation complete!\n")
    print("Generated File Breakdown:")
    print("-" * 60)
    print(f"{'Length':<10}{'Allowed File':<25}{'Target File':<25}")
    print("-" * 60)
    for length in range(MIN_LEN, MAX_LEN + 1):
        allowed_info = f"allowed_{length}.json ({len(allowed_words[length]):,})"
        target_info = f"target_{length}.json ({len(target_words[length]):,})"
        print(f"{length:<10}{allowed_info:<25}{target_info:<25}")
    print("-" * 60)
    print(f"Profane words excluded from target lists: {profane_skipped:,}")


if __name__ == "__main__":
    process_words()