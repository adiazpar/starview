# ----------------------------------------------------------------------------------------------------- #
# This model_review_photo.py file defines the ReviewPhoto model:                                        #
#                                                                                                       #
# Purpose:                                                                                              #
# Manages photo attachments for reviews with automatic image processing, thumbnail generation, and      #
# validation. Each review can have up to 5 photos organized by display order.                           #
#                                                                                                       #
# Key Features:                                                                                         #
# - Automatic image optimization: Resizes to max 1920x1920, converts to JPEG, optimizes quality         #
# - Thumbnail generation: Creates 300x300 thumbnails automatically                                      #
# - Organized storage: Photos stored in review_photos/{location_id}/{review_id}/ hierarchy              #
# - Validation: Enforces 5 photo maximum per review                                                     #
# - Auto-ordering: Automatically assigns display order if not specified                                 #
# - UUID filenames: Generates unique filenames to prevent collisions                                    #
# ----------------------------------------------------------------------------------------------------- #

# Import tools:
from django.db import models
from django.contrib.contenttypes.fields import GenericRelation
from django.core.files.uploadedfile import InMemoryUploadedFile
from django.core.exceptions import ValidationError
import os
import io
import logging
from uuid import uuid4
from PIL import Image

# Configure module logger
logger = logging.getLogger(__name__)

# Minimum dimensions for uploaded photos (prevents blurry/pixelated images in gallery)
MIN_IMAGE_WIDTH = 600
MIN_IMAGE_HEIGHT = 600

# Import models:
from . import Review


# Generates unique file path for review photos (review_photos/{location_id}/{review_id}/{uuid}.ext):
def review_photo_path(instance, filename):
    ext = filename.split('.')[-1]
    filename = f"{uuid4().hex}.{ext}"
    return os.path.join('review_photos', str(instance.review.location.id), str(instance.review.id), filename)


# Generates unique file path for thumbnails (review_photos/{location_id}/{review_id}/thumbnails/{uuid}_thumb.ext):
def review_thumbnail_path(instance, filename):
    ext = filename.split('.')[-1]
    filename = f"{uuid4().hex}_thumb.{ext}"
    return os.path.join('review_photos', str(instance.review.location.id), str(instance.review.id), 'thumbnails', filename)



