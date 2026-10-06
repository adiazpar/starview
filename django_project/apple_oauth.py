"""Load Apple credentials without storing private keys in the database."""
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured


def apple_app_from_env(env):
    names = ("APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID")
    values = {name: env.get(name, "").strip() for name in names}
    private_key = env.get("APPLE_PRIVATE_KEY", "").replace("\\n", "\n").strip()
    key_path = env.get("APPLE_PRIVATE_KEY_PATH", "").strip()
    if not any(values.values()) and not private_key and not key_path:
        return None
    if not all(values.values()) or not (private_key or key_path):
        raise ImproperlyConfigured("Apple OAuth requires APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID and a private key.")
    if private_key and key_path:
        raise ImproperlyConfigured("Set only one of APPLE_PRIVATE_KEY and APPLE_PRIVATE_KEY_PATH.")
    if key_path:
        try:
            private_key = Path(key_path).expanduser().read_text().strip()
        except OSError:
            raise ImproperlyConfigured("Unable to read APPLE_PRIVATE_KEY_PATH.") from None
    try:
        from cryptography.hazmat.primitives.serialization import load_pem_private_key
        from cryptography.hazmat.primitives.asymmetric import ec
        key = load_pem_private_key(private_key.encode(), password=None)
        if not isinstance(key, ec.EllipticCurvePrivateKey) or not isinstance(key.curve, ec.SECP256R1):
            raise ValueError
    except (ValueError, TypeError):
        raise ImproperlyConfigured("Apple OAuth requires an unencrypted ES256 (P-256) private key.") from None
    return {
        "client_id": values["APPLE_CLIENT_ID"],
        "key": values["APPLE_TEAM_ID"],
        "secret": values["APPLE_KEY_ID"],
        "settings": {"certificate_key": private_key},
    }
