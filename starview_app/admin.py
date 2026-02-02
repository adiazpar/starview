# ----------------------------------------------------------------------------------------------------- #
# This admin.py file configures the Django admin interface for the stars_app application:               #
#                                                                                                       #
# Purpose:                                                                                              #
# The Django admin interface provides a web-based interface for managing database content. This file    #
# registers models with the admin site and customizes how they appear and behave in the admin panel.    #
#                                                                                                       #
# What This Provides:                                                                                   #
# - Staff users can view, create, edit, and delete records through a web interface at /admin/           #
# - Custom admin classes enhance the default interface with better displays, filters, and search        #
# - Generic models use custom admins to handle ContentTypes framework complexity                        #
#                                                                                                       #
# Access:                                                                                               #
# Only users with is_staff=True can access the admin interface. Superusers have full permissions.       #
# ----------------------------------------------------------------------------------------------------- #

# Import tools:
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User
from django.urls import reverse
from django.utils.html import format_html

# Import models:
# Separated model imports for package organization (Review system, Location system, etc.):
from .models import UserProfile, FavoriteLocation, Location, Follow
from .models import Review, ReviewComment, ReviewPhoto, Report, Vote
from .models import EmailBounce, EmailComplaint, EmailSuppressionList
from .models import AuditLog, LocationVisit
from .models import Badge, UserBadge, SummaryFeedback



# ----------------------------------------------------------------------------------------------------- #
#                                                                                                       #
#                                       CUSTOM ADMIN INTERFACES                                         #
#                                                                                                       #
# ----------------------------------------------------------------------------------------------------- #

# ----------------------------------------------------------------------------- #
# Custom admin interface for the generic Vote model.                            #
#                                                                               #
# The Vote model uses Django's ContentTypes framework with GenericForeignKey    #
# to handle votes for ANY type of content in a truly generic way.               #
#                                                                               #
# This admin interface makes it easy to:                                        #
# - View and filter votes by type, content type, and user                       #
# - See what object is being voted on                                           #
# - Track voting patterns across different content types                        #
# ----------------------------------------------------------------------------- #
class VoteAdmin(admin.ModelAdmin):
    list_display = [
        'id',
        'get_voted_object_type',    # Shows the model type (review, reviewcomment, etc.)
        'get_voted_object',         # Shows a human-readable description
        'user',                     # Who cast the vote
        'is_upvote',                # True for upvote, False for downvote
        'created_at',               # When the vote was cast
    ]

    list_filter = [
        'is_upvote',
        'content_type',             # Filter by model type
        'created_at',
    ]

    search_fields = [
        'user__username',
        'object_id',
    ]

    ordering = ['-created_at']
    list_per_page = 50

    fieldsets = (
        # Section 1: What's being voted on (generic relationship)
        ('Vote Target', {
            'fields': ('content_type', 'object_id', 'get_voted_object'),
            'description': 'Generic relationship to the voted object'
        }),

        # Section 2: Vote Information
        ('Vote Information', {
            'fields': ('user', 'is_upvote', 'created_at'),
        }),
    )

    readonly_fields = [
        'created_at',
        'get_voted_object',
        'content_type',
        'object_id',
        'user'
    ]


    # Display the type of object being voted on.
    # This returns the model name (e.g., 'review', 'reviewcomment):
    def get_voted_object_type(self, obj):
        return obj.voted_object_type or 'Unknown'

    get_voted_object_type.short_description = 'Object Type'


    # Display a human-readable description of the voted object with a clickable link:
    def get_voted_object(self, obj):
        if obj.voted_object and obj.content_type:
            # Generate admin URL for the voted object
            url = reverse(
                f'admin:{obj.content_type.app_label}_{obj.content_type.model}_change',
                args=[obj.object_id]
            )
            return format_html('<a href="{}">{}</a>', url, obj.voted_object)

        return f"{obj.content_type.model if obj.content_type else 'Unknown'} #{obj.object_id} (deleted)"

    get_voted_object.short_description = 'Voted Object'



