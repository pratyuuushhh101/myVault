# accounts/views_accounts.py

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions

from .models import Account
from .serializers_accounts import (
    AccountCreateSerializer,
    AccountResponseSerializer,
)


class AccountCreateAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = AccountCreateSerializer(
            data=request.data,
            context={"request": request}
        )
        serializer.is_valid(raise_exception=True)

        account = Account.objects.create(
            user=request.user,
            account_type=serializer.validated_data["account_type"]
        )

        return Response(
            AccountResponseSerializer(account).data,
            status=status.HTTP_201_CREATED
        )


class AccountListAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        accounts = Account.objects.filter(user=request.user)

        return Response(
            AccountResponseSerializer(accounts, many=True).data,
            status=status.HTTP_200_OK
        )
