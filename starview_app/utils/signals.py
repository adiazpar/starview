# ----------------------------------------------------------------------------------------------------- #
# This signals.py file handles Django signal receivers for the stars_app:                               #
#                                                                                                       #
# Model Creation Signals (post_save):                                                                   #
# - User creation → Automatically creates associated UserProfile                                        #
#                                                                                                       #
# File Cleanup Signals (pre_delete, post_delete):                                                       #
# 1. UserProfile deletion → Removes profile pictures                                                    #
# 2. ReviewPhoto deletion → Removes review images and thumbnails                                        #
# 3. Review deletion → Coordinates cleanup of all associated photos                                     #
# 4. Location deletion → Coordinates cleanup of all reviews and photos via CASCADE                      #
#                                                                                                       #
# Email Verification Signals (email_confirmed):                                                         #
# - Email confirmed → Deletes EmailConfirmation token to prevent database bloat                         #
#                                                                                                       #
# Badge Checking Signals (post_save):                                                                   #
# 1. LocationVisit created → Check exploration badges (visit count)                                     #
# 2. Location created → Check contribution badges (location adds)                                       #
# 3. Review created → Auto-mark visited + check review badges                                           #
# 4. Follow created → Check community badges (follower count)                                           #
# 5. ReviewComment created → Check community badges (comment count)                                     #
#                                                                                                       #
# Cleanup happens in phases:                                                                            #
# - pre_delete: Delete files before database deletion (while paths are still accessible)                #
# - post_delete: Clean up empty directories after CASCADE deletions complete                            #
#                                                                                                       #
# Signal Registration:                                                                                  #
# These signals are automatically registered when this module is imported via stars_app/apps.py         #
# in the ready() method.                                                                                #
#                                                                                                       #
# Safety Features:                                                                                      #
# - Files are only deleted if they're within MEDIA_ROOT (security check)                                #
# - Empty directories are cleaned up automatically                                                      #
# - Handles CASCADE deletions properly (Location → Reviews → Photos)                                    #
# - Badge checks use lazy imports to prevent circular dependencies                                      #
# ----------------------------------------------------------------------------------------------------- #

# Import tools:
import os
import logging
from django.db.models.signals import pre_delete, post_delete, post_save
from django.dispatch import receiver
from django.conf import settings
from django.contrib.auth.models import User
from pathlib import Path

# Configure module logger
logger = logging.getLogger(__name__)

# Import models:
from starview_app.models import UserProfile
from starview_app.models import ReviewPhoto
from starview_app.models import LocationPhoto
from starview_app.models import Review
from starview_app.models import Location
from starview_app.models import LocationVisit
from starview_app.models import Follow
from starview_app.models import ReviewComment
from starview_app.models import Vote

# Import allauth signals and models:
from allauth.account.signals import email_confirmed
from allauth.account.models import EmailConfirmation


# ----------------------------------------------------------------------------------------------------- #
# ContentType Cache for Signal Handlers                                                                 #
# ----------------------------------------------------------------------------------------------------- #
# Cache ContentType objects at module level to avoid repeated database lookups in signal handlers.      #
# ContentType IDs are stable and won't change during application runtime, making them safe to cache.    #
# This optimization saves 1-2 database queries per vote/comment (potentially hundreds per day).         #
#                                                                                                       #
# Pattern: Lazy initialization on first use, then reused for all subsequent signal invocations.         #
# Thread-safe: Python's GIL ensures atomic assignment of global variables.                              #
# ----------------------------------------------------------------------------------------------------- #

# Module-level ContentType cache (initialized on first use)
_REVIEW_CT_CACHE = None
_COMMENT_CT_CACHE = None

def get_review_content_type():
    """
    Get Review ContentType with module-level caching.

    Returns cached ContentType on subsequent calls (no database query).
    Thread-safe due to Python's GIL for simple assignments.
    """
    global _REVIEW_CT_CACHE
    if _REVIEW_CT_CACHE is None:
        from django.contrib.contenttypes.models import ContentType
        _REVIEW_CT_CACHE = ContentType.objects.get_for_model(Review)
    return _REVIEW_CT_CACHE

def get_comment_content_type():
    """Get ReviewComment ContentType with module-level caching."""
    global _COMMENT_CT_CACHE
    if _COMMENT_CT_CACHE is None:
        from django.contrib.contenttypes.models import ContentType
        _COMMENT_CT_CACHE = ContentType.objects.get_for_model(ReviewComment)
    return _COMMENT_CT_CACHE



