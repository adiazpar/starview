"""
Django settings for Starview project.

Production-ready configuration with:
- PostgreSQL database support
- AWS SES email integration
- Comprehensive security settings
- CORS support for frontend apps
- Rate limiting and throttling
"""

import os
from pathlib import Path
import certifi
from dotenv import load_dotenv
import logging

# Configure module logger for settings
logger = logging.getLogger(__name__)

# =============================================================================
# GDAL/GEOS LIBRARY PATHS (PostGIS dependencies - macOS only)
# =============================================================================
# Only needed for local development on macOS with Homebrew.
# Production (Render) has GDAL/GEOS in standard system paths.
import sys
if sys.platform == 'darwin' and os.path.exists('/opt/homebrew/opt/gdal/lib/libgdal.dylib'):
    GDAL_LIBRARY_PATH = '/opt/homebrew/opt/gdal/lib/libgdal.dylib'
    GEOS_LIBRARY_PATH = '/opt/homebrew/opt/geos/lib/libgeos_c.dylib'

# =============================================================================
# CORE SETTINGS
# =============================================================================

# Build paths inside the project like this: BASE_DIR / 'subdir'
BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables from .env file
load_dotenv()

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.getenv('DJANGO_SECRET_KEY')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.getenv('DEBUG', 'True') == 'True'

# Site configuration
SITE_ID = 1
SITE_NAME = "Starview"

# =============================================================================
# SESSION CONFIGURATION
# =============================================================================

# Use Redis for session storage (better performance than database sessions)
# Sessions are cached in Redis and expire automatically
SESSION_ENGINE = 'django.contrib.sessions.backends.cache'
SESSION_CACHE_ALIAS = 'default'  # Use default Redis cache
SESSION_COOKIE_AGE = 1209600  # 2 weeks (in seconds)

# =============================================================================
# SECURITY SETTINGS
# =============================================================================

# Allowed hosts (comma-separated in .env)
# Development: 127.0.0.1,localhost,nyx.local
# Production: Add your domain (e.g., eventhorizon.com,www.eventhorizon.com)
ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', '127.0.0.1,localhost,nyx.local').split(',')

# CSRF trusted origins (comma-separated in .env)
# Production: https://eventhorizon.com,https://www.eventhorizon.com
CSRF_TRUSTED_ORIGINS = [origin for origin in os.getenv('CSRF_TRUSTED_ORIGINS', '').split(',') if origin]

# Add localhost origins for development
if DEBUG:
    CSRF_TRUSTED_ORIGINS += [
        'http://localhost:5173',  # React dev server
        'http://127.0.0.1:5173',  # React dev server (alternative)
    ]

# Security headers (always enabled)
SECURE_BROWSER_XSS_FILTER = True        # Browser XSS filtering
X_FRAME_OPTIONS = 'DENY'                # Prevent clickjacking
SECURE_CONTENT_TYPE_NOSNIFF = True      # Prevent MIME sniffing
SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'  # Send origin on cross-origin requests (needed for Mapbox URL restrictions)

# Production-only HTTPS settings (enabled when DEBUG=False)
if not DEBUG:
    SECURE_SSL_REDIRECT = True              # Force HTTPS
    SESSION_COOKIE_SECURE = True            # HTTPS-only session cookies
    CSRF_COOKIE_SECURE = True               # HTTPS-only CSRF cookies
    SECURE_HSTS_SECONDS = 31536000          # 1 year HSTS
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True   # HSTS for subdomains
    SECURE_HSTS_PRELOAD = True              # HSTS preload list

