"""Account-level two-step policy, independent of the chosen verification method."""


def requires_second_factor(user):
    # Enrollment records describe available methods; only the account's explicit
    # choice controls whether sign-in needs a second factor.
    return bool(user.is_authenticated and user.userprofile.two_factor_enabled)
