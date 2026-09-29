# ----------------------------------------------------------------------------------------------------- #
# This middleware.py file contains custom middleware for the Starview application:                      #
#                                                                                                       #
# Purpose:                                                                                              #
# Provides request/response processing middleware to handle cross-cutting concerns like language        #
# detection for internationalization (i18n).                                                            #
#                                                                                                       #
# Key Features:                                                                                         #
# - Browser language detection: Automatically detects user's preferred language from Accept-Language    #
# - Explicit language preferences: Reads the profile or language cookie                                #
# - Email localization: Ensures verification emails are sent in the user's preferred language           #
#                                                                                                       #
# Integration:                                                                                          #
# Registered in settings.py MIDDLEWARE list after AuthenticationMiddleware                              #
# ----------------------------------------------------------------------------------------------------- #

from django.utils import translation
from django.conf import settings


# ----------------------------------------------------------------------------- #
# Middleware that detects the user's preferred language from their browser      #
# settings and activates it for the current request.                            #
#                                                                               #
# This ensures that:                                                            #
# 1. Emails are sent in the user's preferred language                           #
# 2. API responses use the correct language                                     #
# 3. Automatic detection never becomes a saved language preference             #
#                                                                               #
# Language detection order:                                                     #
# 1. Authenticated user's language_preference (from UserProfile)                #
# 2. Explicit language cookie                                                  #
# 3. Browser Accept-Language header                                             #
# 4. Default language (settings.LANGUAGE_CODE)                                  #
# ----------------------------------------------------------------------------- #
class BrowserLanguageMiddleware:

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        language = None

        # 1. Check authenticated user's language preference first
        if hasattr(request, 'user') and request.user.is_authenticated:
            try:
                user_language = getattr(request.user.userprofile, 'language_preference', None)
                if user_language:
                    language = user_language
            except AttributeError:
                # UserProfile may not exist in some edge cases
                pass

        # 2. An explicit guest choice takes precedence over a legacy session cache.
        supported = {code.lower(): code for code, _ in settings.LANGUAGES}
        if not language:
            cookie_language = request.COOKIES.get(settings.LANGUAGE_COOKIE_NAME, '')
            language = supported.get(cookie_language.lower())
        # 3. Fall back to browser Accept-Language header
        if not language:
            language = self.get_language_from_request(request)

            # Detection is not a saved preference. In particular, do not create
            # a session on Apple's cookie-less POST and overwrite its OAuth state.

        # Activate the language for this request
        if language:
            translation.activate(language)
            request.LANGUAGE_CODE = language

        try:
            return self.get_response(request)
        finally:
            translation.deactivate()


    # ----------------------------------------------------------------------------- #
    # Extract preferred language from the Accept-Language header.                   #
    #                                                                               #
    # Returns the first supported language that matches the user's preferences,     #
    # or None if no match is found (will fall back to default).                     #
    # ----------------------------------------------------------------------------- #
    def get_language_from_request(self, request):
        # Django handles quality weights and regional fallbacks. Return the
        # canonical code shared by settings, stored profiles and frontend locales.
        detected = translation.get_language_from_request(request)
        return next((code for code, _ in settings.LANGUAGES
                     if code.lower() == detected.lower()), settings.LANGUAGE_CODE)
