# ----------------------------------------------------------------------------------------------------- #
# This __init__.py file marks the services directory as a Python package and exposes service classes:   #
#                                                                                                       #
# Purpose:                                                                                              #
# This file imports service classes and makes them available at the package level. This allows          #
# cleaner imports throughout the application (e.g., `from starview_app.services import LocationService`    #
# instead of `from starview_app.services.location_service import LocationService`).                        #
#                                                                                                       #
# Service Layer Pattern:                                                                                #
# The services directory contains business logic separated from models and views. Services handle:      #
# - External API integrations (Mapbox for geocoding and elevation)                                      #
# - Complex calculations (quality scores, data enrichment)                                              #
# - Reusable business operations that don't belong in models or views                                   #
#                                                                                                       #
# Why Service Layer:                                                                                    #
# - Keeps models thin and focused on data structure                                                     #
# - Keeps views focused on request/response handling                                                    #
# - Makes business logic reusable and testable                                                          #
# - Centralizes external API calls for easier maintenance                                               #
# ----------------------------------------------------------------------------------------------------- #

from .location_service import LocationService
from .password_service import PasswordService
from .report_service import ReportService
from .vote_service import VoteService

# Badge service and PhotoVoteService not imported here to avoid circular dependency
# (models import services, these services import models)
# Import directly when needed:
#   from starview_app.services.badge_service import BadgeService
#   from starview_app.services.photo_vote_service import PhotoVoteService