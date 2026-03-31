from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AccountViewSet, BankingActionView

router = DefaultRouter()
router.register(r'accounts', AccountViewSet, basename='account')
router.register(r'ops', BankingActionView, basename='operations') # transfer, deposit, withdraw

urlpatterns = [
    path('', include(router.urls)),
]
