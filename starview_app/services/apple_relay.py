"""Apple private-relay identity and known forwarding availability."""

from allauth.socialaccount.models import SocialAccount
from django.db.models import Q


APPLE_RELAY_DOMAINS = frozenset({'privaterelay.appleid.com', 'private.icloud.com'})


def is_apple_relay_email(email, provider_data=None):
    """Accept Apple's relay domains or the verified provider's private-email claim."""
    if not isinstance(email, str) or '@' not in email:
        return False
    if email.strip().rsplit('@', 1)[1].casefold() in APPLE_RELAY_DOMAINS:
        return True
    flag = (provider_data or {}).get('is_private_email')
    return flag is True or flag == 'true'


def disabled_apple_relay_emails(emails):
    """Return only addresses Apple has explicitly told us no longer forward."""
    addresses = {email.strip().casefold() for email in emails if isinstance(email, str) and email.strip()}
    if not addresses:
        return set()
    matching = Q(pk__in=[])
    for email in addresses:
        matching |= Q(extra_data__email__iexact=email)
    disabled = set()
    for data in SocialAccount.objects.filter(
        matching, provider='apple', extra_data__apple_relay_enabled=False,
    ).values_list('extra_data', flat=True):
        email = data.get('email')
        if is_apple_relay_email(email, data):
            disabled.add(email.strip().casefold())
    return disabled


def is_apple_relay_disabled(email):
    return bool(disabled_apple_relay_emails([email]))
