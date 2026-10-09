# 🎙️ Tri-voice-agents

A unified, production-ready multi-agent voice platform bringing together three autonomous conversational AI agents into a single-page web interface.

Built with **Google Gemini 3.5 Flash Lite**, **Murf Falcon Real-Time TTS**, and **AssemblyAI Speech Recognition**.

---

## 🌟 The Three Voice Agents

| Agent | Persona & Voice | Key Capabilities |
| :--- | :--- | :--- |
| 💼 **AI Interview Assistant** | **Natalie** *(Murf Falcon)* | • **17 Specialized Tracks**: Python, GenAI, DSA (Basic/Med/Pro), System Design (LLD/HLD), Machine Learning, SQL, and Behavioral HR.<br>• **Adaptive 5-Question Flow**: Questions dynamically adjust based on candidate's spoken responses.<br>• **Evaluation Scorecard**: Generates score rating, strengths, and targeted improvement areas. |
| 🌙 **Bedtime Storyteller** | **Luna** *(Soothing Voice)* | • **Personalized Stories**: Customized by child name, age (3–10+), favorite interests, and life lessons.<br>• **Gentle Audio Narration**: Calming tone and pacing designed to help children feel safe and sleepy.<br>• **Multi-Chapter Continuation**: Interactive reading view with Part 1 and Part 2 ("The Next Night") chapters. |
| 🗣️ **Language Coach** | **Nancy** *(Multilingual Voice)* | • **7 Languages**: French 🇫🇷, Spanish 🇪🇸, Hindi 🇮🇳, Japanese 🇯🇵, German 🇩🇪, Telugu 🇮🇳, Tamil 🇮🇳.<br>• **6 Immersion Scenarios**: Dining, Hotel check-in, Job interview, Directions, Market shopping, and Coffee chat.<br>• **Fluency & Grammar Evaluation**: Live contextual tips and complete scorecard with grammar mistake analysis. |

---

## ⚡ Tech Stack

- **Backend**: Python 3.11, Flask 3.1, Flask-CORS, Gunicorn
- **LLM Reasoning**: LangChain & LangGraph ReAct Agents (`google_genai:gemini-3.5-flash-lite`)
- **Voice Synthesis**: Murf AI Falcon Real-Time Streaming Audio (`audio/mpeg`)
- **Speech-to-Text**: AssemblyAI Multilingual Transcription Engine
- **Frontend**: Vanilla HTML5, ES6 JavaScript, Tailwind CSS (Clean Dark Theme, Voice-Driven)
- **Deployment**: Docker containerization & Render Blueprint (`render.yaml`)

---

## 🚀 Getting Started

### 1. Prerequisites
- Python 3.10+
- Active API keys for:
  - [Google AI Studio](https://aistudio.google.com/) (`GOOGLE_API_KEY`)
  - [Murf AI](https://murf.ai/) (`MURF_API_KEY`)
  - [AssemblyAI](https://www.assemblyai.com/) (`ASSEMBLYAI_API_KEY`)

### 2. Installation & Setup
```bash
# Clone the repository
git clone https://github.com/gannamanenideepak/tri-voice-agents.git
cd tri-voice-agents

# Install dependencies
pip install -r requirements.txt

# Configure your environment variables
cp .env.example .env
```

Add your credentials inside `.env`:
```env
GOOGLE_API_KEY=your_gemini_api_key
MURF_API_KEY=your_murf_api_key
ASSEMBLYAI_API_KEY=your_assemblyai_api_key
PORT=8080
```

### 3. Run Locally
```bash
python app.py
```
Open your browser and navigate to:
👉 **`http://localhost:8080`**

---

## ☁️ Cloud Deployment

### Deploy on Render (Recommended)
1. Fork or push this repository to GitHub.
2. Go to [Render Dashboard](https://dashboard.render.com/) $\rightarrow$ **New Web Service**.
3. Connect your repository. Render automatically reads the `Dockerfile` and `render.yaml`.
4. In the **Environment Variables** tab, provide:
   - `GOOGLE_API_KEY`
   - `MURF_API_KEY`
   - `ASSEMBLYAI_API_KEY`
5. Click **Deploy Web Service** to get your public HTTPS URL.

### Deploy with Docker
```bash
docker build -t tri-voice-agents .
docker run -p 8080:8080 --env-file .env tri-voice-agents
```

---

## 📁 Repository Structure

```
tri-voice-agents/
├── app.py                      # Unified Flask server (hosts all 3 APIs + web interface)
├── requirements.txt            # Production dependencies
├── Dockerfile                  # Container specification for cloud deployment
├── Procfile                    # Process declaration for web hosting
├── render.yaml                 # Render Blueprint configuration
├── .env.example                # Environment variables template
├── static/                     # Unified single-page web application
│   ├── index.html              # Responsive dashboard with 3 dedicated agent interfaces
│   ├── css/style.css           # Clean, modern design system (no neon/radium colors)
│   └── js/app.js               # Universal state controller & streaming audio engine
├── Interview_Assistant/        # Standalone Interview Agent module
├── bedtime-story/              # Standalone Bedtime Story module
└── language-coach/             # Standalone Language Coach module
```

---

## 📄 License
MIT License. Open-source for personal and educational use.
