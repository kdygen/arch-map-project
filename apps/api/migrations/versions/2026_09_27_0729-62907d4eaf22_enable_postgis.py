"""enable postgis

Revision ID: 62907d4eaf22
Revises:
Create Date: 2026-09-27 07:29:13.267540

"""

from collections.abc import Sequence

from alembic import op

revision: str = "62907d4eaf22"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Safe to run on the local Docker image and on Supabase, where PostGIS
    # may already be enabled.
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")


def downgrade() -> None:
    # Intentionally a no-op. Dropping PostGIS would destroy every spatial
    # column that depends on it, so that must be a deliberate manual action.
    pass
