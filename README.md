# Starview

Starview helps people find places to stargaze and plan a night outside. It brings
together stargazing locations, sky conditions, and experiences shared by other
observers.

[Explore Starview](https://starview.app)

## Using Starview

- **Find somewhere to go.** Explore the map, compare light pollution, and browse
  reviews and photos from people who have visited.
- **Check the sky before heading out.** Look at weather forecasts, cloud cover,
  and moon phases to help choose when to go.
- **Keep track of your places.** Save locations for a future trip and mark the
  ones you've visited.

## Working on Starview

This repository contains the Starview web application. Development guidance and
project documentation live in the shared [project workshop](.agents/README.md),
maintained as the `.agents` Git submodule.

For a fresh clone, initialize it with:

```bash
git submodule update --init .agents
```

Start with the [project guide](.agents/AGENTS.md) for local development and the
[documentation index](.agents/docs/index.md) for a specific area of the application.

### Local runtime

Use Python 3.11 and Node.js 22 (`nvm use` reads `.nvmrc`). Install the pinned Python
requirements into `djvenv`, and run `npm --prefix starview_frontend ci`. PostgreSQL
with PostGIS and Redis must be available locally. Then run:

```bash
djvenv/bin/python manage.py migrate
djvenv/bin/python manage.py runserver 127.0.0.1:8000
npm --prefix starview_frontend run dev -- --host 127.0.0.1
```

The frontend is at <http://localhost:5173> and the backend health endpoint is
<http://localhost:8000/health/>. Use the same hostname throughout a login session.
See [Apple sign-in setup](.agents/docs/backend/apple-sign-in.md) for the HTTPS
callback, secure credentials, and isolated browser testing.
