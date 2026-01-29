# ----------------------------------------------------------------------------------------------------- #
# This pagination.py file provides cursor-based pagination utilities:                                   #
#                                                                                                       #
# Purpose:                                                                                              #
# Implements cursor-based pagination for endpoints that need stable ordering with high-performance      #
# navigation. Unlike offset-based pagination, cursor pagination handles inserts/deletes gracefully      #
# and provides O(1) seeks regardless of page depth.                                                     #
#                                                                                                       #
# Key Features:                                                                                         #
# - Composite cursors: Encode multiple fields (e.g., created_at + id) for tie-breaking                 #
# - Base64 encoding: Cursors are URL-safe and opaque to clients                                        #
# - Configurable fields: Different sort options can use different cursor fields                        #
# - Consistent response format: {results, next_cursor, has_more, total_count}                          #
# ----------------------------------------------------------------------------------------------------- #

import base64
import json
from datetime import datetime


def encode_cursor(values: dict) -> str:
    """
    Encode cursor values as a base64 URL-safe string.

    Args:
        values: Dictionary of cursor field values (e.g., {'created_at': '2024-01-01T12:00:00Z', 'id': 123})

    Returns:
        Base64-encoded cursor string
    """
    # Convert datetime objects to ISO format strings
    serializable = {}
    for key, value in values.items():
        if isinstance(value, datetime):
            serializable[key] = value.isoformat()
        else:
            serializable[key] = value

    json_str = json.dumps(serializable, separators=(',', ':'))
    return base64.urlsafe_b64encode(json_str.encode()).decode()


def decode_cursor(cursor_string: str) -> dict | None:
    """
    Decode a cursor string back to values.

    Args:
        cursor_string: Base64-encoded cursor string

    Returns:
        Dictionary of cursor values, or None if invalid
    """
    if not cursor_string:
        return None

    try:
        json_str = base64.urlsafe_b64decode(cursor_string.encode()).decode()
        return json.loads(json_str)
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
        return None


def build_cursor_response(queryset, items: list, cursor_fields: list, limit: int) -> dict:
    """
    Build a cursor-paginated response.

    Args:
        queryset: The full queryset (for total count)
        items: The paginated items for this page
        cursor_fields: List of field names to include in cursor (e.g., ['created_at', 'id'])
        limit: Page size

    Returns:
        Dictionary with {results, next_cursor, has_more, total_count}
    """
    total_count = queryset.count()
    has_more = len(items) > limit

    # If we fetched one extra to check has_more, remove it
    if has_more:
        items = items[:limit]

    # Build next cursor from last item
    next_cursor = None
    if has_more and items:
        last_item = items[-1]
        cursor_values = {}
        for field in cursor_fields:
            value = getattr(last_item, field, None)
            if value is not None:
                cursor_values[field] = value
        next_cursor = encode_cursor(cursor_values)

    return {
        'results': items,
        'next_cursor': next_cursor,
        'has_more': has_more,
        'total_count': total_count,
    }
