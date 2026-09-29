"""Isolated local tests: PostgreSQL test database, memory cache/mail, local storage."""
from .settings import *  # noqa: F403

if DATABASES['default'].get('HOST') not in ('localhost', '127.0.0.1', '::1'):
    raise RuntimeError('Tests require a local PostgreSQL database')
DATABASES['default']['TEST'] = {'NAME': 'test_starview_oauth'}
CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache', 'LOCATION': 'starview-tests'}}
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
TESTING = True
DEBUG = True
ALLOWED_HOSTS = ['testserver', 'localhost']
AXES_HANDLER = 'axes.handlers.dummy.AxesDummyHandler'
