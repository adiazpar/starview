# ----------------------------------------------------------------------------------------------------- #
# This exception_handler.py file provides centralized exception handling for all API endpoints:         #
#                                                                                                       #
# Purpose:                                                                                              #
# Catches ALL exceptions (handled and unhandled) across the entire Django REST Framework application    #
# and formats them into a consistent, secure JSON response structure.                                   #
#                                                                                                       #
# Key Features:                                                                                         #
# - Global exception handling: Catches all DRF, Django, and Python exceptions                           #
# - Consistent response format: All errors return the same JSON structure                               #
# - Security integration: Logs security-relevant errors to AuditLog system                              #
# - Application logging: All errors logged with appropriate severity                                    #
# - Production-safe: Hides sensitive information in production (DEBUG=False)                            #
# - Development-friendly: Shows full error details when DEBUG=True                                      #
#                                                                                                       #
# Standard Error Response Format:                                                                       #
# {                                                                                                     #
#   "detail": "Human-readable error message",                                                           #
#   "error_code": "VALIDATION_ERROR",                                                                   #
#   "status_code": 400,                                                                                 #
#   "errors": {...}  // Optional field-level validation errors                                          #
# }                                                                                                     #
#                                                                                                       #
# Integration:                                                                                          #
# - Configured in settings.py as REST_FRAMEWORK['EXCEPTION_HANDLER']                                    #
# - Integrates with AuditLog system for security event tracking                                         #
# - Works seamlessly with DRF's browsable API and serializer validation                                 #
#                                                                                                       #
# Usage:                                                                                                #
# - No direct imports needed - DRF calls this automatically                                             #
# - Views should raise DRF exceptions (ValidationError, NotFound, PermissionDenied, etc.)               #
# - All exceptions are automatically caught, formatted, and logged                                      #
# ----------------------------------------------------------------------------------------------------- #

# Import tools:
import logging
import traceback
from django.conf import settings
from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from rest_framework import exceptions
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

# Configure logger:
logger = logging.getLogger(__name__)

# Lazy import for audit logging (avoid circular imports):
def get_audit_logger():
    from starview_app.utils import log_permission_denied, log_auth_event
    return log_permission_denied, log_auth_event


# ----------------------------------------------------------------------------- #
# Custom exception handler for Django REST Framework.                           #
#                                                                               #
# This is the global exception handler registered in settings.py that catches   #
# ALL exceptions across the API and formats them consistently. It integrates    #
# with the AuditLog system for security event tracking.                         #
#                                                                               #
# Args:     exc (Exception): The exception that was raised                      #
#           context (dict): Context including request, view, args, kwargs       #
# Returns:  Response: DRF Response with standardized error format               #
#                                                                               #
# 1. Calls DRF's default handler first to handle DRF exceptions                 #
# 2. Handles Django-specific exceptions (Http404, PermissionDenied)             #
# 3. Catches unexpected exceptions (500 errors)                                 #
# 4. Formats all errors consistently                                            #
# 5. Integrates with audit logging for security events                          #
# 6. Logs all errors to application log                                         #
# ----------------------------------------------------------------------------- #
def custom_exception_handler(exc, context):

    # Get request from context for logging
    request = context.get('request')
    view = context.get('view')

    # Call DRF's default exception handler first
    response = drf_exception_handler(exc, context)

    # If DRF handled it, format the response consistently
    if response is not None:
        error_data = format_drf_exception(exc, response)
        response.data = error_data

        # Log security-relevant errors to AuditLog
        log_security_exception(exc, request, response.status_code)

        # Log to application log
        log_exception(exc, request, view, response.status_code)

        return response

    # Handle Django-specific exceptions that DRF doesn't catch
    if isinstance(exc, Http404):
        error_data = {
            'detail': 'Resource not found',
            'error_code': 'NOT_FOUND',
            'status_code': 404
        }
        response = Response(error_data, status=404)
        log_exception(exc, request, view, 404)
        return response

    if isinstance(exc, DjangoPermissionDenied):
        error_data = {
            'detail': str(exc) or 'Permission denied',
            'error_code': 'PERMISSION_DENIED',
            'status_code': 403
        }
        response = Response(error_data, status=403)
        log_security_exception(exc, request, 403)
        log_exception(exc, request, view, 403)
        return response

    # Handle unexpected exceptions (500 errors)
    # This is the safety net for bugs and unhandled cases
    error_data = format_unexpected_exception(exc, request)
    response = Response(error_data, status=500)

    # Log as potential security issue
    log_suspicious_error(exc, request, view)

    # Log detailed error for debugging
    log_exception(exc, request, view, 500, include_traceback=True)

    return response


