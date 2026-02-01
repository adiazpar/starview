# ----------------------------------------------------------------------------------------------------- #
# This badge_service.py file handles badge checking and awarding operations:                            #
#                                                                                                       #
# Purpose:                                                                                              #
# Provides centralized business logic for the badge/achievement system. Handles badge checking,         #
# awarding, progress calculation, and anomaly detection for potential badge gaming.                     #
#                                                                                                       #
# Key Features:                                                                                         #
# - Signal-Triggered Checking: Badges checked automatically after relevant actions                      #
# - Category-Specific Methods: Separate methods for each badge category                                 #
# - Efficient Queries: Simple COUNT queries with early termination (1-3ms per check)                    #
# - On-Demand Progress: Badge progress calculated when needed, not stored                               #
# - Anomaly Detection: Passive monitoring for suspicious activity (10+ visits/hour)                     #
#                                                                                                       #
# Service Layer Pattern:                                                                                #
# This service separates business logic from views, following Django best practices:                    #
# - Models define data structure (Badge, UserBadge, LocationVisit)                                      #
# - Services define business logic (badge checking and awarding)                                        #
# - Signals trigger checks automatically (post_save on LocationVisit, Review, etc.)                     #
# - Views handle API endpoints and user interactions                                                    #
#                                                                                                       #
# Usage:                                                                                                #
# - All methods are static and can be called independently                                              #
# - Called by signal handlers for automatic badge checking                                              #
# - Called by API views for displaying badge progress                                                   #
# ----------------------------------------------------------------------------------------------------- #

# Import tools:
from django.utils import timezone
from django.core.cache import cache
from datetime import timedelta
from starview_app.models import (
    Badge, UserBadge, LocationVisit, Location, Review,
    ReviewComment, Follow
)


# ----------------------------------------------------------------------------------------------------- #
# Module-Level Badge Caching (Performance Optimization)                                                 #
# ----------------------------------------------------------------------------------------------------- #
# Cache Badge objects at module level to avoid redundant database queries in signal handlers.           #
# Badge data is static (rarely changes during application runtime), making it safe to cache.            #
#                                                                                                       #
# Pattern: Lazy initialization on first use, then reused for all subsequent badge checks.               #
# Thread-safe: Python's GIL ensures atomic assignment of global variables.                              #
#                                                                                                       #
# This optimization eliminates 1-2 database queries per badge check operation, saving potentially       #
# thousands of queries per day in production.                                                           #
#                                                                                                       #
# Similar to ContentType caching pattern from signals.py (Critical Issue #3 fix).                       #
# ----------------------------------------------------------------------------------------------------- #

# Module-level badge caches (initialized on first use)
_BADGE_CACHE_BY_CATEGORY = {}  # e.g., {('EXPLORATION', 'LOCATION_VISITS'): [badge1, badge2, ...]}
_BADGE_CACHE_BY_SLUG = {}      # e.g., {'pioneer': badge_obj, 'photographer': badge_obj}


def get_badges_by_category(category, criteria_type):
    """
    Get badges by category and criteria type with module-level caching.

    Returns cached badge list on subsequent calls (no database query).
    Thread-safe due to Python's GIL for simple assignments.

    Args:
        category (str): Badge category (e.g., 'EXPLORATION', 'CONTRIBUTION')
        criteria_type (str): Criteria type (e.g., 'LOCATION_VISITS', 'LOCATIONS_ADDED')

    Returns:
        list: Badge objects ordered by criteria_value
    """
    global _BADGE_CACHE_BY_CATEGORY
    cache_key = (category, criteria_type)

    if cache_key not in _BADGE_CACHE_BY_CATEGORY:
        # First access - query database and cache results
        badges = list(Badge.objects.filter(
            category=category,
            criteria_type=criteria_type
        ).order_by('criteria_value'))
        _BADGE_CACHE_BY_CATEGORY[cache_key] = badges

    return _BADGE_CACHE_BY_CATEGORY[cache_key]


def get_review_badges():
    """
    Get all review category badges with module-level caching.

    Returns cached badge list on subsequent calls (no database query).
    Review badges use multiple criteria types, so we cache all at once.

    Returns:
        list: Badge objects ordered by tier
    """
    global _BADGE_CACHE_BY_CATEGORY
    cache_key = ('REVIEW', None)  # None = all criteria types

    if cache_key not in _BADGE_CACHE_BY_CATEGORY:
        # First access - query database and cache results
        badges = list(Badge.objects.filter(category='REVIEW').order_by('tier'))
        _BADGE_CACHE_BY_CATEGORY[cache_key] = badges

    return _BADGE_CACHE_BY_CATEGORY[cache_key]


