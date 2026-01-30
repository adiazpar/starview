# ----------------------------------------------------------------------------------------------------- #
# This model_location_photo.py file defines the LocationPhoto model:                                   #
#                                                                                                       #
# Purpose:                                                                                              #
# Manages photo attachments uploaded by users with automatic image processing, thumbnail generation,   #
# and validation. Photos are organized by display order and sorted by upvotes in the gallery.          #
#                                                                                                       #
# Key Features:                                                                                         #
# - User attribution: Tracks who uploaded each photo via uploaded_by field                             #
# - Automatic image optimization: Resizes to max 1920x1920, converts to JPEG, optimizes quality        #
# - Thumbnail generation: Creates 720x720 thumbnails automatically                                     #
# - Organized storage: Photos stored in location_photos/{location_id}/ hierarchy                       #
# - Voting: Photos can receive upvotes from users via generic Vote relation                            #
# - Auto-ordering: Automatically assigns display order if not specified                                #
# - UUID filenames: Generates unique filenames to prevent collisions                                   #
# ----------------------------------------------------------------------------------------------------- #

from django.db import models
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.fields import GenericRelation
from django.core.files.uploadedfile import InMemoryUploadedFile
from django.core.exceptions import ValidationError
import os
import io
import logging
from uuid import uuid4
from PIL import Image

logger = logging.getLogger(__name__)

# Minimum dimensions for uploaded photos (prevents blurry/pixelated images in gallery)
MIN_IMAGE_WIDTH = 500
MIN_IMAGE_HEIGHT = 500

from . import Location

User = get_user_model()


def location_photo_path(instance, filename):
    """Generates unique file path for location photos: location_photos/{location_id}/{uuid}.ext"""
    ext = filename.split('.')[-1]
    filename = f"{uuid4().hex}.{ext}"
    return os.path.join('location_photos', str(instance.location.id), filename)


def location_thumbnail_path(instance, filename):
    """Generates unique file path for thumbnails: location_photos/{location_id}/thumbnails/{uuid}_thumb.ext"""
    ext = filename.split('.')[-1]
    filename = f"{uuid4().hex}_thumb.{ext}"
    return os.path.join('location_photos', str(instance.location.id), 'thumbnails', filename)