# Content Security Policy (CSP) - Phase 4 Security Enhancement
# Defines which sources browsers can load resources from (scripts, styles, images, etc.)
# Using django-csp 4.0+ format
CONTENT_SECURITY_POLICY = {
    'DIRECTIVES': {
        'default-src': ("'self'",),                     # Default: only allow resources from same origin
        'script-src': (
            "'self'",
            "'unsafe-inline'",                          # Required for inline scripts (Mapbox init, etc.)
            "https://api.mapbox.com",                   # Mapbox GL JS library
            "https://cdn.jsdelivr.net",                 # CDN for libraries (if needed)
            "https://kit.fontawesome.com",              # Font Awesome kit
            "https://www.googletagmanager.com",         # Google Tag Manager / Analytics
            "https://www.google-analytics.com",         # Google Analytics
        ),
        'style-src': (
            "'self'",
            "'unsafe-inline'",                          # Required for Django admin and inline styles
            "https://api.mapbox.com",                   # Mapbox styles
            "https://cdn.jsdelivr.net",                 # CDN styles
            "https://rsms.me",                          # Inter font CSS
            "https://kit.fontawesome.com",              # Font Awesome kit styles
            "https://fonts.googleapis.com",             # Google Fonts CSS
        ),
        'img-src': (
            "'self'",
            "data:",                                    # Data URIs for inline images
            "blob:",                                    # Blob URLs for Mapbox generated images
            "https://*.mapbox.com",                     # Mapbox tile images (uses subdomains)
            "https://api.mapbox.com",                   # Mapbox API images
            "https://*.r2.dev",                         # Cloudflare R2 dev URLs (development/testing)
            "https://media.starview.app",               # R2 custom domain (production)
        ),
        'worker-src': (
            "'self'",
            "blob:",                                    # Mapbox GL JS uses blob: for web workers
        ),
        'child-src': (
            "'self'",
            "blob:",                                    # Fallback for older browsers
        ),
        'font-src': (
            "'self'",
            "data:",                                    # Data URIs for fonts
            "https://fonts.gstatic.com",                # Google Fonts and Inter font
            "https://rsms.me",                          # Inter font files
            "https://*.fontawesome.com",                # Font Awesome fonts (all subdomains)
        ),
        'connect-src': (
            "'self'",
            "https://api.mapbox.com",                   # Mapbox API calls
            "https://*.mapbox.com",                     # Mapbox tile servers
            "https://events.mapbox.com",                # Mapbox analytics
            "https://*.fontawesome.com",                # Font Awesome API (all subdomains)
            "https://accounts.google.com",              # Google OAuth
            "https://media.starview.app",               # Cloudflare R2 media storage (PMTiles, images)
            "https://www.google-analytics.com",         # Google Analytics data collection
            "https://analytics.google.com",             # Google Analytics 4
        ),
        'frame-ancestors': ("'none'",),                 # Prevent framing (same as X-Frame-Options: DENY)
        'base-uri': ("'self'",),                        # Restrict <base> tag URLs
        'form-action': ("'self'",),                     # Only allow forms to submit to same origin
    }
}

# Permissions Policy (formerly Feature-Policy) - Phase 4 Security Enhancement
# Controls which browser features can be used
PERMISSIONS_POLICY = {
    "geolocation": ["self"],    # Allow geolocation for distance/map features
    "camera": [],               # Disable camera access
    "microphone": [],           # Disable microphone access
    "payment": [],              # Disable payment APIs
    "usb": [],                  # Disable USB device access
    "magnetometer": [],         # Disable magnetometer
    "accelerometer": [],        # Disable accelerometer
    "gyroscope": [],            # Disable gyroscope
}

# File upload validation settings
MAX_UPLOAD_SIZE_MB = 5
ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
ALLOWED_IMAGE_MIMETYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

# =============================================================================
# INSTALLED APPS
# =============================================================================

INSTALLED_APPS = [
    # Django core apps
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.sites',
    'django.contrib.sitemaps',
    'django.contrib.gis',  # PostGIS spatial queries

    # Project apps (MUST be before allauth to override templates)
    'starview_app',

    # Third-party apps
    'rest_framework',
    'django_filters',
    'storages',                 # django-storages for S3/R2 (media storage)
    'corsheaders',              # CORS support (Phase 2)
    'csp',                      # Content Security Policy (Phase 4)
    'axes',                     # Account lockout policy (Phase 4)
    'debug_toolbar',            # Development only

    # django-allauth for social authentication
    'allauth',
    'allauth.account',
    'allauth.socialaccount',
    'allauth.socialaccount.providers.google',
]