# ----------------------------------------------------------------------------- #
# Custom admin interface for the generic Report model.                          #
#                                                                               #
# The Report model uses Django's ContentTypes framework with GenericForeignKey  #
# to handle reports for ANY type of content in a truly generic way.             #
#                                                                               #
# This admin interface makes it easy for moderators to:                         #
# - View and filter reports by type, status, and content type                   #
# - See what object is being reported                                           #
# - Update report status and add review notes                                   #
# - Track who reported and who reviewed each report                             #
# ----------------------------------------------------------------------------- #
class ReportAdmin(admin.ModelAdmin):
    list_display = [
        'id',
        'get_reported_object_type',   # Shows the model type (location, review, reviewcomment, etc.)
        'get_reported_object',        # Shows a human-readable description
        'report_type',                # Spam, Harassment, Duplicate, etc.
        'reported_by',                # Who submitted the report
        'status',                     # Pending, Reviewed, Resolved, Dismissed
        'created_at',                 # When the report was submitted
        'reviewed_by',                # Who reviewed it (if reviewed)
    ]

    list_filter = [
        'status',
        'report_type',
        'content_type',               # Filter by model type
        'created_at',
        'reviewed_at',
    ]

    search_fields = [
        'description',
        'reported_by__username',
        'reviewed_by__username',
        'review_notes',
        'object_id',
    ]

    ordering = ['-created_at']
    list_per_page = 50

    fieldsets = (
        # Section 1: What's being reported (generic relationship)
        ('Report Target', {
            'fields': ('content_type', 'object_id', 'get_reported_object'),
            'description': 'Generic relationship to the reported object'
        }),

        # Section 2: Report details
        ('Report Information', {
            'fields': ('report_type', 'description', 'reported_by', 'created_at', 'updated_at'),
        }),

        # Section 3: Additional data (JSON field)
        ('Additional Data', {
            'fields': ('additional_data',),
            'description': 'Extra context stored as JSON (e.g., duplicate location ID)',
            'classes': ('collapse',),
        }),

        # Section 4: Moderation tracking
        ('Moderation', {
            'fields': ('status', 'reviewed_by', 'review_notes', 'reviewed_at'),
        }),
    )

    readonly_fields = [
        'created_at',
        'updated_at',
        'reported_by',
        'content_type',
        'object_id',
        'get_reported_object',
        'report_type',
        'description',
        'additional_data'
    ]


    # Display the type of object being reported.
    # This returns the model name (e.g., 'location', 'review', 'reviewcomment'):
    def get_reported_object_type(self, obj):
        return obj.reported_object_type or 'Unknown'

    get_reported_object_type.short_description = 'Content Type'


    # Display a human-readable description of the reported object with a clickable link:
    def get_reported_object(self, obj):
        if obj.reported_object and obj.content_type:
            # Generate admin URL for the reported object
            url = reverse(
                f'admin:{obj.content_type.app_label}_{obj.content_type.model}_change',
                args=[obj.object_id]
            )
            return format_html('<a href="{}">{}</a>', url, obj.reported_object)

        return f"{obj.content_type.model if obj.content_type else 'Unknown'} #{obj.object_id} (deleted)"

    get_reported_object.short_description = 'Reported Object'



