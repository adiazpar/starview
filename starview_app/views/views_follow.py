# ----------------------------------------------------------------------------------------------------- #
# This views_follow.py file handles user follow/unfollow API endpoints:                                #
#                                                                                                       #
# Purpose:                                                                                              #
# Manages the social following relationships between users. Enables users to follow/unfollow other     #
# stargazers and view follower/following lists.                                                        #
#                                                                                                       #
# Key Features:                                                                                         #
# - Follow/unfollow actions (POST/DELETE)                                                               #
# - Check follow status for a specific user                                                             #
# - List followers for a user                                                                           #
# - List users that a user is following                                                                 #
# - Prevents self-follows (enforced at model level)                                                     #
# - Optimized queries with select_related for user profiles                                             #
# ----------------------------------------------------------------------------------------------------- #

# Django imports:
from django.shortcuts import get_object_or_404
from django.contrib.auth.models import User

# DRF imports:
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework import status, viewsets, exceptions
from rest_framework.response import Response

# Model imports:
from ..models import Follow

# Serializer imports:
from ..serializers import PublicUserSerializer



# ----------------------------------------------------------------------------- #
# Follow/unfollow a user.                                                       #
#                                                                               #
# Creates or deletes a Follow relationship between the authenticated user and  #
# the target user. Prevents self-follows and following system accounts.        #
#                                                                               #
# HTTP Method: POST (follow) / DELETE (unfollow)                                #
# Endpoint: /api/users/{username}/follow/                                       #
# Authentication: Required                                                      #
# Returns: Success message and follow status                                    #
# ----------------------------------------------------------------------------- #
@api_view(['POST', 'DELETE'])
@permission_classes([IsAuthenticated])
def toggle_follow(request, username):
    # Get the user to follow/unfollow
    target_user = get_object_or_404(User.objects.select_related('userprofile'), username=username)

    # Prevent following system accounts
    if hasattr(target_user, 'userprofile') and target_user.userprofile.is_system_account:
        raise exceptions.NotFound("User not found.")

    # Prevent self-follows
    if request.user == target_user:
        raise exceptions.ValidationError("You cannot follow yourself.")

    if request.method == 'POST':
        # Follow the user
        follow, created = Follow.objects.get_or_create(
            follower=request.user,
            following=target_user
        )

        if created:
            return Response({
                'detail': f'You are now following {target_user.username}.',
                'is_following': True
            }, status=status.HTTP_201_CREATED)
        else:
            return Response({
                'detail': f'You are already following {target_user.username}.',
                'is_following': True
            }, status=status.HTTP_200_OK)

    elif request.method == 'DELETE':
        # Unfollow the user
        try:
            follow = Follow.objects.get(
                follower=request.user,
                following=target_user
            )
            follow.delete()
            return Response({
                'detail': f'You have unfollowed {target_user.username}.',
                'is_following': False
            }, status=status.HTTP_200_OK)
        except Follow.DoesNotExist:
            return Response({
                'detail': f'You are not following {target_user.username}.',
                'is_following': False
            }, status=status.HTTP_200_OK)


# ----------------------------------------------------------------------------- #
# Check if authenticated user is following a specific user.                     #
# System accounts return 404 to hide them from public access.                   #
#                                                                               #
# HTTP Method: GET                                                              #
# Endpoint: /api/users/{username}/is-following/                                 #
# Authentication: Required                                                      #
# Returns: Boolean indicating follow status                                     #
# ----------------------------------------------------------------------------- #
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def check_following(request, username):
    target_user = get_object_or_404(User.objects.select_related('userprofile'), username=username)

    # Hide system accounts
    if hasattr(target_user, 'userprofile') and target_user.userprofile.is_system_account:
        raise exceptions.NotFound("User not found.")

    is_following = Follow.objects.filter(
        follower=request.user,
        following=target_user
    ).exists()

    return Response({
        'is_following': is_following,
        'username': target_user.username
    }, status=status.HTTP_200_OK)


# ----------------------------------------------------------------------------- #
# Get list of users who follow the specified user (followers).                  #
# System accounts are hidden from this list and cannot be queried.              #
#                                                                               #
# HTTP Method: GET                                                              #
# Endpoint: /api/users/{username}/followers/                                    #
# Authentication: Not required                                                  #
# Returns: Paginated list of follower users                                     #
# ----------------------------------------------------------------------------- #
@api_view(['GET'])
@permission_classes([AllowAny])
def get_followers(request, username):
    user = get_object_or_404(User.objects.select_related('userprofile'), username=username)

    # Hide system accounts
    if hasattr(user, 'userprofile') and user.userprofile.is_system_account:
        raise exceptions.NotFound("User not found.")

    # Get all users who follow this user (excluding system accounts)
    followers = Follow.objects.filter(
        following=user,
        follower__userprofile__is_system_account=False
    ).select_related('follower__userprofile')

    # Extract the follower users
    follower_users = [follow.follower for follow in followers]

    # Pagination
    from rest_framework.pagination import PageNumberPagination
    paginator = PageNumberPagination()
    paginator.page_size = 20
    paginated_followers = paginator.paginate_queryset(follower_users, request)

    serializer = PublicUserSerializer(paginated_followers, many=True, context={'request': request})
    return paginator.get_paginated_response(serializer.data)


# ----------------------------------------------------------------------------- #
# Get list of users that the specified user is following.                       #
# System accounts are hidden from this list and cannot be queried.              #
#                                                                               #
# HTTP Method: GET                                                              #
# Endpoint: /api/users/{username}/following/                                    #
# Authentication: Not required                                                  #
# Returns: Paginated list of users being followed                               #
# ----------------------------------------------------------------------------- #
@api_view(['GET'])
@permission_classes([AllowAny])
def get_following(request, username):
    user = get_object_or_404(User.objects.select_related('userprofile'), username=username)

    # Hide system accounts
    if hasattr(user, 'userprofile') and user.userprofile.is_system_account:
        raise exceptions.NotFound("User not found.")

    # Get all users that this user follows (excluding system accounts)
    following = Follow.objects.filter(
        follower=user,
        following__userprofile__is_system_account=False
    ).select_related('following__userprofile')

    # Extract the following users
    following_users = [follow.following for follow in following]

    # Pagination
    from rest_framework.pagination import PageNumberPagination
    paginator = PageNumberPagination()
    paginator.page_size = 20
    paginated_following = paginator.paginate_queryset(following_users, request)

    serializer = PublicUserSerializer(paginated_following, many=True, context={'request': request})
    return paginator.get_paginated_response(serializer.data)