# =============================================================================
# MIDDLEWARE
# =============================================================================

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',                           # Whitenoise (MUST be after SecurityMiddleware)
    'csp.middleware.CSPMiddleware',                                         # Content Security Policy (Phase 4)
    'django_permissions_policy.PermissionsPolicyMiddleware',                # Permissions-Policy header (Phase 4)
    'debug_toolbar.middleware.DebugToolbarMiddleware',                      # Debug Toolbar (development)
    'corsheaders.middleware.CorsMiddleware',                                # CORS (before CommonMiddleware)
    'django.contrib.sessions.middleware.SessionMiddleware',
    'starview_app.utils.middleware.BrowserLanguageMiddleware',              # Language detection (MUST be after SessionMiddleware)
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'allauth.account.middleware.AccountMiddleware',                         # Allauth account middleware (MUST be after AuthenticationMiddleware)
    'axes.middleware.AxesMiddleware',                                       # Account lockout (MUST be after AuthenticationMiddleware)
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

# =============================================================================
# URL CONFIGURATION
# =============================================================================

ROOT_URLCONF = 'django_project.urls'
LOGIN_REDIRECT_URL = '/'

# =============================================================================
# TEMPLATES
# =============================================================================

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [
            os.path.join(BASE_DIR, 'starview_frontend/dist'),  # React build directory
        ],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

# =============================================================================
# WSGI
# =============================================================================

WSGI_APPLICATION = 'django_project.wsgi.application'

# =============================================================================
# DATABASE
# =============================================================================

# Database: PostgreSQL (production) or SQLite (development)
# Set DB_ENGINE=postgresql in .env to use PostgreSQL
DB_ENGINE = os.getenv('DB_ENGINE', 'sqlite3')

if DB_ENGINE == 'postgresql':
    # PostgreSQL configuration (production)
    # Using PostGIS for spatial queries (distance filtering, geographic calculations)
    DATABASES = {
        'default': {
            'ENGINE': 'django.contrib.gis.db.backends.postgis',
            'NAME': os.getenv('DB_NAME', 'event_horizon'),
            'USER': os.getenv('DB_USER', 'postgres'),
            'PASSWORD': os.getenv('DB_PASSWORD', ''),
            'HOST': os.getenv('DB_HOST', 'localhost'),
            'PORT': os.getenv('DB_PORT', '5432'),
        }
    }
else:
    # SQLite configuration (development default)
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

# =============================================================================
# AUTHENTICATION & PASSWORD VALIDATION
# =============================================================================

AUTHENTICATION_BACKENDS = [
    'axes.backends.AxesStandaloneBackend',  # Account lockout backend (Phase 4 - MUST be first)
    'django.contrib.auth.backends.ModelBackend',
]

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'starview_app.utils.validators.UppercaseValidator'},
    {'NAME': 'starview_app.utils.validators.NumberValidator'},
    {'NAME': 'starview_app.utils.validators.SpecialCharacterValidator'},
]

# =============================================================================
# ACCOUNT LOCKOUT POLICY (django-axes - Phase 4)
# =============================================================================

# Account lockout configuration for brute force attack prevention
# Protects against distributed attacks by locking accounts (not just IPs)
from datetime import timedelta

AXES_FAILURE_LIMIT = 5                          # Lock account after 5 failed login attempts
AXES_COOLOFF_TIME = timedelta(hours=1)          # Lock duration: 1 hour
AXES_LOCKOUT_PARAMETERS = ['username']          # Lock by username (protects against distributed attacks)
AXES_RESET_ON_SUCCESS = True                    # Reset failure counter on successful login
AXES_LOCK_OUT_AT_FAILURE = True                 # Lock out immediately when limit reached
AXES_ENABLE_ADMIN = True                        # Show django-axes models in admin interface
AXES_VERBOSE = True                             # Enable detailed logging

