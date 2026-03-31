import os
import django
import threading
import time
from decimal import Decimal
from django.db import transaction, connection
from django.core.exceptions import ValidationError

# 1. Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from accounts.models import Account, Transaction

def setup_demo_account():
    """Reset account for the demo."""
    Account.objects.all().delete()
    Transaction.objects.all().delete()
    # Assuming user with ID 1 exists (standard for local dev)
    from django.contrib.auth import get_user_model
    User = get_user_model()
    user, _ = User.objects.get_or_create(username='demo_user', email='demo@example.com')
    
    account = Account.objects.create(
        user=user,
        account_type='SAVINGS',
        balance=Decimal('100.00')
    )
    return account.id


# --- SCENARIO 1: UNSAFE WITHDRAWAL (No Locking) ---
def withdraw_unsafe(account_id, amount):
    """Demonstrates a race condition."""
    try:
        # We manually simulate the delay to make the race condition 100% visible
        # Read balance
        acc = Account.objects.get(id=account_id)
        print(f"[Thread {threading.current_thread().name}] Read Balance: {acc.balance}")
        
        if acc.balance >= amount:
            # Simulate a slow process (I/O, validation, etc.)
            print(f"[Thread {threading.current_thread().name}] Processing...")
            time.sleep(2) 
            
            # Update balance
            acc.balance -= amount
            acc.save()
            print(f"[Thread {threading.current_thread().name}] Success! New Balance: {acc.balance}")
        else:
            print(f"[Thread {threading.current_thread().name}] Failed: Insufficient funds.")
    except Exception as e:
        print(f"[Thread {threading.current_thread().name}] Error: {e}")


# --- SCENARIO 2: SAFE WITHDRAWAL (With select_for_update) ---
def withdraw_safe(account_id, amount):
    """Demonstrates resolution with Row-Level Locking."""
    try:
        with transaction.atomic():
            # Read balance WITH LOCK
            print(f"[Thread {threading.current_thread().name}] Attempting to lock account...")
            acc = Account.objects.select_for_update().get(id=account_id)
            print(f"[Thread {threading.current_thread().name}] LOCKED Account. Balance: {acc.balance}")
            
            if acc.balance >= amount:
                print(f"[Thread {threading.current_thread().name}] Processing...")
                time.sleep(2) 
                
                acc.balance -= amount
                acc.save()
                print(f"[Thread {threading.current_thread().name}] Success! New Balance: {acc.balance}")
            else:
                print(f"[Thread {threading.current_thread().name}] Failed: Insufficient funds ({acc.balance}).")
    except Exception as e:
        print(f"[Thread {threading.current_thread().name}] Error: {e}")


def run_demo(strategy_fn):
    acc_id = setup_demo_account()
    print(f"\n--- STARTING DEMO (Initial Balance: 100.00, Attempting 2x 60.00 withdrawals) ---")
    
    t1 = threading.Thread(target=strategy_fn, args=(acc_id, Decimal('60.00')), name="T1")
    t2 = threading.Thread(target=strategy_fn, args=(acc_id, Decimal('60.00')), name="T2")
    
    t1.start()
    t2.start()
    
    t1.join()
    t2.join()
    
    # Final check
    final_acc = Account.objects.get(id=acc_id)
    print(f"--- FINAL DATABASE BALANCE: {final_acc.balance} ---")


if __name__ == "__main__":
    print("DEMOS CONCURRENCY IN MYVAULT")
    
    print("\nDEMO 1: WITHOUT LOCKING (Expect Failure)")
    run_demo(withdraw_unsafe)
    # Result: Probable Overdraft/Race Condition. Both see 100, both subtract 60. Final = 40 (last write wins).
    # Wait, in the unsafe case, $60 was deducted twice but balance only reflects one deduction because of stale data. (Money is lost from bank!)
    
    time.sleep(1)
    
    print("\nDEMO 2: WITH SELECT_FOR_UPDATE (Expect Correctness)")
    run_demo(withdraw_safe)
    # Result: T1 locks. T2 waits. T1 subtracts 60 (New 40). T2 wakes up, reads 40, rejects withdrawal. Final = 40. Correct.