class ReviewPhoto(models.Model):
    # Timestamps:
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Relationships:
    review = models.ForeignKey(Review, on_delete=models.CASCADE, related_name='photos')

    # Image fields:
    image = models.ImageField(upload_to=review_photo_path, help_text="Photo for the review")
    thumbnail = models.ImageField(upload_to=review_thumbnail_path, blank=True, null=True, help_text="Thumbnail version of the photo")

    # Photo metadata:
    caption = models.CharField(max_length=255, blank=True, help_text="Optional caption for the photo")
    order = models.PositiveIntegerField(default=0, help_text="Order of display (lower numbers appear first)")

    # Image dimensions (populated during processing for gallery layouts)
    width = models.PositiveIntegerField(null=True, blank=True, help_text="Image width in pixels")
    height = models.PositiveIntegerField(null=True, blank=True, help_text="Image height in pixels")

    # Votes (generic relation to Vote model)
    votes = GenericRelation('Vote', related_query_name='reviewphoto')

    class Meta:
        ordering = ['order', 'created_at']
        indexes = [
            models.Index(fields=['review', 'order']),
            models.Index(fields=['created_at']),
        ]
        verbose_name = 'Review Photo'
        verbose_name_plural = 'Review Photos'


    # String representation for admin interface and debugging:
    def __str__(self):
        return f"Photo {self.order + 1} for review by {self.review.user.username}"


    # Validates that review doesn't exceed 5 photo maximum:
    def clean(self):
        if self.review_id:
            existing_count = ReviewPhoto.objects.filter(review_id=self.review_id).exclude(pk=self.pk).count()
            if existing_count >= 5:
                raise ValidationError("A review can have a maximum of 5 photos.")

    def _validate_image_dimensions(self):
        """Validates that uploaded image meets minimum dimension requirements."""
        try:
            self.image.file.seek(0)
            img = Image.open(self.image.file)
            width, height = img.size
            self.image.file.seek(0)  # Reset for subsequent processing

            if width < MIN_IMAGE_WIDTH or height < MIN_IMAGE_HEIGHT:
                raise ValidationError(
                    f"Image dimensions ({width}x{height}) are too small. "
                    f"Minimum required: {MIN_IMAGE_WIDTH}x{MIN_IMAGE_HEIGHT} pixels."
                )
        except ValidationError:
            raise
        except Exception as e:
            logger.error(f"Error validating image dimensions: {e}")
            raise ValidationError("Could not validate image dimensions. Please try a different image.")


    # Override save to process images, generate thumbnails, and auto-set display order:
    def save(self, *args, **kwargs):
        self.full_clean()

        # Process image if it's new or changed:
        if self.image and (not self.pk or 'image' in kwargs.get('update_fields', [])):
            self._validate_image_dimensions()
            self._process_image()

        # Auto-set order if not provided:
        if self.order == 0 and self.review_id:
            max_order = ReviewPhoto.objects.filter(review_id=self.review_id).aggregate(models.Max('order'))['order__max']
            self.order = (max_order or 0) + 1

        super().save(*args, **kwargs)
    

    # Processes uploaded image: converts to RGB, resizes to max 1920x1920, optimizes, and generates thumbnail:
    def _process_image(self):
        try:
            img = Image.open(self.image.file)

            # Convert to RGB if necessary (handles PNG/RGBA images):
            if img.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                img = background

            # Resize if too large (max 1920x1920, maintains aspect ratio):
            img.thumbnail((1920, 1920), Image.Resampling.LANCZOS)

            # Store final dimensions for gallery layouts
            self.width, self.height = img.size

            # Save the resized image back:
            img_io = io.BytesIO()
            img.save(img_io, format='JPEG', quality=90, optimize=True)
            img_io.seek(0)

            self.image.file.seek(0)
            self.image.file.truncate()
            self.image.file.write(img_io.getvalue())
            self.image.file.seek(0)

            self._create_thumbnail(img)

        except Exception as e:
            logger.error(
                "Error processing review image for review %d: %s",
                self.review_id or 0,
                str(e),
                extra={'review_id': self.review_id, 'error': str(e)},
                exc_info=True
            )


    # Creates 720x720 thumbnail version of the image:
    def _create_thumbnail(self, img):
        try:
            img_copy = img.copy()
            img_copy.thumbnail((720, 720), Image.Resampling.LANCZOS)

            thumb_io = io.BytesIO()
            img_copy.save(thumb_io, format='JPEG', quality=85, optimize=True)
            file_size = thumb_io.tell()  # Get actual file size (current position after writing)
            thumb_io.seek(0)

            original_name = os.path.basename(self.image.name)
            name_without_ext = os.path.splitext(original_name)[0]
            thumb_name = f"{name_without_ext}_thumb.jpg"

            thumb_file = InMemoryUploadedFile(thumb_io, None, thumb_name, 'image/jpeg', file_size, None)
            self.thumbnail.save(thumb_name, thumb_file, save=False)

        except Exception as e:
            logger.error(
                "Error creating thumbnail for review %d: %s",
                self.review_id or 0,
                str(e),
                extra={'review_id': self.review_id, 'error': str(e)},
                exc_info=True
            )


    # Returns the full URL for the image:
    @property
    def image_url(self):
        if self.image:
            return self.image.url
        return None


    # Returns the full URL for the thumbnail (or original image if no thumbnail):
    @property
    def thumbnail_url(self):
        if self.thumbnail:
            return self.thumbnail.url
        return self.image_url

    @property
    def upvote_count(self):
        """Returns the number of upvotes for this photo."""
        return self.votes.filter(is_upvote=True).count()



# ----------------------------------------------------------------------------------------------------- #
#                                       WHY THUMBNAILS?                                                 #
# ----------------------------------------------------------------------------------------------------- #
# Q: Why store separate thumbnails? Doesn't this double storage usage?                                  #
# A: Thumbnails provide critical performance optimization with minimal storage cost:                    #
#                                                                                                       #
# Performance Impact:                                                                                   #
# - Full-size image (1920x1920): ~300-800 KB each                                                       #
# - Thumbnail (300x300): ~20-50 KB each (6% of original size)                                           #
# - Page with 20 thumbnails: 400 KB vs 6-16 MB (10-40x faster load time)                                #
#                                                                                                       #
# Storage Impact:                                                                                       #
# - NOT a doubling: thumbnails add only ~5-10% to total storage                                         #
# - Storage cost: ~$0.02/GB/month (negligible)                                                          #
# - User experience improvement: priceless                                                              #
#                                                                                                       #
# Use Cases:                                                                                            #
# - Review galleries showing multiple photos                                                            #
# - Location detail pages with photo carousels                                                          #
# - User profile pages displaying photo collections                                                     #
# - Any list view where multiple photos appear simultaneously                                           #
#                                                                                                       #
# Bottom Line: Thumbnails are essential for fast page loads and great UX, with minimal storage cost.    #
# ----------------------------------------------------------------------------------------------------- #