# Handler: Use database for logging (provides audit trail)
# 'axes.handlers.database.AxesDatabaseHandler' logs all attempts to database
AXES_HANDLER = 'axes.handlers.database.AxesDatabaseHandler'

# Use cache for performance (in addition to database logging)
AXES_CACHE = 'default'                          # Use default Redis cache

# Customize lockout response
AXES_COOLOFF_MESSAGE = "Account temporarily locked due to too many failed login attempts. Please try again in 1 hour."

# =============================================================================
# INTERNATIONALIZATION
# =============================================================================

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Supported languages
LANGUAGES = [
    ('en', 'English'),
    ('es', 'Español'),
]

# Path to translation files
LOCALE_PATHS = [
    BASE_DIR / 'locale',
]

# =============================================================================
# STATIC & MEDIA FILES
# =============================================================================

# Static files (CSS, JavaScript, Images)
STATIC_URL = 'static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')

# Include React production build as static files
STATICFILES_DIRS = [
    os.path.join(BASE_DIR, 'starview_frontend/dist'),    # React production build
]

# Whitenoise configuration for serving static files in production
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# =============================================================================
# MEDIA FILES CONFIGURATION (User Uploads)
# =============================================================================
# Two storage modes available:
#   1. Local filesystem (development) - set USE_R2_STORAGE=False in .env
#   2. Cloudflare R2 (production/testing) - set USE_R2_STORAGE=True in .env
#
# Default: Local in development (DEBUG=True), R2 in production (DEBUG=False)
# =============================================================================

# Determine storage backend based on environment
USE_R2_STORAGE = os.getenv('USE_R2_STORAGE', 'False' if DEBUG else 'True') == 'True'

# Local media directory (used for local storage mode)
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')
MEDIA_URL = '/media/'
TILES_DIR = os.path.join(MEDIA_ROOT, 'tiles')

if USE_R2_STORAGE:
    # =============================================================================
    # CLOUDFLARE R2 STORAGE (Production/Testing)
    # =============================================================================
    # Using django-storages with S3-compatible backend for R2
    # Credentials are stored in environment variables for security

    CLOUDFLARE_ACCOUNT_ID = os.getenv('CLOUDFLARE_ACCOUNT_ID')
    AWS_ACCESS_KEY_ID = os.getenv('AWS_ACCESS_KEY_ID')
    AWS_SECRET_ACCESS_KEY = os.getenv('AWS_SECRET_ACCESS_KEY')
    AWS_STORAGE_BUCKET_NAME = os.getenv('AWS_STORAGE_BUCKET_NAME', 'starview-media')
    AWS_S3_REGION_NAME = 'auto'  # Required by Cloudflare R2
    AWS_S3_ENDPOINT_URL = f"https://{CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com"
    AWS_S3_SIGNATURE_VERSION = 's3v4'  # R2 doesn't support SigV2
    AWS_S3_FILE_OVERWRITE = False  # Don't overwrite files with same name
    AWS_DEFAULT_ACL = None  # R2 doesn't use ACLs
    AWS_QUERYSTRING_AUTH = False  # Don't add auth query params to URLs
    AWS_S3_OBJECT_PARAMETERS = {
        'CacheControl': 'max-age=86400',  # Cache for 24 hours
    }

    # Custom domain for public R2 URLs (separate from API endpoint)
    # This makes files accessible at https://pub-xxx.r2.dev/ instead of the API URL
    AWS_S3_CUSTOM_DOMAIN = os.getenv('R2_PUBLIC_URL', '').replace('https://', '').replace('http://', '')

    # Use R2 for media storage
    STORAGES = {
        "default": {
            "BACKEND": "storages.backends.s3.S3Storage",
        },
        "staticfiles": {
            "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
        },
    }

    logger.info(
        "Using Cloudflare R2 for media files (Bucket: %s)",
        AWS_STORAGE_BUCKET_NAME,
        extra={'storage_backend': 'r2', 'bucket': AWS_STORAGE_BUCKET_NAME}
    )

