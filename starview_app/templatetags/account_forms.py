"""Apply shared form utilities without replacing Django's widget attributes."""
from django import template
from django.forms import Textarea

register = template.Library()


@register.filter
def account_widget(field):
    if field.is_hidden:
        return field.as_widget()
    widget_type = getattr(field.field.widget, 'input_type', None)
    if widget_type in ('checkbox', 'radio'):
        return field.as_widget()
    utility = 'form-textarea' if isinstance(field.field.widget, Textarea) else 'form-input'
    classes = field.field.widget.attrs.get('class', '').split()
    if utility not in classes:
        classes.append(utility)
    return field.as_widget(attrs={'class': ' '.join(classes)})
