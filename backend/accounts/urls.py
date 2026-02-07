from django.urls import path
from .views import TransactionCreateAPIView,AccountBalanceAPIView

urlpatterns = [
    path("transactions/", TransactionCreateAPIView.as_view(), name="create-transaction"),
    path('accounts/<uuid:account_id>/balance/', AccountBalanceAPIView.as_view(), name='account-balance'),

]