else:
    # =============================================================================
    # LOCAL FILESYSTEM STORAGE (Development)
    # =============================================================================
    # Media files stored in project's media/ directory
    # Requires MEDIA_URL to be served by Django dev server

    STORAGES = {
        "default": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
        },
        "staticfiles": {
            "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
        },
    }

    logger.info(
        "Using local filesystem for media files (Directory: %s)",
        MEDIA_ROOT,
        extra={'storage_backend': 'filesystem', 'directory': str(MEDIA_ROOT)}
    )

# Default assets
DEFAULT_PROFILE_PICTURE = '/static/images/default_profile_pic.jpg'

# =============================================================================
# EMAIL CONFIGURATION (AWS SES - Phase 3)
# =============================================================================

# SSL certificate configuration for HTTPS requests (required for Mapbox API)
os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()
os.environ['SSL_CERT_FILE'] = certifi.where()

# AWS SES Configuration (Email sending)
# Note: SES uses separate credentials from R2 storage (configured in .env)
# django-ses will use AWS_SES_* variables instead of generic AWS_* variables
EMAIL_BACKEND = 'django_ses.SESBackend'
AWS_SES_ACCESS_KEY_ID = os.getenv('AWS_SES_ACCESS_KEY_ID')
AWS_SES_SECRET_ACCESS_KEY = os.getenv('AWS_SES_SECRET_ACCESS_KEY')
AWS_SES_REGION_NAME = os.getenv('AWS_SES_REGION_NAME', 'us-east-1')
AWS_SES_REGION_ENDPOINT = f'email.{AWS_SES_REGION_NAME}.amazonaws.com'
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', 'noreply@starview.app')

# Password Reset Configuration
# Token expires in 1 hour (3600 seconds) for security
PASSWORD_RESET_TIMEOUT = 3600

# AWS SES optimization settings
USE_SES_V2 = True                   # Use newer SESv2 API
AWS_SES_AUTO_THROTTLE = 0.5         # Send at 50% of rate limit (safety factor)

# =============================================================================
# EXTERNAL API CONFIGURATION
# =============================================================================

# Mapbox API (geocoding and elevation)
MAPBOX_TOKEN = os.getenv('MAPBOX_TOKEN')

# Tile server configuration
TILE_SERVER_URL = os.getenv('TILE_SERVER_URL', 'http://localhost:3001')

# Disable external APIs for testing (set to True in .env when needed)
DISABLE_EXTERNAL_APIS = os.getenv('DISABLE_EXTERNAL_APIS', 'False') == 'True'

# =============================================================================
# DJANGO REST FRAMEWORK
# =============================================================================

REST_FRAMEWORK = {
    # Pagination
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 10,

    # Authentication
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.BasicAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],

    # Permissions
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticatedOrReadOnly',
    ],

    # Renderers
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
        'rest_framework.renderers.BrowsableAPIRenderer',
    ],

    # Versioning
    'DEFAULT_VERSIONING_CLASS': 'rest_framework.versioning.NamespaceVersioning',
    'DEFAULT_VERSION': 'v1',
    'ALLOWED_VERSIONS': ['v1'],
    'VERSION_PARAM': 'version',

    # Throttling (Phase 1: Rate limiting)
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '100/hour',             # Anonymous users
        'user': '1000/hour',            # Authenticated users
        'login': '5/minute',            # Login attempts (brute force prevention)
        'password_reset': '3/hour',     # Password reset requests (prevents email bombing)
        'content_creation': '20/hour',  # Create locations/reviews/comments
        'vote': '60/hour',              # Upvotes/downvotes
        'report': '10/hour',            # Content reports
    },

    # Exception handling:
    'EXCEPTION_HANDLER': 'starview_app.utils.exception_handler.custom_exception_handler',
}

# =============================================================================
# AUTHENTICATION CONFIGURATION
# =============================================================================

