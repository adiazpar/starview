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
from django.http import HttpResponse, FileResponse, Http404
from django.conf import settings
import os
import re
import logging

logger = logging.getLogger(__name__)


# ----------------------------------------------------------------------------- #
# SEO Meta Tags - Server-side injection for social media crawlers              #
#                                                                               #
# Social media crawlers (Facebook, Twitter, Discord) don't execute JavaScript, #
# so they can't see React's client-side meta tag updates. This dictionary      #
# defines meta tags that Django injects server-side before serving index.html. #
#                                                                               #
# IMPORTANT: Keep these in sync with useSEO() calls in React page components!  #
# ----------------------------------------------------------------------------- #
SITE_URL = 'https://www.starview.app'
DEFAULT_TITLE = 'Starview - Stargazing Location Reviews'
DEFAULT_DESCRIPTION = 'Discover and share exceptional stargazing locations'

# Route-specific SEO meta tags (path -> {title, description})
# Add new routes here when creating new pages
SEO_META_TAGS = {
    '/': {
        'title': DEFAULT_TITLE,
        'description': DEFAULT_DESCRIPTION,
    },
    '/explore': {
        'title': 'Explore Stargazing Locations | Starview',
        'description': 'Discover the best stargazing spots near you. Browse user-reviewed dark sky locations with light pollution ratings, accessibility info, and photos.',
    },
    '/sky': {
        'title': 'Sky Conditions | Starview',
        'description': 'Plan your stargazing sessions with real-time sky conditions, moon phases, weather forecasts, and light pollution data.',
    },
    '/tonight': {
        'title': "Tonight's Sky Conditions | Starview",
        'description': 'Should you go stargazing tonight? Check real-time sky conditions including moon phase, weather, and light pollution at your location.',
    },
    '/bortle': {
        'title': 'Understanding the Bortle Scale | Starview',
        'description': 'Learn about the Bortle Dark-Sky Scale, a nine-level numeric scale that measures night sky brightness. Understand what you can see at each level and find darker skies.',
    },
    '/moon': {
        'title': 'Understanding Moon Phases | Starview',
        'description': "Learn how the Moon's 8 phases affect stargazing conditions. Plan your observing sessions around the lunar cycle for the best views of the night sky.",
    },
    '/weather': {
        'title': 'Weather for Stargazing | Starview',
        'description': 'Learn how weather conditions affect stargazing. Understand cloud cover, humidity, wind, and temperature impacts on your astronomical observations.',
    },
    '/privacy': {
        'title': 'Privacy Policy | Starview',
        'description': 'Learn how Starview collects, uses, and protects your data. Our privacy policy covers account information, location data, cookies, and your rights.',
    },
    '/terms': {
        'title': 'Terms of Service | Starview',
        'description': "Read Starview's Terms of Service covering eligibility, content licensing, acceptable use policies, and DMCA procedures for our stargazing community.",
    },
    '/accessibility': {
        'title': 'Accessibility Statement | Starview',
        'description': "Learn about Starview's commitment to digital accessibility, our WCAG 2.1 conformance goals, and how to report accessibility issues.",
    },
    '/ccpa': {
        'title': 'California Privacy Rights | Starview',
        'description': 'Learn about your California privacy rights under CCPA/CPRA, including the right to know, delete, and opt-out. Starview does not sell your personal information.',
    },
}


