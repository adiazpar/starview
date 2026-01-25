# ----------------------------------------------------------------------------------------------------- #
# This audit_logger.py file provides centralized audit logging utilities:                               #
#                                                                                                       #
# Purpose:                                                                                              #
# Provides a single point of entry for logging security-relevant events to the database (AuditLog       #
# model). Ensures consistent logging format and automatic context capture.                              #
#                                                                                                       #
# Key Features:                                                                                         #
# - Database storage: All audit events stored in AuditLog table (queryable, persistent)                 #
# - Automatic context capture: Extracts IP address, user agent from request                             #
# - Proxy-aware IP extraction: Handles X-Forwarded-For header for reverse proxies                       #
# - Thread-safe: Safe to use in multi-threaded environments                                             #
# - Flexible metadata: Accepts arbitrary JSON-serializable metadata                                     #
#                                                                                                       #
# Functions:                                                                                            #
# - log_auth_event(): Log authentication events (login, logout, password change)                        #
# - log_admin_action(): Log admin/staff actions (location verification, moderation)                     #
# - log_permission_denied(): Log unauthorized access attempts                                           #
# - get_client_ip(): Extract client IP address from request (handles proxies)                           #
# - get_user_agent(): Extract user agent string from request                                            #
#                                                                                                       #
# Usage Example:                                                                                        #
#   from starview_app.utils.audit_logger import log_auth_event                                          #
#                                                                                                       #
#   # In your view:                                                                                     #
#   log_auth_event(                                                                                     #
#       request=request,                                                                                #
#       event_type='login_success',                                                                     #
#       user=user,                                                                                      #
#       success=True,                                                                                   #
#       message='User logged in successfully',                                                          #
#       metadata={'method': 'password'}                                                                 #
#   )                                                                                                   #
#                                                                                                       #
# Archival:                                                                                             #
# Old audit logs are archived to R2 cloud storage via `archive_audit_logs` management command.          #
# Archives can be restored via `restore_audit_logs` command if database needs recovery.                 #
#                                                                                                       #
# Security Note:                                                                                        #
# This module handles sensitive security data. Database access should be restricted appropriately.      #
# ----------------------------------------------------------------------------------------------------- #

# Import tools:
from django.conf import settings
from django.apps import apps


# Lazy-load AuditLog model to avoid circular import:
def get_audit_log_model():
    return apps.get_model('starview_app', 'AuditLog')


# ----------------------------------------------------------------------------- #
# Extract client IP address from request, handling reverse proxies.             #
#                                                                               #
# Checks X-Forwarded-For header first (for reverse proxies like nginx,          #
# Apache, or cloud load balancers), then falls back to REMOTE_ADDR.             #
#                                                                               #
# Args:     request: Django HTTP request object                                 #
# Returns:  str: Client IP address (IPv4 or IPv6)                               #
# ----------------------------------------------------------------------------- #
def get_client_ip(request):
    # Check X-Forwarded-For header (used by proxies):
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        # Take the first IP if multiple are present (client IP):
        ip = x_forwarded_for.split(',')[0].strip()
    else:
        # No proxy, use direct connection IP:
        ip = request.META.get('REMOTE_ADDR')
    return ip


# ----------------------------------------------------------------------------- #
# Extract user agent string from request.                                       #
#                                                                               #
# Returns the User-Agent header which contains browser/client information.      #
#                                                                               #
# Args:     request: Django HTTP request object                                 #
# Returns:  str: User agent string (or empty string if not present)             #
# ----------------------------------------------------------------------------- #
def get_user_agent(request):
    return request.META.get('HTTP_USER_AGENT', '')


