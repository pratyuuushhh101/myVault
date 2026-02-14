from django.urls import path
from .views_auth import RegisterAPIView
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

urlpatterns = [
    path("register/", RegisterAPIView.as_view(), name="register"),
    path("login/", TokenObtainPairView.as_view(), name="jwt-login"),
    path("refresh/", TokenRefreshView.as_view(), name="jwt-refresh"),
]

# you need to work on tokenobtainpairview or custom login view.
# right now its either django's inuilt: username and pwd
# but email+password is decided so keep the custom login class logic