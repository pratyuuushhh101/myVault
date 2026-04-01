from decimal import Decimal, ROUND_HALF_UP
from django.db import transaction
from django.core.exceptions import ValidationError
from .models import Account, Transaction, Loan


class TransactionEngine:
    """
    Robust transaction engine for atomic banking operations.
    Ensures ACID compliance via Django's transaction API and Postgres row-level locks.
    """

    @staticmethod
    def validate_amount(amount: Decimal) -> Decimal:
        """Ensures the amount is positive and quantized to 2 decimal places."""
        if amount <= 0:
            raise ValidationError("Transaction amount must be greater than zero.")
        # Quantize to 2 decimal places (rounding half up for standard currency math)
        return amount.quantize(Decimal('0.00'), rounding=ROUND_HALF_UP)

    @classmethod
    def transfer_funds(cls, sender_id: str, receiver_id: str, amount: Decimal) -> Transaction:
        """Atomically transfers funds between two accounts."""
        amount = cls.validate_amount(amount)
        
        if str(sender_id) == str(receiver_id):
            raise ValidationError("Self-transfer is not permitted.")
        
        with transaction.atomic():
            # Deadlock prevention: Lock accounts in a consistent order
            ids_to_lock = sorted([str(sender_id), str(receiver_id)])
            accounts_qs = Account.objects.select_for_update().filter(id__in=ids_to_lock)
            accounts_map = {str(acc.id): acc for acc in accounts_qs}

            sender = accounts_map.get(str(sender_id))
            receiver = accounts_map.get(str(receiver_id))

            if not sender or not receiver:
                raise ValidationError("One or both accounts not found.")
            
            if sender.balance < amount:
                raise ValidationError("Insufficient funds.")

            sender.balance -= amount
            receiver.balance += amount
            
            sender.save(update_fields=['balance'])
            receiver.save(update_fields=['balance'])

            return Transaction.objects.create(
                sender=sender, receiver=receiver, amount=amount,
                transaction_type=Transaction.TransactionType.TRANSFER
            )

    @classmethod
    def deposit_funds(cls, account_id: str, amount: Decimal) -> Transaction:
        """Atomically deposits funds into an account."""
        amount = cls.validate_amount(amount)
        with transaction.atomic():
            account = Account.objects.select_for_update().get(id=account_id)
            
            account.balance += amount
            account.save(update_fields=['balance'])
            return Transaction.objects.create(
                receiver=account, amount=amount,
                transaction_type=Transaction.TransactionType.DEPOSIT
            )

    @classmethod
    def withdraw_funds(cls, account_id: str, amount: Decimal) -> Transaction:
        """Atomically withdraws funds from an account."""
        amount = cls.validate_amount(amount)
        with transaction.atomic():
            account = Account.objects.select_for_update().get(id=account_id)

            if account.balance < amount:
                raise ValidationError("Insufficient funds.")
            
            account.balance -= amount
            account.save(update_fields=['balance'])
            return Transaction.objects.create(
                sender=account, amount=amount,
                transaction_type=Transaction.TransactionType.WITHDRAWAL
            )


class LoanService:
    """
    Business service for managing life cycle of loans.
    Integrates with TransactionEngine for financial movements.
    """

    @classmethod
    def create_loan(cls, user, account_id: str, amount: Decimal, loan_type: str) -> Loan:
        """
        Atomically provisions a loan and credits the principal to the user's account.
        """
        amount = TransactionEngine.validate_amount(amount)
        
        with transaction.atomic():
            account = Account.objects.select_for_update().get(id=account_id)
            if account.user != user:
                raise ValidationError("Account does not belong to the user.")

            loan = Loan.objects.create(
                user=user,
                amount=amount,
                remaining_amount=amount,
                loan_type=loan_type,
                status=Loan.LoanStatus.ACTIVE
            )

            # Re-use TransactionEngine to credit the account
            TransactionEngine.deposit_funds(
                account_id=str(account.id),
                amount=amount
            )

            return loan

    @classmethod
    def repay_loan(cls, user, loan_id: str, account_id: str, amount: Decimal) -> Loan:
        """
        Atomically processes a loan repayment from a specified account.
        Uses locking to handle concurrent repayments.
        """
        amount = TransactionEngine.validate_amount(amount)
        
        with transaction.atomic():
            # Lock the loan record first to prevent race conditions on remaining_amount
            loan = Loan.objects.select_for_update().get(id=loan_id)
            
            if loan.user != user:
                raise ValidationError("Unauthorized access to loan.")
            
            if loan.status != Loan.LoanStatus.ACTIVE:
                raise ValidationError("Loan is already closed or inactive.")
                
            if amount > loan.remaining_amount:
                raise ValidationError(f"Repayment amount ({amount}) exceeds remaining balance ({loan.remaining_amount}).")

            account = Account.objects.get(id=account_id)
            if account.user != user:
                raise ValidationError("Source account does not belong to the user.")

            # Re-use TransactionEngine to withdraw funds (handles balance checks)
            TransactionEngine.withdraw_funds(
                account_id=str(account.id),
                amount=amount
            )

            # Update loan state
            loan.remaining_amount -= amount
            if loan.remaining_amount == 0:
                loan.status = Loan.LoanStatus.CLOSED
            
            loan.save(update_fields=['remaining_amount', 'status'])
            return loan


def process_transaction(*, transaction_type: str, amount_str: str, sender_id=None, receiver_id=None):
    """Unified functional entry point for the view layer."""
    try:
        amount = Decimal(amount_str)
    except Exception:
        raise ValidationError("Invalid amount format.")

    if transaction_type == Transaction.TransactionType.TRANSFER:
        return TransactionEngine.transfer_funds(sender_id, receiver_id, amount)
    elif transaction_type == Transaction.TransactionType.DEPOSIT:
        return TransactionEngine.deposit_funds(receiver_id, amount)
    elif transaction_type == Transaction.TransactionType.WITHDRAWAL:
        return TransactionEngine.withdraw_funds(sender_id, amount)
    
    raise ValidationError("Invalid transaction type.")
