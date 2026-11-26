# Spendly — Personal Expense Tracker (PWA)

**Tagline:** *Track Your Money. Control Your Spending.*

Spendly uses **Firebase Authentication** for login (Email/Password & Google Sign-In) and **PostgreSQL** (via a lightweight Node.js + Express API in `server.js`) to store all users, expenses, and budgets.

## Setup

### 1. Configure PostgreSQL
1. Edit `.env` (copied from `.env.example`) and set your PostgreSQL password (`PGPASSWORD`) or `DATABASE_URL`:
   ```env
   PORT=8080
   FIREBASE_PROJECT_ID=spendy-6a620
   PGHOST=localhost
   PGPORT=5432
   PGDATABASE=spendly
   PGUSER=postgres
   PGPASSWORD=your_postgres_password
   ```
2. Install Node dependencies:
   ```powershell
   npm install
   ```
   On startup, `server.js` automatically creates the `spendly` database (if permitted) and applies `db/schema.sql`.

### 2. Enable Firebase Authentication
1. In Firebase Console (`spendy-6a620`) -> **Authentication -> Sign-in method**, enable **Email/Password** and **Google**.
2. Ensure `localhost` is listed under **Authentication -> Settings -> Authorized domains**.

### 3. Run Spendly
Double-click `start-spendly.bat` or run:
```powershell
npm start
```
Then open `http://localhost:8080/login.html`.
