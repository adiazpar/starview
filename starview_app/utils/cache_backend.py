"""Never flush a shared Redis database when clearing Starview's content cache."""

from django.core.cache.backends.redis import RedisCache


class NamespacedRedisCache(RedisCache):
    def clear(self):
        client = self._cache.get_client(None, write=True)
        # allauth uses Django's default cache for security counters. Retain those
        # even when content and security caches share a physical Redis instance.
        protected = self.make_key('allauth')
        prefix = self.make_key('')
        batch = []
        for raw_key in client.scan_iter(match=f'{prefix}*', count=500):
            key = raw_key.decode() if isinstance(raw_key, bytes) else raw_key
            if key.startswith(protected):
                continue
            batch.append(raw_key)
            if len(batch) == 500:
                client.delete(*batch)
                batch = []
        if batch:
            client.delete(*batch)
        return True
