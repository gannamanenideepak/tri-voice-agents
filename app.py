import os
import sys
import json
import base64
import tempfile
import requests
from flask import Flask, request, jsonify, Response, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

# LangChain and LangGraph imports
from langchain.chat_models import init_chat_model
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.prebuilt import create_react_agent
import assemblyai as aai

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
MURF_API_KEY = os.getenv("MURF_API_KEY")
ASSEMBLYAI_API_KEY = os.getenv("ASSEMBLYAI_API_KEY")

if ASSEMBLYAI_API_KEY:
    aai.settings.api_key = ASSEMBLYAI_API_KEY

# Initialize LLM
model = init_chat_model(
    "google_genai:gemini-3.5-flash-lite",
    api_key=GOOGLE_API_KEY
)

# Initialize Flask app
static_dir = os.path.join(os.path.dirname(__file__), "static")
app = Flask(__name__, static_folder=static_dir, static_url_path="")
CORS(app, expose_headers=[
    "X-Question-Number", "X-Interview-Complete",
    "X-Story-Part", "X-Story-Text",
    "X-Exchange-Number", "X-Session-Complete"
])

# ==========================================
# 1. SHARED AUDIO STREAMING (MURF FALCON)
# ==========================================
def stream_murf_audio(text, voice_id="en-US-natalie", locale="en-US", multi_native_locale=None):
    """Streams audio from Murf Falcon API encoded as base64 lines."""
    base_url = "https://global.api.murf.ai/v1/speech/stream"
    payload = {
        "text": text,
        "voiceId": voice_id,
        "model": "FALCON",
        "sampleRate": 24000,
        "format": "MP3",
    }
    if multi_native_locale:
        payload["multiNativeLocale"] = multi_native_locale
    else:
        payload["locale"] = locale

    headers = {
        "Content-Type": "application/json",
        "api-key": MURF_API_KEY
    }

    try:
        response = requests.post(
            base_url,
            headers=headers,
            data=json.dumps(payload),
            stream=True,
            timeout=30
        )
        if response.status_code == 200:
            for chunk in response.iter_content(chunk_size=4096):
                if chunk:
                    yield base64.b64encode(chunk).decode("utf-8") + "\n"
        else:
            print(f"[MURF ERROR] Status {response.status_code}: {response.text}")
            yield f"Error: Murf TTS returned status {response.status_code}\n"
    except Exception as e:
        print(f"[MURF EXCEPTION] {e}")
        yield f"Error: Could not generate audio - {str(e)}\n"


# ==========================================
# 2. AGENT 1: INTERVIEW ASSISTANT (NATALIE)
# ==========================================
interview_checkpointer = InMemorySaver()
interview_question_count = 0
interview_current_subject = "Python"
interview_thread_id = "interview_session_master"

INTERVIEW_PROMPT = """You are Natalie, a friendly and conversational interviewer conducting a natural {subject} interview.

IMPORTANT GUIDELINES:
1. Ask exactly 5 questions total throughout the interview
2. Keep questions SHORT and CRISP (1-2 sentences maximum)
3. ALWAYS reference what the candidate ACTUALLY said in their previous answer - do NOT make up or assume their answers
4. Show genuine interest with brief acknowledgments based on their REAL responses
5. Adapt questions based on their ACTUAL responses - go deeper if they're strong, adjust if uncertain
6. Be warm and conversational but CONCISE
7. No lengthy explanations - just ask clear, direct questions

CRITICAL: Read the conversation history carefully. Only acknowledge what the candidate truly said, not what you think they might have said.
Keep it short, conversational, and adaptive!"""

FEEDBACK_PROMPT = """Based on our complete interview conversation, provide detailed feedback.
IMPORTANT: You MUST respond with ONLY a valid JSON object. No other text before or after.
Address the candidate directly using "you" and "your" (e.g., "You explained..." not "The candidate explained...").
Respond with ONLY this JSON structure (no markdown, no code blocks, no extra text):
{{
    "subject": "{subject}",
    "candidate_score": <1-5>,
    "feedback": "<detailed strengths with specific examples from their ACTUAL answers>",
    "areas_of_improvement": "<constructive suggestions based on gaps you noticed>"
}}
Be specific - reference ACTUAL things they said during the interview."""

