"""
URL configuration for django_project project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.views.static import serve as static_serve
from django.views.decorators.cache import cache_control
from django.http import FileResponse
from django.contrib.sitemaps.views import sitemap

from django.conf import settings
from django.conf.urls.static import static

import os

from .views import ReactAppView, robots_txt
from starview_app.sitemaps import sitemaps
from starview_app.utils.adapters import CustomConfirmEmailView, CustomConnectionsView
from starview_app.views.views_webhooks import ses_bounce_webhook, ses_complaint_webhook


# Custom static file serving with cache headers
def serve_static_with_cache(request, path, document_root):
    """
    Serve static files with proper cache-control headers.
    Cache for 1 year (31536000 seconds) since these files are immutable.
    """
    response = static_serve(request, path, document_root)
    # Cache for 1 year - badge icons rarely change
    response['Cache-Control'] = 'public, max-age=31536000, immutable'
    return response

urlpatterns = [
    path('admin/', admin.site.urls),
    # AWS SNS webhook endpoints (must be accessible without CSRF)
    path('api/webhooks/ses-bounce/', ses_bounce_webhook, name='ses_bounce_webhook'),
    path('api/webhooks/ses-complaint/', ses_complaint_webhook, name='ses_complaint_webhook'),
    # Custom email confirmation view (must be before allauth.urls to override)
    path('accounts/confirm-email/<str:key>/', CustomConfirmEmailView.as_view(), name='account_confirm_email'),
    # Custom social account connections view (must be before allauth.urls to override)
    path('accounts/3rdparty/', CustomConnectionsView.as_view(), name='socialaccount_connections'),
    path('accounts/', include('allauth.urls')),  # django-allauth URLs (must be before starview_app.urls)
    path('', include('starview_app.urls')),
]

# Django Debug Toolbar (development only)
if settings.DEBUG:
    import debug_toolbar
    urlpatterns = [
        path('__debug__/', include(debug_toolbar.urls)),
    ] + urlpatterns

# Static and media files
urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# Serve media files explicitly (works in production too)
# NOTE: In production, consider using AWS S3 or Cloudflare R2 for persistent storage
# Render's filesystem is ephemeral and files will be lost on restart
urlpatterns += [
    re_path(
        r'^media/(?P<path>.*)$',
        static_serve,
        {'document_root': settings.MEDIA_ROOT},
    ),
]

# Serve React build assets (always, even in production)
# Use custom serve function with cache headers for better performance
urlpatterns += [
    re_path(
        r'^assets/(?P<path>.*)$',
        serve_static_with_cache,
        {'document_root': os.path.join(settings.BASE_DIR, 'starview_frontend/dist/assets')},
    ),
    re_path(
        r'^images/(?P<path>.*)$',
        serve_static_with_cache,
        {'document_root': os.path.join(settings.BASE_DIR, 'starview_frontend/dist/images')},
    ),
    re_path(
        r'^badges/(?P<path>.*)$',
        serve_static_with_cache,
        {'document_root': os.path.join(settings.BASE_DIR, 'starview_frontend/dist/badges')},
    ),
]

# SEO: robots.txt for search engines and AI crawlers
# Environment-aware: allows crawlers on production, blocks on staging/dev
urlpatterns += [
    path('robots.txt', robots_txt, name='robots_txt'),
]

# SEO: XML sitemap for search engine discovery
# Helps Google, Bing, and AI crawlers find all pages
urlpatterns += [
    path('sitemap.xml', sitemap, {'sitemaps': sitemaps}, name='django.contrib.sitemaps.views.sitemap'),
]

# Catch-all: serve React app for any non-API/admin/accounts routes
# IMPORTANT: This must be the LAST pattern in urlpatterns
# Excludes: /admin/, /api/, /accounts/ (django-allauth)
# It matches any URL that wasn't caught by previous patterns
urlpatterns += [
    re_path(r'^(?!admin/|api/|accounts/).*$', ReactAppView.as_view(), name='react_app'),
]