def get_location_meta(location_id):
    """
    Fetch location from database and build SEO meta tags.
    Returns None if location not found, allowing fallback to defaults.
    """
    try:
        from starview_app.models import Location

        location = Location.objects.select_related('added_by').prefetch_related(
            'photos', 'reviews__photos'
        ).get(pk=location_id)

        # Build title
        title = f"{location.name} | Starview"

        # Build description with available data
        desc_parts = [f"Explore {location.name}"]

        if location.location_type:
            type_display = location.get_location_type_display()
            desc_parts[0] = f"Explore {location.name} - a {type_display.lower()}"

        if location.administrative_area:
            desc_parts.append(f"in {location.administrative_area}")
            if location.country and location.country != location.administrative_area:
                desc_parts[-1] += f", {location.country}"
        elif location.country:
            desc_parts.append(f"in {location.country}")

        if location.bortle_class:
            desc_parts.append(f"Bortle class {location.bortle_class}")

        if location.average_rating and float(location.average_rating) > 0:
            desc_parts.append(f"rated {float(location.average_rating):.1f}/5")

        description = ". ".join(desc_parts) + "."

        # Get hero image URL (first location photo, or first review photo)
        image_url = None
        location_photos = location.photos.order_by('order', 'created_at')[:1]
        if location_photos:
            image_url = location_photos[0].image.url
        else:
            # Fall back to review photos
            for review in location.reviews.prefetch_related('photos').order_by('-created_at')[:5]:
                review_photos = review.photos.order_by('order')[:1]
                if review_photos:
                    image_url = review_photos[0].image.url
                    break

        return {
            'title': title,
            'description': description,
            'image': image_url,
        }

    except Exception as e:
        logger.warning(f"Failed to fetch location {location_id} for SEO: {e}")
        return None


def get_seo_meta_for_path(path):
    """Get SEO meta tags for a given path, with fallback to defaults."""
    # Normalize path (remove trailing slash except for root)
    clean_path = '/' + path.strip('/')
    if clean_path != '/':
        clean_path = clean_path.rstrip('/')

    # Check for dynamic location routes: /locations/{id}
    location_match = re.match(r'^/locations/(\d+)$', clean_path)
    if location_match:
        location_id = int(location_match.group(1))
        location_meta = get_location_meta(location_id)
        if location_meta:
            return {
                'title': location_meta['title'],
                'description': location_meta['description'],
                'url': f"{SITE_URL}{clean_path}",
                'image': location_meta.get('image'),
            }

    # Static route lookup
    meta = SEO_META_TAGS.get(clean_path, {
        'title': DEFAULT_TITLE,
        'description': DEFAULT_DESCRIPTION,
    })

    return {
        'title': meta['title'],
        'description': meta['description'],
        'url': f"{SITE_URL}{clean_path}",
        'image': None,  # Use default OG image from index.html
    }


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
    r'^locations/\d+/?$',                           # Location detail: /locations/:id
    r'^sky/?$',                                     # Sky hub: /sky
    r'^tonight/?$',                                 # Tonight's conditions: /tonight
    r'^bortle/?$',                                  # Bortle scale guide: /bortle
    r'^moon/?$',                                    # Moon phases guide: /moon
    r'^weather/?$',                                 # Weather guide: /weather
    r'^privacy/?$',                                 # Privacy policy: /privacy
    r'^terms/?$',                                   # Terms of service: /terms
    r'^accessibility/?$',                           # Accessibility statement: /accessibility
    r'^ccpa/?$',                                    # California privacy rights: /ccpa
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
# - Meta tags are injected server-side for social media crawlers                #
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

    def inject_seo_meta_tags(self, html_content, path):
        """
        Inject route-specific SEO meta tags into HTML for social media crawlers.
        Replaces default meta tags with page-specific values.
        """
        meta = get_seo_meta_for_path(path)

        # Replace <title> tag
        html_content = re.sub(
            r'<title>[^<]*</title>',
            f'<title>{meta["title"]}</title>',
            html_content
        )

        # Replace meta description
        html_content = re.sub(
            r'<meta name="description" content="[^"]*"',
            f'<meta name="description" content="{meta["description"]}"',
            html_content
        )

        # Replace Open Graph tags
        html_content = re.sub(
            r'<meta property="og:title" content="[^"]*"',
            f'<meta property="og:title" content="{meta["title"]}"',
            html_content
        )
        html_content = re.sub(
            r'<meta property="og:description" content="[^"]*"',
            f'<meta property="og:description" content="{meta["description"]}"',
            html_content
        )
        html_content = re.sub(
            r'<meta property="og:url" content="[^"]*"',
            f'<meta property="og:url" content="{meta["url"]}"',
            html_content
        )

        # Replace OG image if a custom image is provided (e.g., location hero image)
        if meta.get('image'):
            # Build absolute URL for the image
            # Images from R2 storage already have full URLs, others need site prefix
            image_url = meta['image']
            if not image_url.startswith('http'):
                image_url = f"{SITE_URL}{image_url}"

            html_content = re.sub(
                r'<meta property="og:image" content="[^"]*"',
                f'<meta property="og:image" content="{image_url}"',
                html_content
            )
            html_content = re.sub(
                r'<meta name="twitter:image" content="[^"]*"',
                f'<meta name="twitter:image" content="{image_url}"',
                html_content
            )

        # Replace Twitter Card tags
        html_content = re.sub(
            r'<meta name="twitter:title" content="[^"]*"',
            f'<meta name="twitter:title" content="{meta["title"]}"',
            html_content
        )
        html_content = re.sub(
            r'<meta name="twitter:description" content="[^"]*"',
            f'<meta name="twitter:description" content="{meta["description"]}"',
            html_content
        )
        html_content = re.sub(
            r'<meta name="twitter:url" content="[^"]*"',
            f'<meta name="twitter:url" content="{meta["url"]}"',
            html_content
        )

        # Add or update canonical link
        if '<link rel="canonical"' in html_content:
            html_content = re.sub(
                r'<link rel="canonical" href="[^"]*"',
                f'<link rel="canonical" href="{meta["url"]}"',
                html_content
            )
        else:
            # Insert canonical link before </head>
            html_content = html_content.replace(
                '</head>',
                f'<link rel="canonical" href="{meta["url"]}" />\n  </head>'
            )

        return html_content

    def render_to_response(self, context, **response_kwargs):
        """Override to inject SEO meta tags and return 404 for invalid routes."""
        response = super().render_to_response(context, **response_kwargs)

        # Check if this is a valid React route
        if not is_valid_react_route(self.request.path):
            response.status_code = 404

        # Inject SEO meta tags for social media crawlers
        # This runs for all routes (valid or not) to ensure proper meta tags
        if hasattr(response, 'render'):
            response.render()
        if hasattr(response, 'content'):
            html_content = response.content.decode('utf-8')
            html_content = self.inject_seo_meta_tags(html_content, self.request.path)
            response.content = html_content.encode('utf-8')
            # Update Content-Length header after modification
            response['Content-Length'] = len(response.content)

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