# ----------------------------------------------------------------------------------------------------- #
#                                                                                                       #
#                                           SIGNAL METHODS                                              #
#                                                                                                       #
# ----------------------------------------------------------------------------------------------------- #

# ----------------------------------------------------------------------------- #
# Safely delete a file from the filesystem with error handling.                 #
#                                                                               #
# Args:       file_path (str): Path to the file to delete                       #
# Returns:    bool: True if deleted successfully, False otherwise               #
# ----------------------------------------------------------------------------- #
def safe_delete_file(file_path):
    """
    Safely delete a file from local filesystem or cloud storage (R2/S3).

    Handles both:
    - Local filesystem paths (legacy/development)
    - Django storage backend paths (R2/S3 production)
    """
    if not file_path:
        return False

    try:
        # For local filesystem paths (absolute paths starting with /)
        if isinstance(file_path, str) and file_path.startswith('/'):
            path = Path(file_path)

            # Check if file exists and is within media directory (security check):
            if path.exists() and str(path).startswith(str(settings.MEDIA_ROOT)):
                # File gets deleted:
                path.unlink()
                return True
            elif not path.exists():
                # File already deleted or doesn't exist:
                return True
            else:
                # File outside of media directory, so it doesn't get deleted:
                return False

        # For Django FileField/ImageField objects (R2/S3 storage)
        # These have a 'storage' attribute and 'name' attribute
        elif hasattr(file_path, 'storage') and hasattr(file_path, 'name'):
            if file_path.name and file_path.storage.exists(file_path.name):
                file_path.storage.delete(file_path.name)
                return True
            return True

        # For storage path strings (R2/S3 relative paths like 'profile_pics/xxx.jpg')
        else:
            from django.core.files.storage import default_storage
            file_str = str(file_path)
            if default_storage.exists(file_str):
                default_storage.delete(file_str)
                return True
            return True

    except Exception as e:
        # Log the error but don't crash (file deletion is not critical)
        # Import logger here since it's imported at module level below
        import logging
        module_logger = logging.getLogger(__name__)
        module_logger.warning(
            "Error deleting file %s: %s",
            str(file_path),
            str(e),
            extra={'file_path': str(file_path), 'error': str(e)}
        )
        return False


# ----------------------------------------------------------------------------- #
# Safely delete an empty directory and its empty parent directories.            #
#                                                                               #
# Args:   dir_path (str): Path to the directory to delete                       #
# ----------------------------------------------------------------------------- #
def safe_delete_directory(dir_path):
    if not dir_path:
        return

    try:
        path = Path(dir_path)

        # Only delete if it's within media directory and is empty:
        if (path.exists() and
                str(path).startswith(str(settings.MEDIA_ROOT)) and
                path.is_dir() and
                not any(path.iterdir())):

            # Delete empty directory:
            path.rmdir()

            # Try to delete parent directory if it's also empty:
            parent = path.parent
            if (parent != Path(settings.MEDIA_ROOT) and
                    parent.exists() and
                    parent.is_dir() and
                    not any(parent.iterdir())):
                safe_delete_directory(str(parent))

    except Exception:
        # There was an error deleting the directory:
        return



# ----------------------------------------------------------------------------------------------------- #
#                                                                                                       #
#                                               SIGNALS                                                 #
#                                                                                                       #
# ----------------------------------------------------------------------------------------------------- #

# Deletes user profile picture when user profile is deleted:
@receiver(pre_delete, sender=UserProfile)
def delete_user_profile_picture(instance, **kwargs):
    if instance.profile_picture:
        # Pass field object for R2/S3 compatibility:
        safe_delete_file(instance.profile_picture)

        # Try to clean up empty directory (local filesystem only):
        try:
            if hasattr(instance.profile_picture, 'path'):
                dir_path = os.path.dirname(instance.profile_picture.path)
                safe_delete_directory(dir_path)
        except (NotImplementedError, AttributeError):
            # Storage backend doesn't support .path (R2/S3)
            pass


