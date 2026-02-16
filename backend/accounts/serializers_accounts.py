from rest_framework import serializers
from .models import Account


class AccountCreateSerializer(serializers.Serializer):
    account_type = serializers.ChoiceField(choices=Account.AccountType.choices)

    def validate_account_type(self, value):
        user = self.context["request"].user
        # One savings + one current max per user
        if Account.objects.filter(user=user, account_type=value).exists():
            raise serializers.ValidationError(
                f"You already have a {value.lower()} account."
            )
        return value


class AccountResponseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Account
        fields = ["id", "account_type", "balance", "created_at", "is_active"]
