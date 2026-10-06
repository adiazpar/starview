# ----------------------------------------------------------------------------------------------------- #
# This __init__.py file marks the serializers directory as a Python package and exposes all             #
# serializers:                                                                                          #
#                                                                                                       #
# Purpose:                                                                                              #
# This file imports all serializer classes and makes them available at the package level. This allows   #
# cleaner imports throughout the application (e.g., `from starview_app.serializers import                  #
# ReviewSerializer` instead of `from starview_app.serializers.serializer_review import ReviewSerializer`). #
#                                                                                                       #
# Serializer Organization:                                                                              #
# Serializers are separated into individual files by domain for better organization and                 #
# maintainability.                                                                                      #
#                                                                                                       #
# Django Integration:                                                                                   #
# Django REST Framework automatically discovers serializers imported here and makes them available      #
# for use in views. All serializers imported here can be referenced in views.py files.                  #
# ----------------------------------------------------------------------------------------------------- #

# Review serializers:
from .serializer_review import (
    ReviewSerializer,
    ReviewCommentSerializer,
    ReviewPhotoSerializer,
)

# Location serializers:
from .serializer_location import (
    LocationSerializer,
    LocationListSerializer,
    MapLocationSerializer,
    LocationInfoPanelSerializer,
)

# User serializers:
from .serializer_user import (
    PublicUserSerializer,
    PrivateProfileSerializer,
)

# Favorite location serializers:
from .serializer_favorite import (
    FavoriteLocationSerializer,
)

# Vote serializer (ContentTypes framework):
from .serializer_vote import (
    VoteSerializer,
)

# Report serializer (ContentTypes framework):
from .serializer_report import (
    ReportSerializer,
)

# Expose all serializers for easier imports:
__all__ = [
    # Review serializers
    'ReviewSerializer',
    'ReviewCommentSerializer',
    'ReviewPhotoSerializer',

    # Location serializers
    'LocationSerializer',
    'LocationListSerializer',
    'MapLocationSerializer',
    'LocationInfoPanelSerializer',

    # User serializers
    'PublicUserSerializer',
    'PrivateProfileSerializer',

    # Favorite location serializers
    'FavoriteLocationSerializer',

    # Generic serializers
    'VoteSerializer',
    'ReportSerializer',
]
