from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth import authenticate
from django.db.models import Q
from rest_framework import exceptions
from .models import Account, Transaction, User, Loan
from decimal import Decimal

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        identity = attrs.get('username')
        password = attrs.get('password')

        if not identity or not password:
            raise exceptions.AuthenticationFailed('Both username/email and password are required.')

        # Attempt to find user by username or email
        user = User.objects.filter(Q(username=identity) | Q(email=identity)).first()

        if user and user.check_password(password):
            if not user.is_active:
                raise exceptions.AuthenticationFailed('User account is disabled.')
            
            # Pass correct internal username to parent for token generation
            attrs['username'] = user.username
            return super().validate(attrs)
        
        raise exceptions.AuthenticationFailed('No active account found with the given credentials.')

class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'password')

    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        user.save()
        return user


# --- LOAN SERIALIZERS ---

class LoanSerializer(serializers.ModelSerializer):
    class Meta:
        model = Loan
        fields = [
            'id', 'loan_type', 'amount', 
            'remaining_amount', 'status', 'created_at'
        ]
        read_only_fields = fields


class LoanCreateSerializer(serializers.Serializer):
    account_id = serializers.UUIDField(required=True)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('100.00'))
    loan_type = serializers.ChoiceField(choices=Loan.LoanType.choices)
    pin = serializers.CharField(write_only=True, min_length=4, max_length=6, required=True)


class LoanRepaymentSerializer(serializers.Serializer):
    loan_id = serializers.UUIDField(required=True)
    account_id = serializers.UUIDField(required=True)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'), required=True)
    pin = serializers.CharField(write_only=True, min_length=4, max_length=6, required=True)


# --- ACCOUNT SERIALIZERS ---
class AccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = Account
        fields = ['id', 'account_type', 'balance', 'created_at']
        read_only_fields = ['id', 'balance', 'created_at']


# --- TRANSACTION SERIALIZERS ---
class TransactionHistorySerializer(serializers.ModelSerializer):
    sender_account = serializers.CharField(source='sender.id', read_only=True)
    receiver_account = serializers.CharField(source='receiver.id', read_only=True)

    class Meta:
        model = Transaction
        fields = ['id', 'transaction_type', 'amount', 'sender_account', 'receiver_account', 'created_at']


class DepositWithdrawSerializer(serializers.Serializer):
    account_id = serializers.UUIDField(required=True)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'), required=True)
    pin = serializers.CharField(write_only=True, min_length=4, max_length=6, required=True)


class TransferSerializer(serializers.Serializer):
    sender_id = serializers.UUIDField(required=True)
    receiver_id = serializers.UUIDField(required=True)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'), required=True)
    pin = serializers.CharField(write_only=True, min_length=4, max_length=6, required=True)

    def validate(self, data):
        if data['sender_id'] == data['receiver_id']:
            raise serializers.ValidationError("Sender and receiver account cannot be the same.")
        return data