# ----------------------------------------------------------------------------- #
# Format DRF exception into standardized error response.                        #
#                                                                               #
# Takes a DRF exception and response, extracts error information, and formats   #
# it into our standard error structure. Handles validation errors specially.    #
#                                                                               #
#  Handles:                                                                     #
# - ValidationError (with field-level errors)                                   #
# - AuthenticationFailed                                                        #
# - NotAuthenticated                                                            #
# - PermissionDenied                                                            #
# - NotFound                                                                    #
# - MethodNotAllowed                                                            #
# - Throttled                                                                   #
# - All other DRF exceptions                                                    #
# ----------------------------------------------------------------------------- #
def format_drf_exception(exc, response):
    error_code_map = {
        exceptions.ValidationError: 'VALIDATION_ERROR',
        exceptions.AuthenticationFailed: 'AUTHENTICATION_FAILED',
        exceptions.NotAuthenticated: 'NOT_AUTHENTICATED',
        exceptions.PermissionDenied: 'PERMISSION_DENIED',
        exceptions.NotFound: 'NOT_FOUND',
        exceptions.MethodNotAllowed: 'METHOD_NOT_ALLOWED',
        exceptions.NotAcceptable: 'NOT_ACCEPTABLE',
        exceptions.UnsupportedMediaType: 'UNSUPPORTED_MEDIA_TYPE',
        exceptions.Throttled: 'THROTTLED',
        exceptions.ParseError: 'PARSE_ERROR',
        # Django exceptions (when converted by DRF)
        DjangoPermissionDenied: 'PERMISSION_DENIED',
        Http404: 'NOT_FOUND',
    }

    error_code = error_code_map.get(type(exc), 'API_ERROR')

    # Extract error message
    if hasattr(response.data, 'get') and 'detail' in response.data:
        detail = response.data['detail']
    elif isinstance(response.data, dict):
        # Validation errors might not have 'detail'
        detail = 'Validation failed' if error_code == 'VALIDATION_ERROR' else 'Request failed'
    else:
        detail = str(exc)

    # Override detail for Http404 to use consistent message
    if isinstance(exc, Http404):
        detail = 'Resource not found'

    # Clean up ErrorDetail objects from DRF ValidationError
    # DRF wraps error messages in ErrorDetail objects, which when converted
    # to string show as "[ErrorDetail(string='message', code='invalid')]"
    # Extract the actual message string from ErrorDetail list
    detail_str = str(detail)
    if isinstance(detail, list) and len(detail) > 0:
        # Extract first error from list
        detail_str = str(detail[0])

    # If it's still an ErrorDetail representation, extract the message
    if detail_str.startswith('[ErrorDetail(') or detail_str.startswith('ErrorDetail('):
        # Try to extract the actual message using string manipulation
        # Format: "ErrorDetail(string='message', code='code')"
        import re
        match = re.search(r"string=['\"](.+?)['\"]", detail_str)
        if match:
            detail_str = match.group(1)

    error_data = {
        'detail': detail_str,
        'error_code': error_code,
        'status_code': response.status_code
    }

    # Add field-level validation errors if present
    if isinstance(exc, exceptions.ValidationError):
        if isinstance(response.data, dict) and 'detail' not in response.data:
            # This is a field-level validation error
            error_data['errors'] = response.data

    # Add wait time for throttled requests
    if isinstance(exc, exceptions.Throttled):
        error_data['retry_after'] = exc.wait

    return error_data


# ----------------------------------------------------------------------------- #
# Format unexpected exception (500 error) into safe error response.             #
#                                                                               #
# Handles bugs and unhandled exceptions. In production, hides sensitive         #
# information. In development, shows full error details for debugging.          #
#                                                                               #
# In production (DEBUG=False):                                                  #
# - Returns generic error message                                               #
# - Hides exception type, message, and traceback                                #
#                                                                               #
# In development (DEBUG=True):                                                  #
# - Returns full error details                                                  #
# - Includes exception type and message for debugging                           #
# ----------------------------------------------------------------------------- #
def format_unexpected_exception(exc, request):
    if settings.DEBUG:
        # Development: Show full error details
        error_data = {
            'detail': f'Internal server error: {type(exc).__name__}: {str(exc)}',
            'error_code': 'SERVER_ERROR',
            'status_code': 500,
            'exception_type': type(exc).__name__,
            'exception_message': str(exc)
        }
    else:
        # Production: Hide sensitive details
        error_data = {
            'detail': 'Internal server error. Please try again later.',
            'error_code': 'SERVER_ERROR',
            'status_code': 500
        }

    return error_data


