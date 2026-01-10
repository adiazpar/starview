# ----------------------------------------------------------------------------------------------------- #
# This views.py file contains project-level views for serving the React frontend:                       #
#                                                                                                       #
# Purpose:                                                                                              #
# Provides infrastructure-level views that enable the React + Django architecture. These views are not  #
# specific to the stars_app business logic, but rather handle the integration layer between the React   #
# frontend and Django backend. This file lives at the project level because it serves the entire        #
# application, not just one app.                                                                        #
#                                                                                                       #
# Why This Exists:                                                                                      #
# React Router handles client-side routing, but when users refresh the page or directly navigate to a   #
# React route (e.g., /map or /location/123), the browser sends that request to Django. Without this     #
# catch-all view, Django would return a 404. This view serves the React index.html for all non-API      #
# routes, allowing React Router to take over and render the correct component.                          #
#                                                                                                       #
# Architecture:                                                                                         #
# - Development: Vite dev server runs on :5173 with hot reload, this view rarely used                   #
# - Production: Django serves React build from starview_frontend/dist/, this view handles all routes  #
# - URLs: Configured as catch-all pattern in django_project/urls.py (must be last in urlpatterns)       #
# - Templates: Looks for index.html in starview_frontend/dist/ (configured in settings.TEMPLATES)       #
# ----------------------------------------------------------------------------------------------------- #

# Django imports:
from django.views.generic import TemplateView
from django.http import HttpResponse
from django.conf import settings
import os
import re


# Valid React routes - must match App.jsx routes
# Update this list when adding new routes to the React app
VALID_REACT_ROUTES = [
    r'^$',                                          # Home: /
    r'^login/?$',                                   # Login: /login
    r'^register/?$',                                # Register: /register
    r'^verify-email/?$',                            # Verify email: /verify-email
    r'^email-verified/?$',                          # Email verified: /email-verified
    r'^email-confirm-error/?$',                     # Email confirm error: /email-confirm-error
    r'^social-account-exists/?$',                   # Social account exists: /social-account-exists
    r'^password-reset/?$',                          # Password reset request: /password-reset
    r'^password-reset-confirm/[^/]+/[^/]+/?$',      # Password reset confirm: /password-reset-confirm/:uidb64/:token
    r'^profile/?$',                                 # Profile: /profile
    r'^users/[^/]+/?$',                             # Public profile: /users/:username
    r'^explore/?$',                                 # Explore: /explore
    r'^privacy/?$',                                 # Privacy policy: /privacy
    r'^terms/?$',                                   # Terms of service: /terms
]


def is_valid_react_route(path):
    """Check if a path matches a valid React route."""
    # Remove leading slash for consistent matching
    clean_path = path.lstrip('/')
    for pattern in VALID_REACT_ROUTES:
        if re.match(pattern, clean_path):
            return True
    return False


# ----------------------------------------------------------------------------- #
# Catch-all view that serves React's index.html for client-side routing.        #
#                                                                               #
# This enables React Router to handle navigation by serving the same HTML       #
# file for all non-API routes. React then renders the appropriate component     #
# based on the URL path.                                                        #
#                                                                               #
# SEO behavior:                                                                 #
# - Valid routes return HTTP 200 with index.html                                #
# - Invalid routes return HTTP 404 with index.html (React shows 404 page)       #
# This ensures search engines properly understand which pages exist.            #
#                                                                               #
# Development workflow:                                                         #
# - Run `npm run dev` in starview_frontend/ directory                           #
# - Access React at http://localhost:5173 (hot reload enabled)                  #
# - API calls proxy to Django at :8000 via Vite config                          #
#                                                                               #
# Production workflow:                                                          #
# - Run `npm run build` to create optimized bundle in starview_frontend/dist/   #
# - Django serves everything from :8000                                         #
# - This view returns index.html for all non-API routes                         #
# ----------------------------------------------------------------------------- #
class ReactAppView(TemplateView):

    def get_template_names(self):
        # Production: always serve the built React app
        if not settings.DEBUG:
            return ['index.html']

        # Development: check if build exists (e.g., testing production mode locally)
        build_path = os.path.join(settings.BASE_DIR, 'starview_frontend', 'dist', 'index.html')
        if os.path.exists(build_path):
            return ['index.html']

        # Development fallback: React build doesn't exist
        # User should run `npm run dev` instead of accessing via Django
        return ['dev_placeholder.html']

    def render_to_response(self, context, **response_kwargs):
        """Override to return 404 status for invalid routes."""
        response = super().render_to_response(context, **response_kwargs)

        # Check if this is a valid React route
        if not is_valid_react_route(self.request.path):
            response.status_code = 404

        return response


# ----------------------------------------------------------------------------- #
# robots.txt view for controlling search engine and AI crawler access.          #
#                                                                               #
# Environment-aware behavior:                                                   #
# - Production (starview.app): Allow all crawlers for maximum visibility        #
# - Staging/Dev: Block all crawlers to prevent duplicate content issues         #
#                                                                               #
# This prevents staging environments from being indexed by Google, which would  #
# cause SEO problems (duplicate content, leaked preview features).              #
# ----------------------------------------------------------------------------- #
def robots_txt(request):
    # Check if this is the production domain
    host = request.get_host().split(':')[0]  # Remove port if present
    is_production = host in ['starview.app', 'www.starview.app']

    if is_production:
        # Production: Allow all crawlers for SEO and AI visibility
        content = """# Starview robots.txt
# https://www.starview.app

# Allow all crawlers (Googlebot, Bingbot, GPTBot, ClaudeBot, etc.)
User-agent: *
Allow: /

# Block admin and internal endpoints
Disallow: /admin/
Disallow: /api/
Disallow: /accounts/

# Block auth and utility pages (no search value)
Disallow: /login
Disallow: /signup
Disallow: /forgot-password
Disallow: /reset-password
Disallow: /verify-email
Disallow: /account/

# Sitemap (using canonical www domain)
Sitemap: https://www.starview.app/sitemap.xml
"""
    else:
        # Staging/Development: Block all crawlers
        content = f"""# Starview robots.txt (non-production)
# Host: {host}

# Block all crawlers on staging/development
User-agent: *
Disallow: /
"""

    return HttpResponse(content, content_type="text/plain")
