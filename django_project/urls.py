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
from starview_app.utils.adapters import (
    CustomConfirmEmailView,
    CustomConnectionsView,
    # Redirect views for allauth HTML pages
    EmailManagementRedirectView,
    PasswordChangeRedirectView,
    PasswordSetRedirectView,
    LoginRedirectView,
    SignupRedirectView,
    LogoutRedirectView,
    PasswordResetRedirectView,
    PasswordResetDoneRedirectView,
    PasswordResetKeyDoneRedirectView,
    EmailVerificationSentRedirectView,
    InactiveAccountRedirectView,
    ReauthenticateRedirectView,
    LoginCodeConfirmRedirectView,
    SocialLoginCancelledRedirectView,
    SocialLoginErrorRedirectView,
    SocialSignupRedirectView,
)
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

    # -------------------------------------------------------------------------
    # Allauth HTML page redirects (must be BEFORE allauth.urls to override)
    # These redirect users to React frontend pages instead of Django templates
    # -------------------------------------------------------------------------
    # Custom views (already existed)
    path('accounts/confirm-email/<str:key>/', CustomConfirmEmailView.as_view(), name='account_confirm_email'),
    path('accounts/3rdparty/', CustomConnectionsView.as_view(), name='socialaccount_connections'),

    # Account management redirects → /profile
    path('accounts/email/', EmailManagementRedirectView.as_view(), name='account_email'),
    path('accounts/password/change/', PasswordChangeRedirectView.as_view(), name='account_change_password'),
    path('accounts/password/set/', PasswordSetRedirectView.as_view(), name='account_set_password'),

    # Auth page redirects → React equivalents
    path('accounts/login/', LoginRedirectView.as_view(), name='account_login'),
    path('accounts/signup/', SignupRedirectView.as_view(), name='account_signup'),
    path('accounts/logout/', LogoutRedirectView.as_view(), name='account_logout'),

    # Password reset redirects
    path('accounts/password/reset/', PasswordResetRedirectView.as_view(), name='account_reset_password'),
    path('accounts/password/reset/done/', PasswordResetDoneRedirectView.as_view(), name='account_reset_password_done'),
    path('accounts/password/reset/key/done/', PasswordResetKeyDoneRedirectView.as_view(), name='account_reset_password_from_key_done'),

    # Email verification redirect
    path('accounts/confirm-email/', EmailVerificationSentRedirectView.as_view(), name='account_email_verification_sent'),

    # Misc account redirects
    path('accounts/inactive/', InactiveAccountRedirectView.as_view(), name='account_inactive'),
    path('accounts/reauthenticate/', ReauthenticateRedirectView.as_view(), name='account_reauthenticate'),
    path('accounts/login/code/confirm/', LoginCodeConfirmRedirectView.as_view(), name='account_confirm_login_code'),

    # Social account redirects
    path('accounts/3rdparty/login/cancelled/', SocialLoginCancelledRedirectView.as_view(), name='socialaccount_login_cancelled'),
    path('accounts/3rdparty/login/error/', SocialLoginErrorRedirectView.as_view(), name='socialaccount_login_error'),
    path('accounts/3rdparty/signup/', SocialSignupRedirectView.as_view(), name='socialaccount_signup'),
    path('accounts/social/login/cancelled/', SocialLoginCancelledRedirectView.as_view()),
    path('accounts/social/login/error/', SocialLoginErrorRedirectView.as_view()),
    path('accounts/social/signup/', SocialSignupRedirectView.as_view()),

    # -------------------------------------------------------------------------
    # Allauth URLs (for OAuth callbacks and other functional endpoints)
    # -------------------------------------------------------------------------
    path('accounts/', include('allauth.urls')),
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