# Block non-existent language prefix URLs (Google discovers these externally)
Disallow: /en/
Disallow: /es/
Disallow: /fr/
Disallow: /no/
Disallow: /zh/
Disallow: /de/
Disallow: /it/
Disallow: /pt/
Disallow: /ja/
Disallow: /ko/
Disallow: /ru/
Disallow: /ar/

# Block legacy/removed pages
Disallow: /map

# Block auth and utility pages (no search value)
Disallow: /login
Disallow: /register
Disallow: /users/
Disallow: /signup
Disallow: /forgot-password
Disallow: /reset-password
Disallow: /verify-email
Disallow: /email-verified
Disallow: /email-confirm-error
Disallow: /social-account-exists
Disallow: /password-reset
Disallow: /password-reset-confirm/
Disallow: /account/
Disallow: /profile

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


# ----------------------------------------------------------------------------- #
# llms.txt view for providing structured information to AI language models.      #
#                                                                               #
# The llms.txt file helps LLMs understand the site's purpose, features, and     #
# content at inference time. It's a Markdown file that reduces token usage      #
# compared to parsing HTML pages.                                               #
#                                                                               #
# Specification: https://llmstxt.org/                                           #
#                                                                               #
# IMPORTANT: Update llms.txt when adding new features or pages.                 #
# Location: starview_frontend/public/llms.txt                                   #
# ----------------------------------------------------------------------------- #
def llms_txt(request):
    """Serve the llms.txt file for AI language models."""
    # Try production build first, then development public folder
    paths_to_try = [
        os.path.join(settings.BASE_DIR, 'starview_frontend', 'dist', 'llms.txt'),
        os.path.join(settings.BASE_DIR, 'starview_frontend', 'public', 'llms.txt'),
    ]

    for file_path in paths_to_try:
        if os.path.exists(file_path):
            return FileResponse(
                open(file_path, 'rb'),
                content_type='text/plain; charset=utf-8'
            )

    raise Http404("llms.txt not found")
