from django.conf.urls.defaults import patterns, include, url
from django.contrib.staticfiles.urls import staticfiles_urlpatterns
#from django.conf import settings
#from django.views.generic.simple import direct_to_template
# Uncomment the next two lines to enable the admin:
# from django.contrib import admin
# admin.autodiscover()
import os
APP_NAME = os.path.split(os.path.dirname(__file__))[-1]
urlpatterns = patterns(APP_NAME,
    url(r'^$', 'views.index'),
    (r'^download/form(?P<path>.*)$', 'views.download'),
    (r'^static/form(?P<dir>.*?)/(?P<name>.*)$', 'views.preview'),
)

urlpatterns += staticfiles_urlpatterns()