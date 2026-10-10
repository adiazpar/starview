"""Private, optional birth dates; validation does not determine eligibility."""
from collections.abc import Mapping
from datetime import date
import re

from django.core.exceptions import ValidationError
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework import exceptions


BIRTH_DATE_PROMPT_KEY = 'birth_date_prompt_user_id'


def validate_birth_date(value):
    """Shared calendar bounds for model forms and API input, without an age gate."""
    if value < date(1900, 1, 1):
        raise ValidationError(_('Enter a date in 1900 or later.'))
    if value > timezone.localdate():
        raise ValidationError(_('Date of birth cannot be in the future.'))


def parse_birth_date(data, *, required=False):
    if not isinstance(data, Mapping):
        raise exceptions.ValidationError(_('Provide an object with profile fields.'))
    if 'birth_date' not in data:
        if required:
            raise exceptions.ValidationError({'birth_date': _('This field is required.')})
        return None
    value = data['birth_date']
    if value is None:
        return None
    if not isinstance(value, str) or not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}', value):
        raise exceptions.ValidationError({'birth_date': _('Enter a valid date in YYYY-MM-DD format.')})
    try:
        parsed = date.fromisoformat(value)
        validate_birth_date(parsed)
    except ValueError:
        raise exceptions.ValidationError({'birth_date': _('Enter a valid calendar date.')}) from None
    except ValidationError as error:
        raise exceptions.ValidationError({'birth_date': error.messages}) from None
    return parsed


def should_prompt_birth_date(request):
    """Only the newly created OAuth account is offered this optional session prompt."""
    return (
        request.session.get(BIRTH_DATE_PROMPT_KEY) == request.user.pk
        and request.user.userprofile.birth_date is None
    )