# ----------------------------------------------------------------------------- #
# Custom admin interface for EmailBounce model.                                 #
#                                                                               #
# Admin interface for viewing and managing email bounces with:                  #
# - Filter by bounce type, suppression status                                   #
# - Search by email address                                                     #
# - View detailed bounce information                                            #
# - Bulk actions for suppression management                                     #
# ----------------------------------------------------------------------------- #
class EmailBounceAdmin(admin.ModelAdmin):
    list_display = [
        'email',
        'user_link',
        'bounce_type_badge',
        'bounce_count',
        'last_bounce_date',
        'suppressed_badge',
    ]

    list_filter = [
        'bounce_type',
        'suppressed',
        'bounce_subtype',
        ('last_bounce_date', admin.DateFieldListFilter),
    ]

    search_fields = [
        'email',
        'user__username',
        'user__email',
    ]

    readonly_fields = [
        'email',
        'user',
        'bounce_type',
        'bounce_subtype',
        'bounce_count',
        'first_bounce_date',
        'last_bounce_date',
        'sns_message_id',
        'diagnostic_code_display',
        'raw_notification_display',
    ]

    fieldsets = (
        ('Email Information', {
            'fields': ('email', 'user')
        }),
        ('Bounce Details', {
            'fields': (
                'bounce_type',
                'bounce_subtype',
                'bounce_count',
                'first_bounce_date',
                'last_bounce_date',
            )
        }),
        ('AWS Details', {
            'fields': (
                'sns_message_id',
                'diagnostic_code_display',
            )
        }),
        ('Status', {
            'fields': ('suppressed',)
        }),
        ('Raw Data', {
            'fields': ('raw_notification_display',),
            'classes': ('collapse',)
        }),
    )

    actions = ['mark_as_suppressed', 'remove_from_suppression']


    # Link to user admin page
    def user_link(self, obj):
        if obj.user:
            return format_html(
                '<a href="/admin/auth/user/{}/change/">{}</a>',
                obj.user.id,
                obj.user.username
            )
        return '-'
    user_link.short_description = 'User'


    # Colored badge for bounce type
    def bounce_type_badge(self, obj):
        colors = {
            'hard': 'red',
            'soft': 'orange',
            'transient': 'gray',
        }
        color = colors.get(obj.bounce_type, 'gray')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; border-radius: 3px;">{}</span>',
            color,
            obj.bounce_type.upper()
        )
    bounce_type_badge.short_description = 'Type'


    # Colored badge for suppression status
    def suppressed_badge(self, obj):
        if obj.suppressed:
            return format_html(
                '<span style="background-color: red; color: white; padding: 3px 10px; border-radius: 3px;">SUPPRESSED</span>'
            )
        return format_html(
            '<span style="background-color: green; color: white; padding: 3px 10px; border-radius: 3px;">ACTIVE</span>'
        )
    suppressed_badge.short_description = 'Status'


    # Display diagnostic code with formatting
    def diagnostic_code_display(self, obj):
        if obj.diagnostic_code:
            return format_html('<pre>{}</pre>', obj.diagnostic_code)
        return '-'
    diagnostic_code_display.short_description = 'Diagnostic Code'

    # Display raw notification JSON with formatting
    def raw_notification_display(self, obj):
        import json
        return format_html(
            '<pre>{}</pre>',
            json.dumps(obj.raw_notification, indent=2)
        )
    raw_notification_display.short_description = 'Raw SNS Notification'


    # Add bounced emails to suppression list
    def mark_as_suppressed(self, request, queryset):
        count = 0
        for bounce in queryset:
            if not bounce.suppressed:
                EmailSuppressionList.add_to_suppression(
                    email=bounce.email,
                    reason='hard_bounce' if bounce.bounce_type == 'hard' else 'soft_bounce',
                    bounce=bounce,
                    notes=f'Manually suppressed by admin via bulk action'
                )
                bounce.suppressed = True
                bounce.save()
                count += 1

        self.message_user(request, f'{count} email(s) added to suppression list.')
    mark_as_suppressed.short_description = 'Add to suppression list'


    # Remove emails from suppression list
    def remove_from_suppression(self, request, queryset):
        count = 0
        for bounce in queryset:
            if bounce.suppressed:
                # Deactivate suppression
                EmailSuppressionList.objects.filter(
                    email=bounce.email,
                    is_active=True
                ).update(is_active=False)

                bounce.suppressed = False
                bounce.save()
                count += 1

        self.message_user(request, f'{count} email(s) removed from suppression list.')
    remove_from_suppression.short_description = 'Remove from suppression list'



# ----------------------------------------------------------------------------- #
# Custom admin interface for EmailComplaint model.                              #
#                                                                               #
# Admin interface for viewing and managing email complaints with:               #
# - Filter by complaint type, review status                                     #
# - Search by email address                                                     #
# - View detailed complaint information                                         #
# - Mark complaints as reviewed                                                 #
# ----------------------------------------------------------------------------- #
class EmailComplaintAdmin(admin.ModelAdmin):
    list_display = [
        'email',
        'user_link',
        'complaint_type_badge',
        'complaint_date',
        'reviewed_badge',
        'suppressed_badge',
    ]

    list_filter = [
        'complaint_type',
        'reviewed',
        'suppressed',
        ('complaint_date', admin.DateFieldListFilter),
    ]

    search_fields = [
        'email',
        'user__username',
        'user__email',
    ]

    readonly_fields = [
        'email',
        'user',
        'complaint_type',
        'complaint_date',
        'user_agent',
        'sns_message_id',
        'feedback_id',
        'raw_notification_display',
    ]

    fieldsets = (
        ('Email Information', {
            'fields': ('email', 'user')
        }),
        ('Complaint Details', {
            'fields': (
                'complaint_type',
                'complaint_date',
                'user_agent',
            )
        }),
        ('AWS Details', {
            'fields': (
                'sns_message_id',
                'feedback_id',
            )
        }),
        ('Status', {
            'fields': ('suppressed', 'reviewed')
        }),
        ('Raw Data', {
            'fields': ('raw_notification_display',),
            'classes': ('collapse',)
        }),
    )

    actions = ['mark_as_reviewed', 'mark_as_unreviewed']


    # Link to user admin page
    def user_link(self, obj):
        if obj.user:
            return format_html(
                '<a href="/admin/auth/user/{}/change/">{}</a>',
                obj.user.id,
                obj.user.username
            )
        return '-'
    user_link.short_description = 'User'


    # Colored badge for complaint type
    def complaint_type_badge(self, obj):
        return format_html(
            '<span style="background-color: red; color: white; padding: 3px 10px; border-radius: 3px;">{}</span>',
            obj.complaint_type.upper()
        )
    complaint_type_badge.short_description = 'Type'


    # Badge for review status
    def reviewed_badge(self, obj):
        if obj.reviewed:
            return format_html(
                '<span style="background-color: green; color: white; padding: 3px 10px; border-radius: 3px;">REVIEWED</span>'
            )
        return format_html(
            '<span style="background-color: orange; color: white; padding: 3px 10px; border-radius: 3px;">PENDING</span>'
        )
    reviewed_badge.short_description = 'Review Status'


    # Badge for suppression status
    def suppressed_badge(self, obj):
        if obj.suppressed:
            return format_html(
                '<span style="background-color: red; color: white; padding: 3px 10px; border-radius: 3px;">SUPPRESSED</span>'
            )
        return format_html(
            '<span style="background-color: gray; color: white; padding: 3px 10px; border-radius: 3px;">NOT SUPPRESSED</span>'
        )
    suppressed_badge.short_description = 'Status'


    # Display raw notification JSON with formatting
    def raw_notification_display(self, obj):
        import json
        return format_html(
            '<pre>{}</pre>',
            json.dumps(obj.raw_notification, indent=2)
        )
    raw_notification_display.short_description = 'Raw SNS Notification'


    # Mark complaints as reviewed
    def mark_as_reviewed(self, request, queryset):
        count = queryset.update(reviewed=True)
        self.message_user(request, f'{count} complaint(s) marked as reviewed.')
    mark_as_reviewed.short_description = 'Mark as reviewed'


    # Mark complaints as unreviewed
    def mark_as_unreviewed(self, request, queryset):
        count = queryset.update(reviewed=False)
        self.message_user(request, f'{count} complaint(s) marked as unreviewed.')
    mark_as_unreviewed.short_description = 'Mark as unreviewed'



