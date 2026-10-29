# myVault: Banking Engine


myVault is a full-stack, digital banking web application engineered for multi-account wealth management, atomic fund transfers, and integrated loan provisioning with complete data isolation.

---

## Prerequisites

* **Python 3.10+** (tested with Python 3.12 / 3.14)
* **PostgreSQL** (or a cloud provider like Neon DB)
* **Modern Web Browser** (Chrome, Firefox, Edge, Safari)

---

## How to Run the Project?

### 1. Clone the Repository
```bash
git clone https://github.com/pratyuuushhh101/myvault.git
cd myVault
```

---

### 2. Backend Setup (Django REST Framework)

1. **Navigate to the backend directory:**
   ```bash
   cd backend
   ```

2. **Create and activate a virtual environment:**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   # On Windows: .venv\Scripts\activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Environment Configuration (`.env`):**
   Ensure a `.env` file exists inside the `backend/` directory with:
   ```env
   SECRET_KEY=your-django-secret-key
   DEBUG=True
   DATABASE_URL=postgresql://<user>:<password>@<host>/<database>?sslmode=require
   ```

5. **Apply Database Migrations:**
   ```bash
   python manage.py migrate
   ```

6. **Start the Backend Server:**
   ```bash
   python manage.py runserver 8000
   ```
   *The API will be available at `http://127.0.0.1:8000/`.*

---

### 3. Frontend Setup (Vanilla HTML5 / Tailwind / JS)

Open a **new terminal window** in the project root:

1. **Navigate to the frontend directory:**
   ```bash
   cd frontend
   ```

2. **Start a local static HTTP server:**
   ```bash
   python3 -m http.server 8080
   ```
   *Alternatively, use the VS Code "Live Server" extension.*

3. **Open the App:**
   Open your browser and navigate to:
   ```
   http://localhost:8080/index.html
   ```

---

## 🧪 Running Automated Tests

To verify ACID transactions, row-level locking, and authentication handshakes:

```bash
cd backend
python manage.py test accounts
```

---
