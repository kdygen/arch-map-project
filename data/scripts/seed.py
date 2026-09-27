"""Validate seed files and load them into the database.

Run from the repository root:

    make seed          validate, then import
    make seed-check    validate only, without touching the database

The import is safe to repeat. It runs in a single transaction, so either
everything is applied or nothing is.
"""

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "apps" / "api"))

from sqlalchemy.orm import Session  # noqa: E402

from app.core.db import get_engine  # noqa: E402
from app.seeding.importer import import_seed  # noqa: E402
from app.seeding.loader import SeedValidationError, load_seed  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--seed-dir", type=Path, default=REPO_ROOT / "data" / "seed")
    parser.add_argument(
        "--check", action="store_true", help="validate only, do not touch the database"
    )
    args = parser.parse_args()

    try:
        data = load_seed(args.seed_dir)
    except SeedValidationError as error:
        print(f"Seed data is invalid. {len(error.issues)} problem(s):", file=sys.stderr)
        for issue in error.issues:
            print(f"  - {issue}", file=sys.stderr)
        print("Nothing was written to the database.", file=sys.stderr)
        return 1

    print(f"Validated {len(data.places)} place(s) from {args.seed_dir}")
    if args.check:
        return 0

    with Session(get_engine()) as session, session.begin():
        report = import_seed(session, data)

    for line in report.lines():
        print(f"  {line}")
    print("Done." if report.has_changes else "Done. Database already up to date.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