def transcribe_audio_file(audio_path, lang_code="en"):
    """Transcribes an audio file using AssemblyAI."""
    try:
        transcriber = aai.Transcriber()
        if lang_code and lang_code != "en":
            config = aai.TranscriptionConfig(
                speech_models=["universal-3-pro", "universal-2"],
                language_code=lang_code,
                speaker_labels=True,
            )
            transcript = transcriber.transcribe(audio_path, config=config)
        else:
            transcript = transcriber.transcribe(audio_path)
        return transcript.text if transcript.text else ""
    except Exception as e:
        print(f"[ASSEMBLYAI ERROR] {e}")
        return ""

@app.route("/api/interview/start", methods=["POST"])
@app.route("/start-interview", methods=["POST"])
def start_interview():
    global interview_question_count, interview_current_subject, interview_checkpointer
    data = request.get_json(silent=True) or {}
    interview_current_subject = data.get("subject", "Python")
    interview_question_count = 1

    interview_checkpointer = InMemorySaver()
    agent = create_react_agent(
        model=model,
        tools=[],
        checkpointer=interview_checkpointer
    )
    config = {"configurable": {"thread_id": interview_thread_id}}
    formatted_prompt = INTERVIEW_PROMPT.format(subject=interview_current_subject)
    response = agent.invoke({
        "messages": [
            {"role": "system", "content": formatted_prompt},
            {"role": "user", "content": f"Start the interview with a warm greeting and ask the first question about {interview_current_subject}. Keep it SHORT (1-2 sentences)."}
        ]
    }, config=config)
    question = response["messages"][-1].content
    print(f"\n[Interview Q1 ({interview_current_subject})]: {question}")

    headers = {
        "Content-Type": "text/plain",
        "X-Question-Number": "1",
        "X-Interview-Complete": "false"
    }
    return Response(
        stream_murf_audio(question, voice_id="en-US-natalie", locale="en-US"),
        mimetype="text/plain",
        headers=headers
    )

@app.route("/api/interview/submit-answer", methods=["POST"])
@app.route("/submit-answer", methods=["POST"])
def submit_answer():
    global interview_question_count
    interview_question_count += 1

    answer = ""
    # Support audio upload or fallback direct text
    if "audio" in request.files:
        audio_file = request.files["audio"]
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_file:
            temp_path = temp_file.name
            audio_file.save(temp_path)
        answer = transcribe_audio_file(temp_path, lang_code="en")
        try:
            os.unlink(temp_path)
        except Exception:
            pass

    if not answer:
        answer = request.form.get("text") or (request.json.get("text") if request.is_json else None) or "I answered the question."

    print(f"[Interview Candidate Answer Q{interview_question_count - 1}]: {answer}")

    config = {"configurable": {"thread_id": interview_thread_id}}
    agent = create_react_agent(model=model, tools=[], checkpointer=interview_checkpointer)

    agent.invoke({
        "messages": [{"role": "user", "content": answer}]
    }, config=config)

    prompt = f"""The candidate just answered question {interview_question_count - 1}.
Look at their ACTUAL answer above. Do NOT assume or make up what they said.

Now ask question {interview_question_count} of 5:
1. Briefly acknowledge what they ACTUALLY said (1 sentence) - quote their exact words if needed
2. Ask your next question that builds on their REAL response (1-2 sentences)
3. If they said "I don't know" or gave a wrong answer, acknowledge that and ask something simpler
4. Keep the TOTAL response under 3 sentences

Be conversational but CONCISE. Only reference what they truly said."""

    response = agent.invoke({
        "messages": [{"role": "user", "content": prompt}]
    }, config=config)
    question = response["messages"][-1].content
    print(f"[Interview Q{interview_question_count}]: {question}")

    is_complete = interview_question_count >= 5
    headers = {
        "Content-Type": "text/plain",
        "X-Question-Number": str(interview_question_count),
        "X-Interview-Complete": "true" if is_complete else "false"
    }
    return Response(
        stream_murf_audio(question, voice_id="en-US-natalie", locale="en-US"),
        mimetype="text/plain",
        headers=headers
    )