# Delete review photo and thumbnail files when ReviewPhoto is deleted:
@receiver(pre_delete, sender=ReviewPhoto)
def delete_review_photo_files(instance, **kwargs):
    # Delete main image (pass field object for R2/S3 compatibility):
    if instance.image:
        safe_delete_file(instance.image)

    # Delete thumbnail (pass field object for R2/S3 compatibility):
    if instance.thumbnail:
        safe_delete_file(instance.thumbnail)

    # Clean up directories if they're empty (local filesystem only):
    # For R2/S3, directory cleanup is handled by storage backend
    if instance.image:
        try:
            # Only attempt directory cleanup for local filesystem
            if hasattr(instance.image, 'path'):
                # Get the review-specific directory:
                review_dir = os.path.dirname(instance.image.path)
                safe_delete_directory(os.path.join(review_dir, 'thumbnails'))
                safe_delete_directory(review_dir)

                # Try to clean up location directory if empty:
                location_dir = os.path.dirname(review_dir)
                safe_delete_directory(location_dir)
        except (NotImplementedError, AttributeError):
            # Storage backend doesn't support .path (R2/S3)
            pass


# Delete location photo and thumbnail files when LocationPhoto is deleted:
@receiver(pre_delete, sender=LocationPhoto)
def delete_location_photo_files(instance, **kwargs):
    # Delete main image (pass field object for R2/S3 compatibility):
    if instance.image:
        safe_delete_file(instance.image)

    # Delete thumbnail (pass field object for R2/S3 compatibility):
    if instance.thumbnail:
        safe_delete_file(instance.thumbnail)

    # Clean up directories if they're empty (local filesystem only):
    if instance.image:
        try:
            if hasattr(instance.image, 'path'):
                # Get the location-specific directory:
                location_dir = os.path.dirname(instance.image.path)
                safe_delete_directory(os.path.join(location_dir, 'thumbnails'))
                safe_delete_directory(location_dir)
        except (NotImplementedError, AttributeError):
            # Storage backend doesn't support .path (R2/S3)
            pass


# Clean up the entire location directory structure after all cascade deletions are complete:
@receiver(post_delete, sender=Location)
def cleanup_location_directory_structure(instance, **kwargs):
    try:
        # Try to clean up the review photos directory:
        review_photos_dir = os.path.join(settings.MEDIA_ROOT, 'review_photos', str(instance.id))
        safe_delete_directory(review_photos_dir)

        # Try to clean up the location photos directory:
        location_photos_dir = os.path.join(settings.MEDIA_ROOT, 'location_photos', str(instance.id))
        safe_delete_directory(location_photos_dir)

    except Exception:
        # There was an error cleaning up directory structure for location:
        return


# Clean up the review directory structure after all cascade deletions are complete:
@receiver(post_delete, sender=Review)
def cleanup_review_directory_structure(instance, **kwargs):
    try:
        # Try to clean up the main review directory:
        review_dir = os.path.join(
            settings.MEDIA_ROOT,
            'review_photos',
            str(instance.location.id),
            str(instance.id)
        )
        safe_delete_directory(review_dir)

    except Exception:
        # There was an error cleaning up directory structure for review:
        return


# Automatically create UserProfile when User is created:
@receiver(post_save, sender=User)
def create_or_update_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance)
    else:
        UserProfile.objects.get_or_create(user=instance)  # Create profile for existing users if missing


# ----------------------------------------------------------------------------- #
# Delete EmailConfirmation and check Pioneer badge after email verification.    #
#                                                                               #
# This prevents database bloat from unused confirmation tokens.                 #
# After a user clicks the verification link and confirms their email,           #
# the confirmation token is no longer needed and can be safely deleted.         #
#                                                                               #
# Additionally, checks if user qualifies for Pioneer badge (first 100 users).   #
#                                                                               #
# Signal: allauth.account.signals.email_confirmed                               #
# Triggered: When user successfully confirms their email address                #
# Args:                                                                         #
#   - request: HTTP request object                                              #
#   - email_address: EmailAddress instance that was confirmed                   #
# ----------------------------------------------------------------------------- #
@receiver(email_confirmed)
def delete_email_confirmation_on_confirm(sender, request, email_address, **kwargs):

    # Delete all confirmation tokens for this email address
    # Normally there's only one, but just in case there are multiple (edge case)
    deleted_count, _ = EmailConfirmation.objects.filter(email_address=email_address).delete()

    # Log the cleanup (useful for debugging)
    if deleted_count > 0:
        logger.info(
            "Deleted %d EmailConfirmation record(s) for verified user: %s",
            deleted_count,
            email_address.email,
            extra={'action': 'email_cleanup', 'count': deleted_count, 'email': email_address.email}
        )

    # Check Pioneer badge (first 100 verified users)
    from starview_app.services.badge_service import BadgeService
    BadgeService.check_pioneer_badge(email_address.user)