# Authentication backends (add allauth backend while keeping Django's default)
AUTHENTICATION_BACKENDS = [
    # Django's default authentication backend
    'django.contrib.auth.backends.ModelBackend',
    # Allauth-specific authentication backend for social logins
    'allauth.account.auth_backends.AuthenticationBackend',
    # Axes backend for account lockout (renamed in version 5.0+)
    'axes.backends.AxesStandaloneBackend',
]

# django-allauth settings:
# Custom adapters for React frontend integration and validation
ACCOUNT_ADAPTER = 'starview_app.utils.adapters.CustomAccountAdapter'
SOCIALACCOUNT_ADAPTER = 'starview_app.utils.adapters.CustomSocialAccountAdapter'

# Email verification is always mandatory (even in development)
ACCOUNT_EMAIL_VERIFICATION = 'mandatory'  # Must verify email to login
ACCOUNT_CONFIRM_EMAIL_ON_GET = True  # Confirm email on GET request (one-click verification)
ACCOUNT_EMAIL_CONFIRMATION_HMAC = False  # Use database-based confirmations (easier to debug)

SOCIALACCOUNT_AUTO_SIGNUP = True        # Automatically create account on social login
SOCIALACCOUNT_EMAIL_VERIFICATION = 'optional'  # Email verification for social accounts (already verified by OAuth provider)
SOCIALACCOUNT_LOGIN_ON_GET = True       # Skip confirmation page and go directly to OAuth provider

# Login methods:
ACCOUNT_LOGIN_METHODS = {'username', 'email'}  # Allow login with username or email

# Signup fields:
ACCOUNT_SIGNUP_FIELDS = ['email*', 'username*', 'password1*', 'password2*']

# Auto-connect social accounts to existing users with matching email
# DISABLED: This causes issues where social accounts get transferred to new users
# Users must manually connect social accounts from their profile page
SOCIALACCOUNT_EMAIL_AUTHENTICATION = False  # Don't allow automatic email matching
SOCIALACCOUNT_EMAIL_AUTHENTICATION_AUTO_CONNECT = False  # Don't auto-connect

# After successful social login, redirect to home
# Development: Redirect to Vite dev server (localhost:5173)
# Production: Redirect to root (Django serves React build)
if DEBUG:
    LOGIN_REDIRECT_URL = 'http://localhost:5173/'
    ACCOUNT_LOGOUT_REDIRECT_URL = 'http://localhost:5173/'
else:
    LOGIN_REDIRECT_URL = '/'
    ACCOUNT_LOGOUT_REDIRECT_URL = '/'

# Email verification settings
ACCOUNT_EMAIL_SUBJECT_PREFIX = '[Starview] '  # Email subject prefix
ACCOUNT_EMAIL_CONFIRMATION_EXPIRE_DAYS = 3  # Verification link expires in 3 days

# Rate limiting for email confirmation (new format in django-allauth 65.x+)
ACCOUNT_RATE_LIMITS = {
    'confirm_email': '1/3m',  # 1 confirmation email per 3 minutes
}

# Protocol for email verification links
# Development: Use http:// for local testing
# Production: Use https:// for secure links
ACCOUNT_DEFAULT_HTTP_PROTOCOL = 'https' if not DEBUG else 'http'

# Google OAuth specific settings
SOCIALACCOUNT_PROVIDERS = {
    'google': {
        'SCOPE': [
            'profile',
            'email',
        ],
        'AUTH_PARAMS': {
            'access_type': 'online',
        },
    }
}

# =============================================================================
# CORS CONFIGURATION
# =============================================================================

# CORS allowed origins (comma-separated in .env)
# Development: http://localhost:3000,http://localhost:8080
# Production: https://app.eventhorizon.com
CORS_ALLOWED_ORIGINS = [origin for origin in os.getenv('CORS_ALLOWED_ORIGINS', '').split(',') if origin]

# CORS security settings
CORS_ALLOW_CREDENTIALS = True       # Allow cookies/auth in CORS requests
CORS_ALLOW_METHODS = ['DELETE', 'GET', 'OPTIONS', 'PATCH', 'POST', 'PUT']
CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
]

