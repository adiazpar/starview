# Schema migration for PostGIS coordinates field.
# Enables PostGIS extension and adds PointField to Location model.

from django.contrib.gis.db import models as gis_models
from django.db import migrations


def enable_postgis(apps, schema_editor):
    """Enable PostGIS extension on the database."""
    if schema_editor.connection.vendor == 'postgresql':
        schema_editor.execute("CREATE EXTENSION IF NOT EXISTS postgis;")


def disable_postgis(apps, schema_editor):
    """Reverse: Do nothing (don't drop extension as other things may use it)."""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('starview_app', '0021_add_bortle_fields'),
    ]

    operations = [
        # Enable PostGIS extension first
        migrations.RunPython(enable_postgis, disable_postgis),

        # Add coordinates PointField (nullable during migration)
        migrations.AddField(
            model_name='location',
            name='coordinates',
            field=gis_models.PointField(
                geography=True,
                srid=4326,
                null=True,
                blank=True,
            ),
        ),
    ]
