from rest_framework import serializers
from accounts.models import Transaction

class TransactionCreateSerializer(serializers.Serializer):
    """
    Validates API input before calling the transaction service.
    Does NOT touch the database.
    """

    transaction_type = serializers.ChoiceField(
        choices=Transaction.TransactionType.choices
    )

    amount = serializers.CharField()

    sender_id = serializers.UUIDField(
        required=False,
        allow_null=True
    )

    receiver_id = serializers.UUIDField(
        required=False,
        allow_null=True
    )

    description = serializers.CharField(
        required=False,
        allow_blank=True
    )

    def validate(self, data):
        tx_type = data["transaction_type"]
        sender = data.get("sender_id")
        receiver = data.get("receiver_id")

        if tx_type == Transaction.TransactionType.DEPOSIT:
            if receiver is None or sender is not None:
                raise serializers.ValidationError(
                    "Deposit requires only a receiver account."
                )

        elif tx_type == Transaction.TransactionType.WITHDRAWAL:
            if sender is None or receiver is not None:
                raise serializers.ValidationError(
                    "Withdrawal requires only a sender account."
                )

        elif tx_type == Transaction.TransactionType.TRANSFER:
            if sender is None or receiver is None:
                raise serializers.ValidationError(
                    "Transfer requires both sender and receiver."
                )
            if sender == receiver:
                raise serializers.ValidationError(
                    "Sender and receiver cannot be the same."
                )

        return data

class TransactionResponseSerializer(serializers.ModelSerializer):
    sender_id = serializers.UUIDField(source="sender.id", allow_null=True)
    receiver_id = serializers.UUIDField(source="receiver.id", allow_null=True)

    class Meta:
        model = Transaction
        fields = [
            "id",
            "transaction_type",
            "amount",
            "sender_id",
            "receiver_id",
            "description",
            "created_at",
        ]


