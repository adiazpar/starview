# ----------------------------------------------------------------------------------------------------- #
# This apps.py file configures the starview_app Django application:                                     #
#                                                                                                       #
# Configuration:                                                                                        #
# - default_auto_field: Uses BigAutoField for auto-generated primary keys (64-bit integers)             #
# - name: Application identifier that must match INSTALLED_APPS in settings.py                          #
# - ready(): Startup hook that imports signals.py to register signal handlers                           #
#                                                                                                       #
# Execution Flow:                                                                                       #
# Django startup → Loads INSTALLED_APPS → Instantiates StarviewAppConfig → Calls ready() →              #
# Imports signals.py → Registers @receiver decorators for file cleanup                                  #
#                                                                                                       #
# Critical: Without ready() importing signals, the 4 signal handlers (UserProfile, ReviewPhoto,         #
# Review, and Location deletions) won't register and orphaned files will remain on disk.                #
# ----------------------------------------------------------------------------------------------------- #

# Import tools:
from django.apps import AppConfig


class StarviewAppConfig(AppConfig):
    # BigAutoField for 64-bit auto-incrementing primary keys:
    default_auto_field = 'django.db.models.BigAutoField'

    # Application name (must match settings.py INSTALLED_APPS):
    name = 'starview_app'


    # Registers signal handlers by importing signals.py when app is ready:
    def ready(self):
        import starview_app.utils.signals

        # Register HEIF/HEIC image support with Pillow
        from pillow_heif import register_heif_opener
        register_heif_opener()