# =============================================================================
# CACHING
# =============================================================================

# Cache backend configuration (required for rate limiting and performance caching)
# Using Redis for both development and production (Django 4.0+ native support)
# Development: Local Redis via Homebrew (redis://127.0.0.1:6379/1)
# Production: Render Redis service (set REDIS_URL in environment variables)
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': os.getenv('REDIS_URL', 'redis://127.0.0.1:6379/1'),
        'KEY_PREFIX': 'starview',  # Prefix all cache keys with app name
        'TIMEOUT': 900,  # Default timeout: 15 minutes (in seconds)
    }
}

# =============================================================================
# CELERY CONFIGURATION
# =============================================================================

# Enable/disable Celery async tasks
# Set to True when Celery worker is running (production with worker service)
# Set to False when no worker available (development, free tier deployment)
# When False, tasks run synchronously (slower but no worker cost)
CELERY_ENABLED = os.getenv('CELERY_ENABLED', 'False') == 'True'

# Celery broker (message queue) - uses same Redis instance as cache
# Development: Local Redis (redis://127.0.0.1:6379/0 - different database than cache)
# Production: Render Redis service (set REDIS_URL in environment variables)
CELERY_BROKER_URL = os.getenv('REDIS_URL', 'redis://127.0.0.1:6379/0')

# Celery result backend (stores task results) - also uses Redis
CELERY_RESULT_BACKEND = os.getenv('REDIS_URL', 'redis://127.0.0.1:6379/0')

# Serialization formats
CELERY_ACCEPT_CONTENT = ['json']  # Accept only JSON (more secure than pickle)
CELERY_TASK_SERIALIZER = 'json'   # Serialize tasks as JSON
CELERY_RESULT_SERIALIZER = 'json' # Serialize results as JSON

# Timezone settings (match Django timezone)
CELERY_TIMEZONE = TIME_ZONE
CELERY_ENABLE_UTC = True

# Task time limits (prevent runaway tasks)
CELERY_TASK_TIME_LIMIT = 300      # Hard limit: 5 minutes (task killed after this)
CELERY_TASK_SOFT_TIME_LIMIT = 240 # Soft limit: 4 minutes (SoftTimeLimitExceeded exception)

# Task result settings
CELERY_RESULT_EXPIRES = 3600      # Results expire after 1 hour
CELERY_TASK_TRACK_STARTED = True  # Track when tasks start (useful for monitoring)
CELERY_TASK_SEND_SENT_EVENT = True # Send event when task is sent to broker

# Worker settings
CELERY_WORKER_PREFETCH_MULTIPLIER = 4  # How many tasks each worker prefetches
CELERY_WORKER_MAX_TASKS_PER_CHILD = 1000  # Restart worker after 1000 tasks (prevent memory leaks)

# =============================================================================
# LOGGING CONFIGURATION
# =============================================================================

# Ensure logs directory exists
LOGS_DIR = BASE_DIR / 'logs'
LOGS_DIR.mkdir(exist_ok=True)

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,

    # Log formatting
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {message}',
            'style': '{',
        },
        'json': {
            'format': '{"timestamp": "%(asctime)s", "level": "%(levelname)s", "module": "%(module)s", "message": "%(message)s"}',
        },
    },

    # Log handlers (where logs go)
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
        'audit_file': {
            'level': 'INFO',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': LOGS_DIR / 'audit.log',
            'maxBytes': 10485760,  # 10MB
            'backupCount': 10,
            'formatter': 'json',
        },
    },

    # Loggers (what to log)
    'loggers': {
        # Audit logger for security events
        'audit': {
            'handlers': ['audit_file', 'console'],
            'level': 'INFO',
            'propagate': False,
        },
        # Application logger for general events
        'starview_app': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}

# =============================================================================
# DEVELOPMENT SETTINGS
# =============================================================================

# Django Debug Toolbar (development only)
INTERNAL_IPS = ['127.0.0.1']

# =============================================================================
# MISCELLANEOUS
# =============================================================================

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
