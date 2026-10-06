"""Verified MFA delivery is separate from primary contact/login ownership."""

from allauth.socialaccount.models import SocialAccount
from django.core.exceptions import ValidationError
from django.core.validators import validate_email

from starview_app.services.apple_relay import disabled_apple_relay_emails
from starview_app.services.mfa_policy import requires_second_factor


def email_destination(user):
    return (user.userprofile.two_factor_email if requires_second_factor(user) else '') or user.email


def mask_email(email):
    local, _, domain = email.partition('@')
    return f'{local[:1]}***@{domain}' if domain else ''


def email_choices(user):
    choices = {user.email.lower(): {'email': user.email.lower(), 'source': 'primary'}}
    for account in SocialAccount.objects.filter(user=user, provider__in=('google', 'apple')):
        email = account.extra_data.get('email')
        if not isinstance(email, str):
            continue
        email = email.strip().lower()
        try:
            validate_email(email)
        except ValidationError:
            continue
        choices.setdefault(email, {'email': email, 'source': account.provider})
    # A separately verified mailbox stays a factor if its provider is removed.
    # Disconnecting a sign-in credential must not silently redirect MFA mail.
    selected = email_destination(user).lower()
    choices.setdefault(selected, {'email': selected, 'source': 'verified'})
    unavailable = disabled_apple_relay_emails(choices)
    return [{**choice, 'available': email not in unavailable} for email, choice in choices.items()]