# ----------------------------------------------------------------------------- #
# Log an authentication event to database and file.                             #
#                                                                               #
# Records authentication-related events (login, logout, registration,           #
# password changes) with full context (user, IP, user agent, metadata).         #
#                                                                               #
# Args:     request: Django HTTP request object                                 #
#           event_type (str): Event type (login_success, login_failed, etc.)    #
#           user (User): Django User object (optional, None for failed logins)  #
#           username (str): Username attempted (optional, for failed logins)    #
#           success (bool): Whether the action succeeded (default: True)        #
#           message (str): Human-readable event description                     #
#           metadata (dict): Additional event-specific data (optional)          #
# Returns:  AuditLog: Created AuditLog instance                                 #
# ----------------------------------------------------------------------------- #
def log_auth_event(request, event_type, user=None, username='', success=True, message='', metadata=None):
    # Skip audit logging in development (no need for audit trails locally)
    if settings.DEBUG:
        return None

    # Extract request context:
    ip_address = get_client_ip(request)
    user_agent = get_user_agent(request)

    # Ensure username is set (from user object if available):
    if user and not username:
        username = user.username

    # Ensure metadata is a dict:
    if metadata is None:
        metadata = {}

    # Get AuditLog model (lazy-loaded to avoid circular import):
    AuditLog = get_audit_log_model()

    # Create database record:
    audit_log = AuditLog.objects.create(
        event_type=event_type,
        user=user,
        username=username,
        ip_address=ip_address,
        user_agent=user_agent,
        success=success,
        message=message,
        metadata=metadata,
    )

    return audit_log


# ----------------------------------------------------------------------------- #
# Log an admin action to database.                                              #
#                                                                               #
# Records privileged administrative actions (location verification, content     #
# moderation, user management) with full context.                               #
#                                                                               #
# Args:     request: Django HTTP request object                                 #
#           event_type (str): Event type (location_verified, etc.)              #
#           user (User): Django User object performing the action               #
#           message (str): Human-readable event description                     #
#           metadata (dict): Additional event-specific data (optional)          #
# Returns:  AuditLog: Created AuditLog instance                                 #
# ----------------------------------------------------------------------------- #
def log_admin_action(request, event_type, user, message='', metadata=None):
    # Skip audit logging in development (no need for audit trails locally)
    if settings.DEBUG:
        return None

    # Extract request context:
    ip_address = get_client_ip(request)
    user_agent = get_user_agent(request)

    # Ensure metadata is a dict:
    if metadata is None:
        metadata = {}

    # Get AuditLog model (lazy-loaded to avoid circular import):
    AuditLog = get_audit_log_model()

    # Create database record:
    audit_log = AuditLog.objects.create(
        event_type=event_type,
        user=user,
        username=user.username,
        ip_address=ip_address,
        user_agent=user_agent,
        success=True,  # Admin actions are always successful if they execute
        message=message,
        metadata=metadata,
    )

    return audit_log


# ----------------------------------------------------------------------------- #
# Log a permission denied event to database.                           #
#                                                                               #
# Records unauthorized access attempts (403 Forbidden responses, permission     #
# denials) with full context.                                                   #
#                                                                               #
# Args:     request: Django HTTP request object                                 #
#           user (User): Django User object attempting access (optional)        #
#           resource (str): Resource/URL that was denied                        #
#           message (str): Human-readable event description                     #
#           metadata (dict): Additional event-specific data (optional)          #
# Returns:  AuditLog: Created AuditLog instance                                 #
# ----------------------------------------------------------------------------- #
def log_permission_denied(request, user=None, resource='', message='', metadata=None):
    # Skip audit logging in development (no need for audit trails locally)
    if settings.DEBUG:
        return None

    # Extract request context:
    ip_address = get_client_ip(request)
    user_agent = get_user_agent(request)

    # Get username (or 'anonymous' for unauthenticated users):
    username = user.username if user else 'anonymous'

    # Ensure metadata is a dict and add resource info:
    if metadata is None:
        metadata = {}
    metadata['resource'] = resource

    # Get AuditLog model (lazy-loaded to avoid circular import):
    AuditLog = get_audit_log_model()

    # Create database record:
    audit_log = AuditLog.objects.create(
        event_type='permission_denied',
        user=user,
        username=username,
        ip_address=ip_address,
        user_agent=user_agent,
        success=False,  # Permission denials are failed actions
        message=message,
        metadata=metadata,
    )

    return audit_log