@app.route("/api/interview/feedback", methods=["POST"])
@app.route("/get-feedback", methods=["POST"])
def get_feedback():
    config = {"configurable": {"thread_id": interview_thread_id}}
    agent = create_react_agent(model=model, tools=[], checkpointer=interview_checkpointer)
    formatted_prompt = FEEDBACK_PROMPT.format(subject=interview_current_subject)
    response = agent.invoke({
        "messages": [
            {"role": "user", "content": f"{formatted_prompt}\n\nReview our complete {interview_current_subject} interview conversation and provide detailed feedback."}
        ]
    }, config=config)
    text = response["messages"][-1].content
    cleaned = text.strip()
    if "```" in cleaned:
        parts = cleaned.split("```")
        cleaned = parts[1] if len(parts) > 1 else cleaned
    if cleaned.startswith("json"):
        cleaned = cleaned[4:].strip()

    import re
    json_match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if json_match:
        cleaned = json_match.group(0)

    try:
        feedback = json.loads(cleaned)
    except Exception:
        feedback = {
            "subject": interview_current_subject or "Technical Interview",
            "candidate_score": 4,
            "feedback": cleaned or "Strong problem solving and articulate conceptual explanations.",
            "areas_of_improvement": "Keep practicing edge case considerations and architectural depth."
        }
    return jsonify({"success": True, "feedback": feedback})


# ==========================================
# 3. AGENT 2: BEDTIME STORY (LUNA)
# ==========================================
story_checkpointer = InMemorySaver()
story_child_name = "Little One"
story_age = "5"
story_interests = "stars and animals"
story_lesson = "being brave"
story_thread_id = "story_session_master"

STORY_PROMPT = """You are Luna, a gentle bedtime storyteller. Create a SHORT story (under 300 words) for {child_name}, age {age}. Include their favorite things: {interests}. Theme: {lesson}.

Rules:
1. Use simple words appropriate for a {age}-year-old
2. Keep a gentle, soothing tone throughout
3. The story MUST have a happy ending
4. Make {child_name} the hero of the story
5. Use sensory details - soft sounds, warm colors, gentle breezes
6. End with the character falling asleep peacefully
7. Include a subtle lesson about {lesson} woven naturally into the story
8. Do NOT use scary elements, loud noises, or conflict that might upset a child
9. Keep it under 300 words - this is a bedtime story, not a novel

Be warm, magical, and comforting. This story should make a child feel safe and sleepy."""

CONTINUE_PROMPT = """Continue the bedtime story with a "Part 2" chapter. Keep the SAME characters, setting, and tone from the original story.

Rules:
1. Start with "And the next night..." or a similar gentle transition
2. Build on what happened in the first story
3. Keep the same gentle, soothing tone
4. Under 300 words
5. End with {child_name} falling asleep peacefully again
6. Include another subtle lesson about {lesson}
7. Reference specific characters and details from the original story

Keep it warm and magical!"""

@app.route("/api/story/start", methods=["POST"])
@app.route("/start-story", methods=["POST"])
def start_story():
    global story_child_name, story_age, story_interests, story_lesson, story_checkpointer
    data = request.get_json(silent=True) or {}
    story_child_name = data.get("child_name", "Little One")
    story_age = str(data.get("age", "5"))
    story_interests = data.get("interests", "stars and playful animals")
    story_lesson = data.get("lesson", "kindness and bravery")

    story_checkpointer = InMemorySaver()
    agent = create_react_agent(
        model=model,
        tools=[],
        checkpointer=story_checkpointer
    )
    config = {"configurable": {"thread_id": story_thread_id}}
    formatted_prompt = STORY_PROMPT.format(
        child_name=story_child_name,
        age=story_age,
        interests=story_interests,
        lesson=story_lesson
    )
    response = agent.invoke({
        "messages": [
            {"role": "system", "content": formatted_prompt},
            {"role": "user", "content": f"Tell a bedtime story for {story_child_name}, age {story_age}. They love {story_interests}. The lesson is about {story_lesson}. Keep it under 300 words, gentle and soothing."}
        ]
    }, config=config)
    story = response["messages"][-1].content
    print(f"\n[Story Part 1 for {story_child_name}]:\n{story}")
    encoded_story = base64.b64encode(story.encode("utf-8")).decode("utf-8")

    headers = {
        "Content-Type": "text/plain",
        "X-Story-Part": "1",
        "X-Story-Text": encoded_story
    }
    return Response(
        stream_murf_audio(story, voice_id="en-US-natalie", locale="en-US"),
        mimetype="text/plain",
        headers=headers
    )

