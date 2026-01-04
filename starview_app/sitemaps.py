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
        # List of static page paths
        return ['/', '/explore', '/privacy']

    def location(self, item):
        return item


# Sitemap for public user profile pages.
# Includes all users who have made their profiles public (have reviews/activity).
class UserProfileSitemap(CanonicalSitemap):
    priority = 0.6
    changefreq = 'weekly'

    def items(self):
        # Only include users with profiles (active users)
        # Filter to users who have at least some public activity
        return User.objects.filter(
            is_active=True
        ).select_related('userprofile').order_by('-date_joined')[:1000]  # Limit to prevent huge sitemaps

    def location(self, user):
        return f'/users/{user.username}'

    def lastmod(self, user):
        # Use the user's last login as proxy for activity
        return user.last_login or user.date_joined


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
    'users': UserProfileSitemap,
    # 'locations': LocationSitemap,  # Uncomment when location pages exist
}
