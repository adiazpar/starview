# ----------------------------------------------------------------------------------------------------- #
# This model_user_profile.py file defines the UserProfile model:                                        #
#                                                                                                       #
# Purpose:                                                                                              #
# Extends Django's built-in User model with profile pictures, bio, and location. Automatically created  #
# via post_save signal in signals.py when a User is created.                                            #
#                                                                                                       #
# Key Features:                                                                                         #
# - One-to-One relationship with User model (extends user functionality)                                #
# - Profile picture upload with default fallback                                                        #
# - Public profile fields: bio and location for user profiles                                           #
# - Automatic creation: Signal handler in signals.py creates UserProfile when User is created           #
# ----------------------------------------------------------------------------------------------------- #

# Import tools:
from django.db import models
from django.contrib.auth.models import User
from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from starview_app.utils.validators import validate_latitude, validate_longitude



class UserProfile(models.Model):
    # Timestamps:
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # User relationship:
    user = models.OneToOneField(User, on_delete=models.CASCADE)

    # Profile data:
    profile_picture = models.ImageField(upload_to='profile_pics/', null=True, blank=True)
    bio = models.TextField(
        max_length=150,
        blank=True,
        default='',
        help_text="Short bio visible on public profile (max 150 characters)"
    )
    location = models.CharField(
        max_length=100,
        blank=True,
        default='',
        help_text="User's location (e.g., 'Seattle, WA')"
    )
    location_latitude = models.FloatField(
        null=True,
        blank=True,
        validators=[validate_latitude],
        help_text="User's location latitude (private - never exposed in API)"
    )
    location_longitude = models.FloatField(
        null=True,
        blank=True,
        validators=[validate_longitude],
        help_text="User's location longitude (private - never exposed in API)"
    )
    is_verified = models.BooleanField(
        default=False,
        help_text="Verified badge status for user profile"
    )
    is_system_account = models.BooleanField(
        default=False,
        help_text="System accounts are hidden from public profiles, sitemaps, and cannot be followed"
    )

    # Badge pinning (max 3 pinned badges displayed on profile header):
    pinned_badge_ids = ArrayField(
        models.IntegerField(),
        size=3,
        default=list,
        blank=True,
        help_text="Up to 3 badge IDs to display on profile header"
    )

    # Unit preference for distances and elevations:
    UNIT_CHOICES = [
        ('metric', 'Metric'),
        ('imperial', 'Imperial'),
    ]
    unit_preference = models.CharField(
        max_length=10,
        choices=UNIT_CHOICES,
        default='metric',
        help_text="User's preferred unit system for distances and elevations"
    )


    # Returns profile picture URL or default if none set:
    @property
    def get_profile_picture_url(self):
        if self.profile_picture and hasattr(self.profile_picture, 'url'):
            return self.profile_picture.url
        return settings.DEFAULT_PROFILE_PICTURE


    # String representation for admin interface and debugging:
    def __str__(self):
        return f'{self.user.username} Profile'

    class Meta:
        verbose_name = 'User Profile'
        verbose_name_plural = 'User Profiles'
