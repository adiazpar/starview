# ----------------------------------------------------------------------------------------------------- #
# This __init__.py file marks the utils directory as a Python package and exposes utility modules:      #
#                                                                                                       #
# Purpose:                                                                                              #
# Centralizes reusable utility code that provides cross-cutting functionality across stars_app.         #
# These utilities handle validation, rate limiting, and signal handling - concerns that span multiple   #
# parts of the application (models, views, serializers).                                                #
#                                                                                                       #
# Why This Directory Exists:                                                                            #
# - Prevents circular imports between models/views/serializers                                          #
# - Follows Django convention for organizing utility modules                                            #
# - Enables clean imports: `from starview_app.utils import validate_image_file`                            #
# - Groups related functionality (security validators, throttles, signals)                              #
#                                                                                                       #
# Modules in This Package:                                                                              #
# - validators.py: File upload validation, coordinate validation, XSS sanitization                      #
# - throttles.py: DRF rate limiting classes (login, content creation, voting, reporting)                #
# - cache.py: Redis caching utilities (key generation, invalidation helpers)                            #
# - audit_logger.py: Security audit logging (authentication events, admin actions)                      #
# - exception_handler.py: Global exception handler for consistent error responses (Phase 4)             #
# - signals.py: Django signal handlers (file cleanup, aggregate updates)                                #
#                                                                                                       #
# Note on signals.py:                                                                                   #
# The signals module is NOT imported here to avoid circular imports (signals imports models, models     #
# import validators from utils). Signal handlers are automatically registered via AppConfig.ready().    #
# ----------------------------------------------------------------------------------------------------- #

# Import all validators
from .validators import (
    validate_file_size,
    validate_image_file,
    sanitize_html,
    sanitize_plain_text,
    validate_latitude,
    validate_longitude,
    validate_elevation,
)

# Import all throttle classes
from .throttles import (
    LoginRateThrottle,
    PasswordResetThrottle,
    ContentCreationThrottle,
    VoteThrottle,
    ReportThrottle,
    DirectionsThrottle,
)

# Import cache utilities
from .cache import (
    location_list_key,
    location_detail_key,
    map_geojson_key,
    review_list_key,
    user_favorites_key,
    invalidate_location_list,
    invalidate_location_detail,
    invalidate_map_geojson,
    invalidate_user_map_geojson,
    invalidate_review_list,
    invalidate_user_favorites,
    invalidate_all_location_caches,
    get_or_set_cache,
)

# Import audit logging utilities
from .audit_logger import (
    log_auth_event,
    log_admin_action,
    log_permission_denied,
    get_client_ip,
    get_user_agent,
)

# Import exception handler
from .exception_handler import (
    custom_exception_handler,
)

# Import cursor pagination utilities
from .pagination import (
    encode_cursor,
    decode_cursor,
    build_cursor_response,
)

__all__ = [
    # Validators
    'validate_file_size',
    'validate_image_file',
    'sanitize_html',
    'sanitize_plain_text',
    'validate_latitude',
    'validate_longitude',
    'validate_elevation',

    # Throttles
    'LoginRateThrottle',
    'PasswordResetThrottle',
    'ContentCreationThrottle',
    'VoteThrottle',
    'ReportThrottle',
    'DirectionsThrottle',

    # Cache utilities
    'location_list_key',
    'location_detail_key',
    'map_geojson_key',
    'review_list_key',
    'user_favorites_key',
    'invalidate_location_list',
    'invalidate_location_detail',
    'invalidate_map_geojson',
    'invalidate_user_map_geojson',
    'invalidate_review_list',
    'invalidate_user_favorites',
    'invalidate_all_location_caches',
    'get_or_set_cache',

    # Audit logging
    'log_auth_event',
    'log_admin_action',
    'log_permission_denied',
    'get_client_ip',
    'get_user_agent',

    # Exception handler
    'custom_exception_handler',

    # Cursor pagination
    'encode_cursor',
    'decode_cursor',
    'build_cursor_response',
]
