from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timedelta
from pathlib import Path
import sqlite3
import jwt
import bcrypt
import os
from typing import Optional, List
import uvicorn

# Initialize FastAPI app
app = FastAPI(title="Finance Tracker API", version="1.0.0")

# Base directory (safe file serving)
BASE_DIR = Path(__file__).resolve().parent

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security
security = HTTPBearer()
SECRET_KEY = os.getenv("FT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440  # 24 hours

# Database setup
DATABASE = str(BASE_DIR / "finance_tracker.db")

def init_db():
    conn = sqlite3.connect(DATABASE, check_same_thread=False)
    cursor = conn.cursor()
    
    # Users table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE,
            hashed_password TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Transactions table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            category TEXT NOT NULL,
            amount REAL NOT NULL,
            description TEXT,
            date TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    # Settings table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE,
            balance REAL DEFAULT 0,
            monthly_limit REAL DEFAULT 0,
            start_date TEXT,
            end_date TEXT,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    conn.commit()
    conn.close()

# Pydantic models
class UserCreate(BaseModel):
    username: str
    email: Optional[str] = None
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TransactionCreate(BaseModel):
    category: str
    amount: float
    description: Optional[str] = ""
    date: str

class TransactionUpdate(BaseModel):
    category: str
    amount: float
    description: Optional[str] = ""
    date: str

class Transaction(BaseModel):
    id: int
    category: str
    amount: float
    description: str
    date: str

class SettingsUpdate(BaseModel):
    balance: Optional[float] = None
    monthly_limit: Optional[float] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class Settings(BaseModel):
    balance: float
    monthly_limit: float
    start_date: Optional[str] = None
    end_date: Optional[str] = None

# Utility functions
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    # Ensure sub is a string in the token for predictable decoding
    if "sub" in to_encode:
        to_encode["sub"] = str(to_encode["sub"])
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return int(user_id)
    except Exception:
        # broad except to catch PyJWT errors and conversion problems
        raise HTTPException(status_code=401, detail="Invalid token")

# Database helper functions
def get_db():
    conn = sqlite3.connect(DATABASE, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

# Initialize database
init_db()

# Authentication endpoints
@app.post("/auth/register", response_model=Token)
async def register(user: UserCreate):
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if user exists
    cursor.execute("SELECT id FROM users WHERE username = ? OR email = ?", (user.username, user.email))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="Username or email already exists")
    
    # Create user
    hashed_password = hash_password(user.password)
    cursor.execute(
        "INSERT INTO users (username, email, hashed_password) VALUES (?, ?, ?)",
        (user.username, user.email, hashed_password)
    )
    user_id = cursor.lastrowid
    
    # Create default settings
    cursor.execute(
        "INSERT INTO settings (user_id, balance, monthly_limit) VALUES (?, 0, 0)",
        (user_id,)
    )
    
    conn.commit()
    conn.close()
    
    # Create token
    access_token = create_access_token(data={"sub": user_id})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/auth/login", response_model=Token)
async def login(user: UserLogin):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, hashed_password FROM users WHERE username = ?", (user.username,))
    db_user = cursor.fetchone()
    conn.close()
    
    if not db_user or not verify_password(user.password, db_user["hashed_password"] if "hashed_password" in db_user.keys() else db_user[1]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # db_user['id'] or db_user[0]
    user_id = db_user["id"] if "id" in db_user.keys() else db_user[0]
    access_token = create_access_token(data={"sub": user_id})
    return {"access_token": access_token, "token_type": "bearer"}

# Transaction endpoints
@app.get("/transactions", response_model=List[Transaction])
async def get_transactions(current_user: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, category, amount, description, date FROM transactions WHERE user_id = ? ORDER BY date DESC",
        (current_user,)
    )
    transactions = cursor.fetchall()
    conn.close()
    
    return [dict(row) for row in transactions]

@app.post("/transactions", response_model=Transaction)
async def create_transaction(transaction: TransactionCreate, current_user: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute(
        "INSERT INTO transactions (user_id, category, amount, description, date) VALUES (?, ?, ?, ?, ?)",
        (current_user, transaction.category.upper(), transaction.amount, transaction.description, transaction.date)
    )
    transaction_id = cursor.lastrowid
    conn.commit()
    
    cursor.execute(
        "SELECT id, category, amount, description, date FROM transactions WHERE id = ?",
        (transaction_id,)
    )
    new_transaction = cursor.fetchone()
    conn.close()
    
    return dict(new_transaction)

@app.put("/transactions/{transaction_id}", response_model=Transaction)
async def update_transaction(
    transaction_id: int, 
    transaction: TransactionUpdate, 
    current_user: int = Depends(get_current_user)
):
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if transaction belongs to user
    cursor.execute("SELECT id FROM transactions WHERE id = ? AND user_id = ?", (transaction_id, current_user))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Update transaction
    cursor.execute(
        "UPDATE transactions SET category = ?, amount = ?, description = ?, date = ? WHERE id = ?",
        (transaction.category.upper(), transaction.amount, transaction.description, transaction.date, transaction_id)
    )
    conn.commit()
    
    cursor.execute(
        "SELECT id, category, amount, description, date FROM transactions WHERE id = ?",
        (transaction_id,)
    )
    updated_transaction = cursor.fetchone()
    conn.close()
    
    return dict(updated_transaction)

@app.delete("/transactions/{transaction_id}")
async def delete_transaction(transaction_id: int, current_user: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if transaction belongs to user
    cursor.execute("SELECT id FROM transactions WHERE id = ? AND user_id = ?", (transaction_id, current_user))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    cursor.execute("DELETE FROM transactions WHERE id = ?", (transaction_id,))
    conn.commit()
    conn.close()
    
    return {"message": "Transaction deleted successfully"}

# Settings endpoints
@app.get("/settings", response_model=Settings)
async def get_settings(current_user: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT balance, monthly_limit, start_date, end_date FROM settings WHERE user_id = ?",
        (current_user,)
    )
    settings_row = cursor.fetchone()
    conn.close()
    
    if not settings_row:
        return Settings(balance=0, monthly_limit=0)
    
    # row is sqlite3.Row
    return {
        "balance": settings_row["balance"],
        "monthly_limit": settings_row["monthly_limit"],
        "start_date": settings_row["start_date"],
        "end_date": settings_row["end_date"],
    }

@app.put("/settings", response_model=Settings)
async def update_settings(settings_in: SettingsUpdate, current_user: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if settings exist
    cursor.execute("SELECT id FROM settings WHERE user_id = ?", (current_user,))
    if not cursor.fetchone():
        # Create settings if they don't exist
        cursor.execute(
            "INSERT INTO settings (user_id, balance, monthly_limit) VALUES (?, 0, 0)",
            (current_user,)
        )
    
    # Update settings
    update_fields = []
    values = []
    
    if settings_in.balance is not None:
        update_fields.append("balance = ?")
        values.append(settings_in.balance)
    if settings_in.monthly_limit is not None:
        update_fields.append("monthly_limit = ?")
        values.append(settings_in.monthly_limit)
    if settings_in.start_date is not None:
        update_fields.append("start_date = ?")
        values.append(settings_in.start_date)
    if settings_in.end_date is not None:
        update_fields.append("end_date = ?")
        values.append(settings_in.end_date)
    
    if update_fields:
        values.append(current_user)
        cursor.execute(
            f"UPDATE settings SET {', '.join(update_fields)} WHERE user_id = ?",
            values
        )
    
    conn.commit()
    
    # Get updated settings
    cursor.execute(
        "SELECT balance, monthly_limit, start_date, end_date FROM settings WHERE user_id = ?",
        (current_user,)
    )
    updated_settings = cursor.fetchone()
    conn.close()
    
    return {
        "balance": updated_settings["balance"],
        "monthly_limit": updated_settings["monthly_limit"],
        "start_date": updated_settings["start_date"],
        "end_date": updated_settings["end_date"],
    }

# Analytics endpoint
@app.get("/analytics")
async def get_analytics(current_user: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    
    # Get category totals
    cursor.execute(
        "SELECT category, SUM(amount) as total FROM transactions WHERE user_id = ? GROUP BY category",
        (current_user,)
    )
    categories = {row[0]: row[1] for row in cursor.fetchall()}
    
    # Get total spent
    cursor.execute(
        "SELECT SUM(amount) FROM transactions WHERE user_id = ?",
        (current_user,)
    )
    total_spent = cursor.fetchone()[0] or 0
    
    conn.close()
    
    return {
        "categories": categories,
        "total_spent": total_spent
    }

# Serve static files (JS/CSS) at /static
app.mount("/static", StaticFiles(directory=str(BASE_DIR)), name="static")

@app.get("/")
async def serve_index():
    # Use absolute path to index.html so working-directory mismatches don't break serving
    return FileResponse(str(BASE_DIR / "index.html"))

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
