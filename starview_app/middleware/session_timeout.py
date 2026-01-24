# ----------------------------------------------------------------------------- #
# Session Idle Timeout Middleware                                               #
#                                                                               #
# Logs out users who have been idle (no activity) for longer than the timeout  #
# period. This protects against session hijacking by limiting the window of    #
# opportunity for unattended sessions to be exploited.                          #
#                                                                               #
# Configuration:                                                                #
# - Default timeout: 30 minutes (1800 seconds)                                  #
# - Can be customized via SESSION_IDLE_TIMEOUT in settings                      #
#                                                                               #
# How it works:                                                                 #
# 1. On each request from authenticated user, checks last_activity timestamp   #
# 2. If elapsed time > IDLE_TIMEOUT, logs out the user                          #
# 3. Otherwise, updates last_activity to current time                           #
# ----------------------------------------------------------------------------- #

import time
from django.contrib.auth import logout
from django.conf import settings


class SessionIdleTimeoutMiddleware:
    """
    Middleware to log out users after period of inactivity.
    Protects against session hijacking from unattended sessions.
    """

    # Default idle timeout: 30 minutes (in seconds)
    DEFAULT_IDLE_TIMEOUT = 1800

    def __init__(self, get_response):
        self.get_response = get_response
        # Allow customization via settings
        self.idle_timeout = getattr(settings, 'SESSION_IDLE_TIMEOUT', self.DEFAULT_IDLE_TIMEOUT)

    def __call__(self, request):
        if request.user.is_authenticated:
            last_activity = request.session.get('last_activity')
            now = time.time()

            if last_activity and (now - last_activity) > self.idle_timeout:
                # Session has been idle too long - log out the user
                logout(request)
            else:
                # Update last activity timestamp
                request.session['last_activity'] = now

        return self.get_response(request)
