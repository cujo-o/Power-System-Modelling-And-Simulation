from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr
from typing import Dict, Any, Optional
import uuid
import secrets
from datetime import datetime

class UserLoginRequest(BaseModel):
    email: str
    password: str

class UserRegisterRequest(BaseModel):
    name: str
    email: str
    institution: str
    department: Optional[str] = "Electrical & Electronics Engineering"
    reason: Optional[str] = "Power System Stability & Grid Code Research"

def get_auth_router():
    router = APIRouter(prefix="/api/auth", tags=["Authentication"])

    # Root Administrator seeded so the system can be administered out of the box
    users_db: Dict[str, Dict[str, Any]] = {
        "admin-root": {
            "id": "admin-root",
            "name": "Opeyemi Ibrahim Abubakar",
            "email": "operator@futminna.edu.ng",
            "institution": "Federal University of Technology, Minna",
            "department": "Electrical & Electronics Engineering",
            "reason": "Root Taskforce Administrator",
            "role": "Admin",
            "is_approved": True,
            "status": "APPROVED",
            "password": "ML4PS-ADMIN",
            "temp_password": None,
            "created_at": datetime.now().isoformat()
        }
    }

    @router.post("/register")
    def register(req: UserRegisterRequest):
        clean_email = req.email.strip().lower()

        # Check if already exists
        for u in users_db.values():
            if u["email"].lower() == clean_email:
                if not u["is_approved"]:
                    return {
                        "status": "PENDING",
                        "message": "Your registration request is already submitted and awaiting administrator approval."
                    }
                else:
                    raise HTTPException(
                        status_code=400,
                        detail="An approved account with this email already exists. Please sign in."
                    )

        user_id = f"usr-{uuid.uuid4().hex[:8]}"
        new_user = {
            "id": user_id,
            "name": req.name.strip(),
            "email": clean_email,
            "institution": req.institution.strip(),
            "department": req.department.strip() if req.department else "Electrical Engineering",
            "reason": req.reason.strip() if req.reason else "Grid Research",
            "role": "Research Fellow",
            "is_approved": False,
            "status": "PENDING",
            "password": None,
            "temp_password": None,
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M")
        }

        users_db[user_id] = new_user

        return {
            "status": "SUCCESS",
            "message": "Registration submitted successfully! An administrator will review your application and issue your temporary password.",
            "user_id": user_id
        }

    @router.get("/users")
    def get_all_users():
        """Returns all registered operators and pending applications for admin review."""
        result = []
        for u in users_db.values():
            result.append({
                "id": u["id"],
                "name": u["name"],
                "email": u["email"],
                "institution": u["institution"],
                "department": u["department"],
                "reason": u["reason"],
                "role": u["role"],
                "is_approved": u["is_approved"],
                "status": u["status"],
                "temp_password": u.get("temp_password"),
                "created_at": u.get("created_at")
            })
        return result

    @router.post("/approve/{user_id}")
    def approve_user(user_id: str):
        if user_id not in users_db:
            raise HTTPException(status_code=404, detail="User request not found.")

        user = users_db[user_id]
        
        # Generate random 6-character secure temporary password
        temp_pass = f"ML4PS-{secrets.token_hex(3).upper()}"
        
        user["is_approved"] = True
        user["status"] = "APPROVED"
        user["password"] = temp_pass
        user["temp_password"] = temp_pass

        return {
            "status": "APPROVED",
            "user_id": user_id,
            "user_name": user["name"],
            "temp_password": temp_pass,
            "message": f"Operator '{user['name']}' approved. Temporary password issued: {temp_pass}"
        }

    @router.post("/reject/{user_id}")
    def reject_user(user_id: str):
        if user_id not in users_db:
            raise HTTPException(status_code=404, detail="User request not found.")
        
        if user_id == "admin-root":
            raise HTTPException(status_code=400, detail="Cannot reject the root Taskforce Administrator.")

        rejected_name = users_db[user_id]["name"]
        del users_db[user_id]

        return {
            "status": "REJECTED",
            "message": f"Registration request for '{rejected_name}' was rejected and removed."
        }

    @router.post("/login")
    def login(req: UserLoginRequest):
        clean_email = req.email.strip().lower()
        clean_pass = req.password.strip()

        matched_user = None
        for u in users_db.values():
            if u["email"].lower() == clean_email:
                matched_user = u
                break

        if not matched_user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account not found. Please click 'Register / Request Access' first."
            )

        if not matched_user["is_approved"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account is pending review by the Taskforce Administration. Once approved, you will receive your temporary password."
            )

        if matched_user["password"] != clean_pass:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid password or temporary token. Please re-check the credentials provided by the admin."
            )

        return {
            "status": "SUCCESS",
            "user": {
                "id": matched_user["id"],
                "name": matched_user["name"],
                "email": matched_user["email"],
                "institution": matched_user["institution"],
                "department": matched_user["department"],
                "role": matched_user["role"],
                "is_approved": True
            }
        }

    return router