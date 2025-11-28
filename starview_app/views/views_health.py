# ----------------------------------------------------------------------------------------------------- #
# Health Check Endpoint - Production Monitoring                                                         #
#                                                                                                       #
# Purpose:                                                                                              #
# Provides a comprehensive health check endpoint for load balancer monitoring, uptime tracking, and     #
# operational status verification. This endpoint verifies that all critical services (database, cache,  #
# background workers) are functioning correctly before the load balancer routes traffic to this         #
# instance.                                                                                             #
#                                                                                                       #
# Architecture:                                                                                         #
# - Plain Django function-based view (not DRF)                                                          #
# - Uses Django's JsonResponse for simple JSON responses                                                #
# - No authentication required (public endpoint for load balancer health checks)                        #
# - No rate limiting (called frequently by infrastructure, not users)                                   #
# - Returns 200 OK when all services are healthy (load balancer continues routing traffic)              #
# - Returns 503 Service Unavailable when any critical service fails (load balancer removes instance)    #
# - Checks are performed in order of criticality: database → cache → Celery                             #
# - Non-blocking: All checks complete in <100ms to avoid timeout issues                                 #
#                                                                                                       #
# Why Not DRF:                                                                                          #
# Infrastructure monitoring endpoint that doesn't need DRF features. Called by load balancers and       #
# monitoring services, not users. Plain Django is simpler and faster for health checks.                 #
#                                                                                                       #
# Health Checks Performed:                                                                              #
# 1. Database (PostgreSQL): Verifies connection pool and query execution                                #
# 2. Cache (Redis): Tests connection and read/write operations                                          #
# 3. Celery Worker: Verifies broker connection and worker availability (when enabled)                   #
#                                                                                                       #
# Use Cases:                                                                                            #
# - Render load balancer pings /health/ every 30 seconds                                                #
# - Uptime monitoring services (Pingdom, UptimeRobot, etc.)                                             #
# - Deployment verification (zero-downtime rollouts)                                                    #
# - Debugging production issues (is service X down?)                                                    #
# ----------------------------------------------------------------------------------------------------- #

from django.http import JsonResponse
from django.db import connection
from django.core.cache import cache
from django.conf import settings
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)


def health_check(request):
    checks = {}
    errors = []
    is_healthy = True

    # 1. Database Health Check (CRITICAL)
    try:
        connection.ensure_connection()
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        checks["database"] = "ok"
    except Exception as e:
        checks["database"] = "error"
        errors.append(f"Database connection failed: {str(e)}")
        is_healthy = False
        logger.error("Health check - Database failure: %s", e, exc_info=True)

    # 2. Redis Cache Health Check (CRITICAL)
    try:
        # Test cache write and read
        cache_key = "_health_check_test"
        cache_value = "ok"
        cache.set(cache_key, cache_value, timeout=10)
        retrieved_value = cache.get(cache_key)

        if retrieved_value == cache_value:
            checks["cache"] = "ok"
        else:
            checks["cache"] = "error"
            errors.append("Cache read/write mismatch")
            is_healthy = False
            logger.error("Health check - Cache read/write mismatch")
    except Exception as e:
        checks["cache"] = "error"
        errors.append(f"Cache connection failed: {str(e)}")
        is_healthy = False
        logger.error("Health check - Cache failure: %s", e, exc_info=True)

    # 3. Celery Worker Health Check (CONDITIONAL)
    celery_enabled = getattr(settings, 'CELERY_ENABLED', False)

    if not celery_enabled:
        # Celery is intentionally disabled (FREE tier mode)
        checks["celery"] = "disabled"
    else:
        # Celery should be running - verify broker connection and worker availability
        try:
            from django_project.celery import app as celery_app

            # Check broker connection
            inspect = celery_app.control.inspect()

            # Get active workers with timeout to prevent hanging
            active_workers = inspect.active(timeout=1.0)

            if active_workers:
                checks["celery"] = "ok"
            else:
                checks["celery"] = "error"
                errors.append("No active Celery workers found")
                is_healthy = False
                logger.warning("Health check - No active Celery workers (CELERY_ENABLED=True)")

        except Exception as e:
            checks["celery"] = "error"
            errors.append(f"Celery broker connection failed: {str(e)}")
            is_healthy = False
            logger.error("Health check - Celery failure: %s", e, exc_info=True)

    # Build response
    response_data = {
        "status": "healthy" if is_healthy else "unhealthy",
        "timestamp": timezone.now().isoformat(),
        "checks": checks
    }

    if errors:
        response_data["errors"] = errors

    # Return appropriate HTTP status code
    status_code = 200 if is_healthy else 503

    return JsonResponse(response_data, status=status_code)
