# ----------------------------------------------------------------------------------------------------- #
# This middleware.py file contains custom middleware for the Starview application:                      #
#                                                                                                       #
# Purpose:                                                                                              #
# Provides request/response processing middleware to handle cross-cutting concerns like language        #
# detection for internationalization (i18n).                                                            #
#                                                                                                       #
# Key Features:                                                                                         #
# - Browser language detection: Automatically detects user's preferred language from Accept-Language    #
# - Session-based language persistence: Remembers language choice across requests                       #
# - Email localization: Ensures verification emails are sent in the user's preferred language           #
#                                                                                                       #
# Integration:                                                                                          #
# Registered in settings.py MIDDLEWARE list after SessionMiddleware and before CommonMiddleware         #
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
# 3. Language preference is stored in session for consistency                   #
#                                                                               #
# Language detection order:                                                     #
# 1. Authenticated user's language_preference (from UserProfile)                #
# 2. Session language (if previously set)                                       #
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

        # 2. Fall back to session language
        if not language:
            language = request.session.get('django_language')

        # 3. Fall back to browser Accept-Language header
        if not language:
            language = self.get_language_from_request(request)

            # Store in session for future requests
            if language:
                request.session['django_language'] = language

        # Activate the language for this request
        if language:
            translation.activate(language)
            request.LANGUAGE_CODE = language

        response = self.get_response(request)

        # Deactivate after request
        translation.deactivate()

        return response


    # ----------------------------------------------------------------------------- #
    # Extract preferred language from the Accept-Language header.                   #
    #                                                                               #
    # Returns the first supported language that matches the user's preferences,     #
    # or None if no match is found (will fall back to default).                     #
    # ----------------------------------------------------------------------------- #
    def get_language_from_request(self, request):
        accept_language = request.META.get('HTTP_ACCEPT_LANGUAGE', '')

        if not accept_language:
            return None

        # Parse Accept-Language header
        # Format: "en-US,en;q=0.9,es;q=0.8" -> ['en-US', 'en', 'es']
        languages = []
        for lang_string in accept_language.split(','):
            lang = lang_string.split(';')[0].strip()
            languages.append(lang)

        # Get list of supported language codes
        supported_languages = [lang_code for lang_code, lang_name in settings.LANGUAGES]

        # Match browser languages with supported languages
        for browser_lang in languages:
            # Try exact match first (e.g., 'es-MX')
            if browser_lang in supported_languages:
                return browser_lang

            # Try base language (e.g., 'es' from 'es-MX')
            base_lang = browser_lang.split('-')[0]
            if base_lang in supported_languages:
                return base_lang

        return None