# ----------------------------------------------------------------------------------------------------- #
#                                                                                                       #
#                                       BADGE CHECKING SIGNALS                                          #
#                                                                                                       #
# ----------------------------------------------------------------------------------------------------- #

# ----------------------------------------------------------------------------- #
# Check exploration badges after user marks a location as visited.              #
#                                                                               #
# Triggered when LocationVisit is created (user clicks "Mark as Visited").      #
# Awards badges based on total unique locations visited.                        #
#                                                                               #
# Signal: post_save on LocationVisit                                            #
# Badge Service: check_exploration_badges()                                     #
# Cache Invalidation: Always invalidate (visit count changed)                   #
# ----------------------------------------------------------------------------- #
@receiver(post_save, sender=LocationVisit)
def check_badges_on_visit(sender, instance, created, **kwargs):
    if created:
        from starview_app.services.badge_service import BadgeService
        BadgeService.check_exploration_badges(instance.user)
        # Invalidate cache (visit count changed, affects progress)
        BadgeService.invalidate_badge_progress_cache(instance.user)


# ----------------------------------------------------------------------------- #
# Check contribution badges and auto-mark location as visited.                  #
#                                                                               #
# Triggered when Location is created.                                           #
# 1. Auto-creates LocationVisit (creator has obviously been there)              #
# 2. Awards contribution badges                                                 #
#                                                                               #
# Signal: post_save on Location                                                 #
# Badge Service: check_contribution_badges()                                    #
# Cache Invalidation: Always invalidate (location count changed)                #
# ----------------------------------------------------------------------------- #
@receiver(post_save, sender=Location)
def check_badges_on_location_add(sender, instance, created, **kwargs):
    if created:
        from starview_app.services.badge_service import BadgeService

        # Auto-create LocationVisit when location created
        # (if you discovered and added it, you've obviously been there)
        LocationVisit.objects.get_or_create(
            user=instance.added_by,
            location=instance
        )

        BadgeService.check_contribution_badges(instance.added_by)
        # Invalidate cache (location count changed, affects progress)
        BadgeService.invalidate_badge_progress_cache(instance.added_by)


# ----------------------------------------------------------------------------- #
# Check review badges and auto-mark location as visited.                        #
#                                                                               #
# Triggered when Review is created.                                             #
# 1. Auto-creates LocationVisit (review implies visit)                          #
# 2. Awards review count badges                                                 #
#                                                                               #
# Signal: post_save on Review                                                   #
# Badge Service: check_review_badges()                                          #
# Cache Invalidation: Invalidate for reviewer (review count) and location       #
#                     creator (quality rating changed)                          #
# ----------------------------------------------------------------------------- #
@receiver(post_save, sender=Review)
def check_badges_on_review(sender, instance, created, **kwargs):
    if created:
        from starview_app.services.badge_service import BadgeService

        # Auto-create LocationVisit when review posted (review implies visit)
        LocationVisit.objects.get_or_create(
            user=instance.user,
            location=instance.location
        )

        # Check review badges for the reviewer
        BadgeService.check_review_badges(instance.user)
        # Invalidate cache (review count changed, affects progress)
        BadgeService.invalidate_badge_progress_cache(instance.user)

        # Check quality badges for the location creator
        # (their location just got a new rating that may affect average)
        BadgeService.check_quality_badges(instance.location.added_by)
        # Invalidate cache (location rating changed, affects quality badges)
        BadgeService.invalidate_badge_progress_cache(instance.location.added_by)


# ----------------------------------------------------------------------------- #
# Check community badges after user gains a follower.                           #
#                                                                               #
# Triggered when Follow is created.                                             #
# Awards badges based on follower count.                                        #
#                                                                               #
# Signal: post_save on Follow                                                   #
# Badge Service: check_community_badges()                                       #
# Cache Invalidation: Invalidate for user who gained follower                   #
# ----------------------------------------------------------------------------- #
@receiver(post_save, sender=Follow)
def check_badges_on_follow(sender, instance, created, **kwargs):
    if created:
        from starview_app.services.badge_service import BadgeService
        # Check badges for the user who GAINED a follower
        BadgeService.check_community_badges(instance.following)
        # Invalidate cache (follower count changed, affects progress)
        BadgeService.invalidate_badge_progress_cache(instance.following)


