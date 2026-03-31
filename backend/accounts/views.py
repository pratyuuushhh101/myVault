from rest_framework import status, permissions, viewsets, generics
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework_simplejwt.tokens import RefreshToken
from django.db.models import Q
from decimal import Decimal
from django.core.exceptions import ValidationError as DjangoValidationError
import re
from django.db import connection

from .models import Account, Transaction, User, Loan
from .services import TransactionEngine, LoanService
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from .serializers import (
    UserRegistrationSerializer,
    AccountSerializer,
    TransactionHistorySerializer,
    DepositWithdrawSerializer,
    TransferSerializer,
    LoanSerializer,
    LoanCreateSerializer,
    LoanRepaymentSerializer,
    CustomTokenObtainPairSerializer
)

class LoanViewSet(viewsets.ModelViewSet):
    """
    Loan lifecycle management with owner-only access.
    """
    serializer_class = LoanSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Loan.objects.filter(user=self.request.user)

    @action(detail=False, methods=['post'], url_path='create')
    def create_loan(self, request):
        serializer = LoanCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # 🔐 SECURITY: PIN Validation
        pin = serializer.validated_data.get('pin')
        if not pin or not request.user.check_transaction_pin(pin):
            return Response({"error": "Security Mismatch: Invalid Transaction PIN."}, status=status.HTTP_403_FORBIDDEN)
            
        # 🛡️ SECURITY: Account Ownership
        if not Account.objects.filter(id=serializer.validated_data['account_id'], user=request.user).exists():
            return Response({"error": "Unauthorized disbursement account selection."}, status=status.HTTP_403_FORBIDDEN)
            
        try:
            loan = LoanService.create_loan(
                user=request.user,
                account_id=serializer.validated_data['account_id'],
                amount=Decimal(str(serializer.validated_data['amount'])),
                loan_type=serializer.validated_data['loan_type'],
                interest_rate=Decimal(str(serializer.validated_data['interest_rate'])),
                tenure_months=serializer.validated_data['tenure_months']
            )
            return Response(LoanSerializer(loan).data, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": "Loan Processing Error: " + str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='repay')
    def repay_loan(self, request):
        serializer = LoanRepaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # 🔐 SECURITY: PIN Validation
        pin = serializer.validated_data.get('pin')
        if not pin or not request.user.check_transaction_pin(pin):
            return Response({"error": "Security Mismatch: Invalid Transaction PIN."}, status=status.HTTP_403_FORBIDDEN)
            
        # 🛡️ SECURITY: Account Ownership
        if not Account.objects.filter(id=serializer.validated_data['account_id'], user=request.user).exists():
            return Response({"error": "Unauthorized settlement source account."}, status=status.HTTP_403_FORBIDDEN)
            
        try:
            loan = LoanService.repay_loan(
                user=request.user,
                loan_id=serializer.validated_data['loan_id'],
                account_id=serializer.validated_data['account_id'],
                amount=Decimal(str(serializer.validated_data['amount']))
            )
            return Response(LoanSerializer(loan).data, status=status.HTTP_200_OK)
        except DjangoValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": "Repayment Execution Error: " + str(e)}, status=status.HTTP_400_BAD_REQUEST)

# --- AUTHENTICATION --- #

class RegisterAPIView(generics.CreateAPIView):
    queryset = User.objects.all()
    permission_classes = [permissions.AllowAny]
    serializer_class = UserRegistrationSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        
        # Generate tokens automatically for registration (best UX practice)
        refresh = RefreshToken.for_user(user)
        
        return Response({
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "access": str(refresh.access_token),
            "refresh": str(refresh),
        }, status=status.HTTP_201_CREATED)

class LoginAPIView(TokenObtainPairView):
    """
    Enhanced authentication entry point supporting multi-identifier login (Username/Email).
    """
    serializer_class = CustomTokenObtainPairSerializer


class SetPinAPIView(APIView):
    """Allows users to establish or rotate their security PIN."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        pin = request.data.get('pin')
        if not pin or len(pin) < 4:
            return Response({"error": "PIN must be at least 4 digits."}, status=status.HTTP_400_BAD_REQUEST)
        
        request.user.set_transaction_pin(pin)
        request.user.save()
        return Response({"message": "Security PIN synchronized successfully."}, status=status.HTTP_200_OK)


# --- ACCOUNT MANAGEMENT --- #

class AccountViewSet(viewsets.ModelViewSet):
    """
    Standard CRUD for accounts with user ownership enforcement.
    """
    serializer_class = AccountSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # SECURITY: Global boundary - Users only interact with their own accounts.
        return Account.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        # Automatic secure assignment of owner
        serializer.save(user=self.request.user)


# --- BANKING SYSTEM (TRANSACTIONS) --- #

class TransactionViewSet(viewsets.ViewSet):
    """
    Atomic banking operations that delegate strictly to Business Services.
    """
    permission_classes = [permissions.IsAuthenticated]

    # POST /transactions/deposit
    def deposit(self, request):
        serializer = DepositWithdrawSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        try:
            tx = TransactionEngine.deposit_funds(
                account_id=str(serializer.validated_data['account_id']),
                amount=Decimal(str(serializer.validated_data['amount']))
            )
            return Response(TransactionHistorySerializer(tx).data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


    # POST /transactions/withdraw
    def withdraw(self, request):
        serializer = DepositWithdrawSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # 🔐 MANDATORY Security Check
        pin = serializer.validated_data.get('pin')
        if not pin or not request.user.check_transaction_pin(pin):
            return Response({"error": "Security Mismatch: Invalid Transaction PIN."}, status=status.HTTP_403_FORBIDDEN)

        try:
            tx = TransactionEngine.withdraw_funds(
                account_id=str(serializer.validated_data['account_id']),
                amount=Decimal(str(serializer.validated_data['amount']))
            )
            return Response(TransactionHistorySerializer(tx).data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


    # POST /transactions/transfer
    def transfer(self, request):
        serializer = TransferSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        sender_id = serializer.validated_data['sender_id']
        
        # SECURITY: Sender must belong to the authenticated user context.
        if not Account.objects.filter(id=sender_id, user=request.user).exists():
            return Response({"error": "Unauthorized transfer context."}, status=status.HTTP_403_FORBIDDEN)
            
        # 🔐 MANDATORY Security Check
        pin = serializer.validated_data.get('pin')
        if not pin or not request.user.check_transaction_pin(pin):
            return Response({"error": "Security Mismatch: Invalid Transaction PIN."}, status=status.HTTP_403_FORBIDDEN)

        try:
            tx = TransactionEngine.transfer_funds(
                sender_id=sender_id,
                receiver_id=serializer.validated_data['receiver_id'],
                amount=Decimal(str(serializer.validated_data['amount']))
            )
            return Response(TransactionHistorySerializer(tx).data, status=status.HTTP_201_CREATED)
        except (DjangoValidationError, Exception) as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)



    # GET /transactions/history
    def history(self, request):
        """
        Retrieves all transactions across all accounts owned by the user.
        """
        user_accounts = Account.objects.filter(user=request.user)
        transactions = Transaction.objects.filter(
            Q(sender__in=user_accounts) | Q(receiver__in=user_accounts)
        ).distinct()
        
        return Response(TransactionHistorySerializer(transactions, many=True).data)


# --- LOAN MANAGEMENT --- #

class LoanViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Institutional Loan Audit ViewSet.
    """
    serializer_class = LoanSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Loan.objects.filter(user=self.request.user)

    @action(detail=False, methods=['post'], url_path='create')
    def create_loan(self, request):
        serializer = LoanCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Security PIN verify
        pin = serializer.validated_data.get('pin')
        if not pin or not request.user.check_transaction_pin(pin):
            return Response({"error": "Security Mismatch: Invalid Transaction PIN."}, status=status.HTTP_403_FORBIDDEN)

        try:
            loan = LoanService.create_loan(
                user=request.user,
                account_id=str(serializer.validated_data['account_id']),
                amount=Decimal(str(serializer.validated_data['amount'])),
                loan_type=serializer.validated_data['loan_type']
            )
            return Response(LoanSerializer(loan).data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='repay')
    def repay_loan(self, request):
        serializer = LoanRepaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Security PIN verify
        pin = serializer.validated_data.get('pin')
        if not pin or not request.user.check_transaction_pin(pin):
            return Response({"error": "Security Mismatch: Invalid Transaction PIN."}, status=status.HTTP_403_FORBIDDEN)

        try:
            loan = LoanService.repay_loan(
                user=request.user,
                loan_id=str(serializer.validated_data['loan_id']),
                account_id=str(serializer.validated_data['account_id']),
                amount=Decimal(str(serializer.validated_data['amount']))
            )
            return Response(LoanSerializer(loan).data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)