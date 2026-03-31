from django.db import models
from django.conf import settings
from django.db.models import CheckConstraint, Q, F
import uuid

class Account(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='accounts')
    account_number = models.CharField(max_length=20, unique=True)
    balance = models.DecimalField(max_digits=15, decimal_places=2, default=0.00)
    currency = models.CharField(max_length=3, default='USD')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            CheckConstraint(
                check=Q(balance__gte=0),
                name='balance_not_negative'
            )
        ]
        verbose_name = 'Account'
        verbose_name_plural = 'Accounts'

    def __str__(self):
        return f"{self.account_number} ({self.user.username})"

class TransactionType(models.TextChoices):
    DEPOSIT = 'DEPOSIT', 'Deposit'
    WITHDRAWAL = 'WITHDRAWAL', 'Withdrawal'
    TRANSFER = 'TRANSFER', 'Transfer'

class Transaction(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    from_account = models.ForeignKey(
        Account, 
        on_delete=models.PROTECT, 
        related_name='outgoing_transactions',
        null=True, 
        blank=True
    )
    to_account = models.ForeignKey(
        Account, 
        on_delete=models.PROTECT, 
        related_name='incoming_transactions',
        null=True, 
        blank=True
    )
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    transaction_type = models.CharField(max_length=20, choices=TransactionType.choices)
    description = models.TextField(blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp']
        verbose_name = 'Transaction'
        verbose_name_plural = 'Transactions'
        constraints = [
            CheckConstraint(
                check=Q(amount__gt=0),
                name='transaction_amount_positive'
            )
        ]

    def save(self, *args, **kwargs):
        # Prevent updates to existing transactions (Immutability)
        if not self._state.adding:
            raise PermissionError("Transactions are immutable and cannot be updated.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        # Prevent deletion (Immutability)
        raise PermissionError("Transactions are immutable and cannot be deleted.")

    def __str__(self):
        return f"{self.transaction_type}: {self.amount} from {self.from_account} to {self.to_account}"