# ----------------------------------------------------------------------------- #
# Custom admin interface for EmailSuppressionList model.                        #
#                                                                               #
# Admin interface for managing email suppression list with:                     #
# - Filter by reason, active status                                             #
# - Search by email address                                                     #
# - Bulk activate/deactivate suppressions                                       #
# - View linked bounce/complaint records                                        #
# ----------------------------------------------------------------------------- #
class EmailSuppressionListAdmin(admin.ModelAdmin):
    list_display = [
        'email',
        'user_link',
        'reason_badge',
        'added_date',
        'is_active_badge',
    ]

    list_filter = [
        'reason',
        'is_active',
        ('added_date', admin.DateFieldListFilter),
    ]

    search_fields = [
        'email',
        'user__username',
        'user__email',
    ]

    readonly_fields = [
        'added_date',
        'bounce_link',
        'complaint_link',
    ]

    fieldsets = (
        ('Email Information', {
            'fields': ('email', 'user')
        }),
        ('Suppression Details', {
            'fields': (
                'reason',
                'added_date',
                'notes',
            )
        }),
        ('Linked Records', {
            'fields': (
                'bounce_link',
                'complaint_link',
            )
        }),
        ('Status', {
            'fields': ('is_active',)
        }),
    )

    actions = ['activate_suppression', 'deactivate_suppression']


    # Link to user admin page
    def user_link(self, obj):
        if obj.user:
            return format_html(
                '<a href="/admin/auth/user/{}/change/">{}</a>',
                obj.user.id,
                obj.user.username
            )
        return '-'
    user_link.short_description = 'User'


    # Colored badge for suppression reason
    def reason_badge(self, obj):
        colors = {
            'hard_bounce': 'red',
            'soft_bounce': 'orange',
            'complaint': 'darkred',
            'manual': 'blue',
            'unsubscribe': 'green',
        }
        color = colors.get(obj.reason, 'gray')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; border-radius: 3px;">{}</span>',
            color,
            obj.get_reason_display()
        )
    reason_badge.short_description = 'Reason'


    # Badge for active status
    def is_active_badge(self, obj):
        if obj.is_active:
            return format_html(
                '<span style="background-color: red; color: white; padding: 3px 10px; border-radius: 3px;">ACTIVE</span>'
            )
        return format_html(
            '<span style="background-color: gray; color: white; padding: 3px 10px; border-radius: 3px;">INACTIVE</span>'
        )
    is_active_badge.short_description = 'Status'


    # Link to related bounce record
    def bounce_link(self, obj):
        if obj.bounce:
            return format_html(
                '<a href="/admin/starview_app/emailbounce/{}/change/">View Bounce #{}</a>',
                obj.bounce.id,
                obj.bounce.id
            )
        return '-'
    bounce_link.short_description = 'Related Bounce'


    # Link to related complaint record
    def complaint_link(self, obj):
        if obj.complaint:
            return format_html(
                '<a href="/admin/starview_app/emailcomplaint/{}/change/">View Complaint #{}</a>',
                obj.complaint.id,
                obj.complaint.id
            )
        return '-'
    complaint_link.short_description = 'Related Complaint'


    # Activate suppression for selected emails
    def activate_suppression(self, request, queryset):
        count = queryset.update(is_active=True)
        self.message_user(request, f'{count} suppression(s) activated.')
    activate_suppression.short_description = 'Activate suppression'


    # Deactivate suppression for selected emails
    def deactivate_suppression(self, request, queryset):
        count = queryset.update(is_active=False)
        self.message_user(request, f'{count} suppression(s) deactivated.')
    deactivate_suppression.short_description = 'Deactivate suppression'