# ----------------------------------------------------------------------------- #
# Check community badges after user posts a comment.                            #
#                                                                               #
# Triggered when ReviewComment is created.                                      #
# Awards badges based on comment count.                                         #
#                                                                               #
# Signal: post_save on ReviewComment                                            #
# Badge Service: check_community_badges()                                       #
# Cache Invalidation: Always invalidate (comment count changed)                 #
# ----------------------------------------------------------------------------- #
@receiver(post_save, sender=ReviewComment)
def check_badges_on_comment(sender, instance, created, **kwargs):
    if created:
        from starview_app.services.badge_service import BadgeService
        BadgeService.check_community_badges(instance.user)
        # Invalidate cache (comment count changed, affects progress)
        BadgeService.invalidate_badge_progress_cache(instance.user)


# ----------------------------------------------------------------------------- #
# Check review badges after vote is cast on a review.                           #
#                                                                               #
# Triggered when Vote is created.                                               #
# Awards badges based on upvote count and helpful ratio.                        #
#                                                                               #
# Signal: post_save on Vote                                                     #
# Badge Service: check_review_badges()                                          #
# Cache Invalidation: Invalidate for review author (vote count changed)         #
# ----------------------------------------------------------------------------- #
@receiver(post_save, sender=Vote)
def check_badges_on_vote(sender, instance, created, **kwargs):
    if created:
        from starview_app.services.badge_service import BadgeService

        # Only check badges if vote is on a Review
        # Use cached ContentType (no database query after first call)
        review_ct = get_review_content_type()

        # Compare IDs instead of objects (more efficient)
        if instance.content_type_id == review_ct.id:
            # Check badges for the review author (who received the vote)
            # Use select_related to fetch user in same query
            try:
                review = Review.objects.select_related('user').get(id=instance.object_id)
                BadgeService.check_review_badges(review.user)
                # Invalidate cache (vote count changed, affects review badges)
                BadgeService.invalidate_badge_progress_cache(review.user)
            except Review.DoesNotExist:
                # Vote on deleted review, skip badge check
                pass


# ----------------------------------------------------------------------------- #
# Check Photographer badge after user uploads a review photo.                   #
#                                                                               #
# Triggered when ReviewPhoto is created.                                        #
# Awards Photographer badge when user uploads 25+ photos.                       #
#                                                                               #
# Signal: post_save on ReviewPhoto                                              #
# Badge Service: check_photographer_badge()                                     #
# Cache Invalidation: Always invalidate (photo count changed)                   #
# ----------------------------------------------------------------------------- #
@receiver(post_save, sender=ReviewPhoto)
def check_badges_on_photo_upload(sender, instance, created, **kwargs):
    if created:
        from starview_app.services.badge_service import BadgeService
        # Check Photographer badge for the user who uploaded the photo
        BadgeService.check_photographer_badge(instance.review.user)
        # Invalidate cache (photo count changed, affects photographer badge)
        BadgeService.invalidate_badge_progress_cache(instance.review.user)


# ----------------------------------------------------------------------------------------------------- #
#                                                                                                       #
#                                   BADGE REVOCATION SIGNALS (DELETIONS)                                #
#                                                                                                       #
# ----------------------------------------------------------------------------------------------------- #

# ----------------------------------------------------------------------------- #
# Revoke badges when LocationVisit is deleted.                                  #
#                                                                               #
# Triggered when LocationVisit is deleted (user removes visit).                 #
# Checks if user still qualifies for exploration badges they have.              #
#                                                                               #
# Signal: post_delete on LocationVisit                                          #
# Badge Service: revoke_exploration_badges_if_needed()                          #
# ----------------------------------------------------------------------------- #
@receiver(post_delete, sender=LocationVisit)
def revoke_badges_on_visit_delete(sender, instance, **kwargs):
    from starview_app.services.badge_service import BadgeService
    BadgeService.revoke_exploration_badges_if_needed(instance.user)


# ----------------------------------------------------------------------------- #
# Revoke badges when Location is deleted.                                       #
#                                                                               #
# Triggered when Location is deleted.                                           #
# Checks if user still qualifies for contribution badges they have.             #
#                                                                               #
# Signal: post_delete on Location                                               #
# Badge Service: revoke_contribution_badges_if_needed()                         #
# ----------------------------------------------------------------------------- #
@receiver(post_delete, sender=Location)
def revoke_badges_on_location_delete(sender, instance, **kwargs):
    from starview_app.services.badge_service import BadgeService
    BadgeService.revoke_contribution_badges_if_needed(instance.added_by)


