from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from decimal import Decimal
from accounts.models import Account, Loan, Transaction
from accounts.services import TransactionEngine, LoanService
import uuid

User = get_user_model()

class LoanSystemTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='bankuser',
            password='Password123!',
            email='bankuser@example.com'
        )
        self.user.set_transaction_pin('1234')
        self.user.save()
        self.client.force_authenticate(user=self.user)
        
        self.account = Account.objects.create(
            user=self.user,
            account_type=Account.AccountType.SAVINGS,
            balance=Decimal('1000.00')
        )

    def test_loan_creation_success(self):
        """Validates successful loan provisioning and account crediting."""
        url = '/api/v1/accounts/loans/create/'
        data = {
            "account_id": str(self.account.id),
            "amount": "5000.00",
            "loan_type": "PERSONAL",
            "interest_rate": "12.5",
            "tenure_months": 24
        }
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        # Check loan record
        loan = Loan.objects.get(id=response.data['id'])
        self.assertEqual(loan.amount, Decimal('5000.00'))
        self.assertEqual(loan.remaining_amount, Decimal('5000.00'))
        self.assertEqual(loan.status, Loan.LoanStatus.ACTIVE)
        
        # Check account balance (1000 original + 5000 loan)
        self.account.refresh_from_db()
        self.assertEqual(self.account.balance, Decimal('6000.00'))
        
        # Check transaction history
        tx = Transaction.objects.filter(receiver=self.account).first()
        self.assertIn("Loan Disbursement", tx.description)

    def test_loan_repayment_flow(self):
        """Validates standard repayment and closure logic."""
        loan = LoanService.create_loan(
            user=self.user,
            account_id=str(self.account.id),
            amount=Decimal('1000.00'),
            loan_type='EDUCATION',
            interest_rate=Decimal('5.0'),
            tenure_months=12
        )
        
        url = '/api/v1/accounts/loans/repay/'
        repay_data = {
            "loan_id": str(loan.id),
            "account_id": str(self.account.id),
            "amount": "400.00"
        }
        
        # First repayment
        response = self.client.post(url, repay_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        loan.refresh_from_db()
        self.assertEqual(loan.remaining_amount, Decimal('600.00'))
        
        # Final repayment (closure)
        repay_data["amount"] = "600.00"
        response = self.client.post(url, repay_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        loan.refresh_from_db()
        self.assertEqual(loan.remaining_amount, Decimal('0.00'))
        self.assertEqual(loan.status, Loan.LoanStatus.CLOSED)

    def test_repayment_over_remaining_amount_rejection(self):
        """Ensures system rejects overpayments."""
        loan = LoanService.create_loan(
            user=self.user,
            account_id=str(self.account.id),
            amount=Decimal('1000.00'),
            loan_type='PERSONAL',
            interest_rate=Decimal('10.0'),
            tenure_months=12
        )
        
        url = '/api/v1/accounts/loans/repay/'
        response = self.client.post(url, {
            "loan_id": str(loan.id),
            "account_id": str(self.account.id),
            "amount": "1100.00"
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("exceeds remaining balance", response.data['error'])

    def test_unauthorized_loan_access(self):
        """Prevents users from repaying loans they don't own."""
        other_user = User.objects.create_user(username='hacker', password='p', email='h@e.com')
        other_loan = Loan.objects.create(
            user=other_user,
            account=self.account, # Doesn't matter for this test
            amount=Decimal('1000.00'),
            remaining_amount=Decimal('1000.00'),
            loan_type='HOME',
            interest_rate=Decimal('8.0'),
            tenure_months=120
        )
        
        url = '/api/v1/accounts/loans/repay/'
        response = self.client.post(url, {
            "loan_id": str(other_loan.id),
            "account_id": str(self.account.id),
            "amount": "100.00"
        })
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND) # get_queryset filters by user

    def test_insufficient_balance_repayment(self):
        """Ensures TransactionEngine balance checks still apply."""
        loan = LoanService.create_loan(
            user=self.user,
            account_id=str(self.account.id),
            amount=Decimal('100.00'),
            loan_type='PERSONAL',
            interest_rate=Decimal('10.0'),
            tenure_months=1
        )
        # Drain account
        self.account.balance = Decimal('50.00')
        self.account.save()
        
        url = '/api/v1/accounts/loans/repay/'
        response = self.client.post(url, {
            "loan_id": str(loan.id),
            "account_id": str(self.account.id),
            "amount": "100.00"
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Insufficient funds", response.data['error'])