# ----------------------------------------------------------------------------- #
# Custom admin interface for AuditLog model.                                    #
#                                                                               #
# Admin interface for viewing security audit logs with:                         #
# - Read-only access (audit logs are immutable)                                 #
# - Filter by event type, timestamp, success status                             #
# - Search by username and IP address                                           #
# - View metadata and user agent details                                        #
# ----------------------------------------------------------------------------- #
class AuditLogAdmin(admin.ModelAdmin):
    list_display = [
        'timestamp',
        'event_type_badge',
        'user_display',
        'ip_address',
        'success_badge',
    ]

    list_filter = [
        'event_type',
        'success',
        ('timestamp', admin.DateFieldListFilter),
    ]

    search_fields = [
        'username',
        'ip_address',
        'message',
        'user__username',
    ]

    readonly_fields = [
        'event_type',
        'timestamp',
        'success',
        'message',
        'user',
        'username',
        'ip_address',
        'user_agent',
        'metadata_display',
    ]

    fieldsets = (
        ('Event Information', {
            'fields': ('event_type', 'timestamp', 'success', 'message')
        }),
        ('User Information', {
            'fields': ('user', 'username')
        }),
        ('Request Context', {
            'fields': ('ip_address', 'user_agent')
        }),
        ('Metadata', {
            'fields': ('metadata_display',),
            'classes': ('collapse',)
        }),
    )

    # Disable add and delete permissions (audit logs are append-only)
    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    # Badge for event type
    def event_type_badge(self, obj):
        colors = {
            'login_success': 'green',
            'login_failed': 'red',
            'login_locked': 'darkred',
            'logout': 'gray',
            'registration_success': 'green',
            'registration_failed': 'orange',
            'password_reset_requested': 'blue',
            'password_changed': 'blue',
            'permission_denied': 'red',
            'access_forbidden': 'red',
        }
        color = colors.get(obj.event_type, 'gray')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; border-radius: 3px;">{}</span>',
            color,
            obj.get_event_type_display()
        )
    event_type_badge.short_description = 'Event Type'

    # Display username or user
    def user_display(self, obj):
        if obj.user:
            return format_html(
                '<a href="/admin/auth/user/{}/change/">{}</a>',
                obj.user.id,
                obj.user.username
            )
        return obj.username or 'anonymous'
    user_display.short_description = 'User'

    # Badge for success status
    def success_badge(self, obj):
        if obj.success:
            return format_html(
                '<span style="background-color: green; color: white; padding: 3px 10px; border-radius: 3px;">SUCCESS</span>'
            )
        return format_html(
            '<span style="background-color: red; color: white; padding: 3px 10px; border-radius: 3px;">FAILED</span>'
        )
    success_badge.short_description = 'Status'

    # Display metadata JSON with formatting
    def metadata_display(self, obj):
        import json
        if obj.metadata:
            return format_html(
                '<pre>{}</pre>',
                json.dumps(obj.metadata, indent=2)
            )
        return '-'
    metadata_display.short_description = 'Metadata'



