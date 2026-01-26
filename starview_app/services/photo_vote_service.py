# ----------------------------------------------------------------------------------------------------- #
# This photo_vote_service.py file handles upvote operations for photos:                                #
#                                                                                                       #
# Purpose:                                                                                              #
# Provides centralized business logic for upvoting photos (LocationPhoto and ReviewPhoto).             #
# Unlike the general VoteService, this only supports upvotes (no downvotes) for photo ranking.         #
#                                                                                                       #
# Key Features:                                                                                         #
# - Upvote-only: No downvotes - users can only upvote or remove their upvote                           #
# - Self-vote Prevention: Users cannot upvote their own photos                                          #
# - Generic Support: Works with both LocationPhoto and ReviewPhoto via ContentTypes                     #
# ----------------------------------------------------------------------------------------------------- #

from django.contrib.contenttypes.models import ContentType
from starview_app.models.model_vote import Vote


class PhotoVoteService:

    @staticmethod
    def toggle_upvote(user, photo):
        """
        Toggle a user's upvote on a photo (LocationPhoto or ReviewPhoto).

        Args:
            user (User): The user casting the vote
            photo: The photo object (LocationPhoto or ReviewPhoto)

        Returns:
            dict: {upvote_count, user_has_upvoted, photo_id}

        Raises:
            ValidationError: If user tries to vote on their own photo
        """
        from rest_framework.exceptions import ValidationError

        # Prevent self-voting
        owner = PhotoVoteService._get_photo_owner(photo)
        if owner and owner == user:
            raise ValidationError('You cannot upvote your own photo')

        content_type = ContentType.objects.get_for_model(photo)

        # Try to get existing vote
        existing_vote = Vote.objects.filter(
            user=user,
            content_type=content_type,
            object_id=photo.id
        ).first()

        if existing_vote:
            # Vote exists - remove it (toggle off)
            existing_vote.delete()
            user_has_upvoted = False
        else:
            # No vote - create upvote
            Vote.objects.create(
                user=user,
                content_type=content_type,
                object_id=photo.id,
                is_upvote=True
            )
            user_has_upvoted = True

        # Get updated count
        upvote_count = Vote.objects.filter(
            content_type=content_type,
            object_id=photo.id,
            is_upvote=True
        ).count()

        return {
            'upvote_count': upvote_count,
            'user_has_upvoted': user_has_upvoted,
            'photo_id': PhotoVoteService._get_photo_id_string(photo)
        }

    @staticmethod
    def get_upvote_status(photo, user=None):
        """
        Get upvote count and user's vote status for a photo.

        Args:
            photo: The photo object (LocationPhoto or ReviewPhoto)
            user (User): Optional user to check their vote status

        Returns:
            dict: {upvote_count, user_has_upvoted}
        """
        content_type = ContentType.objects.get_for_model(photo)

        upvote_count = Vote.objects.filter(
            content_type=content_type,
            object_id=photo.id,
            is_upvote=True
        ).count()

        user_has_upvoted = False
        if user and user.is_authenticated:
            user_has_upvoted = Vote.objects.filter(
                content_type=content_type,
                object_id=photo.id,
                user=user,
                is_upvote=True
            ).exists()

        return {
            'upvote_count': upvote_count,
            'user_has_upvoted': user_has_upvoted
        }

    @staticmethod
    def _get_photo_owner(photo):
        """
        Get the owner/uploader of a photo.

        LocationPhoto has 'uploaded_by' field.
        ReviewPhoto's owner is the review author (review.user).
        """
        from starview_app.models import LocationPhoto, ReviewPhoto

        if isinstance(photo, LocationPhoto):
            return photo.uploaded_by
        elif isinstance(photo, ReviewPhoto):
            return photo.review.user if photo.review else None
        return None

    @staticmethod
    def _get_photo_id_string(photo):
        """
        Get the prefixed photo ID string (loc_123 or rev_456).
        """
        from starview_app.models import LocationPhoto, ReviewPhoto

        if isinstance(photo, LocationPhoto):
            return f'loc_{photo.id}'
        elif isinstance(photo, ReviewPhoto):
            return f'rev_{photo.id}'
        return str(photo.id)