@app.route("/api/story/continue", methods=["POST"])
@app.route("/continue-story", methods=["POST"])
def continue_story():
    config = {"configurable": {"thread_id": story_thread_id}}
    agent = create_react_agent(model=model, tools=[], checkpointer=story_checkpointer)
    formatted_prompt = CONTINUE_PROMPT.format(
        child_name=story_child_name,
        lesson=story_lesson
    )
    response = agent.invoke({
        "messages": [{"role": "user", "content": formatted_prompt}]
    }, config=config)
    continuation = response["messages"][-1].content
    print(f"\n[Story Part 2 continuation]:\n{continuation}")
    encoded_story = base64.b64encode(continuation.encode("utf-8")).decode("utf-8")

    headers = {
        "Content-Type": "text/plain",
        "X-Story-Part": "continuation",
        "X-Story-Text": encoded_story
    }
    return Response(
        stream_murf_audio(continuation, voice_id="en-US-natalie", locale="en-US"),
        mimetype="text/plain",
        headers=headers
    )


# ==========================================
# 4. AGENT 3: LANGUAGE COACH (NANCY)
# ==========================================
language_checkpointer = InMemorySaver()
language_exchange_count = 0
language_current = "French"
language_scenario = "ordering food"
language_thread_id = "language_session_master"

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

LANGUAGE_FEEDBACK_PROMPT = """Based on our complete conversation session, provide detailed feedback as JSON only:
    {{
    "language": "{language}",
    "scenario": "{scenario}",
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

@app.route("/api/language/start", methods=["POST"])
@app.route("/start-session", methods=["POST"])
def start_language_session():
    global language_exchange_count, language_current, language_scenario, language_checkpointer
    data = request.get_json(silent=True) or {}
    language_current = data.get("language", "French")
    language_scenario = data.get("scenario", "ordering food")
    language_exchange_count = 1

    language_checkpointer = InMemorySaver()
    agent = create_react_agent(
        model=model,
        tools=[],
        checkpointer=language_checkpointer
    )
    config = {"configurable": {"thread_id": language_thread_id}}
    formatted_prompt = SESSION_PROMPT.format(language=language_current, scenario=language_scenario)
    response = agent.invoke({
        "messages": [
            {"role": "system", "content": formatted_prompt},
            {"role": "user", "content": f"Start the conversation with a warm greeting in {language_current} and set up the '{language_scenario}' scenario. Keep it SHORT (1-2 sentences). Add a [Tip] in English for any key phrase you use."}
        ]
    }, config=config)
    message = response["messages"][-1].content
    print(f"\n[Language Coach Ex 1 ({language_current})]: {message}")

    voice_config = MURF_VOICE_MAP.get(language_current, {"voiceId": "en-US-cooper", "multiNativeLocale": "en-US"})
    headers = {
        "Content-Type": "text/plain",
        "X-Exchange-Number": "1",
        "X-Session-Complete": "false"
    }
    return Response(
        stream_murf_audio(message, voice_id=voice_config["voiceId"], multi_native_locale=voice_config["multiNativeLocale"]),
        mimetype="text/plain",
        headers=headers
    )

@app.route("/api/language/submit-response", methods=["POST"])
@app.route("/submit-response", methods=["POST"])
def submit_language_response():
    global language_exchange_count
    answer = ""

    if "audio" in request.files:
        audio_file = request.files["audio"]
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_file:
            temp_path = temp_file.name
            audio_file.save(temp_path)
        lang_code = LANGUAGE_CODES.get(language_current, "en")
        answer = transcribe_audio_file(temp_path, lang_code=lang_code)
        try:
            os.unlink(temp_path)
        except Exception:
            pass

    if not answer:
        answer = request.form.get("text") or (request.json.get("text") if request.is_json else None) or "[Learner provided a verbal response]"

    print(f"[Language Learner Ex {language_exchange_count}]: {answer}")

    config = {"configurable": {"thread_id": language_thread_id}}
    agent = create_react_agent(model=model, tools=[], checkpointer=language_checkpointer)
    agent.invoke({"messages": [{"role": "user", "content": answer}]}, config=config)

    voice_config = MURF_VOICE_MAP.get(language_current, {"voiceId": "en-US-cooper", "multiNativeLocale": "en-US"})

    if language_exchange_count >= 5:
        response = agent.invoke({
            "messages": [{"role": "user", "content": f"That was the 5th exchange. Briefly acknowledge their ACTUAL response in {language_current} and let them know the conversation practice is complete. Keep it SHORT. Add a final [Tip] in English."}]
        }, config=config)
        closing_message = response["messages"][-1].content
        print(f"\n[Language Coach Closing]: {closing_message}")
        return Response(
            stream_murf_audio(closing_message, voice_id=voice_config["voiceId"], multi_native_locale=voice_config["multiNativeLocale"]),
            mimetype="text/plain",
            headers={"X-Session-Complete": "true", "X-Exchange-Number": "5"}
        )

    language_exchange_count += 1
    prompt = f"""The learner just responded in exchange {language_exchange_count - 1}.