# ----------------------------------------------------------------------------- #
# Custom admin interface for Follow model.                                      #
#                                                                               #
# Admin interface for viewing and managing user follow relationships with:      #
# - Filter by creation date                                                     #
# - Search by follower or following username                                    #
# - View follower/following relationships                                       #
# - Bulk delete actions                                                         #
# ----------------------------------------------------------------------------- #
class FollowAdmin(admin.ModelAdmin):
    list_display = [
        'id',
        'follower_link',
        'arrow',
        'following_link',
        'created_at',
    ]

    list_filter = [
        ('created_at', admin.DateFieldListFilter),
    ]

    search_fields = [
        'follower__username',
        'following__username',
    ]

    readonly_fields = [
        'follower',
        'following',
        'created_at',
    ]

    fieldsets = (
        ('Follow Relationship', {
            'fields': ('follower', 'following', 'created_at'),
            'description': 'User follow relationship'
        }),
    )

    ordering = ['-created_at']
    list_per_page = 50

    # Disable add permission (users create follows through the app)
    def has_add_permission(self, request):
        return False

    # Link to follower user admin page
    def follower_link(self, obj):
        return format_html(
            '<a href="/admin/auth/user/{}/change/">{}</a>',
            obj.follower.id,
            obj.follower.username
        )
    follower_link.short_description = 'Follower'

    # Arrow symbol between follower and following
    def arrow(self, obj):
        return '→'
    arrow.short_description = ''

    # Link to following user admin page
    def following_link(self, obj):
        return format_html(
            '<a href="/admin/auth/user/{}/change/">{}</a>',
            obj.following.id,
            obj.following.username
        )
    following_link.short_description = 'Following'



# ----------------------------------------------------------------------------- #
# Custom admin interface for Badge model.                                       #
#                                                                               #
# Admin interface for managing badges with:                                     #
# - Filter by category, tier, rarity                                            #
# - Search by name, slug, description                                           #
# - View badge details and award counts                                         #
# - Color-coded badges by category                                              #
# ----------------------------------------------------------------------------- #
class BadgeAdmin(admin.ModelAdmin):
    list_display = [
        'name',
        'category_badge',
        'tier',
        'criteria_display',
        'is_rare',
        'award_count',
        'display_order',
    ]

    list_filter = [
        'category',
        'tier',
        'is_rare',
    ]

    search_fields = [
        'name',
        'slug',
        'description',
    ]

    readonly_fields = [
        'award_count',
    ]

    fieldsets = (
        ('Badge Information', {
            'fields': ('name', 'slug', 'description', 'category', 'tier')
        }),
        ('Criteria', {
            'fields': ('criteria_type', 'criteria_value', 'criteria_secondary'),
            'description': 'Requirements for earning this badge'
        }),
        ('Display', {
            'fields': ('icon_path', 'display_order', 'is_rare')
        }),
        ('Statistics', {
            'fields': ('award_count',),
        }),
    )

    ordering = ['category', 'tier', 'display_order']
    list_per_page = 50

    # Colored badge for category
    def category_badge(self, obj):
        colors = {
            'EXPLORATION': '#3498db',      # Blue
            'CONTRIBUTION': '#2ecc71',     # Green
            'QUALITY': '#9b59b6',          # Purple
            'REVIEW': '#e74c3c',           # Red
            'COMMUNITY': '#f39c12',        # Orange
            'SPECIAL': '#1abc9c',          # Teal
            'TENURE': '#34495e',           # Dark gray
        }
        color = colors.get(obj.category, 'gray')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; border-radius: 3px;">{}</span>',
            color,
            obj.get_category_display()
        )
    category_badge.short_description = 'Category'

    # Display criteria in readable format
    def criteria_display(self, obj):
        if obj.criteria_type == 'SPECIAL_CONDITION':
            return f"Special: {obj.description}"
        elif obj.criteria_secondary:
            return f"{obj.get_criteria_type_display()}: {obj.criteria_value} (+ {obj.criteria_secondary}%)"
        else:
            return f"{obj.get_criteria_type_display()}: {obj.criteria_value}"
    criteria_display.short_description = 'Criteria'

    # Count of users who have this badge
    def award_count(self, obj):
        count = obj.userbadge_set.count() if obj.id else 0
        return format_html(
            '<strong>{}</strong> user(s)',
            count
        )
    award_count.short_description = 'Times Awarded'



# ----------------------------------------------------------------------------- #
# Custom admin interface for UserBadge model.                                   #
#                                                                               #
# Admin interface for viewing user badge awards with:                           #
# - Filter by badge, earned date                                                #
# - Search by username                                                          #
# - View badge details and earn date                                            #
# - Links to user and badge detail pages                                        #
# ----------------------------------------------------------------------------- #
class UserBadgeAdmin(admin.ModelAdmin):
    list_display = [
        'user_link',
        'badge_link',
        'badge_category',
        'earned_at',
    ]

    list_filter = [
        'badge__category',
        ('earned_at', admin.DateFieldListFilter),
    ]

    search_fields = [
        'user__username',
        'badge__name',
    ]

    readonly_fields = [
        'user',
        'badge',
        'earned_at',
    ]

    fieldsets = (
        ('Badge Award', {
            'fields': ('user', 'badge', 'earned_at')
        }),
    )

    ordering = ['-earned_at']
    list_per_page = 50

    # Disable add permission (badges awarded via BadgeService)
    def has_add_permission(self, request):
        return False

    # Link to user admin page
    def user_link(self, obj):
        return format_html(
            '<a href="/admin/auth/user/{}/change/">{}</a>',
            obj.user.id,
            obj.user.username
        )
    user_link.short_description = 'User'

    # Link to badge admin page
    def badge_link(self, obj):
        return format_html(
            '<a href="/admin/starview_app/badge/{}/change/">{}</a>',
            obj.badge.id,
            obj.badge.name
        )
    badge_link.short_description = 'Badge'

    # Display badge category
    def badge_category(self, obj):
        return obj.badge.get_category_display()
    badge_category.short_description = 'Category'



