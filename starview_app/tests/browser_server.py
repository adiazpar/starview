"""Run the isolated OAuth browser server without macOS fork/Objective-C issues."""
import os
from wsgiref.simple_server import WSGIRequestHandler, make_server

from django.core.wsgi import get_wsgi_application


class QuietRequestHandler(WSGIRequestHandler):
    def log_message(self, format, *args):
        # OAuth callback query strings contain one-time credentials.
        pass


if __name__ == '__main__':
    os.environ['DJANGO_SETTINGS_MODULE'] = 'starview_app.tests.browser_settings'
    application = get_wsgi_application()
    with make_server('127.0.0.1', 8001, application, handler_class=QuietRequestHandler) as server:
        print('Isolated OAuth browser server listening on 127.0.0.1:8001', flush=True)
        server.serve_forever()
