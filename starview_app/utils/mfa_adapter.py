from allauth.mfa.adapter import DefaultMFAAdapter
from starview_app.services.secret_storage import secret_cipher


class StarviewMFAAdapter(DefaultMFAAdapter):
    def encrypt(self, text):
        return 'mfa-v1:' + secret_cipher('mfa.v1').encrypt(text.encode()).decode()

    def decrypt(self, encrypted_text):
        if not encrypted_text.startswith('mfa-v1:'):
            raise ValueError('Unrecognized authenticator encryption format')
        return secret_cipher('mfa.v1').decrypt(encrypted_text[len('mfa-v1:'):].encode()).decode()
