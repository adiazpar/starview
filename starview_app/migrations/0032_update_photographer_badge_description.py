# Migration to update photographer badge description
# Now counts all uploaded photos (review photos + location photos), not just review photos

from django.db import migrations


def update_photographer_description(apps, schema_editor):
    """Update photographer badge description to reflect all photo types."""
    Badge = apps.get_model('starview_app', 'Badge')

    Badge.objects.filter(slug='photographer').update(
        description='Capture the cosmos - upload 25 photos'
    )


def reverse_update(apps, schema_editor):
    """Revert to original description."""
    Badge = apps.get_model('starview_app', 'Badge')

    Badge.objects.filter(slug='photographer').update(
        description='Capture the cosmos - upload 25 review photos'
    )


class Migration(migrations.Migration):

    dependencies = [
        ('starview_app', '0031_add_dimensions_to_review_photo'),
    ]

    operations = [
        migrations.RunPython(update_photographer_description, reverse_update),
    ]
