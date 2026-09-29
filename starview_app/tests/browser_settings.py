"""Isolated HTTPS browser test server. Never use this settings module on Render.

Uses a dedicated local database, one-process memory sessions, and no outbound mail
or media storage. Run browser_server behind a trusted local HTTPS tunnel.
"""
from django_project.settings import *  # noqa: F403

if DEBUG or DATABASES['default'].get('HOST') not in ('localhost', '127.0.0.1', '::1'):
    raise RuntimeError('OAuth browser tests require DEBUG=False and local PostgreSQL')
if not os.getenv('OAUTH_TEST_HOST'):
    raise RuntimeError('Set OAUTH_TEST_HOST to the exact HTTPS tunnel hostname')

DATABASES['default']['NAME'] = 'test_starview_apple_browser'
ALLOWED_HOSTS = [os.environ['OAUTH_TEST_HOST']]
CSRF_TRUSTED_ORIGINS = [f'https://{os.environ["OAUTH_TEST_HOST"]}']
CORS_ALLOWED_ORIGINS = CSRF_TRUSTED_ORIGINS
CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache', 'LOCATION': 'apple-browser'}}
# Rebuilt frontend bundles should be picked up without resetting the test session.
TEMPLATES[0]['APP_DIRS'] = False
TEMPLATES[0]['OPTIONS']['loaders'] = [
    'django.template.loaders.filesystem.Loader',
    'django.template.loaders.app_directories.Loader',
]
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
CELERY_ENABLED = False
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'},
}
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
# The temporary HTTPS hostname must not create a lasting HSTS policy.
SECURE_HSTS_SECONDS = 0
