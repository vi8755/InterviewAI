
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.model.user import User
from app.core.security import hash_password
from app.schemas.user import UserRegister, UserResponse

router = APIRouter(prefix="/auth", tags=["Authentication"])

from fastapi.security import OAuth2PasswordBearer
from app.core.security import get_user_id_from_token
 


from fastapi import HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from app.core.security import verify_password, create_access_token
from app.model.user import User
from app.db.session import get_db
from sqlalchemy import select
from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends
class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_user(
    user_data: UserRegister,
    db: Session = Depends(get_db),
):
    existing_user = db.scalar(
        select(User).where(User.email == user_data.email)
    )

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    new_user = User(
        full_name=user_data.full_name,
        email=user_data.email,
        password_hash=hash_password(user_data.password),
    )

    db.add(new_user)

    try:
        db.commit()
        db.refresh(new_user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    return new_user
 

@router.post("/login")
def login_user(user_data: UserLogin, db: Session = Depends(get_db)):
    # 1. Find the user by email
    user = db.scalar(
        select(User).where(User.email == user_data.email)
    )

    # 2. Check credentials
    if not user or not verify_password(
        user_data.password, user.password_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 3. Reject inactive accounts
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is inactive",
        )

    # 4. Generate JWT token
    access_token = create_access_token(subject=str(user.id))

    # 5. Return token
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
        },
    }


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


@router.get("/me")
def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user_id = get_user_id_from_token(token)

    user = db.get(User, user_id)

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "is_active": user.is_active,
    }
