from django.urls import path, include
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework.routers import DefaultRouter
from .views import RegisterAPIView, AccountViewSet, TransactionViewSet, LoanViewSet, LoginAPIView, SetPinAPIView

router = DefaultRouter()
router.register('accounts', AccountViewSet, basename='accounts')
router.register('loans', LoanViewSet, basename='loans')

urlpatterns = [
    # AUTH SYSTEM
    path('register/', RegisterAPIView.as_view(), name='register'),
    path('login/', LoginAPIView.as_view(), name='jwt-login'),
    path('refresh/', TokenRefreshView.as_view(), name='jwt-refresh'),
    path('set-pin/', SetPinAPIView.as_view(), name='set-pin'),
    
    # SYSTEM BASE (ROUTER)
    path('', include(router.urls)),
    
    # TRANSACTION SYSTEM (Standardized)
    path('transactions/deposit/', TransactionViewSet.as_view({'post': 'deposit'}), name='deposit'),
    path('transactions/withdraw/', TransactionViewSet.as_view({'post': 'withdraw'}), name='withdraw'),
    path('transactions/transfer/', TransactionViewSet.as_view({'post': 'transfer'}), name='transfer'),
    path('transactions/history/', TransactionViewSet.as_view({'get': 'history'}), name='history'),
]
