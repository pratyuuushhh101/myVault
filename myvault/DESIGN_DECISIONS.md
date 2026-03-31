# MyVault Digital Banking Backend: Technical Design Overview

This system is built as a production-hardened banking backend following **Clean Architecture** principles and **ACID** database properties.

## 1. Concurrency & Integrity Strategy (Strict Requirement)
- **Select for Update (Explicit Row Locking)**: In `banking/services.py`, we use `select_for_update()` on Account rows BEFORE modifying balances. This creates a database lock, preventing other processes from reading/writing the record until the current transaction commits.
- **Deadlock Avoidance**: When transferring between two accounts (A and B), locking them in a random order can cause deadlocks if two people transfer to each other simultaneously. We solve this by **sorting the UUIDs** and always locking the smaller one first. This ensures a consistent global locking order.
- **Database-Level Constraints**: 
    - `CheckConstraint(balance >= 0)`: Enforces that zero-balance accounts cannot be overdrawn at the CPU/DB storage level, even if the application logic has a bug.
    - `CheckConstraint(amount > 0)`: Ensures no zero or negative transactions can ever be recorded.

## 2. Immutable Ledger History
- **Protected Transactions**: The `Transaction` model overrides `.save()` and `.delete()`. If the object already has an ID (i.e., it's not a new record), the system raises a `PermissionError`.
- **Constraint-Based deletion**: We use `on_delete=models.PROTECT` on account relationships to prevent historical data loss through accidental account deletion.

## 3. Clean Architecture (Separation of Concerns)
- **Models (`models.py`)**: Defines state and persistent integrity rules.
- **Serializers (`serializers.py`)**: Data validation, type conversion, and JSON formatting.
- **Services (`services.py`)**: The **Domain Layer**. All business logic lives here. Views never touch `models.save()` directly for transfers; they use the service to ensure atomicity.
- **Views (`views.py`)**: Handle HTTP, JWT authentication, and **Authorization** (ensuring users only access their own accounts).

## 4. Security
- **JWT (SimpleJWT)**: Modern stateless authentication.
- **RBAC & Ownership**: The `AccountViewSet.get_queryset()` handles automatic filtering so `GET /accounts/` only returns the current user's data.

## 5. Deployment Considerations (PostgreSQL)
- The `settings.py` is pre-configured for **PostgreSQL**. 
- To use this in production: `python manage.py makemigrations banking`, `python manage.py migrate`.
