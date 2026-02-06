from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.core.exceptions import ValidationError

from .models import Account, Transaction


@transaction.atomic
def process_transaction(
    *,
    transaction_type: str,
    amount_str: str,
    sender_id=None,
    receiver_id=None,
    description: str = ""
):

    #Validate transaction type
    if transaction_type not in Transaction.TransactionType.values:
        raise ValidationError("Invalid transaction type.")

    #Parse & validate amount
    try:
        amount = Decimal(amount_str)
    except (InvalidOperation, TypeError):
        raise ValidationError("Invalid amount format.")

    if amount <= 0:
        raise ValidationError("Transaction amount must be positive.")

    
    #Lock accounts deterministically (deadlock-safe)
    account_ids = [aid for aid in [sender_id, receiver_id] if aid is not None]

    locked_accounts = {
        account.id: account
        for account in Account.objects.select_for_update()
        .filter(id__in=account_ids)
        .order_by("id")
    }

    sender = locked_accounts.get(sender_id)
    receiver = locked_accounts.get(receiver_id)

    
    #Validate account presence per transaction type
    if transaction_type == Transaction.TransactionType.DEPOSIT:
        if receiver is None or sender is not None:
            raise ValidationError("Deposit requires only a receiver account.")

    elif transaction_type == Transaction.TransactionType.WITHDRAWAL:
        if sender is None or receiver is not None:
            raise ValidationError("Withdrawal requires only a sender account.")

    elif transaction_type == Transaction.TransactionType.TRANSFER:
        if sender is None or receiver is None:
            raise ValidationError("Transfer requires both sender and receiver.")
        if sender.id == receiver.id:
            raise ValidationError("Sender and receiver cannot be the same account.")

    
    #Validate account state
    if sender and not sender.is_active:
        raise ValidationError("Sender account is inactive.")

    if receiver and not receiver.is_active:
        raise ValidationError("Receiver account is inactive.")

    #Balance checks + mutation
    if transaction_type == Transaction.TransactionType.DEPOSIT:
        receiver.balance += amount
        receiver.save(update_fields=["balance"])

    elif transaction_type == Transaction.TransactionType.WITHDRAWAL:
        if sender.balance < amount:
            raise ValidationError("Insufficient balance for withdrawal.")
        sender.balance -= amount
        sender.save(update_fields=["balance"])

    elif transaction_type == Transaction.TransactionType.TRANSFER:
        if sender.balance < amount:
            raise ValidationError("Insufficient balance for transfer.")

        sender.balance -= amount
        receiver.balance += amount

        sender.save(update_fields=["balance"])
        receiver.save(update_fields=["balance"])

    #Ledger entry (single source of truth)
    transaction_record = Transaction.objects.create(
        sender=sender,
        receiver=receiver,
        amount=amount,
        transaction_type=transaction_type,
        description=description,
    )

    return transaction_record
