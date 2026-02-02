# ----------------------------------------------------------------------------------------------------- #
# This tasks.py file defines Celery tasks for asynchronous background processing:                       #
#                                                                                                       #
# Purpose:                                                                                              #
# Handles time-consuming operations asynchronously to improve user experience and application           #
# responsiveness. Users get instant feedback while heavy operations run in the background.              #
#                                                                                                       #
# Key Tasks:                                                                                            #
# - enrich_location_data: Fetches address and elevation from Mapbox (2-5 seconds)                       #
# - Future tasks: Bulk email sending, image processing, data exports, report generation                 #
#                                                                                                       #
# Architecture:                                                                                         #
# - Tasks are queued in Redis broker when triggered                                                     #
# - Celery worker processes tasks in background                                                         #
# - Results stored in Redis (expire after 1 hour)                                                       #
# - Location model calls .delay() to trigger async execution                                            #
#                                                                                                       #
# Usage:                                                                                                #
# Synchronous:  enrich_location_data(location_id)           # Blocks until complete                     #
# Asynchronous: enrich_location_data.delay(location_id)     # Returns immediately                       #
# ----------------------------------------------------------------------------------------------------- #

from celery import shared_task
from celery.utils.log import get_task_logger
from django.conf import settings

# Get Celery logger (integrates with Celery's logging system)
logger = get_task_logger(__name__)


# ----------------------------------------------------------------------------- #
# Enriches a location with address and elevation data from Mapbox.              #
#                                                                               #
# This task runs asynchronously in the background, allowing location creation   #
# to return instantly to the user. The location starts with basic data          #
# (name, coordinates) and is enriched with address/elevation a few seconds      #
# later.                                                                        #
#                                                                               #
# Args:                                                                         #
#   location_id (int): The ID of the Location object to enrich                  #
#                                                                               #
# Returns:                                                                      #
#   dict: Success status and enriched fields                                    #
#                                                                               #
# Task Settings:                                                                #
#   - bind=True: Task instance passed as first arg (enables self.retry())       #
#   - max_retries=3: Retry up to 3 times on failure                             #
#   - default_retry_delay=60: Wait 60 seconds between retries                   #
#                                                                               #
# Error Handling:                                                               #
#   - If Mapbox API fails, task retries up to 3 times                           #
#   - If location not found (deleted), task fails gracefully                    #
#   - Logs all operations for monitoring and debugging                          #
# ----------------------------------------------------------------------------- #
@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def enrich_location_data(self, location_id):
    """
    Asynchronously enriches a location with address and elevation data from Mapbox.

    This task is triggered after a location is created, allowing the user to get
    an instant response while the enrichment happens in the background.
    """
    from starview_app.models import Location
    from starview_app.services.location_service import LocationService

    logger.info("Starting enrichment for location ID: %s", location_id)

    try:
        # Get the location object
        location = Location.objects.get(id=location_id)

        # Skip if external APIs are disabled (testing mode)
        if getattr(settings, 'DISABLE_EXTERNAL_APIS', False):
            logger.info("Skipping enrichment for location %s (APIs disabled)", location_id)
            return {
                'status': 'skipped',
                'location_id': location_id,
                'reason': 'DISABLE_EXTERNAL_APIS is True'
            }

        # Track which fields were successfully enriched
        enriched_fields = []

        # Enrich address from coordinates
        try:
            address_success = LocationService.update_address_from_coordinates(location)
            if address_success:
                enriched_fields.append('address')
                logger.info("Address enriched for location %s: %s", location_id, location.formatted_address)
            else:
                logger.warning("Address enrichment failed for location %s", location_id)
        except Exception as e:
            logger.error("Error enriching address for location %s: %s", location_id, e)
            # Don't fail the entire task if address fails, continue to elevation

        # Enrich elevation from Mapbox
        try:
            elevation_success = LocationService.update_elevation_from_mapbox(location)
            if elevation_success:
                enriched_fields.append('elevation')
                logger.info("Elevation enriched for location %s: %sm", location_id, location.elevation)
            else:
                logger.warning("Elevation enrichment failed for location %s", location_id)
        except Exception as e:
            logger.error("Error enriching elevation for location %s: %s", location_id, e)

        # Return success with enriched fields
        result = {
            'status': 'success',
            'location_id': location_id,
            'location_name': location.name,
            'enriched_fields': enriched_fields,
            'formatted_address': location.formatted_address,
            'elevation': location.elevation
        }

        logger.info("Enrichment complete for location %s: %s", location_id, enriched_fields)
        return result

    except Location.DoesNotExist:
        # Location was deleted before enrichment could complete
        logger.error("Location %s not found - may have been deleted", location_id)
        return {
            'status': 'error',
            'location_id': location_id,
            'error': 'Location not found (may have been deleted)'
        }

    except Exception as exc:
        # Unexpected error - retry the task
        logger.error("Unexpected error enriching location %s: %s", location_id, exc)

        # Retry the task (up to max_retries times)
        try:
            raise self.retry(exc=exc)
        except self.MaxRetriesExceededError:
            logger.error("Max retries exceeded for location %s", location_id)
            return {
                'status': 'failed',
                'location_id': location_id,
                'error': f'Max retries exceeded: {str(exc)}'
            }


