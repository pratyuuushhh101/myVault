from rest_framework import viewsets, status, permissions
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from .models import Account, Transaction
from .serializers import (
    AccountSerializer, 
    TransactionSerializer, 
    TransferRequestSerializer,
    DepositWithdrawRequestSerializer
)
from .services import BankingService

class AccountViewSet(viewsets.ModelViewSet):
    """Handles account listing, creation and balance viewing."""
    serializer_class = AccountSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Enforce security constraint: Users can only see their own accounts
        return Account.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        # Automatically assign logged in user to account
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['get'])
    def transactions(self, request, pk=None):
        """Returns transaction history for a specific account."""
        account = self.get_object()
        # Fetch both incoming and outgoing transactions
        transactions = Transaction.objects.filter(
            Q(from_account=account) | Q(to_account=account)
        ).select_related('from_account', 'to_account')
        
        serializer = TransactionSerializer(transactions, many=True)
        return Response(serializer.data)

class BankingActionView(viewsets.ViewSet):
    """Process banking operations (transfer, deposit, withdraw)."""
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=['post'])
    def transfer(self, request):
        serializer = TransferRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Verify ownership of 'from' account before processing transfer
        try:
            # Check existance and ownership first to avoid unauthorized transfers
            from_account_id = serializer.validated_data['from_account_id']
            # Using get_object handles ownership check if we had it in viewset, 
            # here we check explicitly.
            if not Account.objects.filter(user=request.user, id=from_account_id).exists():
                return Response(
                    {"error": "Unauthorized transfer context."}, 
                    status=status.HTTP_403_FORBIDDEN
                )

            transaction_record = BankingService.transfer(
                from_account_id=from_account_id,
                to_account_id=serializer.validated_data['to_account_id'],
                amount=serializer.validated_data['amount'],
                description=serializer.validated_data.get('description', '')
            )
            
            return Response(
                TransactionSerializer(transaction_record).data, 
                status=status.HTTP_201_CREATED
            )
        except (DjangoValidationError, Exception) as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_VALUE)

    @action(detail=False, methods=['post'])
    def deposit(self, request):
        serializer = DepositWithdrawRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Users can typically only deposit into their own accounts in this context
        account_id = serializer.validated_data['account_id']
        if not Account.objects.filter(user=request.user, id=account_id).exists():
            return Response({"error": "Unauthorized access."}, status=status.HTTP_403_FORBIDDEN)

        try:
            transaction_record = BankingService.deposit(
                account_id=account_id,
                amount=serializer.validated_data['amount'],
                description=serializer.validated_data.get('description', '')
            )
            return Response(
                TransactionSerializer(transaction_record).data, 
                status=status.HTTP_201_CREATED
            )
        except (DjangoValidationError, Exception) as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_VALUE)

    @action(detail=False, methods=['post'])
    def withdraw(self, request):
        serializer = DepositWithdrawRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        account_id = serializer.validated_data['account_id']
        if not Account.objects.filter(user=request.user, id=account_id).exists():
            return Response({"error": "Unauthorized access."}, status=status.HTTP_403_FORBIDDEN)

        try:
            transaction_record = BankingService.withdraw(
                account_id=account_id,
                amount=serializer.validated_data['amount'],
                description=serializer.validated_data.get('description', '')
            )
            return Response(
                TransactionSerializer(transaction_record).data, 
                status=status.HTTP_201_CREATED
            )
        except (DjangoValidationError, Exception) as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_VALUE)
