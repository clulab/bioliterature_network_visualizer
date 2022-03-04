""" Starts the backend """

import logging

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from build_network import SignificanceRow # Required by pickle

from .api import api_router
from backend.cli_parser import args

logger = logging.getLogger("frailty_viz_main")

logger.addHandler(logging.StreamHandler())

app = FastAPI(title="Frailty Visualization REST API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Deprecated
@app.get("/viz")
async def hack():
    with open("frontend/build/index.html") as f:
        contents = f.read()
    return HTMLResponse(content=contents, status_code=200)


app.include_router(api_router)

# Deprecated
app.mount("/old", StaticFiles(directory="static", html=True), name="old_frontend")

app.mount("/", StaticFiles(directory="frontend/build", html=True), name="frontend")
# TODO Mount Rahat's router here

if __name__ == '__main__':
    uvicorn.run(app, host="0.0.0.0", port=args.port, debug=False)