# ----------------------------------------------------------------------------- #
# Custom admin interface for LocationVisit model.                               #
#                                                                               #
# Admin interface for viewing location check-ins with:                          #
# - Filter by visited date                                                      #
# - Search by user or location name                                             #
# - View visit details                                                          #
# - Links to user and location detail pages                                     #
# ----------------------------------------------------------------------------- #
class LocationVisitAdmin(admin.ModelAdmin):
    list_display = [
        'user_link',
        'location_link',
        'visited_at',
    ]

    list_filter = [
        ('visited_at', admin.DateFieldListFilter),
    ]

    search_fields = [
        'user__username',
        'location__name',
    ]

    readonly_fields = [
        'user',
        'location',
        'visited_at',
    ]

    fieldsets = (
        ('Visit Information', {
            'fields': ('user', 'location', 'visited_at')
        }),
    )

    ordering = ['-visited_at']
    list_per_page = 50

    # Disable add permission (visits created via app)
    def has_add_permission(self, request):
        return False

    # Link to user admin page
    def user_link(self, obj):
        return format_html(
            '<a href="/admin/auth/user/{}/change/">{}</a>',
            obj.user.id,
            obj.user.username
        )
    user_link.short_description = 'User'

    # Link to location admin page
    def location_link(self, obj):
        return format_html(
            '<a href="/admin/starview_app/location/{}/change/">{}</a>',
            obj.location.id,
            obj.location.name
        )
    location_link.short_description = 'Location'



# ----------------------------------------------------------------------------- #
# Custom admin interface for SummaryFeedback model.                             #
#                                                                               #
# Admin interface for viewing AI summary feedback with:                         #
# - Filter by feedback type (helpful/not helpful), location, date               #
# - Search by username or location name                                         #
# - View feedback details and summary hash for version tracking                 #
# - Links to user and location detail pages                                     #
# ----------------------------------------------------------------------------- #
class SummaryFeedbackAdmin(admin.ModelAdmin):
    list_display = [
        'id',
        'user_link',
        'location_link',
        'feedback_badge',
        'created_at',
        'updated_at',
    ]

    list_filter = [
        'is_helpful',
        ('created_at', admin.DateFieldListFilter),
    ]

    search_fields = [
        'user__username',
        'location__name',
    ]

    readonly_fields = [
        'user',
        'location',
        'is_helpful',
        'summary_hash',
        'created_at',
        'updated_at',
    ]

    fieldsets = (
        ('Feedback Information', {
            'fields': ('user', 'location', 'is_helpful')
        }),
        ('Summary Version', {
            'fields': ('summary_hash',),
            'description': 'MD5 hash of the summary text when feedback was given'
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at')
        }),
    )

    ordering = ['-created_at']
    list_per_page = 50

    # Disable add permission (feedback created via app)
    def has_add_permission(self, request):
        return False

    # Link to user admin page
    def user_link(self, obj):
        return format_html(
            '<a href="/admin/auth/user/{}/change/">{}</a>',
            obj.user.id,
            obj.user.username
        )
    user_link.short_description = 'User'

    # Link to location admin page
    def location_link(self, obj):
        return format_html(
            '<a href="/admin/starview_app/location/{}/change/">{}</a>',
            obj.location.id,
            obj.location.name
        )
    location_link.short_description = 'Location'

    # Colored badge for feedback type
    def feedback_badge(self, obj):
        if obj.is_helpful:
            return format_html(
                '<span style="background-color: #2ecc71; color: white; padding: 3px 10px; border-radius: 3px;">👍 HELPFUL</span>'
            )
        return format_html(
            '<span style="background-color: #e74c3c; color: white; padding: 3px 10px; border-radius: 3px;">👎 NOT HELPFUL</span>'
        )
    feedback_badge.short_description = 'Feedback'



