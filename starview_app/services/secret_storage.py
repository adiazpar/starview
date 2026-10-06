"""Purpose-separated encryption with Django's existing key-rotation fallbacks."""

import base64

from cryptography.fernet import Fernet, MultiFernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from django.conf import settings


def secret_cipher(purpose):
    return MultiFernet([
        Fernet(base64.urlsafe_b64encode(HKDF(
            algorithm=hashes.SHA256(), length=32, salt=None,
            info=f'starview.{purpose}'.encode(),
        ).derive(key.encode())))
        for key in [settings.SECRET_KEY, *settings.SECRET_KEY_FALLBACKS]
    ])
