# Starview

**Live Demo:** [https://starview.app](https://starview.app)

---

## The night sky is incredible—if you know where to look.

Starview solves the #1 problem for stargazers: **finding quality dark sky locations**. Whether you're chasing meteor showers, photographing the Milky Way, or observing planets through a telescope, our community-driven platform helps you discover reviewed, photo-verified locations perfect for your next celestial adventure.

### The Problem

Stargazers face a common challenge: generic map applications don't provide the specific information needed to find exceptional viewing locations. Where is the nearest dark sky site? Which locations have minimal light pollution? Is it accessible? Worth the drive? These questions go unanswered by traditional mapping tools.

### The Solution

Starview is a specialized, community-driven platform built specifically for the stargazing community. Users can:

- **Discover locations** with detailed reviews from fellow stargazers
- **Read authentic experiences** from people who've actually visited
- **Browse photos** to see what each location offers
- **Save favorites** to build a personal stargazing trip list
- **Contribute knowledge** by sharing your own favorite spots

---

## Key Features

### Current Functionality

**Location Discovery**
- Browse community-submitted stargazing locations worldwide
- Search and filter by country, region, and rating
- View enriched location data (address, elevation, coordinates)
- Optimized map markers for exploring nearby spots

**Community Reviews**
- Detailed reviews with 1-5 star ratings
- Photo uploads (up to 5 images per review with automatic thumbnails)
- Upvote/downvote system to surface the best content
- Comment threads for community discussion

**User Profiles**
- Personal favorites collection for trip planning
- Review history and contribution tracking
- Profile customization with avatar uploads

**Content Moderation**
- Community reporting system for inappropriate content
- Vote-based content quality signals
- Spam prevention and rate limiting

### Future Vision

**Celestial Events Integration**
- Meteor shower calendars with location recommendations
- New moon periods for optimal Milky Way viewing
- Planetary alignment notifications
- Eclipse path tracking
- Community event coordination (star parties, group observations)

**Enhanced Discovery**
- Light pollution ratings (Bortle scale integration)
- Equipment-friendly filters (telescope accessible, power availability)
- Weather forecasts and sky condition predictions
- Advanced search (horizon visibility, altitude, accessibility)

**Mobile Experience**
- Native mobile applications
- Clear sky night notifications
- Offline location access
- Real-time sky condition updates

---

## Tech Stack

### Backend (Production-Ready)

**Framework & Core**
- **Django 5.1.13** - Web framework
- **Django REST Framework 3.15.2** - RESTful API
- **PostgreSQL 17.6** - Production database
- **Redis 7.0.0** - Caching and message broker
- **Celery 5.4.0** - Asynchronous task processing

**Security & Performance**
- **django-axes 8.0.0** - Account lockout protection (defends against brute force)
- **django-allauth 65.3.0** - Email verification and social authentication (Google OAuth)
- **django-csp 4.0** - Content Security Policy headers
- **bleach 6.2.0** - HTML sanitization (XSS prevention)
- **Comprehensive rate limiting** - 6 throttle classes (login, password reset, content creation, voting, reporting)
- **99.3% query optimization** - N+1 elimination with strategic prefetching
- **Redis caching** - 10-60x faster response times

**Production Infrastructure**
- **Gunicorn 23.0.0** - WSGI server
- **Whitenoise 6.9.0** - Static file serving with compression
- **AWS SES** - Transactional email delivery (custom domain: noreply@starview.app)
- **Cloudflare R2** - Object storage for media files (custom domain: media.starview.app)
- **django-storages 1.14.6** - S3-compatible storage backend for R2
- **Render.com** - Hosting platform with automated deployments

**Media Storage**
- **Cloudflare R2** - Persistent object storage for user-uploaded media (profile pictures, review photos)
- **68x cheaper than AWS S3** - Zero egress fees ($0.15/month vs $10.23/month for typical usage)
- **Custom domain** - Professional URLs via media.starview.app with CDN caching
- **Automatic cleanup** - Signal handlers delete orphaned files when content is removed
- **Security** - UUID filenames prevent enumeration, CSP headers control image loading

**Email System**
- **Mandatory email verification** - All new users must verify their email address
- **Professional branded templates** - HTML and plain text versions for all email types
- **Password reset emails** - Secure one-time links with 1-hour expiration
- **Security notifications** - Alerts when passwords are changed
- **Resend verification** - Users can request new verification emails if needed

**External Services**
- **Mapbox API** - Geocoding and elevation data for location enrichment
- **Custom tile server** - Map rendering (self-hosted)

### Architecture Highlights

**Service Layer Pattern**
- Separation of business logic from views and models
- LocationService, VoteService, ReportService, PasswordService
- Graceful degradation with external API failures

**Signal Handlers**
- Automatic file cleanup on model deletion
- Cascading deletions with orphaned file prevention
- Safe path validation (prevents directory traversal)

**Async Task Processing**
- Celery integration with FREE tier support (sync fallback)
- Location enrichment runs asynchronously (99.4% faster response: 2.5s → 0.015s)
- Configurable via `CELERY_ENABLED` environment variable

**Generic Relationships**
- ContentTypes framework for Vote and Report models
- DRY implementation (one Vote model for Reviews, Comments, future content)

**Custom Exception Handling**
- Consistent JSON error responses across all endpoints
- Production-safe error messages (hides internals when DEBUG=False)
- Automatic audit logging for security events

### Security Features

**Grade: A+ on securityheaders.com**

**Authentication & Access Control:**
- Email verification required for all new accounts
- Secure password requirements (uppercase, number, special character)
- Password reset with one-time tokens (1-hour expiration)
- Account lockout after 5 failed login attempts (1-hour duration)
- Google OAuth integration for easy sign-in
- "Remember Me" option for extended sessions (30 days vs browser close)
- Session security with Redis-backed storage

**Data Protection:**
- HTTPS enforced (HSTS enabled with 1-year max-age)
- Security headers (CSP, X-Frame-Options, X-Content-Type-Options, Permissions-Policy)
- CSRF protection with trusted origins
- XSS prevention (HTML sanitization with whitelisted tags)
- File upload validation (extension, MIME type, image verification)
- Coordinate validation (realistic latitude/longitude ranges)

**Rate Limiting & Monitoring:**
- Login attempts: 5 per minute
- Password reset: 3 per hour (prevents email abuse)
- Content creation: 20 per hour
- Voting: 60 per hour
- Reporting: 10 per hour
- Comprehensive audit logging (all security events tracked with IP addresses)
- Automatic cleanup of unverified accounts after 7 days

**Test Coverage:**
- 140+ security and performance tests across 7 phases
- Phase 1: 44+ security tests (rate limiting, XSS, file upload)
- Phase 2: Performance optimization tests (query reduction verified)
- Phase 4: 31+ infrastructure tests (account lockout, audit logging, Celery)
- Phase 5: Monitoring tests (health check endpoint)
- Phase 6: Authentication tests (password reset)
- Phase 7: Badge system tests

### Performance Optimizations

**Query Optimization**
- 99.3% query reduction (548 → 4 queries on location list)
- Strategic use of `select_related()` and `prefetch_related()`
- Database annotations for aggregates (Count, Avg)
- Conditional serializers (list vs detail views)

**Response Optimization**
- Map markers endpoint: 97% smaller payload
- Info panel endpoint: 95% smaller payload
- Image optimization: automatic resize and thumbnail generation
- Pagination: 20 items per page

**Caching Strategy**
- Redis-backed caching (15-minute TTL)
- User-aware cache keys (authenticated vs anonymous)
- Smart invalidation on create/update/delete operations
- 10-60x performance gains on cached endpoints

**Database Indexes**
- Strategic indexes on frequently queried fields
- Compound indexes for complex queries
- Full-text search ready (PostgreSQL capabilities)

### API Architecture

**RESTful Design**
- Nested resources (locations → reviews → comments)
- Custom actions (vote, report, add_photos, map_markers)
- Pagination and filtering
- Consistent error responses

**Core Endpoints:**
- `/api/locations/` - Browse and create stargazing locations
- `/api/locations/{id}/reviews/` - Location reviews
- `/api/locations/{id}/reviews/{id}/comments/` - Review comments
- `/api/favorite-locations/` - User favorites management
- `/api/profile/` - User profile management
- `/health/` - System health monitoring

**Authentication Endpoints:**
- `/api/auth/register/` - Create new account (sends verification email)
- `/api/auth/login/` - Sign in (requires verified email)
- `/api/auth/logout/` - Sign out
- `/api/auth/status/` - Check authentication status
- `/api/auth/resend-verification/` - Request new verification email
- `/api/auth/password-reset/` - Request password reset link
- `/api/auth/password-reset-confirm/` - Complete password reset
- `/accounts/google/login/` - Sign in with Google

**Authentication Features:**
- Session-based authentication with Redis storage
- Email verification required for new accounts
- Google OAuth for quick sign-in
- Secure password reset with one-time links
- "Remember Me" functionality
- Account lockout protection
- Comprehensive security logging

---

## Frontend

**Status:** React application in active development

**Tech Stack:**
- React 18 with React Router
- CSS with custom variables (dark/light theme)
- Mapbox GL JS for maps
- Font Awesome icons

**Implemented Features:**
- Interactive map interface for location discovery
- User authentication (login, register, password reset)
- Profile page with badge display
- Settings page with tabbed interface
- Photo gallery and review interfaces
- Responsive design for mobile and desktop

---

## Development Setup

### Prerequisites

- Python 3.11+
- PostgreSQL 17.6
- Redis 7.0+
- Virtual environment tool (venv)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/starview.git
   cd starview
   ```

2. **Create and activate virtual environment**
   ```bash
   python3 -m venv djvenv
   source djvenv/bin/activate  # On Windows: djvenv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. **Set up database**
   ```bash
   python manage.py migrate
   python manage.py createsuperuser
   ```

6. **Start Redis (required for caching)**
   ```bash
   # macOS (Homebrew)
   brew services start redis

   # Linux
   sudo systemctl start redis

   # Verify connection
   redis-cli PING  # Should return PONG
   ```

7. **Run development server**
   ```bash
   python manage.py runserver
   ```

8. **Optional: Start Celery worker (for async tasks)**
   ```bash
   celery -A django_project worker --loglevel=info
   ```

### Environment Variables

Required variables in `.env`:

```bash
# Django Core
DJANGO_SECRET_KEY=your-secret-key-here
DEBUG=True  # False in production
ALLOWED_HOSTS=127.0.0.1,localhost,testserver
CSRF_TRUSTED_ORIGINS=  # Empty for dev, https://starview.app for production

# CORS (for frontend dev server)
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# Database
DB_ENGINE=postgresql
DB_NAME=your_db_name
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_HOST=localhost
DB_PORT=5432

# Redis & Celery
REDIS_URL=redis://127.0.0.1:6379/1
CELERY_ENABLED=False  # True to enable async tasks

# External APIs
MAPBOX_TOKEN=your_mapbox_token
TILE_SERVER_URL=  # Optional: custom tile server
DISABLE_EXTERNAL_APIS=False

# Media Storage (Cloudflare R2)
AWS_ACCESS_KEY_ID=your_r2_access_key
AWS_SECRET_ACCESS_KEY=your_r2_secret_key
AWS_STORAGE_BUCKET_NAME=starview-media
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
R2_PUBLIC_URL=https://pub-xxxxx.r2.dev  # Dev: R2.dev URL, Prod: https://media.starview.app
USE_R2_STORAGE=False  # False for local dev, True for R2

# Email (AWS SES - separate credentials from R2)
AWS_SES_ACCESS_KEY_ID=your_ses_access_key
AWS_SES_SECRET_ACCESS_KEY=your_ses_secret_key
AWS_SES_REGION_NAME=us-east-2
DEFAULT_FROM_EMAIL=noreply@yourdomain.com

# Google OAuth (optional)
GOOGLE_OAUTH_CLIENT_ID=your_google_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_google_client_secret
```

### Management Commands

```bash
# Set up Google OAuth from environment variables
python manage.py setup_google_oauth

# Clean up unverified users after 7 days
python manage.py cleanup_unverified_users --days=7
```

## Production Deployment

**Current Status:** Live at [https://starview.app](https://starview.app)

**Platform:** Render.com
- Web Service (Gunicorn)
- PostgreSQL Database (automated backups)
- Redis Cache
- Cloudflare R2 (media storage with custom domain)
- Custom domain with SSL/TLS

**Infrastructure:**
- **Ephemeral filesystem** - Render deletes local files on restart/deployment
- **Persistent storage** - R2 provides permanent media file storage
- **Static files** - Served by WhiteNoise (local, compressed)
- **Media files** - Served by R2 CDN (profile pictures, review photos)

**Security:**
- A+ grade on securityheaders.com
- All API keys rotated for production
- Environment variables secured in hosting dashboard
- DEBUG=False with production-safe error messages

**Monitoring:**
- Health check endpoint for load balancer monitoring
- Audit logging (database + rotating files)
- Django logging configured for errors and security events

---

## Project Status

**Backend:** 98% Complete (35/36 items)
- Production deployed and live at https://starview.app
- Security audit complete (Phases 1-7: 100%)
- Infrastructure hardening (Phase 4: 100%)
- Monitoring (Phase 5: 100%)
- Authentication enhancements (Phase 6: 100%)
- Email deliverability (Phase 7: 100%)
- Optimization (Phase 8: 67%)

**Remaining Backend Work:**
- Database index optimization (2-3 hours)
- Sentry integration for error tracking (optional)

**Frontend:** React application in development
- Profile page with badges implemented
- Settings page with tabs

---

## Contributing

This is currently a solo developer project. Contributions, suggestions, and feedback are welcome!

**Areas for contribution:**
- Frontend development
- Mobile app development
- Celestial event data integration
- Light pollution data sources
- UI/UX design

---

## License

[To be determined]

---

## Contact

**Developer:** Alejandro Diaz
**Live Site:** [https://starview.app](https://starview.app)
**Project Repository:** [GitHub](https://github.com/adiazpar/starview)

---

## Acknowledgments

**Technologies:**
- Django and Django REST Framework communities
- Mapbox for geocoding and elevation APIs
- Render.com for hosting infrastructure
- Open source security tools (django-axes, django-csp, bleach)

**Inspiration:**
- The stargazing and amateur astronomy community
- Dark sky preservation efforts worldwide
- Astrophotography communities sharing knowledge and locations