# ----------------------------------------------------------------------------- #
# Custom admin interface for Django's User model.                               #
#                                                                               #
# Extends Django's built-in UserAdmin to add:                                   #
# - Registration rank (position in signup order)                                #
# - Pioneer badge eligibility indicator                                         #
# - Link to user's badges                                                       #
# ----------------------------------------------------------------------------- #
class CustomUserAdmin(BaseUserAdmin):
    # Add registration rank to list display
    list_display = BaseUserAdmin.list_display + ('registration_rank', 'pioneer_eligible')

    # Add readonly fields to the user detail page
    readonly_fields = BaseUserAdmin.readonly_fields + ('registration_rank', 'pioneer_eligible', 'view_badges')

    # Add new fieldset for badge information
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Badge Information', {
            'fields': ('registration_rank', 'pioneer_eligible', 'view_badges'),
        }),
    )

    # Calculate and display user's registration rank
    def registration_rank(self, obj):
        if obj.date_joined:
            rank = User.objects.filter(date_joined__lte=obj.date_joined).count()

            # Color-code based on Pioneer eligibility
            if rank <= 100:
                return format_html(
                    '<strong style="color: #2ecc71;">#{}</strong> 🎖️',
                    rank
                )
            else:
                return format_html('#{:,}', rank)
        return '-'
    registration_rank.short_description = 'Registration Rank'
    registration_rank.admin_order_field = 'date_joined'  # Allow sorting by date_joined

    # Show if user is eligible for Pioneer badge
    def pioneer_eligible(self, obj):
        if obj.date_joined:
            rank = User.objects.filter(date_joined__lte=obj.date_joined).count()

            if rank <= 100:
                # Check if they actually have the badge
                from .models import UserBadge, Badge
                pioneer_badge = Badge.objects.filter(slug='pioneer').first()
                if pioneer_badge:
                    has_badge = UserBadge.objects.filter(user=obj, badge=pioneer_badge).exists()
                    if has_badge:
                        return format_html(
                            '<span style="background-color: #2ecc71; color: white; padding: 3px 10px; border-radius: 3px;">✓ HAS BADGE</span>'
                        )
                    else:
                        return format_html(
                            '<span style="background-color: #f39c12; color: white; padding: 3px 10px; border-radius: 3px;">ELIGIBLE</span>'
                        )
                else:
                    return format_html(
                        '<span style="background-color: #f39c12; color: white; padding: 3px 10px; border-radius: 3px;">ELIGIBLE</span>'
                    )
            else:
                return format_html(
                    '<span style="background-color: gray; color: white; padding: 3px 10px; border-radius: 3px;">NOT ELIGIBLE</span>'
                )
        return '-'
    pioneer_eligible.short_description = 'Pioneer Badge'

    # Link to view user's badges
    def view_badges(self, obj):
        from .models import UserBadge
        badge_count = UserBadge.objects.filter(user=obj).count()

        if badge_count > 0:
            url = f'/admin/starview_app/userbadge/?user__id__exact={obj.id}'
            return format_html(
                '<a href="{}" class="button">View {} Badge(s)</a>',
                url,
                badge_count
            )
        else:
            return format_html(
                '<span style="color: gray;">No badges yet</span>'
            )
    view_badges.short_description = 'User Badges'


# ----------------------------------------------------------------------------------------------------- #
#                                                                                                       #
#                                          ADMIN SITE REGISTERS                                         #
#                                                                                                       #
# ----------------------------------------------------------------------------------------------------- #

# Register models with basic admin interface
admin.site.register(Location)
admin.site.register(UserProfile)
admin.site.register(FavoriteLocation)
admin.site.register(Review)
admin.site.register(ReviewComment)
admin.site.register(ReviewPhoto)

# Register Follow model with custom admin interface
admin.site.register(Follow, FollowAdmin)

# Register generic models with custom admin interfaces
admin.site.register(Vote, VoteAdmin)
admin.site.register(Report, ReportAdmin)

# Register email event models with custom admin interfaces
admin.site.register(EmailBounce, EmailBounceAdmin)
admin.site.register(EmailComplaint, EmailComplaintAdmin)
admin.site.register(EmailSuppressionList, EmailSuppressionListAdmin)

# Register audit log model with custom admin interface (read-only)
admin.site.register(AuditLog, AuditLogAdmin)

# Register badge models with custom admin interfaces
admin.site.register(Badge, BadgeAdmin)
admin.site.register(UserBadge, UserBadgeAdmin)
admin.site.register(LocationVisit, LocationVisitAdmin)

# Register summary feedback model with custom admin interface
admin.site.register(SummaryFeedback, SummaryFeedbackAdmin)

# Re-register User model with custom admin (extends Django's default UserAdmin)
# Must unregister first, then register with our custom admin
admin.site.unregister(User)
admin.site.register(User, CustomUserAdmin)