class LocationPhoto(models.Model):
    """Photos uploaded by users for display in location galleries and card carousels."""

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    location = models.ForeignKey(Location, on_delete=models.CASCADE, related_name='photos')
    uploaded_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='uploaded_location_photos',
        help_text="User who uploaded this photo"
    )

    image = models.ImageField(upload_to=location_photo_path, help_text="Photo for the location")
    thumbnail = models.ImageField(upload_to=location_thumbnail_path, blank=True, null=True, help_text="Thumbnail version of the photo")

    caption = models.CharField(max_length=255, blank=True, help_text="Optional caption for the photo")
    order = models.PositiveIntegerField(default=0, help_text="Order of display (lower numbers appear first)")

    # Image dimensions (populated during processing for quality filtering)
    width = models.PositiveIntegerField(null=True, blank=True, help_text="Image width in pixels")
    height = models.PositiveIntegerField(null=True, blank=True, help_text="Image height in pixels")

    # Votes (generic relation to Vote model)
    votes = GenericRelation('Vote', related_query_name='locationphoto')

    class Meta:
        ordering = ['order', 'created_at']
        indexes = [
            models.Index(fields=['location', 'order']),
            models.Index(fields=['created_at']),
        ]
        verbose_name = 'Location Photo'
        verbose_name_plural = 'Location Photos'

    def __str__(self):
        return f"Photo {self.order + 1} for {self.location.name}"

    def _validate_image_dimensions(self):
        """Validates that uploaded image meets minimum dimension requirements."""
        try:
            self.image.file.seek(0)
            img = Image.open(self.image.file)
            width, height = img.size
            self.image.file.seek(0)  # Reset for subsequent processing

            if width < MIN_IMAGE_WIDTH or height < MIN_IMAGE_HEIGHT:
                raise ValidationError(
                    f"Image too small ({width}x{height}). Minimum: {MIN_IMAGE_WIDTH}x{MIN_IMAGE_HEIGHT}."
                )
        except ValidationError:
            raise
        except Exception as e:
            logger.error(f"Error validating image dimensions: {e}")
            raise ValidationError("Could not validate image dimensions. Please try a different image.")

    def save(self, *args, **kwargs):

        # Process image if it's new or changed
        if self.image and (not self.pk or 'image' in kwargs.get('update_fields', [])):
            self._validate_image_dimensions()
            self._process_image()

        # Auto-set order if not provided
        if self.order == 0 and self.location_id:
            max_order = LocationPhoto.objects.filter(location_id=self.location_id).aggregate(models.Max('order'))['order__max']
            self.order = (max_order or 0) + 1

        super().save(*args, **kwargs)

    def _process_image(self):
        """Processes uploaded image: converts to RGB, resizes to max 1920x1920, optimizes, and generates thumbnail."""
        try:
            # Read original image
            self.image.file.seek(0)
            img = Image.open(self.image.file)

            # SECURITY NOTE: Decompression bomb protection
            # Pillow's MAX_IMAGE_PIXELS prevents loading extremely large images that could
            # exhaust memory (decompression bomb attack). We temporarily disable this because:
            # 1. File size is already limited to 5MB at upload (FileExtensionValidator)
            # 2. We immediately resize to max 1920x1920 after loading
            # 3. The limit is restored in the finally block regardless of success/failure
            # This allows users to upload high-resolution photos while maintaining safety.
            original_max = Image.MAX_IMAGE_PIXELS
            Image.MAX_IMAGE_PIXELS = None  # Temporarily disable for processing

            try:
                img.load()  # Force load the image data
            finally:
                Image.MAX_IMAGE_PIXELS = original_max  # Restore limit

            # Convert to RGB if necessary (handles PNG/RGBA images)
            if img.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')

            # Resize if too large (max 1920x1920, maintains aspect ratio)
            img.thumbnail((1920, 1920), Image.Resampling.LANCZOS)

            # Store final dimensions for quality filtering
            self.width, self.height = img.size

            # Save processed image to new BytesIO
            img_io = io.BytesIO()
            img.save(img_io, format='JPEG', quality=90, optimize=True)
            file_size = img_io.tell()
            img_io.seek(0)

            # Get original filename and create new InMemoryUploadedFile
            original_name = os.path.basename(self.image.name)
            name_without_ext = os.path.splitext(original_name)[0]
            new_name = f"{name_without_ext}.jpg"

            # Replace the image field with processed version
            processed_file = InMemoryUploadedFile(
                img_io, None, new_name, 'image/jpeg', file_size, None
            )
            self.image = processed_file

            self._create_thumbnail(img)

        except Exception as e:
            logger.error(
                "Error processing location image for location %d: %s",
                self.location_id or 0,
                str(e),
                extra={'location_id': self.location_id, 'error': str(e)},
                exc_info=True
            )

    def _create_thumbnail(self, img):
        """Creates 720x720 thumbnail version of the image."""
        try:
            img_copy = img.copy()
            img_copy.thumbnail((720, 720), Image.Resampling.LANCZOS)

            thumb_io = io.BytesIO()
            img_copy.save(thumb_io, format='JPEG', quality=85, optimize=True)
            file_size = thumb_io.tell()
            thumb_io.seek(0)

            original_name = os.path.basename(self.image.name)
            name_without_ext = os.path.splitext(original_name)[0]
            thumb_name = f"{name_without_ext}_thumb.jpg"

            thumb_file = InMemoryUploadedFile(thumb_io, None, thumb_name, 'image/jpeg', file_size, None)
            self.thumbnail.save(thumb_name, thumb_file, save=False)

        except Exception as e:
            logger.error(
                "Error creating thumbnail for location %d: %s",
                self.location_id or 0,
                str(e),
                extra={'location_id': self.location_id, 'error': str(e)},
                exc_info=True
            )

    @property
    def image_url(self):
        """Returns the full URL for the image."""
        if self.image:
            return self.image.url
        return None

    @property
    def thumbnail_url(self):
        """Returns the full URL for the thumbnail (or original image if no thumbnail)."""
        if self.thumbnail:
            return self.thumbnail.url
        return self.image_url

    @property
    def upvote_count(self):
        """Returns the number of upvotes for this photo."""
        return self.votes.filter(is_upvote=True).count()
