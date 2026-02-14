from django.urls import path
from .views import TransactionCreateAPIView,AccountBalanceAPIView
from .views_auth import RegisterAPIView, LoginAPIView

urlpatterns = [
    path("auth/register/", RegisterAPIView.as_view()),
    path("auth/login/", LoginAPIView.as_view()),
    path("transactions/", TransactionCreateAPIView.as_view(), name="create-transaction"),
    path('accounts/<uuid:account_id>/balance/', AccountBalanceAPIView.as_view(), name='account-balance'),
]




