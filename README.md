# MarkovChained
Video Link: https://drive.google.com/file/d/12FfpXcMzNlVanpB_Nu72MeRhO_JBEYMs/view?usp=sharing


Slides Link(PDF): https://drive.google.com/file/d/1Vc4m2HeWo1sm61kdzePmG_fOzfesnE0R/view?usp=sharing


Brief startup guide for local development.

## Prerequisites

- Python: https://www.python.org/downloads/
- Node.js (includes npm): https://nodejs.org/en/download

## 1) Start Backend (FastAPI)

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run API server
fastapi dev main.py
```

## 2) Start Frontend (Next.js)

Open a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3000` by default.

## 3) Seed and Verify Demo Routes (Bash)

After the backend is running:

```bash
cd backend
chmod +x scripts/seed_and_verify.sh
./scripts/seed_and_verify.sh
```

Verbose mode:

```bash
./scripts/seed_and_verify.sh --verbose
```

Custom backend URL:

```bash
./scripts/seed_and_verify.sh http://127.0.0.1:8000
```
