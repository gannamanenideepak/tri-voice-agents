from flask import Flask,request,jsonify,Response
from flask_cors import CORS
from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
from langgraph.prebuilt import create_react_agent
import assemblyai as aai
import os
import base64
import requests
import tempfile
import json

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
MURF_API_KEY = os.getenv("MURF_API_KEY")
ASSEMBLYAI_API_KEY = os.getenv("ASSEMBLYAI_API_KEY")
aai.settings.api_key = ASSEMBLYAI_API_KEY
checkpointer = InMemorySaver()

model = init_chat_model(
    "google_genai:gemini-3.5-flash-lite",
    api_key=GOOGLE_API_KEY
)

agent = create_react_agent(
    model=model,
    tools=[],
    checkpointer=checkpointer
)

exchange_count = 0
current_language = ""
current_scenario = ""
thread_id = "conversation_session"

LANGUAGE_CODES = {
    "French": "fr",
    "Spanish": "es",
    "Hindi": "hi",
    "Japanese": "ja",
    "German": "de",
    "Telugu": "te",
    "Tamil": "ta"
}

MURF_VOICE_MAP = {
    "French": {"voiceId": "en-US-natalie", "multiNativeLocale": "fr-FR"},
    "Spanish": {"voiceId": "en-US-natalie", "multiNativeLocale": "es-ES"},
    "Hindi": {"voiceId": "en-US-natalie", "multiNativeLocale": "hi-IN"},
    "Japanese": {"voiceId": "en-US-natalie", "multiNativeLocale": "ja-JP"},
    "German": {"voiceId": "en-US-natalie", "multiNativeLocale": "de-DE"},
    "Telugu": {"voiceId": "en-US-natalie", "multiNativeLocale": "en-US"},
    "Tamil": {"voiceId": "en-US-natalie", "multiNativeLocale": "en-US"}
}

SESSION_PROMPT = """You are Nancy, a patient and encouraging language conversation partner helping someone practice {language} through a realistic "{scenario}" scenario.

IMPORTANT GUIDELINES:
1. Conduct exactly 5 conversational exchanges total throughout the session
2. Speak ONLY in {language} for the main conversation
3. After each of your {language} responses, add a correction or tip in English inside [brackets] like:
   [Tip: "Je voudrais" is more polite than "Je veux"]
4. Keep your {language} responses SHORT and CRISP (1-2 sentences maximum)
5. ALWAYS reference what the learner ACTUALLY said in their previous response - do NOT make up or assume their responses
6. Adapt difficulty based on their ACTUAL level - simplify if they struggle, challenge if they're strong
7. Be warm and conversational but CONCISE
8. Stay in the "{scenario}" scenario throughout

CRITICAL: Read the conversation history carefully. Only acknowledge what the learner truly said, not what you think they might have said.

Keep it short, conversational, and adaptive!"""

FEEDBACK_PROMPT = """Based on our complete conversation session, provide detailed feedback as JSON only:
    {{
    "language": "<language practiced>",
    "scenario": "<scenario practiced>",
    "fluency_score": <1-10>,
    "grammar_accuracy": <1-10>,
    "vocabulary_range": "<basic/moderate/advanced>",
    "grammar_mistakes": [
        {{"said": "<what they said>", "correct": "<correct form>", "rule": "<grammar rule>"}}
    ],
    "new_words_to_learn": ["word1", "word2", "word3"],
    "conversation_tip": "<practical tip for improvement>"
    }}
    Be specific - reference ACTUAL things they said during the conversation."""


app = Flask(__name__)
CORS(app, expose_headers=['X-Exchange-Number', 'X-Session-Complete'])


def stream_audio(text):
    BASE_URL = "https://global.api.murf.ai/v1/speech/stream"
    voice_config = MURF_VOICE_MAP.get(current_language, {"voiceId": "en-US-cooper", "multiNativeLocale": "en-US"})
    payload = {
        "text": text,
        "voiceId": voice_config["voiceId"],
        "model": "FALCON",
        "multiNativeLocale": voice_config["multiNativeLocale"],
        "sampleRate": 24000,
        "format": "MP3",
    }

    headers = {
        "Content-Type": "application/json",
        "api-key": MURF_API_KEY
    }
    response = requests.post(
        BASE_URL,
        headers=headers,
        data=json.dumps(payload),
        stream=True
    )
    for chunk in response.iter_content(chunk_size=4096):
        if chunk:
            yield base64.b64encode(chunk).decode("utf-8") + "\n"


