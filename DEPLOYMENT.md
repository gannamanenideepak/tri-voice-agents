# 🚀 Tri-voice-agents - Deployment & Integration Guide

Welcome to **Tri-voice-agents**. This unified web application brings together all 3 autonomous AI agents into a single high-performance web dashboard with 3 dedicated interfaces:
1. 💼 **AI Interview Assistant (Natalie)** - 17 technical & behavioral tracks, speech recognition, adaptive questions, real-time voice streaming, and rubric scorecard.
2. 🌙 **Bedtime Story Generator (Luna)** - Personalized child tales with age-appropriate themes, soothing voice narration, and Part 1 / Part 2 continuation.
3. 🗣️ **Language Coach (Nancy)** - Conversational immersion across 7 languages, 6 realistic scenarios, live speech-to-text, bracketed grammar tips, and 360° fluency reports.

---

## 💻 1. Running Locally in Development

### Quick Start
To start the unified platform locally:

```bash
cd /Users/deepakgannamaneni/Desktop/AGENTS
python3 app.py
```

Then open your browser at:
👉 **[http://localhost:8080](http://localhost:8080)**

> **Note:** The server automatically serves the unified single web page at `/`, and provides all API routes under `/api/*` as well as legacy endpoints (`/start-interview`, etc.) for backwards compatibility.

---

## ☁️ 2. Free Cloud Deployment (Render.com)

Render provides free hosting for web services with automated GitHub deployment.

### Step-by-Step Render Deployment:
1. **Push your code to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "feat: unified multi-agent platform with single web page"
   git remote add origin https://github.com/your-username/tri-voice-agents.git
   git push -u origin main
   ```
2. Go to **[Render.com](https://render.com/)** and log in.
3. Click **"New +"** $\rightarrow$ **"Web Service"**.
4. Connect your GitHub repository `nexus-agents`.
5. Fill in the settings:
   - **Name**: `nexus-multi-agent-platform`
   - **Region**: Closest to you (e.g. Frankfurt, Oregon, Singapore)
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --threads 8 --timeout 120`
   - **Instance Type**: `Free`
6. Click **"Advanced"** $\rightarrow$ **"Add Environment Variable"** and add your 3 keys:
   - `GOOGLE_API_KEY`: *(your Gemini key)*
   - `MURF_API_KEY`: *(your Murf key)*
   - `ASSEMBLYAI_API_KEY`: *(your AssemblyAI key)*
   - `PYTHON_VERSION`: `3.11.9`
7. Click **"Create Web Service"**.
   Render will build the app and give you a public URL (e.g. `https://nexus-multi-agent-platform.onrender.com`).

---

## 🚂 3. Deploying to Railway.app

1. Go to **[Railway.app](https://railway.app/)**.
2. Click **"New Project"** $\rightarrow$ **"Deploy from GitHub repo"**.
3. Select your repository.
4. Go to **Variables** tab in Railway dashboard and add:
   - `GOOGLE_API_KEY`
   - `MURF_API_KEY`
   - `ASSEMBLYAI_API_KEY`
5. Railway automatically detects `Procfile` or `Dockerfile` and deploys your web app with an HTTPS URL.

---

## 🐳 4. Deploying with Docker

If you prefer containerized deployment (e.g. Fly.io, Google Cloud Run, AWS):

```bash
docker build -t nexus-agents .
docker run -p 8080:8080 --env-file .env nexus-agents
```

---

## 🔧 Architecture Overview

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Unified Server** | Python Flask 3.1 & Flask-CORS | Coordinates all routes, handles streaming audio, and serves the static frontend |
| **LLM Agent** | Google GenAI `gemini-3.5-flash` | Reasoning engine using LangGraph ReAct Agent with InMemory checkpointer |
| **Voice Synthesis** | Murf AI Falcon Real-Time TTS | Ultra-low latency voice streaming chunks (`audio/mpeg`) |
| **Speech-to-Text** | AssemblyAI (`universal-3-pro`) | Multilingual speech transcription from user microphone WebM recordings |
| **Frontend UI** | Vanilla HTML5 / CSS3 / ES6 / Tailwind | Responsive single-page application with 3 dedicated interfaces |
