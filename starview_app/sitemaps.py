# ----------------------------------------------------------------------------- #
# Sitemap configuration for search engine optimization.                         #
#                                                                               #
# Django's sitemap framework generates XML sitemaps that help search engines    #
# discover and index all pages on the site. This improves SEO and helps with    #
# Google AI Overviews visibility.                                               #
#                                                                               #
# SECURITY NOTE:                                                                #
# - Sitemaps ONLY expose URLs and modification dates - NO user data             #
# - All URLs listed are already publicly accessible pages                       #
# - Private data (email, coordinates, passwords) is NEVER exposed               #
# - User profiles use PublicUserSerializer which excludes sensitive fields      #
#                                                                               #
# Sitemaps included:                                                            #
# - StaticViewSitemap: Homepage and other static pages                          #
# - UserProfileSitemap: Public user profile pages                               #
#                                                                               #
# Future additions (when pages exist):                                          #
# - LocationSitemap: Individual stargazing location pages                       #
# - GuideSitemap: Stargazing guides and articles                                #
# ----------------------------------------------------------------------------- #

from django.contrib.sitemaps import Sitemap
from django.contrib.auth import get_user_model

User = get_user_model()


# Base sitemap class that forces www.starview.app as the canonical domain.
# This ensures all sitemap URLs use the correct canonical domain regardless
# of what's configured in django.contrib.sites.
class CanonicalSitemap(Sitemap):
    protocol = 'https'

    def get_urls(self, site=None, **kwargs):
        # Override to use canonical domain instead of Sites framework
        from django.contrib.sites.models import Site
        canonical_site = Site(domain='www.starview.app', name='Starview')
        return super().get_urls(site=canonical_site, **kwargs)


# Sitemap for static pages (Home, About, etc.)
# These pages don't change frequently and are high priority:
class StaticViewSitemap(CanonicalSitemap):
    priority = 1.0
    changefreq = 'weekly'

    def items(self):
        return ['/', '/explore', '/sky', '/tonight']

    def location(self, item):
        return item


# Sitemap for legal pages (Terms, Privacy)
# Lower priority since they're informational, not primary content:
class LegalPageSitemap(CanonicalSitemap):
    priority = 0.3
    changefreq = 'monthly'

    def items(self):
        return ['/terms', '/privacy']

    def location(self, item):
        return item


# Sitemap for public user profile pages.
# Only includes users with actual content/activity to avoid soft 404 issues.
# Google treats empty profiles as soft 404s because they lack substantive content.
# System accounts are always excluded from the sitemap.
class UserProfileSitemap(CanonicalSitemap):
    priority = 0.6
    changefreq = 'weekly'

    def items(self):
        from django.db.models import Q, Count
        # Include users who show any sign of activity:
        # - has 1+ reviews
        # - has a bio
        # - has 1+ followers
        # - is following 1+ people
        # - has pinned badges
        # - is verified
        # This prevents Google from flagging empty profiles as soft 404s
        # while still indexing engaged users without reviews yet
        return User.objects.filter(
            is_active=True,
            userprofile__is_system_account=False
        ).annotate(
            review_count=Count('location_reviews', distinct=True),
            follower_count=Count('followers', distinct=True),
            following_count=Count('following', distinct=True)
        ).filter(
            Q(review_count__gt=0) |
            Q(userprofile__bio__gt='') |
            Q(follower_count__gt=0) |
            Q(following_count__gt=0) |
            Q(userprofile__pinned_badge_ids__len__gt=0) |
            Q(userprofile__is_verified=True)
        ).select_related('userprofile').order_by('-date_joined')[:1000]

    def location(self, user):
        return f'/users/{user.username}'

    def lastmod(self, user):
        # Use most recent activity date (review or profile update)
        from starview_app.models.model_review import Review
        latest_review = Review.objects.filter(user=user).order_by('-created_at').first()
        if latest_review:
            return latest_review.created_at
        # Fall back to profile update time or join date
        if hasattr(user, 'userprofile') and user.userprofile.updated_at:
            return user.userprofile.updated_at
        return user.date_joined


# Future: Add when location detail pages exist
# class LocationSitemap(Sitemap):
#     """
#     Sitemap for stargazing location pages.
#     These are the main content pages and should be high priority.
#     """
#     priority = 0.8
#     changefreq = 'weekly'
#     protocol = 'https'
#
#     def items(self):
#         from starview_app.models import Location
#         return Location.objects.filter(is_active=True).order_by('-created_at')
#
#     def location(self, location):
#         return f'/locations/{location.id}'
#
#     def lastmod(self, location):
#         return location.updated_at


# Dictionary of all sitemaps for use in urls.py
sitemaps = {
    'static': StaticViewSitemap,
    'legal': LegalPageSitemap,
    'users': UserProfileSitemap,
    # 'locations': LocationSitemap,  # Uncomment when location pages exist
}
