from decimal import Decimal
from django.test import TransactionTestCase, Client
from django.urls import reverse
from django.core.exceptions import ValidationError
from accounts.models import User, Account, Transaction
from accounts.services import TransactionEngine
import threading
from django.db import connection

class BankingSystemTests(TransactionTestCase):
    """
    High-integrity tests for MyVault banking operations.
    Using TransactionTestCase to allow testing concurrent threads.
    """

    def setUp(self):
        # FIXED: Ensure unique emails for all test users
        self.alice = User.objects.create_user(
            username="alice_banking", 
            email="alice_banking@test.com", 
            password="password123"
        )
        self.bob = User.objects.create_user(
            username="bob_banking", 
            email="bob_banking@test.com", 
            password="password123"
        )
        
        # Setup Accounts
        self.alice_acc = Account.objects.create(
            user=self.alice, account_type="SAVINGS", balance=Decimal("1000.00")
        )
        self.bob_acc = Account.objects.create(
            user=self.bob, account_type="SAVINGS", balance=Decimal("500.00")
        )
        
        # Set Transaction PINs
        self.alice.set_transaction_pin("1234")
        self.alice.save()
        self.bob.set_transaction_pin("9999")
        self.bob.save()
        
        self.client = Client()

    def test_successful_transfer(self):
        """Test a standard valid transfer between two accounts."""
        TransactionEngine.transfer_funds(
            sender_id=self.alice_acc.id,
            receiver_id=self.bob_acc.id,
            amount=Decimal("200.00"),
            description="Lunch"
        )
        
        self.alice_acc.refresh_from_db()
        self.bob_acc.refresh_from_db()
        
        self.assertEqual(self.alice_acc.balance, Decimal("800.00"))
        self.assertEqual(self.bob_acc.balance, Decimal("700.00"))

    def test_concurrent_transfers_safety(self):
        """
        Simulation of race condition: 
        Attempting two simultaneous withdrawals that exceed balance.
        """
        def thread_task(acc_id, target_id):
            try:
                TransactionEngine.transfer_funds(
                    sender_id=acc_id,
                    receiver_id=target_id,
                    amount=Decimal("600.00")
                )
            except ValidationError:
                pass
            finally:
                connection.close()

        t1 = threading.Thread(target=thread_task, args=(self.alice_acc.id, self.bob_acc.id))
        t2 = threading.Thread(target=thread_task, args=(self.alice_acc.id, self.bob_acc.id))
        
        t1.start()
        t2.start()
        t1.join()
        t2.join()
        
        self.alice_acc.refresh_from_db()
        # Initial 1000. 1000 - 600 = 400.
        self.assertEqual(self.alice_acc.balance, Decimal("400.00"))

    def test_unauthorized_access_blocked(self):
        """
        API Level: Ensure Bob cannot transfer money OUT of Alice's account.
        """
        # FIXED: Use 'jwt-login' name
        response = self.client.post(reverse('jwt-login'), {
            'username': 'bob_banking', 'password': 'password123'
        }, content_type='application/json')
        
        token = response.data['access']
        
        # Bob tries to transfer FROM Alice's account to his own
        # FIXED: Use 'transfer' name
        response = self.client.post(
            reverse('transfer'),
            {
                'sender_id': str(self.alice_acc.id),
                'receiver_id': str(self.bob_acc.id),
                'amount': '100.00',
                'pin': '9999' # Bob provides a PIN (his or random), should still be blocked by ownership
            },
            HTTP_AUTHORIZATION=f'Bearer {token}',
            content_type='application/json'
        )
        
        # Should be 403 Forbidden because Bob doesn't own sender_id
        self.assertEqual(response.status_code, 403)
        
        self.alice_acc.refresh_from_db()
        self.assertEqual(self.alice_acc.balance, Decimal("1000.00"))

    def test_inactive_account_blocked(self):
        """Ensure business logic prevents inactive account transfers."""
        self.alice_acc.is_active = False
        self.alice_acc.save()
        
        with self.assertRaises(ValidationError):
            TransactionEngine.transfer_funds(
                sender_id=self.alice_acc.id,
                receiver_id=self.bob_acc.id,
                amount=Decimal("10.00")
            )

    def test_transfer_with_correct_pin(self):
        """API Level: Valid transfer with correct security PIN."""
        login_res = self.client.post(reverse('jwt-login'), {
            'username': 'alice_banking', 'password': 'password123'
        }, content_type='application/json')
        token = login_res.data['access']

        response = self.client.post(
            reverse('transfer'),
            {
                'sender_id': str(self.alice_acc.id),
                'receiver_id': str(self.bob_acc.id),
                'amount': '100.00',
                'pin': '1234' # CORRECT PIN
            },
            HTTP_AUTHORIZATION=f'Bearer {token}',
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 201)
        self.alice_acc.refresh_from_db()
        self.assertEqual(self.alice_acc.balance, Decimal("900.00"))

    def test_transfer_with_incorrect_pin_fails(self):
        """API Level: Block transfer with incorrect security PIN."""
        login_res = self.client.post(reverse('jwt-login'), {
            'username': 'alice_banking', 'password': 'password123'
        }, content_type='application/json')
        token = login_res.data['access']

        response = self.client.post(
            reverse('transfer'),
            {
                'sender_id': str(self.alice_acc.id),
                'receiver_id': str(self.bob_acc.id),
                'amount': '100.00',
                'pin': '0000' # INCORRECT PIN
            },
            HTTP_AUTHORIZATION=f'Bearer {token}',
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 403)
        self.assertIn("Invalid Transaction PIN", response.data['error'])
        self.alice_acc.refresh_from_db()
        self.assertEqual(self.alice_acc.balance, Decimal("1000.00"))

    def test_deposit_with_correct_pin(self):
        """API Level: Valid deposit with correct security PIN."""
        login_res = self.client.post(reverse('jwt-login'), {
            'username': 'alice_banking', 'password': 'password123'
        }, content_type='application/json')
        token = login_res.data['access']

        response = self.client.post(
            reverse('deposit'),
            {
                'account_id': str(self.alice_acc.id),
                'amount': '500.00',
                'pin': '1234'
            },
            HTTP_AUTHORIZATION=f'Bearer {token}',
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 201)
        self.alice_acc.refresh_from_db()
        self.assertEqual(self.alice_acc.balance, Decimal("1500.00"))
