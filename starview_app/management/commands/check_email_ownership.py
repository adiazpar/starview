"""Read-only migration preflight; reports IDs rather than exposing email addresses."""

from django.core.management.base import BaseCommand, CommandError
from django.db import connection


class Command(BaseCommand):
    help = 'Check normalized email ownership before deployment without changing accounts'

    def handle(self, **options):
        with connection.cursor() as cursor:
            cursor.execute('''
                SELECT array_agg(DISTINCT user_id ORDER BY user_id) FROM (
                    SELECT id AS user_id, lower(btrim(email)) AS email
                    FROM auth_user WHERE btrim(email) <> ''
                    UNION ALL
                    SELECT user_id, lower(btrim(email)) FROM account_emailaddress
                ) owners GROUP BY email HAVING count(DISTINCT user_id) > 1
            ''')
            conflicts = cursor.fetchall()
            cursor.execute('''
                SELECT user_id FROM account_emailaddress
                GROUP BY user_id, lower(btrim(email)) HAVING count(*) > 1
            ''')
            duplicates = cursor.fetchall()
            cursor.execute("SELECT user_id FROM account_emailaddress WHERE btrim(email) = ''")
            blanks = cursor.fetchall()
        for (ids,) in conflicts:
            self.stdout.write(f'Conflicting contact owners: user IDs {ids}')
        for (user_id,) in duplicates:
            self.stdout.write(f'Duplicate address rows: user ID {user_id}')
        for (user_id,) in blanks:
            self.stdout.write(f'Empty address row: user ID {user_id}')
        if conflicts or duplicates or blanks:
            raise CommandError('Resolve the listed conflicts before deploying; no data was changed.')
        self.stdout.write(self.style.SUCCESS('Email ownership is unambiguous.'))
