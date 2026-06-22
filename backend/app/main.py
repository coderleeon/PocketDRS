from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="PocketDRS API",
    description="Backend API for PocketDRS analytics (Version 0)",
    version="0.1.0"
)

# Enable CORS for frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production if needed
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {
        "status": "ok",
        "version": "0.1.0",
        "message": "PocketDRS Backend Ready"
    }

@app.get("/health")
def health_check():
    return {"status": "healthy"}
