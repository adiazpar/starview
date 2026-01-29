# ----------------------------------------------------------------------------------------------------- #
# Management command to seed test photos for a location.                                               #
# Generates colored square images locally (no network requests).                                       #
# ----------------------------------------------------------------------------------------------------- #

from django.core.management.base import BaseCommand, CommandError
from django.core.files.base import ContentFile
from django.contrib.auth import get_user_model
import io
import random
from PIL import Image

from starview_app.models import Location, LocationPhoto

User = get_user_model()


def generate_colored_square(index, size=800):
    """Generate a colored square image with a number overlay."""
    # Generate a random but consistent color based on index
    random.seed(index)
    r = random.randint(50, 200)
    g = random.randint(50, 200)
    b = random.randint(50, 200)

    # Create image
    img = Image.new('RGB', (size, size), color=(r, g, b))

    # Save to bytes
    buffer = io.BytesIO()
    img.save(buffer, format='JPEG', quality=85)
    buffer.seek(0)
    return buffer.getvalue()


class Command(BaseCommand):
    help = 'Seed test photos for a location using generated colored squares'

    def add_arguments(self, parser):
        parser.add_argument(
            'location_name',
            type=str,
            help='Name of the location to add photos to (partial match supported)'
        )
        parser.add_argument(
            '--count',
            type=int,
            default=100,
            help='Number of photos to add (default: 100)'
        )
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear existing photos before adding new ones'
        )

    def handle(self, *args, **options):
        location_name = options['location_name']
        count = options['count']
        clear = options['clear']

        # Find the location
        try:
            location = Location.objects.get(name__icontains=location_name)
        except Location.DoesNotExist:
            raise CommandError(f'Location matching "{location_name}" not found')
        except Location.MultipleObjectsReturned:
            locations = Location.objects.filter(name__icontains=location_name)[:5]
            names = [f'  - {loc.name} (ID: {loc.id})' for loc in locations]
            raise CommandError(
                f'Multiple locations match "{location_name}". Please be more specific:\n' +
                '\n'.join(names)
            )

        self.stdout.write(f'Found location: {location.name} (ID: {location.id})')

        # Get or create system user for attribution
        system_user, _ = User.objects.get_or_create(
            username='starview',
            defaults={'email': 'system@starview.app', 'is_active': True}
        )

        # Clear existing photos if requested
        if clear:
            deleted_count = LocationPhoto.objects.filter(location=location).delete()[0]
            self.stdout.write(f'Cleared {deleted_count} existing photos')

        # Get current photo count for ordering
        current_count = LocationPhoto.objects.filter(location=location).count()

        self.stdout.write(f'Adding {count} test photos...')

        success_count = 0
        for i in range(count):
            try:
                # Generate a colored square image
                image_bytes = generate_colored_square(i + 1)

                # Create the photo
                photo = LocationPhoto(
                    location=location,
                    uploaded_by=system_user,
                    caption=f'Test photo {i + 1}',
                    order=current_count + i + 1
                )

                # Save the image
                photo.image.save(
                    f'test_photo_{i + 1}.jpg',
                    ContentFile(image_bytes),
                    save=True
                )

                success_count += 1

                # Progress indicator
                if (i + 1) % 10 == 0:
                    self.stdout.write(f'  Progress: {i + 1}/{count} photos added')

            except Exception as e:
                self.stderr.write(f'  Failed to create photo {i + 1}: {e}')

        self.stdout.write(
            self.style.SUCCESS(f'Successfully added {success_count} photos to "{location.name}"')
        )

        # Show total count
        total = LocationPhoto.objects.filter(location=location).count()
        self.stdout.write(f'Total photos for this location: {total}')
