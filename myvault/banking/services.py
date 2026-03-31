from decimal import Decimal
from django.db import transaction
from django.core.exceptions import ValidationError
from .models import Account, Transaction, TransactionType
from django.db.models import F

class BankingService:
    @staticmethod
    def transfer(from_account_id, to_account_id, amount, description=""):
        """
        Atomically transfers funds from one account to another with row-level locking.
        Prevents race conditions by using select_for_update().
        """
        amount = Decimal(str(amount))
        
        if amount <= 0:
            raise ValidationError("Transfer amount must be positive.")

        if str(from_account_id) == str(to_account_id):
            raise ValidationError("Cannot transfer funds to the same account.")

        # Consistency: Lock smaller UUID first to prevent deadlocks
        account_ids = sorted([str(from_account_id), str(to_account_id)])
        
        with transaction.atomic():
            # Apply row-level locking in deterministic order
            accounts = Account.objects.select_for_update().filter(id__in=account_ids)
            # Create a dictionary for easy access
            locked_accounts = {str(acc.id): acc for acc in accounts}
            
            from_acc = locked_accounts.get(str(from_account_id))
            to_acc = locked_accounts.get(str(to_account_id))

            if not from_acc or not to_acc:
                raise ValidationError("One or both accounts not found.")

            if from_acc.balance < amount:
                raise ValidationError(f"Insufficient funds. Required: {amount}, Available: {from_acc.balance}")

            # Update balances (explicitly using locked instances)
            from_acc.balance = F('balance') - amount
            to_acc.balance = F('balance') + amount
            
            # Save using save() because F() expressions are evaluated in DB, 
            # and we want to refresh after save if needed.
            # (Note: Standard DRF view will likely refresh from DB anyway).
            from_acc.save(update_fields=['balance'])
            to_acc.save(update_fields=['balance'])

            # Create immutable transaction record
            transaction_record = Transaction.objects.create(
                from_account=from_acc,
                to_account=to_acc,
                amount=amount,
                transaction_type=TransactionType.TRANSFER,
                description=description
            )
            
            return transaction_record

    @staticmethod
    def deposit(account_id, amount, description=""):
        """Atomically deposit funds into an account."""
        amount = Decimal(str(amount))
        
        if amount <= 0:
            raise ValidationError("Deposit amount must be positive.")

        with transaction.atomic():
            account = Account.objects.select_for_update().get(id=account_id)
            account.balance = F('balance') + amount
            account.save(update_fields=['balance'])
            
            return Transaction.objects.create(
                to_account=account,
                amount=amount,
                transaction_type=TransactionType.DEPOSIT,
                description=description
            )

    @staticmethod
    def withdraw(account_id, amount, description=""):
        """Atomically withdraw funds from an account."""
        amount = Decimal(str(amount))
        
        if amount <= 0:
            raise ValidationError("Withdrawal amount must be positive.")

        with transaction.atomic():
            account = Account.objects.select_for_update().get(id=account_id)
            
            # Wait: F() expression check doesn't work in Python logic before save. 
            # Need to refresh from DB or check current field value if we have lock.
            # Using select_for_update() + refreshing balance from DB
            account.refresh_from_db()
            
            if account.balance < amount:
                raise ValidationError(f"Insufficient funds. Required: {amount}, Available: {account.balance}")

            account.balance = F('balance') - amount
            account.save(update_fields=['balance'])
            
            return Transaction.objects.create(
                from_account=account,
                amount=amount,
                transaction_type=TransactionType.WITHDRAWAL,
                description=description
            )
