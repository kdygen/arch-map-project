"""create catalog schema

Revision ID: 39c12a2975d5
Revises: 62907d4eaf22
Create Date: 2026-09-27 07:43:56.176101

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geography
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "39c12a2975d5"
down_revision: str | Sequence[str] | None = "62907d4eaf22"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "architects",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("birth_year", sa.SmallInteger(), nullable=True),
        sa.Column("death_year", sa.SmallInteger(), nullable=True),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'", name=op.f("ck_architects_slug_format")
        ),
        sa.CheckConstraint(
            "death_year IS NULL OR birth_year IS NULL OR death_year >= birth_year",
            name=op.f("ck_architects_lifespan_order"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_architects")),
        sa.UniqueConstraint("slug", name=op.f("uq_architects_slug")),
    )
    op.create_table(
        "building_types",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.CheckConstraint(
            "slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'", name=op.f("ck_building_types_slug_format")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_building_types")),
        sa.UniqueConstraint("slug", name=op.f("uq_building_types_slug")),
    )
    op.create_table(
        "cities",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("region", sa.String(length=200), nullable=True),
        sa.Column("country_code", sa.String(length=2), nullable=False),
        sa.Column(
            "center",
            Geography(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=True,
        ),
        sa.CheckConstraint(
            "country_code ~ '^[A-Z]{2}$'", name=op.f("ck_cities_country_code_format")
        ),
        sa.CheckConstraint("slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'", name=op.f("ck_cities_slug_format")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cities")),
        sa.UniqueConstraint("slug", name=op.f("uq_cities_slug")),
    )
    op.create_table(
        "periods",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("start_year", sa.SmallInteger(), nullable=True),
        sa.Column("end_year", sa.SmallInteger(), nullable=True),
        sa.CheckConstraint(
            "slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'", name=op.f("ck_periods_slug_format")
        ),
        sa.CheckConstraint(
            "end_year IS NULL OR start_year IS NULL OR end_year >= start_year",
            name=op.f("ck_periods_year_order"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_periods")),
        sa.UniqueConstraint("slug", name=op.f("uq_periods_slug")),
    )
    op.create_table(
        "sources",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("url", sa.String(length=2000), nullable=False),
        sa.Column("publisher", sa.String(length=300), nullable=False),
        sa.Column("source_type", sa.String(length=40), nullable=False),
        sa.Column("accessed_at", sa.Date(), nullable=False),
        sa.CheckConstraint(
            "source_type IN ('academic', 'government', 'official_site', 'other', 'preservation_org')",
            name=op.f("ck_sources_source_type_valid"),
        ),
        sa.CheckConstraint("url ~ '^https?://'", name=op.f("ck_sources_url_format")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sources")),
        sa.UniqueConstraint("url", name=op.f("uq_sources_url")),
    )
    op.create_table(
        "styles",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("parent_style_id", sa.Uuid(), nullable=True),
        sa.CheckConstraint("slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'", name=op.f("ck_styles_slug_format")),
        sa.CheckConstraint(
            "parent_style_id IS NULL OR parent_style_id <> id",
            name=op.f("ck_styles_not_own_parent"),
        ),
        sa.ForeignKeyConstraint(
            ["parent_style_id"],
            ["styles.id"],
            name=op.f("fk_styles_parent_style_id_styles"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_styles")),
        sa.UniqueConstraint("slug", name=op.f("uq_styles_slug")),
    )
    op.create_index(op.f("ix_styles_parent_style_id"), "styles", ["parent_style_id"], unique=False)
    op.create_table(
        "tags",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("category", sa.String(length=40), nullable=False),
        sa.CheckConstraint(
            "category IN ('designation', 'feature', 'interior', 'material')",
            name=op.f("ck_tags_category_valid"),
        ),
        sa.CheckConstraint("slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'", name=op.f("ck_tags_slug_format")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tags")),
        sa.UniqueConstraint("slug", name=op.f("uq_tags_slug")),
    )
    op.create_index(op.f("ix_tags_category"), "tags", ["category"], unique=False)
    op.create_table(
        "places",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("slug", sa.String(length=160), nullable=False),
        sa.Column("name", sa.String(length=300), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="draft", nullable=False),
        sa.Column(
            "location",
            Geography(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=False,
        ),
        sa.Column("address_line", sa.String(length=300), nullable=True),
        sa.Column("city_id", sa.Uuid(), nullable=False),
        sa.Column("country_code", sa.String(length=2), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("year_built_start", sa.SmallInteger(), nullable=True),
        sa.Column("year_built_end", sa.SmallInteger(), nullable=True),
        sa.Column(
            "year_is_approximate", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column("building_type_id", sa.Uuid(), nullable=True),
        sa.Column("period_id", sa.Uuid(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("significance_text", sa.Text(), nullable=True),
        sa.Column("significance_score", sa.SmallInteger(), nullable=True),
        sa.Column("public_access", sa.String(length=20), server_default="unknown", nullable=False),
        sa.Column("admission_type", sa.String(length=20), server_default="unknown", nullable=False),
        sa.Column("admission_notes", sa.Text(), nullable=True),
        sa.Column("reservation_required", sa.Boolean(), nullable=True),
        sa.Column("tours_available", sa.Boolean(), nullable=True),
        sa.Column("visit_minutes_exterior", sa.SmallInteger(), nullable=True),
        sa.Column("visit_minutes_interior", sa.SmallInteger(), nullable=True),
        sa.Column("accessibility", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("website_url", sa.String(length=2000), nullable=True),
        sa.Column("google_place_id", sa.String(length=300), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "admission_type IN ('donation', 'free', 'paid', 'unknown')",
            name=op.f("ck_places_admission_type_valid"),
        ),
        sa.CheckConstraint(
            "country_code ~ '^[A-Z]{2}$'", name=op.f("ck_places_country_code_format")
        ),
        sa.CheckConstraint(
            "public_access IN ('by_appointment', 'exterior_only', 'private', 'public', 'unknown')",
            name=op.f("ck_places_public_access_valid"),
        ),
        sa.CheckConstraint("slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'", name=op.f("ck_places_slug_format")),
        sa.CheckConstraint(
            "status <> 'published' OR significance_score IS NOT NULL",
            name=op.f("ck_places_published_has_significance_score"),
        ),
        sa.CheckConstraint(
            "status <> 'published' OR visit_minutes_exterior IS NOT NULL",
            name=op.f("ck_places_published_has_exterior_minutes"),
        ),
        sa.CheckConstraint("status IN ('draft', 'published')", name=op.f("ck_places_status_valid")),
        sa.CheckConstraint(
            "website_url IS NULL OR website_url ~ '^https?://'",
            name=op.f("ck_places_website_url_format"),
        ),
        sa.CheckConstraint(
            "significance_score IS NULL OR significance_score BETWEEN 1 AND 5",
            name=op.f("ck_places_significance_score_range"),
        ),
        sa.CheckConstraint(
            "visit_minutes_exterior IS NULL OR visit_minutes_exterior > 0",
            name=op.f("ck_places_visit_minutes_exterior_positive"),
        ),
        sa.CheckConstraint(
            "visit_minutes_interior IS NULL OR visit_minutes_interior > 0",
            name=op.f("ck_places_visit_minutes_interior_positive"),
        ),
        sa.CheckConstraint(
            "year_built_end IS NULL OR year_built_start IS NOT NULL",
            name=op.f("ck_places_year_built_end_requires_start"),
        ),
        sa.CheckConstraint(
            "year_built_end IS NULL OR year_built_start IS NULL OR year_built_end >= year_built_start",
            name=op.f("ck_places_year_built_order"),
        ),
        sa.ForeignKeyConstraint(
            ["building_type_id"],
            ["building_types.id"],
            name=op.f("fk_places_building_type_id_building_types"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["city_id"], ["cities.id"], name=op.f("fk_places_city_id_cities"), ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["period_id"],
            ["periods.id"],
            name=op.f("fk_places_period_id_periods"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_places")),
        sa.UniqueConstraint("google_place_id", name=op.f("uq_places_google_place_id")),
        sa.UniqueConstraint("slug", name=op.f("uq_places_slug")),
    )
    op.create_index(
        op.f("ix_places_building_type_id"), "places", ["building_type_id"], unique=False
    )
    op.create_index(op.f("ix_places_city_id"), "places", ["city_id"], unique=False)
    op.create_index(
        "ix_places_location_geometry_gist",
        "places",
        [sa.literal_column("(location::geometry)")],
        unique=False,
        postgresql_using="gist",
    )
    op.create_index(
        "ix_places_location_gist", "places", ["location"], unique=False, postgresql_using="gist"
    )
    op.create_index(op.f("ix_places_period_id"), "places", ["period_id"], unique=False)
    op.create_index(op.f("ix_places_status"), "places", ["status"], unique=False)
    op.create_index("ix_places_year_built_start", "places", ["year_built_start"], unique=False)
    op.create_table(
        "opening_hours",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("place_id", sa.Uuid(), nullable=False),
        sa.Column("day_of_week", sa.SmallInteger(), nullable=False),
        sa.Column("opens", sa.Time(), nullable=False),
        sa.Column("closes", sa.Time(), nullable=False),
        sa.Column("valid_from", sa.Date(), nullable=True),
        sa.Column("valid_to", sa.Date(), nullable=True),
        sa.CheckConstraint(
            "day_of_week BETWEEN 0 AND 6", name=op.f("ck_opening_hours_day_of_week_range")
        ),
        sa.CheckConstraint(
            "valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from",
            name=op.f("ck_opening_hours_validity_order"),
        ),
        sa.ForeignKeyConstraint(
            ["place_id"],
            ["places.id"],
            name=op.f("fk_opening_hours_place_id_places"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_opening_hours")),
        sa.UniqueConstraint(
            "place_id",
            "day_of_week",
            "opens",
            "valid_from",
            name=op.f("uq_opening_hours_place_id_day_of_week_opens_valid_from"),
            postgresql_nulls_not_distinct=True,
        ),
    )
    op.create_index(op.f("ix_opening_hours_place_id"), "opening_hours", ["place_id"], unique=False)
    op.create_table(
        "opening_hours_exceptions",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("place_id", sa.Uuid(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("is_closed", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("opens", sa.Time(), nullable=True),
        sa.Column("closes", sa.Time(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "is_closed OR (opens IS NOT NULL AND closes IS NOT NULL)",
            name=op.f("ck_opening_hours_exceptions_open_exception_has_times"),
        ),
        sa.ForeignKeyConstraint(
            ["place_id"],
            ["places.id"],
            name=op.f("fk_opening_hours_exceptions_place_id_places"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_opening_hours_exceptions")),
        sa.UniqueConstraint(
            "place_id", "date", name=op.f("uq_opening_hours_exceptions_place_id_date")
        ),
    )
    op.create_index(
        op.f("ix_opening_hours_exceptions_place_id"),
        "opening_hours_exceptions",
        ["place_id"],
        unique=False,
    )
    op.create_table(
        "place_architects",
        sa.Column("place_id", sa.Uuid(), nullable=False),
        sa.Column("architect_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(length=100), server_default="architect", nullable=False),
        sa.ForeignKeyConstraint(
            ["architect_id"],
            ["architects.id"],
            name=op.f("fk_place_architects_architect_id_architects"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["place_id"],
            ["places.id"],
            name=op.f("fk_place_architects_place_id_places"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "place_id", "architect_id", "role", name=op.f("pk_place_architects")
        ),
    )
    op.create_index(
        op.f("ix_place_architects_architect_id"), "place_architects", ["architect_id"], unique=False
    )
    op.create_table(
        "place_field_sources",
        sa.Column("place_id", sa.Uuid(), nullable=False),
        sa.Column("field_name", sa.String(length=60), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "field_name IN ('accessibility', 'address', 'admission', 'architects', 'building_type', 'description', 'location', 'name', 'opening_hours', 'public_access', 'reservation_required', 'significance_text', 'styles', 'tags', 'tours_available', 'website_url', 'year_built')",
            name=op.f("ck_place_field_sources_field_name_sourceable"),
        ),
        sa.CheckConstraint(
            "field_name NOT IN ('significance_score', 'visit_minutes_exterior', 'visit_minutes_interior')",
            name=op.f("ck_place_field_sources_field_name_not_curated"),
        ),
        sa.ForeignKeyConstraint(
            ["place_id"],
            ["places.id"],
            name=op.f("fk_place_field_sources_place_id_places"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["source_id"],
            ["sources.id"],
            name=op.f("fk_place_field_sources_source_id_sources"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint(
            "place_id", "field_name", "source_id", name=op.f("pk_place_field_sources")
        ),
    )
    op.create_index(
        op.f("ix_place_field_sources_source_id"), "place_field_sources", ["source_id"], unique=False
    )
    op.create_table(
        "place_images",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("place_id", sa.Uuid(), nullable=False),
        sa.Column("storage_path", sa.String(length=1000), nullable=False),
        sa.Column("credit", sa.String(length=500), nullable=False),
        sa.Column("license", sa.String(length=200), nullable=False),
        sa.Column("source_url", sa.String(length=2000), nullable=False),
        sa.Column("sort_order", sa.SmallInteger(), server_default=sa.text("0"), nullable=False),
        sa.CheckConstraint(
            "source_url ~ '^https?://'", name=op.f("ck_place_images_source_url_format")
        ),
        sa.ForeignKeyConstraint(
            ["place_id"],
            ["places.id"],
            name=op.f("fk_place_images_place_id_places"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_place_images")),
        sa.UniqueConstraint(
            "place_id", "storage_path", name=op.f("uq_place_images_place_id_storage_path")
        ),
    )
    op.create_index(op.f("ix_place_images_place_id"), "place_images", ["place_id"], unique=False)
    op.create_table(
        "place_styles",
        sa.Column("place_id", sa.Uuid(), nullable=False),
        sa.Column("style_id", sa.Uuid(), nullable=False),
        sa.Column("is_primary", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.ForeignKeyConstraint(
            ["place_id"],
            ["places.id"],
            name=op.f("fk_place_styles_place_id_places"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["style_id"],
            ["styles.id"],
            name=op.f("fk_place_styles_style_id_styles"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("place_id", "style_id", name=op.f("pk_place_styles")),
    )
    op.create_index(op.f("ix_place_styles_style_id"), "place_styles", ["style_id"], unique=False)
    op.create_index(
        "uq_place_styles_one_primary",
        "place_styles",
        ["place_id"],
        unique=True,
        postgresql_where=sa.text("is_primary"),
    )
    op.create_table(
        "place_tags",
        sa.Column("place_id", sa.Uuid(), nullable=False),
        sa.Column("tag_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["place_id"],
            ["places.id"],
            name=op.f("fk_place_tags_place_id_places"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tag_id"], ["tags.id"], name=op.f("fk_place_tags_tag_id_tags"), ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("place_id", "tag_id", name=op.f("pk_place_tags")),
    )
    op.create_index(op.f("ix_place_tags_tag_id"), "place_tags", ["tag_id"], unique=False)


def downgrade() -> None:
    # Drops every catalog table and all data in them.
    op.drop_index(op.f("ix_place_tags_tag_id"), table_name="place_tags")
    op.drop_table("place_tags")
    op.drop_index(
        "uq_place_styles_one_primary",
        table_name="place_styles",
        postgresql_where=sa.text("is_primary"),
    )
    op.drop_index(op.f("ix_place_styles_style_id"), table_name="place_styles")
    op.drop_table("place_styles")
    op.drop_index(op.f("ix_place_images_place_id"), table_name="place_images")
    op.drop_table("place_images")
    op.drop_index(op.f("ix_place_field_sources_source_id"), table_name="place_field_sources")
    op.drop_table("place_field_sources")
    op.drop_index(op.f("ix_place_architects_architect_id"), table_name="place_architects")
    op.drop_table("place_architects")
    op.drop_index(
        op.f("ix_opening_hours_exceptions_place_id"), table_name="opening_hours_exceptions"
    )
    op.drop_table("opening_hours_exceptions")
    op.drop_index(op.f("ix_opening_hours_place_id"), table_name="opening_hours")
    op.drop_table("opening_hours")
    op.drop_index("ix_places_year_built_start", table_name="places")
    op.drop_index(op.f("ix_places_status"), table_name="places")
    op.drop_index(op.f("ix_places_period_id"), table_name="places")
    op.drop_index("ix_places_location_gist", table_name="places", postgresql_using="gist")
    op.drop_index("ix_places_location_geometry_gist", table_name="places", postgresql_using="gist")
    op.drop_index(op.f("ix_places_city_id"), table_name="places")
    op.drop_index(op.f("ix_places_building_type_id"), table_name="places")
    op.drop_table("places")
    op.drop_index(op.f("ix_tags_category"), table_name="tags")
    op.drop_table("tags")
    op.drop_index(op.f("ix_styles_parent_style_id"), table_name="styles")
    op.drop_table("styles")
    op.drop_table("sources")
    op.drop_table("periods")
    op.drop_table("cities")
    op.drop_table("building_types")
    op.drop_table("architects")
