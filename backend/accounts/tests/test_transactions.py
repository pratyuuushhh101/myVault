from decimal import Decimal
from django.test import TestCase
from django.core.exceptions import ValidationError
from accounts.models import User, Account, Transaction
from accounts.services import process_transaction


class TransactionServiceTests(TestCase):

    def setUp(self):
        # Users
        self.user1 = User.objects.create_user(
            username="alice",
            email="alice@test.com",
            password="pass123"
        )
        self.user2 = User.objects.create_user(
            username="bob",
            email="bob@test.com",
            password="pass123"
        )

        # Accounts
        self.account1 = Account.objects.create(
            user=self.user1,
            account_type=Account.AccountType.SAVINGS,
            balance=Decimal("1000.00")
        )

        self.account2 = Account.objects.create(
            user=self.user2,
            account_type=Account.AccountType.SAVINGS,
            balance=Decimal("500.00")
        )

    # ---------- SUCCESS CASES ----------

    def test_deposit_increases_balance(self):
        tx = process_transaction(
            transaction_type=Transaction.TransactionType.DEPOSIT,
            amount_str="200",
            receiver_id=self.account1.id,
            description="Cash deposit"
        )

        self.account1.refresh_from_db()

        self.assertEqual(self.account1.balance, Decimal("1200.00"))
        self.assertIsNone(tx.sender)
        self.assertEqual(tx.receiver, self.account1)

    def test_withdrawal_decreases_balance(self):
        tx = process_transaction(
            transaction_type=Transaction.TransactionType.WITHDRAWAL,
            amount_str="300",
            sender_id=self.account1.id,
            description="ATM withdrawal"
        )

        self.account1.refresh_from_db()

        self.assertEqual(self.account1.balance, Decimal("700.00"))
        self.assertEqual(tx.sender, self.account1)
        self.assertIsNone(tx.receiver)

    def test_transfer_moves_money_atomically(self):
        tx = process_transaction(
            transaction_type=Transaction.TransactionType.TRANSFER,
            amount_str="400",
            sender_id=self.account1.id,
            receiver_id=self.account2.id,
            description="Rent payment"
        )

        self.account1.refresh_from_db()
        self.account2.refresh_from_db()

        self.assertEqual(self.account1.balance, Decimal("600.00"))
        self.assertEqual(self.account2.balance, Decimal("900.00"))
        self.assertEqual(tx.sender, self.account1)
        self.assertEqual(tx.receiver, self.account2)

    # ---------- DECIMAL PRECISION ----------

    def test_amount_with_more_than_two_decimals_is_quantized(self):
        tx = process_transaction(
            transaction_type=Transaction.TransactionType.DEPOSIT,
            amount_str="10.999",
            receiver_id=self.account1.id
        )

        self.account1.refresh_from_db()

        # Expect proper rounding / quantization
        self.assertEqual(self.account1.balance, Decimal("1010.99"))

    # ---------- FAILURE CASES ----------

    def test_withdrawal_insufficient_balance_fails(self):
        with self.assertRaises(ValidationError):
            process_transaction(
                transaction_type=Transaction.TransactionType.WITHDRAWAL,
                amount_str="5000",
                sender_id=self.account1.id
            )

        self.account1.refresh_from_db()

        self.assertEqual(self.account1.balance, Decimal("1000.00"))
        self.assertEqual(Transaction.objects.count(), 0)

    def test_transfer_from_inactive_account_fails(self):
        self.account1.is_active = False
        self.account1.save()

        with self.assertRaises(ValidationError):
            process_transaction(
                transaction_type=Transaction.TransactionType.TRANSFER,
                amount_str="100",
                sender_id=self.account1.id,
                receiver_id=self.account2.id
            )

        self.account1.refresh_from_db()
        self.account2.refresh_from_db()

        self.assertEqual(self.account1.balance, Decimal("1000.00"))
        self.assertEqual(self.account2.balance, Decimal("500.00"))
        self.assertEqual(Transaction.objects.count(), 0)

    def test_negative_amount_fails(self):
        with self.assertRaises(ValidationError):
            process_transaction(
                transaction_type=Transaction.TransactionType.DEPOSIT,
                amount_str="-100",
                receiver_id=self.account1.id
            )

        self.account1.refresh_from_db()

        self.assertEqual(self.account1.balance, Decimal("1000.00"))
        self.assertEqual(Transaction.objects.count(), 0)

    def test_same_sender_receiver_fails(self):
        with self.assertRaises(ValidationError):
            process_transaction(
                transaction_type=Transaction.TransactionType.TRANSFER,
                amount_str="100",
                sender_id=self.account1.id,
                receiver_id=self.account1.id
            )

        self.account1.refresh_from_db()

        self.assertEqual(self.account1.balance, Decimal("1000.00"))
        self.assertEqual(Transaction.objects.count(), 0)

    def test_failed_transfer_does_not_partial_update(self):
        with self.assertRaises(ValidationError):
            process_transaction(
                transaction_type=Transaction.TransactionType.TRANSFER,
                amount_str="2000",
                sender_id=self.account1.id,
                receiver_id=self.account2.id
            )

        self.account1.refresh_from_db()
        self.account2.refresh_from_db()

        self.assertEqual(self.account1.balance, Decimal("1000.00"))
        self.assertEqual(self.account2.balance, Decimal("500.00"))