@app.route("/start-session", methods=["POST"])
def start_session():
    global exchange_count, current_language, current_scenario, checkpointer, agent
    data = request.json
    current_language = data.get("language", "French")
    current_scenario = data.get("scenario", "ordering food")
    exchange_count = 1
    checkpointer = InMemorySaver()
    agent = create_react_agent(
        model=model,
        tools=[],
        checkpointer=checkpointer
    )
    config = {"configurable": {"thread_id": thread_id}}
    formatted_prompt = SESSION_PROMPT.format(language=current_language, scenario=current_scenario)
    response = agent.invoke({
        "messages": [
            {"role": "system", "content": formatted_prompt},
            {"role": "user", "content": f"Start the conversation with a warm greeting in {current_language} and set up the '{current_scenario}' scenario. Keep it SHORT (1-2 sentences). Add a [Tip] in English for any key phrase you use."}
        ]
    }, config=config)
    message = response["messages"][-1].content
    print(f"\n[Exchange {exchange_count}] {message}")
    return stream_audio(message), {"Content-Type": "text/plain"}

def speech_to_text(audio_path):
    """Convert audio file to text using AssemblyAI"""
    transcriber = aai.Transcriber()
    lang_code = LANGUAGE_CODES.get(current_language, "en")
    config = aai.TranscriptionConfig(
        speech_models=["universal-3-pro", "universal-2"],
        language_code=lang_code,
        speaker_labels=True,
    )
    transcript = transcriber.transcribe(audio_path, config=config)
    return transcript.text if transcript.text else ""


@app.route("/submit-response", methods=["POST"])
def submit_response():
    """Process user's response and generate next exchange"""
    global exchange_count

    audio_file = request.files["audio"]

    temp_path = tempfile.NamedTemporaryFile(delete=False, suffix=".webm").name
    audio_file.save(temp_path)

    answer = speech_to_text(temp_path)
    os.unlink(temp_path)

    if not answer or answer.strip() == "":
        answer = "[Learner provided a verbal response]"

    print(f"[Response {exchange_count}] {answer}")

    config = {"configurable": {"thread_id": thread_id}}

    agent.invoke({"messages": [{"role": "user", "content": answer}]}, config=config)

    if exchange_count >= 5:
        response = agent.invoke({
            "messages": [{"role": "user", "content": f"That was the 5th exchange. Briefly acknowledge their ACTUAL response in {current_language} and let them know the conversation practice is complete. Keep it SHORT. Add a final [Tip] in English."}]
        }, config=config)

        closing_message = response["messages"][-1].content
        print(f"\n[Closing] {closing_message}")

        return Response(
            stream_audio(closing_message),
            mimetype='text/plain',
            headers={'X-Session-Complete': 'true'}
        )

    exchange_count += 1

    prompt = f"""The learner just responded in exchange {exchange_count - 1}.

Look at their ACTUAL response above. Do NOT assume or make up what they said.

Now continue with exchange {exchange_count} of 5:
1. Briefly acknowledge what they ACTUALLY said in {current_language} (1 sentence)
2. Continue the "{current_scenario}" conversation naturally (1-2 sentences in {current_language})
3. If they struggled or used English, gently guide them back to {current_language} with simpler phrases
4. Add a [Tip] in English about any grammar or vocabulary correction
5. Keep the TOTAL response under 3-4 sentences

Be conversational but CONCISE. Only reference what they truly said."""

    response = agent.invoke({"messages": [{"role": "user", "content": prompt}]}, config=config)

    message = response["messages"][-1].content
    print(f"\n[Exchange {exchange_count}] {message}")

    return Response(
        stream_audio(message),
        mimetype='text/plain',
        headers={'X-Exchange-Number': str(exchange_count)}
    )


@app.route("/get-feedback", methods=["POST"])
def get_feedback():
    """Generate detailed conversation feedback"""
    config = {"configurable": {"thread_id": thread_id}}
    response = agent.invoke({
        "messages": [
        {
            "role": "user",
            "content": f"{FEEDBACK_PROMPT}\n\nReview our complete {current_language} conversation about '{current_scenario}' and provide detailed feedback."
        }
        ]
    }, config=config)
    text = response["messages"][-1].content
    print(f"\n[Feedback Generated]\n{text}\n")
    cleaned = text.strip()
    if "```" in cleaned:
        cleaned = cleaned.split("```")[1].replace("json", "").strip()
    else:
        start = cleaned.find("{")
        end = cleaned.rfind("}") + 1
        if start != -1 and end > start:
            cleaned = cleaned[start:end]
    feedback = json.loads(cleaned)

    return jsonify({"success": True, "feedback": feedback})


app.run(debug=True, port=5001)
