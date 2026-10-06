"""One session-lifetime policy, applied only after all login stages succeed."""

import time
from django.conf import settings


REMEMBER_KEY = 'starview_remember_me'


def remember_login(request, remember=False):
    remembered = remember is True
    request.session['remember_me'] = remembered
    request.session['last_activity'] = time.time()
    request.session.set_expiry(settings.REMEMBERED_SESSION_AGE if remembered else 0)