def get_badge_by_slug(slug):
    """
    Get badge by slug with module-level caching.

    Returns cached badge on subsequent calls (no database query).
    Thread-safe due to Python's GIL for simple assignments.

    Args:
        slug (str): Badge slug (e.g., 'pioneer', 'photographer')

    Returns:
        Badge: Badge object or None if not found
    """
    global _BADGE_CACHE_BY_SLUG

    if slug not in _BADGE_CACHE_BY_SLUG:
        # First access - query database and cache result
        badge = Badge.objects.filter(slug=slug).first()
        _BADGE_CACHE_BY_SLUG[slug] = badge

    return _BADGE_CACHE_BY_SLUG[slug]


# System users that should be excluded from badge eligibility
SYSTEM_USERNAMES = {'starview'}


def is_system_user(user):
    """Check if user is a system account (excluded from badges)."""
    return user.username in SYSTEM_USERNAMES


class BadgeService:

    # ----------------------------------------------------------------------------- #
    # Check exploration badges (location visit count).                              #
    #                                                                               #
    # Triggered by LocationVisit creation signal.                                   #
    # Awards badges based on total unique locations visited by user.                #
    #                                                                               #
    # Args:     user (User): The user to check badges for                           #
    # Returns:  list: Badge IDs of newly awarded badges                             #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def check_exploration_badges(user):
        if is_system_user(user):
            return []

        visit_count = LocationVisit.objects.filter(user=user).count()

        # Use cached badges (no database query after first call)
        exploration_badges = get_badges_by_category('EXPLORATION', 'LOCATION_VISITS')

        newly_awarded = []
        for badge in exploration_badges:
            if visit_count >= badge.criteria_value:
                created = BadgeService.award_badge(user, badge)
                if created:
                    newly_awarded.append(badge.id)
            else:
                break  # Stop checking higher tier badges

        return newly_awarded


    # ----------------------------------------------------------------------------- #
    # Check contribution badges (location creation count).                          #
    #                                                                               #
    # Triggered by Location creation signal.                                        #
    # Awards badges based on total locations added by user.                         #
    #                                                                               #
    # Args:     user (User): The user to check badges for                           #
    # Returns:  list: Badge IDs of newly awarded badges                             #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def check_contribution_badges(user):
        if is_system_user(user):
            return []

        location_count = Location.objects.filter(added_by=user).count()

        # Use cached badges (no database query after first call)
        contribution_badges = get_badges_by_category('CONTRIBUTION', 'LOCATIONS_ADDED')

        newly_awarded = []
        for badge in contribution_badges:
            if location_count >= badge.criteria_value:
                created = BadgeService.award_badge(user, badge)
                if created:
                    newly_awarded.append(badge.id)
            else:
                break

        return newly_awarded


    # ----------------------------------------------------------------------------- #
    # Check quality badges (well-rated locations).                                  #
    #                                                                               #
    # Triggered by Review creation signal (checks location creator).                #
    # Awards badges based on locations added by user with 4+ star average.          #
    #                                                                               #
    # Args:     user (User): The user to check badges for                           #
    # Returns:  list: Badge IDs of newly awarded badges                             #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def check_quality_badges(user):
        if is_system_user(user):
            return []

        # Count locations added by user with average rating >= 4.0
        quality_location_count = Location.objects.filter(
            added_by=user,
            average_rating__gte=4.0
        ).count()

        # Use cached badges (no database query after first call)
        quality_badges = get_badges_by_category('QUALITY', 'LOCATION_RATING')

        newly_awarded = []
        for badge in quality_badges:
            if quality_location_count >= badge.criteria_value:
                created = BadgeService.award_badge(user, badge)
                if created:
                    newly_awarded.append(badge.id)
            else:
                break

        return newly_awarded


    # ----------------------------------------------------------------------------- #
    # Check review badges (review count, upvotes, helpful ratio).                   #
    #                                                                               #
    # Triggered by Review creation signal and Vote creation signal.                 #
    # Awards badges based on:                                                       #
    # - REVIEWS_WRITTEN: Total reviews written by user                              #
    # - UPVOTES_RECEIVED: Total upvotes received on user's reviews                  #
    # - HELPFUL_RATIO: Minimum reviews + percentage of upvotes vs total votes       #
    #                                                                               #
    # OPTIMIZATION: Uses aggregate() with conditional Count() to get upvote_count   #
    # and total_votes in a single query instead of two separate count queries.      #
    #                                                                               #
    # Args:     user (User): The user to check badges for                           #
    # Returns:  list: Badge IDs of newly awarded badges                             #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def check_review_badges(user):
        if is_system_user(user):
            return []

        from django.contrib.contenttypes.models import ContentType
        from django.db.models import Count, Q
        from starview_app.models import Vote

        # Get user's reviews
        user_reviews = Review.objects.filter(user=user)
        review_count = user_reviews.count()

        # Get ContentType for Review model
        review_ct = ContentType.objects.get_for_model(Review)

        # OPTIMIZATION: Get vote counts in a single query using aggregate()
        # BEFORE: Two separate queries (upvote_count + total_votes)
        # AFTER: Single query with conditional aggregation
        vote_stats = Vote.objects.filter(
            content_type=review_ct,
            object_id__in=user_reviews.values('id')
        ).aggregate(
            upvote_count=Count('id', filter=Q(is_upvote=True)),
            total_votes=Count('id')
        )

        # Extract counts from aggregated results
        upvote_count = vote_stats['upvote_count'] or 0
        total_votes = vote_stats['total_votes'] or 0

        # Calculate helpful ratio (upvotes / total_votes * 100)
        helpful_ratio = (upvote_count / total_votes * 100) if total_votes > 0 else 0

        # Get all review badges (cached - no database query after first call)
        review_badges = get_review_badges()

        newly_awarded = []
        for badge in review_badges:
            qualifies = False

            if badge.criteria_type == 'REVIEWS_WRITTEN':
                # Simple review count check
                qualifies = review_count >= badge.criteria_value

            elif badge.criteria_type == 'UPVOTES_RECEIVED':
                # Upvote count check
                qualifies = upvote_count >= badge.criteria_value

            elif badge.criteria_type == 'HELPFUL_RATIO':
                # Minimum reviews + helpful ratio check
                min_reviews = badge.criteria_value
                min_ratio = badge.criteria_secondary  # Percentage (e.g., 75, 80, 85)

                qualifies = (
                    review_count >= min_reviews and
                    helpful_ratio >= min_ratio
                )

            if qualifies:
                created = BadgeService.award_badge(user, badge)
                if created:
                    newly_awarded.append(badge.id)

        return newly_awarded


    # ----------------------------------------------------------------------------- #
    # Check community badges (follower count and comment count).                    #
    #                                                                               #
    # Triggered by Follow or ReviewComment creation signals.                        #
    # Awards badges based on follower count or comment count.                       #
    #                                                                               #
    # Args:     user (User): The user to check badges for                           #
    # Returns:  list: Badge IDs of newly awarded badges                             #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def check_community_badges(user):
        if is_system_user(user):
            return []

        follower_count = Follow.objects.filter(following=user).count()

        # Count comments on OTHER users' reviews only (exclude comments on own reviews)
        comment_count = ReviewComment.objects.filter(user=user).exclude(
            review__user=user  # Exclude comments on user's own reviews
        ).count()

        newly_awarded = []

        # Check follower badges (cached - no database query after first call)
        follower_badges = get_badges_by_category('COMMUNITY', 'FOLLOWER_COUNT')

        for badge in follower_badges:
            if follower_count >= badge.criteria_value:
                created = BadgeService.award_badge(user, badge)
                if created:
                    newly_awarded.append(badge.id)
            else:
                break

        # Check comment badges (cached - no database query after first call)
        comment_badges = get_badges_by_category('COMMUNITY', 'COMMENTS_WRITTEN')

        for badge in comment_badges:
            if comment_count >= badge.criteria_value:
                created = BadgeService.award_badge(user, badge)
                if created:
                    newly_awarded.append(badge.id)
            else:
                break

        return newly_awarded


    # ----------------------------------------------------------------------------- #
    # Check Pioneer badge (first 100 verified users).                               #
    #                                                                               #
    # Triggered by email_confirmed signal (after email verification).               #
    # Awards Pioneer badge to first 100 users by registration date (historical).    #
    #                                                                               #
    # Logic: Uses date_joined to determine registration order.                      #
    # Only users who verify email qualify (prevents spam registrations).            #
    #                                                                               #
    # Args:     user (User): The user to check Pioneer badge for                    #
    # Returns:  list: Badge IDs of newly awarded badges (empty or [pioneer_id])     #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def check_pioneer_badge(user):
        if is_system_user(user):
            return []

        from django.contrib.auth.models import User

        # Get user's registration rank (1-indexed), excluding system users
        # Count users who registered before this user + this user
        registration_rank = User.objects.filter(
            date_joined__lte=user.date_joined
        ).exclude(username__in=SYSTEM_USERNAMES).count()

        # Check if user qualifies for Pioneer badge (first 100)
        if registration_rank <= 100:
            # Use cached badge (no database query after first call)
            pioneer_badge = get_badge_by_slug('pioneer')

            if pioneer_badge:
                created = BadgeService.award_badge(user, pioneer_badge)
                if created:
                    return [pioneer_badge.id]

        return []


    # ----------------------------------------------------------------------------- #
    # Check Photographer badge (upload 25 photos).                                  #
    #                                                                               #
    # Triggered by ReviewPhoto or LocationPhoto creation signal.                    #
    # Awards Photographer badge when user uploads 25+ photos total                  #
    # (review photos + location gallery photos).                                    #
    #                                                                               #
    # Args:     user (User): The user to check Photographer badge for               #
    # Returns:  list: Badge IDs of newly awarded badges (empty or [photographer])   #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def check_photographer_badge(user):
        if is_system_user(user):
            return []

        from starview_app.models import ReviewPhoto, LocationPhoto

        # Count total photos uploaded by user (review photos + location photos)
        review_photo_count = ReviewPhoto.objects.filter(review__user=user).count()
        location_photo_count = LocationPhoto.objects.filter(uploaded_by=user).count()
        total_photo_count = review_photo_count + location_photo_count

        # Check if user qualifies for Photographer badge (25+ photos)
        if total_photo_count >= 25:
            # Use cached badge (no database query after first call)
            photographer_badge = get_badge_by_slug('photographer')

            if photographer_badge:
                created = BadgeService.award_badge(user, photographer_badge)
                if created:
                    return [photographer_badge.id]

        return []


    # ----------------------------------------------------------------------------- #
    # Award a badge to a user if not already earned.                                #
    #                                                                               #
    # Creates a UserBadge record linking the user to the badge.                     #
    # Uses get_or_create to prevent duplicate awards.                               #
    #                                                                               #
    # CACHE INVALIDATION: Invalidates badge progress cache when badge is awarded.   #
    #                                                                               #
    # Args:     user (User): The user to award the badge to                         #
    #           badge (Badge): The badge to award                                   #
    # Returns:  bool: True if newly awarded, False if already had it                #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def award_badge(user, badge):
        user_badge, created = UserBadge.objects.get_or_create(
            user=user,
            badge=badge
        )

        # Invalidate cache if badge was newly awarded
        if created:
            BadgeService.invalidate_badge_progress_cache(user)

        return created


    # ----------------------------------------------------------------------------- #
    # Invalidate badge progress cache for a user.                                   #
    #                                                                               #
    # Called when user's badge state changes (earns/loses badge, activity changes). #
    # Ensures cache always reflects current badge progress.                         #
    #                                                                               #
    # Invalidation triggers:                                                        #
    # - Badge awarded (award_badge)                                                 #
    # - Location created (contribution badges may be awarded)                       #
    # - Review created (review badges may be awarded)                               #
    # - Vote received (review badges may be awarded)                                #
    # - Follower gained (community badges may be awarded)                           #
    # - Comment created (community badges may be awarded)                           #
    # - LocationVisit created (exploration badges may be awarded)                   #
    #                                                                               #
    # Args:     user (User): The user whose cache should be invalidated             #
    # Returns:  bool: True if cache was deleted, False if no cache existed          #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def invalidate_badge_progress_cache(user):
        cache_key = f'badge_progress:{user.id}'
        return cache.delete(cache_key)


    # ----------------------------------------------------------------------------- #
    # Get user's badge progress for display (on-demand calculation).                #
    #                                                                               #
    # Returns categorized badges: earned, in_progress, locked.                      #
    # Progress is calculated from source data, not stored.                          #
    #                                                                               #
    # NEXT TIER LOGIC: Only shows the nearest unearned badge as "in-progress"       #
    # within each badge progression (e.g., if you have 1 follower, only            #
    # "Connector" shows as in-progress, not "Influencer" and "Community Leader").   #
    # This reduces UI clutter and focuses users on achievable goals.                #
    #                                                                               #
    # OPTIMIZATION #1: Uses select_related() to eliminate N+1 query anti-pattern.   #
    # BEFORE: 1 query for badge IDs + N queries for UserBadge objects = N+1         #
    # AFTER: 2 queries total (earned badges with related data + all badges)         #
    #                                                                               #
    # OPTIMIZATION #2: Redis cache with 5-minute TTL (Medium Issue #7).             #
    # BEFORE: 7 queries on every call (stats + UserBadge + all badges)              #
    # AFTER: 0 queries on cache hit, 7 queries on cache miss                        #
    # Speedup: 10-60x faster for repeated requests (cache hits)                     #
    #                                                                               #
    # Cache invalidation: Triggered by badge-related user actions via signals.      #
    #                                                                               #
    # Args:     user (User): The user to get badge progress for                     #
    # Returns:  dict: {earned: [...], in_progress: [...], locked: [...]}            #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def get_user_badge_progress(user):
        # Try cache first (Medium Issue #7 optimization)
        cache_key = f'badge_progress:{user.id}'
        cached_result = cache.get(cache_key)

        if cached_result is not None:
            # Cache hit - return cached data (0 queries)
            return cached_result

        # Cache miss - calculate from scratch (7 queries)
        # Get user stats (efficient single queries)
        from starview_app.models import ReviewPhoto, LocationPhoto

        stats = {
            'location_visits': LocationVisit.objects.filter(user=user).count(),
            'locations_added': Location.objects.filter(added_by=user).count(),
            'reviews_written': Review.objects.filter(user=user).count(),
            'follower_count': Follow.objects.filter(following=user).count(),
            'comment_count': ReviewComment.objects.filter(user=user).count(),
            'photo_count': (
                ReviewPhoto.objects.filter(review__user=user).count() +
                LocationPhoto.objects.filter(uploaded_by=user).count()
            ),
        }

        # Calculate profile completion progress (for Mission Ready badge)
        # Uses centralized PROFILE_COMPLETION_REQUIREMENTS config
        profile_status = BadgeService.get_profile_completion_status(user)
        stats['profile_fields_complete'] = profile_status['completed']
        stats['total_profile_fields'] = profile_status['total']

        # OPTIMIZATION: Use select_related to fetch badge data in single query
        # This eliminates N+1 pattern by fetching all UserBadge records with
        # their related Badge data in one query with a JOIN
        earned_badges = UserBadge.objects.filter(user=user).select_related('badge')

        # Create lookup map for O(1) access (no additional queries)
        earned_badge_map = {ub.badge_id: ub for ub in earned_badges}

        # Get all badges ordered by category, tier, and display_order (1 query)
        # This ensures badges display in logical progression (tier 1, 2, 3, etc.)
        all_badges = Badge.objects.all().order_by('category', 'tier', 'display_order', 'criteria_type', 'criteria_value')

        result = {
            'earned': [],
            'in_progress': [],
            'locked': []
        }

        # Group badges by (category, criteria_type) to find "next tier" logic
        badge_groups = {}
        for badge in all_badges:
            key = (badge.category, badge.criteria_type)
            if key not in badge_groups:
                badge_groups[key] = []
            badge_groups[key].append(badge)

        # Process each group to determine states
        for (category, criteria_type), badges in badge_groups.items():
            next_tier_found = False  # Track if we've found the "next tier" to unlock

            for badge in badges:
                if badge.id in earned_badge_map:
                    # Badge earned
                    user_badge = earned_badge_map[badge.id]
                    result['earned'].append({
                        'badge': badge,
                        'earned_at': user_badge.earned_at,
                    })
                else:
                    # Calculate progress
                    progress = BadgeService._calculate_progress(user, badge, stats)

                    # For PROFILE_COMPLETE, use dynamic total from requirements config
                    # This ensures adding new requirements doesn't require DB updates
                    if badge.criteria_type == 'PROFILE_COMPLETE':
                        criteria_value = stats['total_profile_fields']
                    else:
                        criteria_value = badge.criteria_value

                    if progress > 0 and progress < criteria_value and not next_tier_found:
                        # In progress - only the FIRST unearned badge with progress
                        result['in_progress'].append({
                            'badge': badge,
                            'current_progress': progress,
                            'criteria_value': criteria_value,
                            'percentage': int((progress / criteria_value) * 100)
                        })
                        next_tier_found = True  # Mark that we found the next tier
                    else:
                        # Locked (0 progress, or higher tier after in-progress badge)
                        result['locked'].append({'badge': badge})

        # Cache result for 5 minutes (300 seconds)
        # This balances freshness (user sees updates within 5 min) with performance
        cache.set(cache_key, result, 300)

        return result


    # ----------------------------------------------------------------------------- #
    # Calculate current progress for a badge from cached stats.                     #
    #                                                                               #
    # Maps badge criteria type to the corresponding stat value.                     #
    #                                                                               #
    # Args:     user (User): The user to calculate progress for                     #
    #           badge (Badge): The badge to calculate progress for                  #
    #           stats (dict): Pre-calculated user stats                             #
    # Returns:  int: Current progress toward badge                                  #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def _calculate_progress(user, badge, stats):
        criteria_map = {
            'LOCATION_VISITS': stats['location_visits'],
            'LOCATIONS_ADDED': stats['locations_added'],
            'REVIEWS_WRITTEN': stats['reviews_written'],
            'FOLLOWER_COUNT': stats['follower_count'],
            'COMMENTS_WRITTEN': stats['comment_count'],
        }

        # Handle PROFILE_COMPLETE specially (count completed fields out of total)
        if badge.criteria_type == 'PROFILE_COMPLETE':
            return stats.get('profile_fields_complete', 0)

        # Handle SPECIAL_CONDITION badges by slug
        if badge.criteria_type == 'SPECIAL_CONDITION':
            if badge.slug == 'photographer':
                return stats.get('photo_count', 0)
            # Pioneer badge has no progress (you either qualify or don't)
            return 0

        return criteria_map.get(badge.criteria_type, 0)


    # ----------------------------------------------------------------------------- #
    # Detect suspicious badge activity (passive monitoring).                        #
    #                                                                               #
    # Flags users who check in to 10+ locations within 1 hour.                      #
    # Logs to AuditLog for admin review without blocking the user.                  #
    #                                                                               #
    # Args:     user (User): The user to check for suspicious activity              #
    # Returns:  bool: True if suspicious activity detected, False otherwise         #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def detect_suspicious_activity(user):
        # Check for rapid check-ins (10+ in 1 hour)
        recent_visits = LocationVisit.objects.filter(
            user=user,
            visited_at__gte=timezone.now() - timedelta(hours=1)
        ).count()

        if recent_visits >= 10:
            from starview_app.utils.audit_logger import log_auth_event
            log_auth_event(
                user=user,
                event_type='suspicious_badge_activity',
                success=False,
                details={'rapid_check_ins': recent_visits, 'timeframe': '1_hour'}
            )
            return True

        return False


    # ----------------------------------------------------------------------------------------------------- #
    #                                                                                                       #
    #                                   BADGE REVOCATION METHODS                                            #
    #                                                                                                       #
    # These methods check if a user still qualifies for badges they have earned after content deletion.     #
    # If they no longer meet the criteria, the badge is revoked (UserBadge record deleted).                 #
    # ----------------------------------------------------------------------------------------------------- #

    # ----------------------------------------------------------------------------- #
    # Revoke exploration badges if user no longer qualifies.                        #
    #                                                                               #
    # Called when LocationVisit is deleted.                                         #
    # Removes badges user no longer qualifies for based on current visit count.     #
    #                                                                               #
    # Args:     user (User): The user to check                                      #
    # Returns:  list: Badge IDs that were revoked                                   #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def revoke_exploration_badges_if_needed(user):
        visit_count = LocationVisit.objects.filter(user=user).count()

        # Get exploration badges user currently has
        user_exploration_badges = UserBadge.objects.filter(
            user=user,
            badge__category='EXPLORATION',
            badge__criteria_type='LOCATION_VISITS'
        ).select_related('badge')

        revoked = []
        for user_badge in user_exploration_badges:
            # If user no longer meets criteria, revoke badge
            if visit_count < user_badge.badge.criteria_value:
                badge_id = user_badge.badge.id
                user_badge.delete()
                revoked.append(badge_id)

        return revoked


    # ----------------------------------------------------------------------------- #
    # Revoke contribution badges if user no longer qualifies.                       #
    #                                                                               #
    # Called when Location is deleted.                                              #
    # Removes badges user no longer qualifies for based on current location count.  #
    #                                                                               #
    # Args:     user (User): The user to check                                      #
    # Returns:  list: Badge IDs that were revoked                                   #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def revoke_contribution_badges_if_needed(user):
        location_count = Location.objects.filter(added_by=user).count()

        # Get contribution badges user currently has
        user_contribution_badges = UserBadge.objects.filter(
            user=user,
            badge__category='CONTRIBUTION',
            badge__criteria_type='LOCATIONS_ADDED'
        ).select_related('badge')

        revoked = []
        for user_badge in user_contribution_badges:
            # If user no longer meets criteria, revoke badge
            if location_count < user_badge.badge.criteria_value:
                badge_id = user_badge.badge.id
                user_badge.delete()
                revoked.append(badge_id)

        return revoked


    # ----------------------------------------------------------------------------- #
    # Revoke quality badges if user no longer qualifies.                            #
    #                                                                               #
    # Called when Review is deleted (location's average rating may have changed).   #
    # Removes badges user no longer qualifies for based on well-rated locations.    #
    #                                                                               #
    # Args:     user (User): The user to check                                      #
    # Returns:  list: Badge IDs that were revoked                                   #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def revoke_quality_badges_if_needed(user):
        # Count locations added by user with average rating >= 4.0
        quality_location_count = Location.objects.filter(
            added_by=user,
            average_rating__gte=4.0
        ).count()

        # Get quality badges user currently has
        user_quality_badges = UserBadge.objects.filter(
            user=user,
            badge__category='QUALITY',
            badge__criteria_type='LOCATION_RATING'
        ).select_related('badge')

        revoked = []
        for user_badge in user_quality_badges:
            # If user no longer meets criteria, revoke badge
            if quality_location_count < user_badge.badge.criteria_value:
                badge_id = user_badge.badge.id
                user_badge.delete()
                revoked.append(badge_id)

        return revoked


    # ----------------------------------------------------------------------------- #
    # Revoke review badges if user no longer qualifies.                             #
    #                                                                               #
    # Called when Review or Vote is deleted.                                        #
    # Removes badges user no longer qualifies for based on current stats.           #
    #                                                                               #
    # OPTIMIZATION: Uses aggregate() with conditional Count() to get upvote_count   #
    # and total_votes in a single query (same optimization as check_review_badges). #
    #                                                                               #
    # Args:     user (User): The user to check                                      #
    # Returns:  list: Badge IDs that were revoked                                   #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def revoke_review_badges_if_needed(user):
        from django.contrib.contenttypes.models import ContentType
        from django.db.models import Count, Q
        from starview_app.models import Vote

        # Get user's reviews
        user_reviews = Review.objects.filter(user=user)
        review_count = user_reviews.count()

        # Get ContentType for Review model
        review_ct = ContentType.objects.get_for_model(Review)

        # OPTIMIZATION: Get vote counts in a single query using aggregate()
        # BEFORE: Two separate queries (upvote_count + total_votes)
        # AFTER: Single query with conditional aggregation
        vote_stats = Vote.objects.filter(
            content_type=review_ct,
            object_id__in=user_reviews.values('id')
        ).aggregate(
            upvote_count=Count('id', filter=Q(is_upvote=True)),
            total_votes=Count('id')
        )

        # Extract counts from aggregated results
        upvote_count = vote_stats['upvote_count'] or 0
        total_votes = vote_stats['total_votes'] or 0

        # Calculate helpful ratio (upvotes / total_votes * 100)
        helpful_ratio = (upvote_count / total_votes * 100) if total_votes > 0 else 0

        # Get review badges user currently has
        user_review_badges = UserBadge.objects.filter(
            user=user,
            badge__category='REVIEW'
        ).select_related('badge')

        revoked = []
        for user_badge in user_review_badges:
            should_revoke = False

            if user_badge.badge.criteria_type == 'REVIEWS_WRITTEN':
                # Check if user still meets review count threshold
                should_revoke = review_count < user_badge.badge.criteria_value

            elif user_badge.badge.criteria_type == 'UPVOTES_RECEIVED':
                # Check if user still meets upvote count threshold
                should_revoke = upvote_count < user_badge.badge.criteria_value

            elif user_badge.badge.criteria_type == 'HELPFUL_RATIO':
                # Check if user still meets minimum reviews + helpful ratio
                min_reviews = user_badge.badge.criteria_value
                min_ratio = user_badge.badge.criteria_secondary

                should_revoke = not (
                    review_count >= min_reviews and
                    helpful_ratio >= min_ratio
                )

            if should_revoke:
                badge_id = user_badge.badge.id
                user_badge.delete()
                revoked.append(badge_id)

        return revoked


    # ----------------------------------------------------------------------------- #
    # Revoke community badges if user no longer qualifies.                          #
    #                                                                               #
    # Called when Follow or ReviewComment is deleted.                               #
    # Removes badges user no longer qualifies for based on follower/comment count.  #
    #                                                                               #
    # Args:     user (User): The user to check                                      #
    # Returns:  list: Badge IDs that were revoked                                   #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def revoke_community_badges_if_needed(user):
        follower_count = Follow.objects.filter(following=user).count()

        # Count comments on OTHER users' reviews only (exclude comments on own reviews)
        comment_count = ReviewComment.objects.filter(user=user).exclude(
            review__user=user
        ).count()

        # Get community badges user currently has
        user_community_badges = UserBadge.objects.filter(
            user=user,
            badge__category='COMMUNITY'
        ).select_related('badge')

        revoked = []
        for user_badge in user_community_badges:
            should_revoke = False

            if user_badge.badge.criteria_type == 'FOLLOWER_COUNT':
                should_revoke = follower_count < user_badge.badge.criteria_value

            elif user_badge.badge.criteria_type == 'COMMENTS_WRITTEN':
                should_revoke = comment_count < user_badge.badge.criteria_value

            if should_revoke:
                badge_id = user_badge.badge.id
                user_badge.delete()
                revoked.append(badge_id)

        return revoked


    # ----------------------------------------------------------------------------- #
    # Revoke Photographer badge if user no longer qualifies.                        #
    #                                                                               #
    # Called when ReviewPhoto or LocationPhoto is deleted.                          #
    # Removes Photographer badge if user now has fewer than 25 total photos.        #
    #                                                                               #
    # Args:     user (User): The user to check                                      #
    # Returns:  list: Badge IDs that were revoked (empty or [photographer_id])      #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def revoke_photographer_badge_if_needed(user):
        from starview_app.models import ReviewPhoto, LocationPhoto

        # Count total photos uploaded by user (review photos + location photos)
        review_photo_count = ReviewPhoto.objects.filter(review__user=user).count()
        location_photo_count = LocationPhoto.objects.filter(uploaded_by=user).count()
        total_photo_count = review_photo_count + location_photo_count

        # Check if user has Photographer badge (cached - no database query after first call)
        photographer_badge = get_badge_by_slug('photographer')

        if photographer_badge:
            user_badge = UserBadge.objects.filter(
                user=user,
                badge=photographer_badge
            ).first()

            # If user has badge but no longer qualifies (< 25 photos), revoke it
            if user_badge and total_photo_count < 25:
                user_badge.delete()
                return [photographer_badge.id]

        return []


    # ----------------------------------------------------------------------------- #
    # Profile completion requirements configuration.                                #
    #                                                                               #
    # SINGLE SOURCE OF TRUTH for what fields are required for profile completion.   #
    # Add new requirements here - badge logic automatically adapts.                 #
    #                                                                               #
    # Each entry is a tuple: (field_name, check_function)                           #
    # - field_name: Human-readable name for the requirement                         #
    # - check_function: Lambda that takes profile and returns True if complete      #
    # ----------------------------------------------------------------------------- #
    PROFILE_COMPLETION_REQUIREMENTS = [
        ('bio', lambda p: bool(p.bio)),
        ('profile_picture', lambda p: bool(p.profile_picture) and hasattr(p.profile_picture, 'url')),
        # Add new requirements here, e.g.:
        # ('website', lambda p: bool(p.website)),
        # ('social_connected', lambda p: p.has_connected_social),
    ]

    # ----------------------------------------------------------------------------- #
    # Get profile completion status for a user.                                     #
    #                                                                               #
    # Returns count of completed fields and total required fields.                  #
    # Used by badge check and can be exposed via API for frontend progress display. #
    #                                                                               #
    # Args:     user (User): The user to check                                      #
    # Returns:  dict: {'completed': int, 'total': int, 'is_complete': bool}         #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def get_profile_completion_status(user):
        profile = user.userprofile
        requirements = BadgeService.PROFILE_COMPLETION_REQUIREMENTS

        # Build detailed status for each requirement
        items = []
        for field_name, check in requirements:
            is_complete = check(profile)
            items.append({
                'field': field_name,
                'complete': is_complete
            })

        completed = sum(1 for item in items if item['complete'])
        total = len(requirements)

        return {
            'completed': completed,
            'total': total,
            'is_complete': completed == total,
            'items': items  # Detailed breakdown of each requirement
        }

    # ----------------------------------------------------------------------------- #
    # Check/update Mission Ready badge (profile completion).                        #
    #                                                                               #
    # REVOCABLE BADGE: Awards when profile is complete, revokes when incomplete.    #
    #                                                                               #
    # Triggered by profile updates (location, bio, profile picture).                #
    # Uses PROFILE_COMPLETION_REQUIREMENTS config - add new fields there.           #
    #                                                                               #
    # Args:     user (User): The user to check profile completion for               #
    # Returns:  dict: {'awarded': bool, 'revoked': bool, 'badge_id': int|None}      #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def check_profile_complete_badge(user):
        if is_system_user(user):
            return {'awarded': False, 'revoked': False, 'badge_id': None}

        # Get the Mission Ready badge (cached - no database query after first call)
        mission_ready_badge = get_badge_by_slug('mission-ready')

        if not mission_ready_badge:
            return {'awarded': False, 'revoked': False, 'badge_id': None}

        # Check profile completion using centralized config
        status = BadgeService.get_profile_completion_status(user)
        is_complete = status['is_complete']

        # Check if user currently has the badge
        user_badge = UserBadge.objects.filter(
            user=user,
            badge=mission_ready_badge
        ).first()

        result = {'awarded': False, 'revoked': False, 'badge_id': mission_ready_badge.id}

        if is_complete and not user_badge:
            # Profile complete and user doesn't have badge - award it
            BadgeService.award_badge(user, mission_ready_badge)
            result['awarded'] = True

        elif not is_complete and user_badge:
            # Profile incomplete and user has badge - revoke it
            user_badge.delete()
            BadgeService.invalidate_badge_progress_cache(user)
            result['revoked'] = True

        return result
