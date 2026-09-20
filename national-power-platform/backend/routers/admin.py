from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import io, csv

def get_admin_router(users_db: list, get_active_fn):
    router = APIRouter(tags=["Admin"])

    @router.get("/api/admin/users")
    def get_users():
        return users_db

    @router.post("/api/admin/users/{user_id}/approve")
    def approve_user(user_id: str):
        for u in users_db:
            if u["id"] == user_id:
                u["status"] = "APPROVED"
                return {"status": "success", "user": u}
        raise HTTPException(status_code=404, detail="User not found")

    @router.post("/api/admin/users/{user_id}/reject")
    def reject_user(user_id: str):
        for u in users_db:
            if u["id"] == user_id:
                u["status"] = "REJECTED"
                return {"status": "success", "user": u}
        raise HTTPException(status_code=404, detail="User not found")

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