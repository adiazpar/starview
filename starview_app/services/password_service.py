# ----------------------------------------------------------------------------------------------------- #
# This password_service.py file handles password validation and management operations:                  #
#                                                                                                       #
# 1. Password Validation → Validates passwords against Django's configured validators                   #
# 2. Password Setting → Securely hashes and sets user passwords                                         #
# 3. Password Changing → Verifies current password before setting new one                               #
# 4. Centralized Logic → Single source of truth for all password operations                             #
#                                                                                                       #
# Data Flow:                                                                                            #
# User provides password → PasswordService validates against security rules → Password is hashed        #
# and stored → User authenticated with secure password                                                  #
#                                                                                                       #
# Service Layer Pattern:                                                                                #
# This service separates business logic from views, following Django best practices:                    #
# - Models define data structure (User model)                                                           #
# - Services define business logic (password validation and management)                                 #
# - Views coordinate between user requests and services                                                 #
#                                                                                                       #
# Security Features:                                                                                    #
# - Uses Django's configured password validators from settings.AUTH_PASSWORD_VALIDATORS                 #
# - Validates against: similarity, minimum length, common passwords, numeric-only                       #
# - Context-aware validation (checks against username, email, etc.)                                     #
# - Secure password hashing via Django's authentication system                                          #
#                                                                                                       #
# Usage:                                                                                                #
# - All methods are static and can be called independently                                              #
# ----------------------------------------------------------------------------------------------------- #

# Import tools:
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError



class PasswordService:

    # ----------------------------------------------------------------------------- #
    # Validates a password against Django's configured password validators.         #
    #                                                                               #
    # Checks password against all validators configured in settings.py:             #
    # - UserAttributeSimilarityValidator: Password not too similar to user info     #
    # - MinimumLengthValidator: Password meets minimum length requirement           #
    # - CommonPasswordValidator: Password not in common passwords list              #
    # - NumericPasswordValidator: Password not entirely numeric                     #
    #                                                                               #
    # Args:     password (str): The password to validate                            #
    #           user (User): User instance for context-aware validation (optional)  #
    # Returns:  Tuple (bool, str or None): (success, error_message)                 #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def validate_password_strength(password, user=None):
        try:
            validate_password(password, user=user)
            return True, None
        except ValidationError as e:
            # Return simplified generic error message
            return False, "Please enter a valid password that meets all requirements."


    # ----------------------------------------------------------------------------- #
    # Sets a new password for a user after validation.                              #
    #                                                                               #
    # Validates the password strength, then securely hashes and saves it.           #
    # Does NOT verify the current password - use for initial password setting       #
    # (registration) or admin password resets.                                      #
    #                                                                               #
    # Args:     user (User): The user instance to update                            #
    #           new_password (str): The new password to set                         #
    # Returns:  Tuple (bool, str or None): (success, error_message)                 #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def set_password(user, new_password):
        # Validate password strength
        is_valid, error_message = PasswordService.validate_password_strength(
            new_password, user=user
        )

        if not is_valid:
            return False, error_message

        # Set and save the password
        try:
            user.set_password(new_password)
            user.save(update_fields=['password'])
            return True, None
        except Exception:
            return False, 'The password could not be saved. Please try again.'


    # ----------------------------------------------------------------------------- #
    # Changes a user's password after validating the current password.              #
    #                                                                               #
    # This is the secure method for password changes where the user must            #
    # prove they know their current password before setting a new one.              #
    #                                                                               #
    # Process:                                                                      #
    # 1. Verify current password is correct                                         #
    # 2. Validate new password strength                                             #
    # 3. Hash and save new password                                                 #
    #                                                                               #
    # Args:     user (User): The user instance to update                            #
    #           current_password (str): Current password for verification           #
    #           new_password (str): The new password to set                         #
    # Returns:  Tuple (bool, str or None): (success, error_message)                 #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def change_password(user, current_password, new_password):
        # Verify current password
        if not user.check_password(current_password):
            return False, "Current password is incorrect."

        # Validate and set the new password
        return PasswordService.set_password(user, new_password)


    # ----------------------------------------------------------------------------- #
    # Validates that two passwords match (for registration/confirmation).           #
    #                                                                               #
    # Simple utility method to ensure password and confirmation match.              #
    # Should be called before validate_password_strength.                           #
    #                                                                               #
    # Args:     password (str): The password                                        #
    #           password_confirmation (str): The password confirmation              #
    # Returns:  Tuple (bool, str or None): (success, error_message)                 #
    # ----------------------------------------------------------------------------- #
    @staticmethod
    def validate_passwords_match(password, password_confirmation):
        if password != password_confirmation:
            return False, "Passwords do not match."
        return True, None
