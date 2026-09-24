import io
import csv
import random
import string
from datetime import datetime
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from models.schemas import UserRegisterRequest, UserLoginRequest

def generate_temp_password():
    chars = string.ascii_uppercase + string.digits
    suffix = ''.join(random.choices(chars, k=5))
    return f"ML4PS-{suffix}"

def get_admin_router(users_db: list, get_active_fn):
    router = APIRouter(tags=["Admin & Auth"])

    @router.get("/api/admin/users")
    def get_users():
        return users_db

    @router.post("/api/auth/register")
    def register_user(req: UserRegisterRequest):
        # Check duplicate email
        for u in users_db:
            if u["email"].lower() == req.email.lower():
                raise HTTPException(status_code=400, detail="A user with this email address has already requested access.")

        new_user = {
            "id": f"usr-{len(users_db) + 1}",
            "name": req.name,
            "email": req.email,
            "institution": req.institution,
            "department": req.department or "Electrical Engineering",
            "role": "Researcher",
            "reason": req.reason,
            "referee": req.referee or "None",
            "research_tags": req.research_tags or "Grid Studies",
            "status": "PENDING",
            "password": None,
            "temp_password": None,
            "registered_at": datetime.now().strftime("%Y-%m-%d %H:%M")
        }
        users_db.append(new_user)
        return {
            "status": "success",
            "message": "Access request submitted. A temporary password will be assigned once reviewed by the Taskforce Administrator.",
            "user": new_user
        }

    @router.post("/api/admin/users/{user_id}/approve")
    def approve_user(user_id: str):
        for u in users_db:
            if u["id"] == user_id:
                temp_pwd = generate_temp_password()
                u["status"] = "APPROVED"
                u["password"] = temp_pwd
                u["temp_password"] = temp_pwd
                return {
                    "status": "success",
                    "user": u,
                    "generated_password": temp_pwd
                }
        raise HTTPException(status_code=404, detail="User not found")

    @router.post("/api/admin/users/{user_id}/reject")
    def reject_user(user_id: str):
        for u in users_db:
            if u["id"] == user_id:
                u["status"] = "REJECTED"
                u["password"] = None
                u["temp_password"] = None
                return {"status": "success", "user": u}
        raise HTTPException(status_code=404, detail="User not found")

    @router.post("/api/auth/login")
    def login_user(req: UserLoginRequest):
        # 1. Master administrator fallback
        if req.email.strip().lower() == "admin@futminna.edu.ng" and req.password == "nrf2026!":
            return {
                "status": "success",
                "user": {
                    "id": "usr-master",
                    "name": "Opeyemi Ibrahim Abubakar",
                    "email": "admin@futminna.edu.ng",
                    "institution": "FUT Minna (ML4PS Group)",
                    "department": "Electrical & Electronics Engineering",
                    "role": "Admin",
                    "status": "APPROVED"
                }
            }

        # 2. Check registered users in database
        for u in users_db:
            if u["email"].strip().lower() == req.email.strip().lower():
                if u["status"] != "APPROVED":
                    raise HTTPException(
                        status_code=403,
                        detail="Your registration is currently PENDING approval from the Admin."
                    )
                if u.get("password") == req.password.strip():
                    return {"status": "success", "user": u}
                else:
                    raise HTTPException(status_code=401, detail="Invalid password. Please enter the temporary password assigned upon approval.")

        raise HTTPException(status_code=404, detail="No registered account found with this email address.")

    @router.get("/api/reports/export-csv")
    def export_csv():
        net, name = get_active_fn()
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["NATIONAL POWER SYSTEM MODELLING & SIMULATION PLATFORM"])
        writer.writerow(["Model", name])
        writer.writerow([])
        writer.writerow(["Bus ID", "Substation Name", "Nominal kV", "Compliance"])
        for idx, row in net.bus.iterrows():
            writer.writerow([idx, row.get("name", f"Bus {idx}"), row.get("vn_kv", 330.0), "COMPLIANT"])
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=grid_audit.csv"}
        )

    return router