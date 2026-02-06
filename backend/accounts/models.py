from django.contrib.auth.models import AbstractUser
from django.db import models
from django.core.exceptions import ValidationError
from django.conf import settings
import uuid
# Create your models here.


class User(AbstractUser):
    phone_number = models.CharField(
        max_length=15,
        unique=True,
        null=True,
        blank=True
    )

    email = models.EmailField(unique=True)

    is_phone_verified = models.BooleanField(default=False)
    is_kyc_verified = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.username} ({self.email})"


class Account(models.Model):

    class AccountType(models.TextChoices):
        SAVINGS = "SAVINGS", "Savings"
        CURRENT = "CURRENT", "Current"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='accounts'
    )

    account_type = models.CharField(
        max_length=10,
        choices=AccountType.choices
    )

    balance = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(balance__gte=0),
                name="balance_non_negative"
            )
        ]
        indexes = [
            models.Index(fields=['user']),
            models.Index(fields=['account_type']),
        ]

    def __str__(self):
        return f"Account {self.id} ({self.account_type})"


class Transaction(models.Model):

    class TransactionType(models.TextChoices):
        DEPOSIT = "DEPOSIT", "Deposit"
        WITHDRAWAL = "WITHDRAWAL", "Withdrawal"
        TRANSFER = "TRANSFER", "Transfer"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    sender = models.ForeignKey('Account',on_delete=models.PROTECT,null=True,
        blank=True,
        related_name='outgoing_transactions'
    )

    receiver = models.ForeignKey(
        'Account',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='incoming_transactions'
    )

    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2
    )

    transaction_type = models.CharField(
        max_length=15,
        choices=TransactionType.choices
    )

    description = models.CharField(
        max_length=255,
        blank=True
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['created_at']),
            models.Index(fields=['transaction_type']),
        ]

    def clean(self):
        # amount must be positive
        if self.amount <= 0:
            raise ValidationError("Transaction amount must be greater than zero.")

        # DEPOSIT rules
        if self.transaction_type == self.TransactionType.DEPOSIT:
            if self.receiver is None or self.sender is not None:
                raise ValidationError("Deposit must have a receiver and no sender.")

        # WITHDRAWAL rules
        if self.transaction_type == self.TransactionType.WITHDRAWAL:
            if self.sender is None or self.receiver is not None:
                raise ValidationError("Withdrawal must have a sender and no receiver.")

        # TRANSFER rules
        if self.transaction_type == self.TransactionType.TRANSFER:
            if self.sender is None or self.receiver is None:
                raise ValidationError("Transfer must have both sender and receiver.")
            if self.sender == self.receiver:
                raise ValidationError("Sender and receiver cannot be the same account.")

    def save(self, *args, **kwargs):
        self.full_clean()  # enforce validation always
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.transaction_type} | {self.amount} | {self.created_at}"

