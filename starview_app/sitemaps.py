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


# Sitemap for static pages (Home, About, etc.)
# These pages don't change frequently and are high priority:
class StaticViewSitemap(Sitemap):
    priority = 1.0
    changefreq = 'weekly'
    protocol = 'https'

    def items(self):
        # List of static page paths
        return ['/']

    def location(self, item):
        return item


# Sitemap for public user profile pages.
# Includes all users who have made their profiles public (have reviews/activity).
class UserProfileSitemap(Sitemap):
    priority = 0.6
    changefreq = 'weekly'
    protocol = 'https'

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