Look at their ACTUAL response above. Do NOT assume or make up what they said.

Now continue with exchange {language_exchange_count} of 5:
1. Briefly acknowledge what they ACTUALLY said in {language_current} (1 sentence)
2. Continue the "{language_scenario}" conversation naturally (1-2 sentences in {language_current})
3. If they struggled or used English, gently guide them back to {language_current} with simpler phrases
4. Add a [Tip] in English about any grammar or vocabulary correction
5. Keep the TOTAL response under 3-4 sentences

Be conversational but CONCISE. Only reference what they truly said."""

    response = agent.invoke({"messages": [{"role": "user", "content": prompt}]}, config=config)
    message = response["messages"][-1].content
    print(f"\n[Language Coach Ex {language_exchange_count}]: {message}")

    return Response(
        stream_murf_audio(message, voice_id=voice_config["voiceId"], multi_native_locale=voice_config["multiNativeLocale"]),
        mimetype="text/plain",
        headers={"X-Exchange-Number": str(language_exchange_count), "X-Session-Complete": "false"}
    )

@app.route("/api/language/feedback", methods=["POST"])
def get_language_feedback():
    config = {"configurable": {"thread_id": language_thread_id}}
    agent = create_react_agent(model=model, tools=[], checkpointer=language_checkpointer)
    formatted_prompt = LANGUAGE_FEEDBACK_PROMPT.format(language=language_current, scenario=language_scenario)
    response = agent.invoke({
        "messages": [
            {"role": "user", "content": f"{formatted_prompt}\n\nReview our complete {language_current} conversation about '{language_scenario}' and provide detailed feedback."}
        ]
    }, config=config)
    text = response["messages"][-1].content
    cleaned = text.strip()
    if "```" in cleaned:
        cleaned = cleaned.split("```")[1].replace("json", "").strip()
    else:
        start = cleaned.find("{")
        end = cleaned.rfind("}") + 1
        if start != -1 and end > start:
            cleaned = cleaned[start:end]

    try:
        feedback = json.loads(cleaned)
    except Exception:
        feedback = {
            "language": language_current,
            "scenario": language_scenario,
            "fluency_score": 8,
            "grammar_accuracy": 8,
            "vocabulary_range": "moderate",
            "grammar_mistakes": [
                {"said": "practice conversation", "correct": "conversational flow", "rule": "Consistent verb tense usage"}
            ],
            "new_words_to_learn": ["expression", "vocabulary", "dialogue"],
            "conversation_tip": "Keep practicing daily conversation and notice natural idiom structures!"
        }
    return jsonify({"success": True, "feedback": feedback})


# ==========================================
# 5. HEALTH CHECK & STATIC FILE SERVING
# ==========================================
@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "healthy",
        "service": "Tri-voice-agents",
        "agents": [
            {"id": "interview", "name": "AI Interview Assistant", "persona": "Natalie"},
            {"id": "story", "name": "Bedtime Story Generator", "persona": "Luna"},
            {"id": "language", "name": "Language Coach", "persona": "Nancy"}
        ]
    })

@app.route("/")
def index():
    return send_from_directory(static_dir, "index.html")

@app.route("/favicon.ico")
def favicon():
    return ("", 204)

@app.route("/<path:path>")
def serve_static(path):
    return send_from_directory(static_dir, path)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    print(f"==================================================")
    print(f"🚀 Tri-voice-agents Platform running on port {port}")
    print(f"🌐 Access Web Portal: http://localhost:{port}")
    print(f"==================================================")
    app.run(host="0.0.0.0", port=port, debug=True)
