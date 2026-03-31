from rest_framework import serializers
from .models import Account, Transaction, TransactionType

class AccountSerializer(serializers.ModelSerializer):
    """View only account serializer for public endpoints."""
    class Meta:
        model = Account
        fields = ['id', 'account_number', 'balance', 'currency', 'created_at']
        read_only_fields = ['id', 'balance', 'created_at']

class TransactionSerializer(serializers.ModelSerializer):
    """Read-only transaction list serializer for history."""
    from_account_number = serializers.CharField(source='from_account.account_number', read_only=True)
    to_account_number = serializers.CharField(source='to_account.account_number', read_only=True)

    class Meta:
        model = Transaction
        fields = [
            'id', 
            'from_account', 
            'to_account', 
            'from_account_number', 
            'to_account_number', 
            'amount', 
            'transaction_type', 
            'description', 
            'timestamp'
        ]
        read_only_fields = fields

class TransferRequestSerializer(serializers.Serializer):
    """Validated schema for fund transfers."""
    from_account_id = serializers.UUIDField(required=True)
    to_account_id = serializers.UUIDField(required=True)
    amount = serializers.DecimalField(max_digits=15, decimal_places=2, required=True, min_value=0.01)
    description = serializers.CharField(required=False, allow_blank=True, max_length=255)

    def validate(self, data):
        if data['from_account_id'] == data['to_account_id']:
            raise serializers.ValidationError({"to_account_id": "Cannot transfer to the same account."})
        return data

class DepositWithdrawRequestSerializer(serializers.Serializer):
    """Validated schema for simple deposits and withdrawals."""
    account_id = serializers.UUIDField(required=True)
    amount = serializers.DecimalField(max_digits=15, decimal_places=2, required=True, min_value=0.01)
    description = serializers.CharField(required=False, allow_blank=True, max_length=255)