# ----------------------------------------------------------------------------- #
# Example task for testing Celery setup.                                        #
#                                                                               #
# Usage:                                                                        #
#   from starview_app.utils.tasks import test_celery                               #
#   result = test_celery.delay("Hello from Celery!")                            #
#   print(result.get(timeout=10))  # Wait up to 10 seconds for result           #
# ----------------------------------------------------------------------------- #
@shared_task
def test_celery(message):
    logger.info("Test task received message: %s", message)
    return f"Task completed successfully: {message}"


# ----------------------------------------------------------------------------- #
# Generates AI review summary for a location using Gemini API.                   #
#                                                                               #
# This task runs asynchronously in the background when CELERY_ENABLED=True.     #
# It generates a concise AI summary of user reviews for the specified location. #
#                                                                               #
# Args:                                                                         #
#   location_id (int): The ID of the Location object to generate summary for    #
#                                                                               #
# Returns:                                                                      #
#   dict: Success status and generated summary                                  #
#                                                                               #
# Task Settings:                                                                #
#   - bind=True: Task instance passed as first arg (enables self.retry())       #
#   - max_retries=2: Retry up to 2 times on failure (API rate limits, etc.)     #
#   - default_retry_delay=120: Wait 2 minutes between retries                   #
#                                                                               #
# Error Handling:                                                               #
#   - If Gemini API fails, task retries up to 2 times                           #
#   - If location not found, task fails gracefully                              #
#   - Logs all operations for monitoring                                        #
# ----------------------------------------------------------------------------- #
@shared_task(bind=True, max_retries=2, default_retry_delay=120)
def generate_review_summary(self, location_id):
    """
    Asynchronously generates an AI review summary for a location.

    This task is triggered when CELERY_ENABLED=True and a location's
    review summary needs regeneration (stale flag set, cooldown passed).
    """
    from starview_app.services.review_summary_service import ReviewSummaryService

    logger.info("Starting review summary generation for location ID: %s", location_id)

    try:
        summary = ReviewSummaryService.generate_summary(location_id)

        if summary:
            logger.info(
                "Generated review summary for location %s: %s...",
                location_id,
                summary[:50]
            )
            return {
                'status': 'success',
                'location_id': location_id,
                'summary_preview': summary[:100]
            }
        else:
            logger.warning(
                "No summary generated for location %s (may not meet threshold)",
                location_id
            )
            return {
                'status': 'skipped',
                'location_id': location_id,
                'reason': 'No summary generated (threshold not met or API unavailable)'
            }

    except Exception as exc:
        logger.error(
            "Error generating review summary for location %s: %s",
            location_id,
            exc
        )

        # Retry the task (up to max_retries times)
        try:
            raise self.retry(exc=exc)
        except self.MaxRetriesExceededError:
            logger.error("Max retries exceeded for location %s", location_id)
            return {
                'status': 'failed',
                'location_id': location_id,
                'error': f'Max retries exceeded: {str(exc)}'
            }