# ----------------------------------------------------------------------------- #
# Log security-relevant exceptions to AuditLog system.                          #
#                                                                               #
# Integrates with the AuditLog system to track authentication failures,         #
# permission denials, and other security-relevant errors.                       #
#                                                                               #
# Logs:                                                                         #
# - Authentication failures (401)                                               #
# - Permission denials (403)                                                    #
# ----------------------------------------------------------------------------- #
def log_security_exception(exc, request, status_code):
    if not request:
        return

    try:
        log_permission_denied, log_auth_event = get_audit_logger()

        # Log permission denials
        if status_code == 403 or isinstance(exc, (exceptions.PermissionDenied, DjangoPermissionDenied)):
            user = request.user if hasattr(request, 'user') and request.user.is_authenticated else None
            resource = f"{request.method} {request.path}"

            log_permission_denied(
                request=request,
                user=user,
                resource=resource,
                message=str(exc) or 'Permission denied',
                metadata={'status_code': status_code}
            )

        # Log authentication failures
        elif status_code == 401 or isinstance(exc, (exceptions.AuthenticationFailed, exceptions.NotAuthenticated)):
            log_auth_event(
                request=request,
                event_type='login_failed',
                success=False,
                message=str(exc) or 'Authentication failed',
                metadata={
                    'reason': 'invalid_credentials',
                    'endpoint': request.path,
                    'status_code': status_code
                }
            )
    except Exception as e:
        # Never let audit logging break the request
        logger.error("Failed to log security exception to AuditLog: %s", e)


# ----------------------------------------------------------------------------- #
# Log suspicious 500 errors to AuditLog as potential security issues.           #
#                                                                               #
# Unexpected exceptions might indicate attacks, bugs, or security issues.       #
# Log them for investigation.                                                   #
#                                                                               #
#  Helps detect:                                                                #
# - SQL injection attempts                                                      #
# - Code injection attempts                                                     #
# - Exploits targeting bugs                                                     #
# - DoS attempts                                                                #
# ----------------------------------------------------------------------------- #
def log_suspicious_error(exc, request, view):
    if not request:
        return

    try:
        log_permission_denied, log_auth_event = get_audit_logger()

        user = request.user if hasattr(request, 'user') and request.user.is_authenticated else None
        view_name = view.__class__.__name__ if view else 'Unknown'

        # Use log_permission_denied to track suspicious activity
        log_permission_denied(
            request=request,
            user=user,
            resource=f"{request.method} {request.path}",
            message=f"Unexpected exception in {view_name}: {type(exc).__name__}",
            metadata={
                'exception_type': type(exc).__name__,
                'exception_message': str(exc),
                'view': view_name,
                'method': request.method,
                'error_category': 'suspicious_activity'
            }
        )
    except Exception as e:
        # Never let audit logging break the request
        logger.error("Failed to log suspicious error to AuditLog: %s", e)


# ----------------------------------------------------------------------------- #
# Log exception to application log for debugging and monitoring.                #
#                                                                               #
# All exceptions are logged with context for debugging. Level depends on        #
# severity: warning for client errors (4xx), error for server errors (5xx).     #
#                                                                               #
# Logs with context:                                                            #
# - Exception type and message                                                  #
# - Request method, path, user                                                  #
# - View that raised the exception                                              #
# - Full traceback for 500 errors                                               #
# ----------------------------------------------------------------------------- #
def log_exception(exc, request, view, status_code, include_traceback=False):
    user = 'Anonymous'
    if request and hasattr(request, 'user') and request.user.is_authenticated:
        user = request.user.username

    path = request.path if request else 'Unknown'
    method = request.method if request else 'Unknown'
    view_name = view.__class__.__name__ if view else 'Unknown'

    log_message = (
        f"{type(exc).__name__} in {view_name}: {str(exc)} | "
        f"User: {user} | {method} {path} | Status: {status_code}"
    )

    # Use appropriate log level
    if status_code >= 500:
        if include_traceback:
            logger.error(log_message, exc_info=True)
        else:
            logger.error(log_message)
    elif status_code >= 400:
        logger.warning(log_message)
    else:
        logger.info(log_message)
