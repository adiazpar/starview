"""Keep one-use account credentials out of application and Django request logs."""

import logging
import re


_SECRET_PATH = re.compile(
    r'(/api/auth/password-reset-confirm/|/accounts/confirm-email/|/accounts/password/reset/key/)[^\s\"\'<>]*'
)
_OAUTH_QUERY = re.compile(r'(/accounts/(?:apple|google)/[^\s\"\'<>?]*)\?[^\s\"\'<>]*')


def redact_account_urls(value):
    return _OAUTH_QUERY.sub(r'\1?[redacted]', _SECRET_PATH.sub(r'\1[redacted]/', str(value)))


class AccountSecretFilter(logging.Filter):
    def filter(self, record):
        record.msg = redact_account_urls(record.getMessage())
        record.args = ()
        return True
