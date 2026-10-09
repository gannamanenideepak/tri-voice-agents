from flask import Flask,request,Response
from flask_cors import CORS
from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.prebuilt import create_react_agent
import os
import base64
import json
import requests

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
MURF_API_KEY = os.getenv("MURF_API_KEY")
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

current_child_name = ""
current_age = ""
current_interests = ""
current_lesson = ""
thread_id = "story_session"

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

app = Flask(__name__)
CORS(app, expose_headers=['X-Story-Part', 'X-Story-Text'])


def stream_audio(text):
    BASE_URL = "https://global.api.murf.ai/v1/speech/stream"
    payload = {
        "text": text,
        "voiceId": "en-US-natalie",
        "model": "FALCON",
        "multiNativeLocale": "en-US",
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


@app.route("/start-story", methods=["POST"])
def start_story():
    global current_child_name, current_age, current_interests, current_lesson, checkpointer, agent
    data = request.json
    current_child_name = data.get("child_name", "Little One")
    current_age = data.get("age", "5")
    current_interests = data.get("interests", "stars and animals")
    current_lesson = data.get("lesson", "being brave")
    checkpointer = InMemorySaver()
    agent = create_react_agent(
        model=model,
        tools=[],
        checkpointer=checkpointer
    )
    config = {"configurable": {"thread_id": thread_id}}
    formatted_prompt = STORY_PROMPT.format(
        child_name=current_child_name,
        age=current_age,
        interests=current_interests,
        lesson=current_lesson
    )
    response = agent.invoke({
        "messages": [
            {"role": "system", "content": formatted_prompt},
            {"role": "user", "content": f"Tell a bedtime story for {current_child_name}, age {current_age}. They love {current_interests}. The lesson is about {current_lesson}. Keep it under 300 words, gentle and soothing."}
        ]
    }, config=config)
    story = response["messages"][-1].content
    print(f"\n[Story Part 1]\n{story}")
    encoded_story = base64.b64encode(story.encode()).decode()
    return stream_audio(story), {"Content-Type": "text/plain", "X-Story-Text": encoded_story}


@app.route("/continue-story", methods=["POST"])
def continue_story():
    config = {"configurable": {"thread_id": thread_id}}
    formatted_prompt = CONTINUE_PROMPT.format(
        child_name=current_child_name,
        lesson=current_lesson
    )
    response = agent.invoke({
        "messages": [{"role": "user", "content": formatted_prompt}]
    }, config=config)
    continuation = response["messages"][-1].content
    print(f"\n[Story Continuation]\n{continuation}")
    encoded_story = base64.b64encode(continuation.encode()).decode()
    return Response(
        stream_audio(continuation),
        mimetype='text/plain',
        headers={'X-Story-Part': 'continuation', 'X-Story-Text': encoded_story}
    )


app.run(debug=True, port=5002)
