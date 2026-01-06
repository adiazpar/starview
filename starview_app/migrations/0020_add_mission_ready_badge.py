"""
Migration: Add "Mission Ready" badge

Awarded when user completes their profile setup.
This badge is revocable - removed if profile becomes incomplete.
"""

from django.db import migrations


def create_badge(apps, schema_editor):
    Badge = apps.get_model('starview_app', 'Badge')
    Badge.objects.create(
        name='Mission Ready',
        slug='mission-ready',
        description='Completed setting up your profile',
        category='SPECIAL',
        criteria_type='PROFILE_COMPLETE',
        criteria_value=3,  # Number of profile fields required (location, bio, picture)
        tier=1,
        icon_path='/badges/mission-ready.png',
    )


def remove_badge(apps, schema_editor):
    Badge = apps.get_model('starview_app', 'Badge')
    Badge.objects.filter(slug='mission-ready').delete()


class Migration(migrations.Migration):
    dependencies = [
        ('starview_app', '0019_add_location_prompt_dismissed'),
    ]
    operations = [
        migrations.RunPython(create_badge, remove_badge),
    ]
