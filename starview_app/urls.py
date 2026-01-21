# ----------------------------------------------------------------------------------------------------- #
# This urls.py file defines all URL routing for the stars_app application:                              #
#                                                                                                       #
# Purpose:                                                                                              #
# Maps incoming HTTP requests to the appropriate view functions or ViewSets. This is the central        #
# configuration that connects URLs to business logic, enabling users to interact with the application   #
# through both traditional template views and REST API endpoints.                                       #
#                                                                                                       #
# Key Features:                                                                                         #
# - REST API routers: Automatic URL generation for CRUD operations on locations, reviews, favorites     #
# - Nested resources: Hierarchical API structure (locations → reviews → comments)                       #
# - User profiles: Public profile viewing (/users/{username}/) and private management (/users/me/*)    #
# - Authentication routes: Registration, login, logout, password reset flows                            #
# - Template views: Traditional Django views for navigation and location detail pages                   #
#                                                                                                       #
# Architecture:                                                                                         #
# - Uses Django REST Framework's DefaultRouter for flat resources (locations, favorites, users)         #
# - Uses NestedDefaultRouter for hierarchical resources (reviews under locations, comments under        #
#   reviews), creating intuitive API paths like /api/locations/{id}/reviews/{id}/comments/              #
# - Static/media file serving is handled at the project level (django_project/urls.py)                  #
# ----------------------------------------------------------------------------------------------------- #

# Import tools:
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_nested import routers

# Import views:
from .views import (
    # ViewSets
    LocationViewSet,
    FavoriteLocationViewSet,
    ReviewViewSet,
    CommentViewSet,
    UserProfileViewSet,
    # Follow views
    toggle_follow,
    check_following,
    get_followers,
    get_following,
    # Badge views
    get_user_badges,
    get_my_badge_collection,
    update_pinned_badges,
    # Authentication views
    register,
    custom_login,
    custom_logout,
    auth_status,
    resend_verification_email,
    request_password_reset,
    confirm_password_reset,
    # Health check views
    health_check,
    # Stats views
    get_platform_stats,
    # Moon views
    get_moon_phases,
    # Weather views
    get_weather_forecast,
    # Bortle views
    get_bortle,
    # GeoIP views
    geolocate_ip,
)

router = DefaultRouter()
router.register(r'locations', LocationViewSet, basename='locations')
router.register(r'favorite-locations', FavoriteLocationViewSet, basename='favorite-locations')
router.register(r'users', UserProfileViewSet, basename='users')

# Nested router for reviews
locations_router = routers.NestedDefaultRouter(router, r'locations', lookup='location')
locations_router.register(r'reviews', ReviewViewSet, basename='location-reviews')

# Nested router for comments
reviews_router = routers.NestedDefaultRouter(locations_router, r'reviews', lookup='review')
reviews_router.register(r'comments', CommentViewSet, basename='review-comments')


urlpatterns = [
    # Health check (for load balancer monitoring):
    path('health/', health_check, name='health_check'),

    # Platform stats (for home page):
    path('api/stats/', get_platform_stats, name='platform_stats'),

    # Moon phases (for stargazing planning):
    path('api/moon-phases/', get_moon_phases, name='moon_phases'),

    # Weather forecast (for stargazing planning):
    path('api/weather/', get_weather_forecast, name='weather_forecast'),

    # Bortle scale / light pollution (for stargazing planning):
    path('api/bortle/', get_bortle, name='bortle'),

    # IP geolocation (fallback for users without browser/profile location):
    path('api/geolocate/', geolocate_ip, name='geolocate_ip'),

    # User authentication API endpoints:
    path('api/auth/register/', register, name='register'),
    path('api/auth/login/', custom_login, name='login'),
    path('api/auth/logout/', custom_logout, name='logout'),
    path('api/auth/status/', auth_status, name='auth_status'),
    path('api/auth/resend-verification/', resend_verification_email, name='resend_verification'),
    path('api/auth/password-reset/', request_password_reset, name='password_reset_request'),
    path('api/auth/password-reset-confirm/<uidb64>/<token>/', confirm_password_reset, name='password_reset_confirm'),

    # User follow API endpoints:
    path('api/users/<str:username>/follow/', toggle_follow, name='toggle_follow'),
    path('api/users/<str:username>/is-following/', check_following, name='check_following'),
    path('api/users/<str:username>/followers/', get_followers, name='get_followers'),
    path('api/users/<str:username>/following/', get_following, name='get_following'),

    # User badge API endpoints:
    path('api/users/<str:username>/badges/', get_user_badges, name='get_user_badges'),
    path('api/users/me/badges/collection/', get_my_badge_collection, name='get_my_badge_collection'),
    path('api/users/me/badges/pin/', update_pinned_badges, name='update_pinned_badges'),

    # Django Rest Framework API endpoints:
    path('api/', include(router.urls)),
    path('api/', include(locations_router.urls)),
    path('api/', include(reviews_router.urls)),
]