# ----------------------------------------------------------------------------- #
# Revoke badges when Review is deleted.                                         #
#                                                                               #
# Triggered when Review is deleted.                                             #
# Checks if:                                                                    #
# 1. Reviewer still qualifies for review badges                                 #
# 2. Location creator still qualifies for quality badges (rating changed)       #
#                                                                               #
# Signal: post_delete on Review                                                 #
# Badge Service: revoke_review_badges_if_needed(), revoke_quality_badges()      #
# ----------------------------------------------------------------------------- #
@receiver(post_delete, sender=Review)
def revoke_badges_on_review_delete(sender, instance, **kwargs):
    from starview_app.services.badge_service import BadgeService

    # Check review badges for the reviewer
    BadgeService.revoke_review_badges_if_needed(instance.user)

    # Check quality badges for the location creator (rating average changed)
    BadgeService.revoke_quality_badges_if_needed(instance.location.added_by)


# ----------------------------------------------------------------------------- #
# Revoke badges when ReviewComment is deleted.                                  #
#                                                                               #
# Triggered when ReviewComment is deleted.                                      #
# Checks if user still qualifies for community (comment) badges.                #
#                                                                               #
# Signal: post_delete on ReviewComment                                          #
# Badge Service: revoke_community_badges_if_needed()                            #
# ----------------------------------------------------------------------------- #
@receiver(post_delete, sender=ReviewComment)
def revoke_badges_on_comment_delete(sender, instance, **kwargs):
    from starview_app.services.badge_service import BadgeService
    BadgeService.revoke_community_badges_if_needed(instance.user)


# ----------------------------------------------------------------------------- #
# Revoke badges when Follow is deleted.                                         #
#                                                                               #
# Triggered when Follow is deleted (unfollowed).                                #
# Checks if user still qualifies for community (follower) badges.               #
#                                                                               #
# Signal: post_delete on Follow                                                 #
# Badge Service: revoke_community_badges_if_needed()                            #
# ----------------------------------------------------------------------------- #
@receiver(post_delete, sender=Follow)
def revoke_badges_on_unfollow(sender, instance, **kwargs):
    from starview_app.services.badge_service import BadgeService
    # Check badges for the user who LOST a follower
    BadgeService.revoke_community_badges_if_needed(instance.following)


# ----------------------------------------------------------------------------- #
# Revoke badges when Vote is deleted.                                           #
#                                                                               #
# Triggered when Vote is deleted.                                               #
# Checks if review author still qualifies for review badges (upvote/ratio).     #
#                                                                               #
# Signal: post_delete on Vote                                                   #
# Badge Service: revoke_review_badges_if_needed()                               #
# ----------------------------------------------------------------------------- #
@receiver(post_delete, sender=Vote)
def revoke_badges_on_vote_delete(sender, instance, **kwargs):
    from starview_app.services.badge_service import BadgeService

    # Only check badges if vote is on a Review
    # Use cached ContentType (no database query after first call)
    review_ct = get_review_content_type()

    # Compare IDs instead of objects (more efficient)
    if instance.content_type_id == review_ct.id:
        # Check badges for the review author (who lost the vote)
        # Use select_related to fetch user in same query
        try:
            review = Review.objects.select_related('user').get(id=instance.object_id)
            BadgeService.revoke_review_badges_if_needed(review.user)
        except Review.DoesNotExist:
            # Review already deleted, no badges to revoke
            pass


# ----------------------------------------------------------------------------- #
# Revoke badges when ReviewPhoto is deleted.                                    #
#                                                                               #
# Triggered when ReviewPhoto is deleted.                                        #
# Checks if user still qualifies for Photographer badge.                        #
#                                                                               #
# Signal: post_delete on ReviewPhoto                                            #
# Badge Service: revoke_photographer_badge_if_needed()                          #
# ----------------------------------------------------------------------------- #
@receiver(post_delete, sender=ReviewPhoto)
def revoke_badges_on_photo_delete(sender, instance, **kwargs):
    from starview_app.services.badge_service import BadgeService
    BadgeService.revoke_photographer_badge_if_needed(instance.review.user)
