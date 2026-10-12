import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from . import models
from .database import get_db

load_dotenv()

DEFAULT_SECRET = "dev-only-change-this-in-production"
SECRET_KEY = os.getenv("SECRET_KEY", DEFAULT_SECRET)
IS_PRODUCTION = os.getenv("APP_ENV", "").lower() == "production"
if IS_PRODUCTION and (SECRET_KEY == DEFAULT_SECRET or len(SECRET_KEY) < 32):
    raise RuntimeError("Set a long random SECRET_KEY before running in production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


# Used when an email doesn't exist, so a failed login takes the same time either way
# and can't be used to discover which emails are registered.
DUMMY_HASH = hash_password("not-a-real-password")


def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": str(user_id), "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def user_from_token(token: str, db: Session) -> models.User | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError, TypeError):
        return None
    return db.get(models.User, user_id)


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> models.User:
    user = user_from_token(token, db)
    if user is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
