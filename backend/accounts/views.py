from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.core.exceptions import ValidationError
from .services import process_transaction

from .serializers import (TransactionCreateSerializer,TransactionResponseSerializer)
from .models import Transaction

# Create your views here.
class TransactionCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = TransactionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data

        try:
            tx = process_transaction(
                transaction_type=data["transaction_type"],
                amount_str=data["amount"],
                sender_id=data.get("sender_id"),
                receiver_id=data.get("receiver_id"),
                description=data.get("description", ""),
            )
        except ValidationError as e:
            return Response(
                {"error": e.message},
                status=status.HTTP_400_BAD_REQUEST
            )

        response_serializer = TransactionResponseSerializer(tx)
        return Response(
            response_serializer.data,
            status=status.HTTP_201_CREATED
        )

from .models import Account

class AccountBalanceAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, account_id):
        try:
            acc = Account.objects.get(id=account_id)
            return Response({"balance": acc.balance})
        except Account.DoesNotExist:
            return Response({"error": "Account not found"}, status=404)
