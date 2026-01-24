# Starview

**Live Site:** [https://starview.app](https://starview.app)

---

## The night sky is incredible—if you know where to look.

Starview solves the #1 problem for stargazers: **finding quality dark sky locations**. Whether you're chasing meteor showers, photographing the Milky Way, or observing planets through a telescope, our community-driven platform helps you discover reviewed, photo-verified locations perfect for your next celestial adventure.

### The Problem

Stargazers face a common challenge: generic map applications don't provide the specific information needed to find exceptional viewing locations. Where is the nearest dark sky site? What's the light pollution level? Is it accessible? Worth the drive? These questions go unanswered by traditional mapping tools.

### The Solution

Starview is a specialized, community-driven platform built specifically for the stargazing community. Users can:

- **Discover locations** with detailed reviews, photos, and light pollution data
- **Check tonight's conditions** with sky scores, weather, and moon phase info
- **Explore the Bortle scale** with interactive light pollution comparisons
- **Track lunar cycles** with accurate moon phase calendars
- **Earn badges** for contributions and exploration
- **Follow other stargazers** and build a community

---

## Key Features

### Location Discovery
- Browse community-submitted stargazing locations worldwide
- Filter by country, region, type, rating, distance, Bortle class, and verification status
- Interactive map with clustered markers and turn-by-turn navigation
- Location detail pages with address, elevation, coordinates, and reviews
- Hero carousel featuring high-quality location photos

### Celestial Information Hub
- **Tonight Page** - Sky Score dashboard with hourly weather timeline (6PM-6AM), cloud layer breakdown, and moon phase
- **Moon Page** - Lunar cycle calendar with accurate phase calculations, moonrise/moonset times
- **Bortle Page** - Interactive light pollution scale (1-9) with sky quality comparison slider using World Atlas 2015 data
- **Weather Page** - Multi-source weather data (forecast, historical, averages)

### Community Reviews
- Detailed reviews with 1-5 star ratings and text content
- Photo uploads (up to 5 images per review with automatic thumbnails)
- Upvote/downvote system to surface the best content
- Threaded comment system with voting and reporting

### User Profiles & Social
- Personal favorites collection with optional nicknames
- Review history and contribution tracking
- Profile customization (display name, bio, location, profile picture)
- Follow other stargazers and see their contributions
- Public profile pages

### Achievement System
- **24 badges** across 7 categories: Exploration, Contribution, Quality, Review, Community, Tenure, Special
- Progress tracking (earned, in-progress, locked states)
- Pin up to 3 favorite badges to display on your profile

### Content Moderation
- Community reporting system for inappropriate content
- Vote-based content quality signals
- Rate limiting and spam prevention

---

## Tech Stack

### Backend
| Technology | Purpose |
|------------|---------|
| Django 5.1.13 | Web framework |
| Django REST Framework 3.15.2 | RESTful API |
| PostgreSQL 17.6 + PostGIS | Database with geographic queries |
| Redis 7.0 | Caching, sessions, message broker |
| Celery 5.4.0 | Async task processing (optional) |
| Gunicorn 23.0.0 | WSGI application server |
| WhiteNoise 6.9.0 | Static file serving |

### Frontend
| Technology | Purpose |
|------------|---------|
| React 19.1.1 | UI framework |
| Vite 7.1.7 | Build tool and dev server |
| React Router 7.9.4 | Client-side routing |
| TanStack Query 5.90.5 | Server state management |
| Mapbox GL 3.17.0 | Interactive maps |
| Axios 1.13.1 | HTTP client |

### Infrastructure
| Service | Purpose |
|---------|---------|
| Render.com | Hosting (web service, PostgreSQL, Redis, cron jobs) |
| Cloudflare R2 | Media storage (profile pictures, review photos) |
| AWS SES | Transactional email (noreply@starview.app) |
| Mapbox API | Geocoding, elevation data, map tiles |

### Security
- **A+ grade** on securityheaders.com
- django-allauth for email verification + Google OAuth
- django-axes for account lockout protection
- django-csp for Content Security Policy headers
- bleach for XSS prevention
- Comprehensive rate limiting (6 throttle classes)

---

## Frontend

### Pages (24 total)

| Category | Pages |
|----------|-------|
| **Discovery** | Home, Explore (list/map views), Location Detail |
| **Celestial** | Sky Hub, Tonight, Moon, Bortle, Weather |
| **Authentication** | Login, Register, Password Reset, Email Verification |
| **User** | Profile, Public Profile, Settings |
| **Legal** | Terms, Privacy, Accessibility, CCPA |

### Component Architecture
- **93 JSX components** organized by feature
- React Context for auth, location, and toast state
- TanStack Query hooks for server state caching
- Custom design system with dark theme and glass-morphism effects

### Key Frontend Features
- Responsive design (mobile-first)
- Virtual scrolling for long lists
- Lazy-loaded map components
- Optimistic UI updates
- Code splitting with React.lazy

---

## API Endpoints

### Locations
```
GET    /api/locations/                    # List with 12+ filter params
GET    /api/locations/{id}/               # Detail
POST   /api/locations/                    # Create (auth required)
GET    /api/locations/map_geojson/        # GeoJSON for map markers
POST   /api/locations/{id}/toggle_favorite/
POST   /api/locations/{id}/mark-visited/
POST   /api/locations/{id}/report/
```

### Reviews & Comments
```
GET    /api/locations/{id}/reviews/
POST   /api/locations/{id}/reviews/
POST   /api/locations/{id}/reviews/{id}/add_photos/
POST   /api/locations/{id}/reviews/{id}/vote/
GET    /api/locations/{id}/reviews/{id}/comments/
```

### Celestial Data
```
GET    /api/moon-phases/                  # Moon data with location support
GET    /api/weather/                      # Forecast/historical/averages
GET    /api/bortle/                       # Light pollution rating
```

### Users & Authentication
```
POST   /api/auth/register/
POST   /api/auth/login/
POST   /api/auth/logout/
GET    /api/auth/status/
GET    /api/users/me/                     # Current user profile
GET    /api/users/{username}/             # Public profile
GET    /api/users/{username}/badges/      # User badge collection
POST   /api/users/{username}/follow/      # Follow/unfollow
```

---

## Performance

### Query Optimization
- **99.3% query reduction** (548 → 4 queries on location list)
- Strategic use of `select_related()` and `prefetch_related()`
- Database annotations for aggregates

### Caching Strategy
- Redis-backed caching with smart invalidation
- **10-60x performance gains** on cached endpoints
- Version-based cache invalidation for map GeoJSON

### Response Optimization
- Map markers: 97% smaller payload
- Image optimization with automatic thumbnails
- Pagination (20 items per page)

---

## Development Setup

### Prerequisites
- Python 3.11+
- PostgreSQL 17.6
- Redis 7.0+
- Node.js 16+

### Installation

```bash
# Clone repository
git clone https://github.com/adiazpar/starview.git
cd starview

# Backend setup
python3 -m venv djvenv
source djvenv/bin/activate
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your configuration

# Database setup
python manage.py migrate
python manage.py createsuperuser

# Frontend setup
cd starview_frontend
npm install

# Start Redis (required)
brew services start redis  # macOS
# or: sudo systemctl start redis  # Linux

# Run development servers
python manage.py runserver  # Backend at :8000
npm run dev                 # Frontend at :5173 (proxies to backend)
```

### Environment Variables

```bash
# Django
DJANGO_SECRET_KEY=your-secret-key
DEBUG=True
ALLOWED_HOSTS=127.0.0.1,localhost

# Database
DB_ENGINE=postgresql
DB_NAME=your_db_name
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# Redis
REDIS_URL=redis://127.0.0.1:6379/1

# External APIs
MAPBOX_TOKEN=your_mapbox_token

# Media Storage (Cloudflare R2)
AWS_ACCESS_KEY_ID=your_r2_access_key
AWS_SECRET_ACCESS_KEY=your_r2_secret_key
CLOUDFLARE_ACCOUNT_ID=your_account_id
USE_R2_STORAGE=False  # True for production

# Email (AWS SES)
AWS_SES_ACCESS_KEY_ID=your_ses_access_key
AWS_SES_SECRET_ACCESS_KEY=your_ses_secret_key
DEFAULT_FROM_EMAIL=noreply@yourdomain.com

# Optional
CELERY_ENABLED=False
GOOGLE_OAUTH_CLIENT_ID=your_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_client_secret
```

---

## Deployment

**Platform:** Render.com

| Service | Configuration |
|---------|---------------|
| Web Service | Django/Gunicorn |
| Database | PostgreSQL 17.6 with automated daily backups |
| Cache | Redis (persistent) |
| Cron Jobs | Audit cleanup, email cleanup, user cleanup |

**Build Process:**
1. Install Python and Node dependencies
2. Build React production bundle
3. Collect static files
4. Run database migrations
5. Warm caches

**Media Storage:** Cloudflare R2 with custom domain (media.starview.app)

**Email:** AWS SES with bounce/complaint tracking via SNS webhooks

---

## Project Status

| Component | Status |
|-----------|--------|
| Backend | Production-ready, live |
| Frontend | Complete (24 pages, 93 components) |
| Security | A+ grade, 140+ tests |
| Documentation | Comprehensive |

**Live at:** [https://starview.app](https://starview.app)

---

## Future Vision

- **Celestial Events** - Meteor shower calendars, eclipse tracking, planetary alignments
- **Community Events** - Star parties, group observations
- **Mobile Apps** - Native iOS/Android applications
- **Notifications** - Clear sky alerts, event reminders

---

## Contributing

Contributions, suggestions, and feedback are welcome!

**Areas for contribution:**
- Mobile app development
- Celestial event data integration
- Light pollution data sources
- UI/UX improvements
- Internationalization

---

## Contact

**Developer:** Alejandro Diaz
**Live Site:** [https://starview.app](https://starview.app)
**Repository:** [GitHub](https://github.com/adiazpar/starview)

---

## Acknowledgments

- Django and Django REST Framework communities
- Mapbox for geocoding, elevation, and map APIs
- Render.com for hosting infrastructure
- The stargazing and amateur astronomy community
- Dark sky preservation efforts worldwide
