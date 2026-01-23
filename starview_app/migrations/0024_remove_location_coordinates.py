# Migration: Remove profile location coordinates
#
# Part of the migration from profile-based to search-based location system.
# Location is now session-based (ephemeral) in the frontend, enabling a
# "check conditions anywhere" experience without requiring profile updates.
#
# Fields removed:
# - location_latitude: No longer needed - location resolved via browser/IP geolocation
# - location_longitude: No longer needed - location resolved via browser/IP geolocation
# - location_prompt_dismissed: No longer needed - onboarding modal removed
#
# Kept:
# - location: Still used for public profile display (e.g., "Seattle, WA")

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('starview_app', '0023_populate_coordinates'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='userprofile',
            name='location_latitude',
        ),
        migrations.RemoveField(
            model_name='userprofile',
            name='location_longitude',
        ),
        migrations.RemoveField(
            model_name='userprofile',
            name='location_prompt_dismissed',
        ),
    ]
