# Data migration to populate coordinates from existing latitude/longitude values.
# Uses batch processing for performance on large datasets.

from django.db import migrations


def populate_coordinates(apps, schema_editor):
    """Populate coordinates PointField from existing lat/lng values."""
    if schema_editor.connection.vendor != 'postgresql':
        # Skip for non-PostgreSQL databases (e.g., SQLite in tests)
        return

    # Use raw SQL for better performance on large datasets
    # ST_SetSRID creates a Point with the correct SRID (4326 = WGS84)
    # Note: PostGIS Point uses (longitude, latitude) order
    schema_editor.execute("""
        UPDATE starview_app_location
        SET coordinates = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
    """)


def reverse_populate(apps, schema_editor):
    """Reverse: Clear coordinates field."""
    if schema_editor.connection.vendor != 'postgresql':
        return

    schema_editor.execute("""
        UPDATE starview_app_location
        SET coordinates = NULL;
    """)


class Migration(migrations.Migration):

    dependencies = [
        ('starview_app', '0022_add_postgis_coordinates'),
    ]

    operations = [
        migrations.RunPython(populate_coordinates, reverse_populate),
    ]
