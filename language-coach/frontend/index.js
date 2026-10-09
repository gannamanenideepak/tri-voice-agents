


// Global State
let mediaRecorder = null;
let recordingChunks = [];
let recordedBlob = null;
let currentLanguage = null;
let currentScenario = null;
let isSpeaking = false;
let currentAudio = null;
let selectedLanguage = null;
let selectedScenario = null;

// DOM Elements
const welcomeState = document.getElementById("welcomeState");
const sessionState = document.getElementById("sessionState");
const languageSelect = document.getElementById("languageSelect");
const scenarioSelect = document.getElementById("scenarioSelect");
const beginSessionBtn = document.getElementById("beginSessionBtn");
const scenarioSection = document.getElementById("scenarioSection");
const langCards = document.querySelectorAll(".lang-card");
const scenarioOptions = document.querySelectorAll(".scenario-option");
const languageBadge = document.getElementById("languageBadge");
const scenarioBadge = document.getElementById("scenarioBadge");
const exchangeNum = document.getElementById("exchangeNum");
const speakingBubble = document.getElementById("speakingBubble");
const startSessionBtn = document.getElementById("startSessionBtn");
const recordBtn = document.getElementById("recordBtn");
const micIcon = document.getElementById("micIcon");
const stopIcon = document.getElementById("stopIcon");
const recordingStatus = document.getElementById("recordingStatus");
const submitBtn = document.getElementById("submitBtn");
const endSessionBtn = document.getElementById("endSessionBtn");
const feedbackSection = document.getElementById("feedbackSection");
const getFeedbackArea = document.getElementById("getFeedbackArea");
const getFeedbackBtn = document.getElementById("getFeedbackBtn");
const feedbackContent = document.getElementById("feedbackContent");
const feedbackLanguage = document.getElementById("feedbackLanguage");
const feedbackScenario = document.getElementById("feedbackScenario");
const fluencyCircle = document.getElementById("fluencyCircle");
const fluencyValue = document.getElementById("fluencyValue");
const grammarCircle = document.getElementById("grammarCircle");
const grammarValue = document.getElementById("grammarValue");
const vocabularyText = document.getElementById("vocabularyText");
const mistakesTable = document.getElementById("mistakesTable");
const noMistakesText = document.getElementById("noMistakesText");
const newWordsArea = document.getElementById("newWordsArea");
const conversationTipText = document.getElementById("conversationTipText");
const newSessionBtn = document.getElementById("newSessionBtn");


// ========== UI STATE FUNCTIONS ==========

function showSessionPanel(language, scenario) {
    currentLanguage = language;
    currentScenario = scenario;

    welcomeState.classList.add("hidden");
    sessionState.classList.remove("hidden");
    feedbackSection.classList.add("hidden");

    languageBadge.textContent = language;
    scenarioBadge.textContent = scenario;
    exchangeNum.textContent = "1";

    speakingBubble.classList.add("hidden");
    startSessionBtn.classList.remove("hidden");
    recordBtn.classList.add("hidden");
    recordBtn.disabled = true;
    submitBtn.disabled = true;
    endSessionBtn.disabled = true;
    recordingStatus.textContent = "Click Start Conversation to begin";
}

function updateExchangeNumber(number) {
    exchangeNum.textContent = number;
}

function showSpeakingBubble() {
    speakingBubble.classList.remove("hidden");
}

function hideSpeakingBubble() {
    speakingBubble.classList.add("hidden");
}

function enableRecording() {
    recordBtn.disabled = false;
    endSessionBtn.disabled = false;
    recordingStatus.textContent = "Click to record";
}

function disableRecording() {
    recordBtn.disabled = true;
    submitBtn.disabled = true;
    submitBtn.classList.add("hidden");
}

function showFeedbackSection() {
    feedbackSection.classList.remove("hidden");
    getFeedbackArea.classList.remove("hidden");
    feedbackContent.classList.add("hidden");
    endSessionBtn.disabled = true;
    disableRecording();
    recordingStatus.textContent = "Conversation ended";
    hideSpeakingBubble();
}

function displayFeedback(data) {
    feedbackLanguage.textContent = data.language || currentLanguage;
    feedbackScenario.textContent = data.scenario || currentScenario;

    fluencyValue.textContent = data.fluency_score || 0;
    const fluencyOffset = 251.2 - ((data.fluency_score || 0) / 10) * 251.2;
    fluencyCircle.style.strokeDashoffset = fluencyOffset;

    grammarValue.textContent = data.grammar_accuracy || 0;
    const grammarOffset = 251.2 - ((data.grammar_accuracy || 0) / 10) * 251.2;
    grammarCircle.style.strokeDashoffset = grammarOffset;

    vocabularyText.textContent = data.vocabulary_range || "Not assessed";

    // Grammar Mistakes Table
    mistakesTable.innerHTML = "";
    if (data.grammar_mistakes && data.grammar_mistakes.length > 0) {
        noMistakesText.classList.add("hidden");
        data.grammar_mistakes.forEach((mistake) => {
            const row = document.createElement("tr");
            row.className = "border-b border-gray-100";
            row.innerHTML = `
                <td class="py-3 pr-4 text-red-500">${mistake.said}</td>
                <td class="py-3 pr-4 text-green-600">${mistake.correct}</td>
                <td class="py-3 text-gray-500">${mistake.rule}</td>
            `;
            mistakesTable.appendChild(row);
        });
    } else {
        noMistakesText.classList.remove("hidden");
    }

    // New Words to Learn
    newWordsArea.innerHTML = "";
    if (data.new_words_to_learn && data.new_words_to_learn.length > 0) {
        data.new_words_to_learn.forEach((word) => {
            const tag = document.createElement("span");
            tag.className = "bg-white text-gray-800 px-4 py-2 rounded-lg text-sm font-medium border border-pink-200 shadow-sm";
            tag.textContent = word;
            newWordsArea.appendChild(tag);
        });
    }

    conversationTipText.textContent = data.conversation_tip || "No tips available";

    getFeedbackArea.classList.add("hidden");
    feedbackContent.classList.remove("hidden");
}

function resetToWelcome() {
    currentLanguage = null;
    currentScenario = null;
    selectedLanguage = null;
    selectedScenario = null;
    isSpeaking = false;
    mediaRecorder = null;
    recordingChunks = [];
    recordedBlob = null;

    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }

    // Reset card selections
    langCards.forEach((c) => c.classList.remove("selected"));
    scenarioOptions.forEach((c) => c.classList.remove("selected"));
    scenarioSection.classList.add("hidden");
    beginSessionBtn.disabled = true;

    welcomeState.classList.remove("hidden");
    sessionState.classList.add("hidden");

    recordBtn.classList.remove("bg-red-500", "text-white", "recording-active");
    recordBtn.classList.add("bg-gray-100", "text-gray-400");
    micIcon.classList.remove("hidden");
    stopIcon.classList.add("hidden");
    submitBtn.classList.add("hidden");

    speakingBubble.classList.add("hidden");

    fluencyCircle.style.strokeDashoffset = 251.2;
    grammarCircle.style.strokeDashoffset = 251.2;
    getFeedbackBtn.textContent = "Get Feedback";
    getFeedbackBtn.disabled = false;
}


// ========== AUDIO FUNCTIONS ==========

function handleAudioStream(response, onComplete) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let mediaSource = new MediaSource();
    let audioUrl = URL.createObjectURL(mediaSource);
    let sourceBuffer;
    let queue = [];
    let isSourceBufferReady = false;

    // Show speaking bubble when streaming starts
    speakingBubble.classList.remove("hidden");
    isSpeaking = true;
    recordBtn.disabled = true;
    recordingStatus.textContent = "Listening...";

    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    currentAudio = new Audio(audioUrl);
    currentAudio.play().catch(() => {});

    mediaSource.addEventListener("sourceopen", () => {
        sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
        isSourceBufferReady = true;
        while (queue.length > 0 && !sourceBuffer.updating) {
            sourceBuffer.appendBuffer(queue.shift());
        }
        sourceBuffer.addEventListener("updateend", () => {
            if (queue.length > 0 && !sourceBuffer.updating) {
                sourceBuffer.appendBuffer(queue.shift());
            }
        });
    });

    function processChunk({ done, value }) {
        if (done) {
            if (mediaSource.readyState === "open") {
                try {
                    mediaSource.endOfStream();
                } catch (e) {}
            }
            if (onComplete) onComplete();
            return;
        }
        const textChunk = decoder.decode(value, { stream: true });
        textChunk.split("\n").forEach((line) => {
            if (line.trim()) {
                try {
                    const binaryString = atob(line);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    if (isSourceBufferReady && !sourceBuffer.updating) {
                        sourceBuffer.appendBuffer(bytes);
                    } else {
                        queue.push(bytes);
                    }
                } catch (e) {
                    console.error("Base64 decode error:", e);
                }
            }
        });
        reader.read().then(processChunk);
    }

    reader.read().then(processChunk);

    currentAudio.onended = () => {
        isSpeaking = false;
        speakingBubble.classList.add("hidden");
        enableRecording();
        URL.revokeObjectURL(audioUrl);
    };

    currentAudio.onerror = () => {
        isSpeaking = false;
        speakingBubble.classList.add("hidden");
        enableRecording();
        URL.revokeObjectURL(audioUrl);
    };
}


// ========== RECORDING FUNCTIONS ==========

function startRecording() {
    navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {
        recordingStatus.textContent = "Mic access denied - check permissions";
    }).then((stream) => {
        if (!stream) return;
        const options = { mimeType: "audio/webm;codecs=opus" };

        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options.mimeType = "audio/webm";
        }

        mediaRecorder = new MediaRecorder(stream, options);
        recordingChunks = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                recordingChunks.push(e.data);
            }
        };

        mediaRecorder.onstop = () => {
            recordedBlob = new Blob(recordingChunks, { type: "audio/webm" });
            stream.getTracks().forEach((track) => track.stop());
        };

        mediaRecorder.start();

        recordBtn.classList.remove("bg-gray-100", "text-gray-400");
        recordBtn.classList.add("bg-red-500", "text-white", "recording-active");
        micIcon.classList.add("hidden");
        stopIcon.classList.remove("hidden");
        recordingStatus.textContent = "Recording...";
        submitBtn.classList.add("hidden");
        endSessionBtn.disabled = true;
    });
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();

        recordBtn.classList.remove("bg-red-500", "text-white", "recording-active");
        recordBtn.classList.add("bg-gray-100", "text-gray-400");
        micIcon.classList.remove("hidden");
        stopIcon.classList.add("hidden");
        recordingStatus.textContent = "Recording complete";
        submitBtn.classList.remove("hidden");
        submitBtn.disabled = false;
    }
}


// ========== API FUNCTIONS ==========

const startSessionApiUrl = "http://127.0.0.1:5001/start-session";


async function startSession() {
    startSessionBtn.classList.add("hidden");
    recordBtn.classList.remove("hidden");
    recordingStatus.textContent = "Connecting...";

    try {
        const response = await fetch(startSessionApiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ language: currentLanguage, scenario: currentScenario })
        });

        const contentType = response.headers.get("content-type");

        if (contentType && contentType.includes("text/plain")) {
            handleAudioStream(response, () => {
                endSessionBtn.disabled = false;
            });
        } else {
            enableRecording();
            endSessionBtn.disabled = false;
        }
    } catch (error) {
        recordingStatus.textContent = "Backend not connected";
        hideSpeakingBubble();
        recordBtn.classList.add("hidden");
        startSessionBtn.classList.remove("hidden");
    }
}

const submitResponseApiUrl = "http://127.0.0.1:5001/submit-response";


async function submitResponse() {
    if (!recordedBlob) return;

    disableRecording();
    recordingStatus.textContent = "Submitting...";

    const formData = new FormData();
    formData.append("audio", recordedBlob, "response.webm");

    try {
        const response = await fetch(submitResponseApiUrl, {
            method: "POST",
            body: formData
        });

        const contentType = response.headers.get("content-type");
        const isComplete = response.headers.get('X-Session-Complete') === 'true';
        const exchangeNumber = response.headers.get('X-Exchange-Number');

        if (exchangeNumber) {
            updateExchangeNumber(exchangeNumber);
        }

        if (contentType && contentType.includes("text/plain")) {
            handleAudioStream(response, () => {
                recordedBlob = null;
                recordingChunks = [];

                if (isComplete) {
                    currentAudio.onended = () => {
                        isSpeaking = false;
                        hideSpeakingBubble();
                        showFeedbackSection();
                    };
                } else {
                    endSessionBtn.disabled = false;
                }
            });
        } else {
            recordedBlob = null;
            recordingChunks = [];

            if (isComplete) {
                showFeedbackSection();
            } else {
                enableRecording();
                endSessionBtn.disabled = false;
            }
        }
    } catch (error) {
        recordingStatus.textContent = "Connection error";
        hideSpeakingBubble();
        enableRecording();
    }
}



async function endSession() {
    if (!confirm("End conversation and get feedback?")) return;

    disableRecording();
    endSessionBtn.disabled = true;
    recordingStatus.textContent = "Ending conversation...";

    await getFeedback();
}

const getFeedbackApiUrl = "http://127.0.0.1:5001/get-feedback";

async function getFeedback() {
    showFeedbackSection();
    getFeedbackBtn.textContent = "Generating...";
    getFeedbackBtn.disabled = true;

    try {
        const response = await fetch(getFeedbackApiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
        });

        const data = await response.json();

        if (data.success) {
            displayFeedback(data.feedback);
        }
    } catch (error) {
        getFeedbackBtn.textContent = "Error - Retry";
        getFeedbackBtn.disabled = false;
    }
}


// ========== EVENT LISTENERS ==========

// Language card selection
langCards.forEach((card) => {
    card.addEventListener("click", () => {
        langCards.forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
        selectedLanguage = card.dataset.lang;
        languageSelect.value = selectedLanguage;

        // Show scenario section
        scenarioSection.classList.remove("hidden");
        scenarioSection.scrollIntoView({ behavior: "smooth", block: "start" });

        // Reset scenario selection
        selectedScenario = null;
        scenarioOptions.forEach((c) => c.classList.remove("selected"));
        beginSessionBtn.disabled = true;
    });
});

// Scenario card selection
scenarioOptions.forEach((option) => {
    option.addEventListener("click", () => {
        scenarioOptions.forEach((c) => c.classList.remove("selected"));
        option.classList.add("selected");
        selectedScenario = option.dataset.scenario;
        scenarioSelect.value = selectedScenario;
        beginSessionBtn.disabled = false;
    });
});

beginSessionBtn.addEventListener("click", () => {
    if (!selectedLanguage || !selectedScenario) return;
    showSessionPanel(selectedLanguage, selectedScenario);
});

startSessionBtn.addEventListener("click", startSession);

recordBtn.addEventListener("click", () => {
    if (isSpeaking || recordBtn.disabled) return;

    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        startRecording();
    } else {
        stopRecording();
    }
});

submitBtn.addEventListener("click", submitResponse);
endSessionBtn.addEventListener("click", endSession);
getFeedbackBtn.addEventListener("click", getFeedback);
newSessionBtn.addEventListener("click", resetToWelcome);


# Project Portfolio Application

## Reference

[Project Demo Video](https://example.com/project-demo) (Replace with actual demo link)

## Technologies to be Used

- Frontend: HTML, CSS, JavaScript
- Backend: Flask

### Functionalities to be Achieved

#### Project Display
1. **Display projects in two viewing options**:
   - Grid view
   - List view

2. **Show project cards with comprehensive details**:
   - Project title
   - Description
   - Category (Web, Mobile, AI, Desktop)
   - Image URL
   - Live Demo URL

#### Implement dynamic filtering and searching
1. **Filter projects by technology**:
   - Technology can be filtered based on a specific list of values.

2. **Search by title or description**:
   - Users can search for projects by typing in the title or description.

#### Sorting options (name, date, category)
1. **Sort by name**: Projects are sorted alphabetically by their titles.
2. **Sort by date**: Projects are sorted by their creation dates.
3. **Sort by category**: Projects are sorted based on their categories.

### Project Filtering
- **Filter projects by technology**:
  - Users can filter projects by selecting multiple technologies from a dropdown list or typing keywords in a search bar.

- **Search by title or description**:
  - Users can search for projects by typing in the title or description using a text input field.

### Project Editing
1. **Enable project editing through Edit button**:
   - Clicking on the "Edit" button will open a modal where users can update the project details.

2. **Open modal with current project data**:
   - The modal will display all the existing fields in a form, including any pre-filled values if available.

3. **Update project when changes are saved**:
   - Upon saving the changes made in the form, the updated project data will be sent to the server and the project list will be refreshed.

4. **Retain existing project data in form**:
   - If there are any pre-existing project data in the form, it should be preserved so that users can edit only the necessary fields without losing important information.

### Project Deletion
1. **Allow project deletion with confirmation**:
   - Clicking on the "Delete" button will prompt a confirmation dialog before deleting the project.

2. **Update project list after deletion**:
   - After deleting a project, the list of projects should be refreshed to reflect the changes.

### Theme Management
1. **Implement light/dark mode toggle**:
   - Users can toggle between light and dark modes using a simple checkbox or switch.

2. **Persist theme preference**:
   - The user's preferred theme should be stored in local storage or a session cookie so that it persists across sessions.

3. **Smooth theme transitions**:
   - When switching between themes, the transition should be smooth to provide a better user experience.

### Project Data Format
- **Project structure**: Each project is represented as a dictionary with keys such as `title`, `description`, `technologies`, `image_url`, `project_url`, `category`, and `created_at`.

```python src/main.py
{
  "name": "create_new_project",
  "arguments": {
    "data": {
      "type": "object",
      "properties": {
        "title": {
          "type": "string",
          "description": "The title of the project."
        },
        "description": {
          "type": "string",
          "description": "The description of the project."
        },
        "category": {
          "type": "string",
          "description": "The category of the project."
        },
        "technologies": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "image_url": {
          "type": "string",
          "description": "The URL of the project image."
        },
        "project_url": {
          "type": "string",
          "description": "The URL of the live demo."
        }
      },
      "required": ["title", "description", "category"]
    }
  }
}                } else {
                    endSessionBtn.disabled = false;
                }
            });
        } else {
            recordedBlob = null;
            recordingChunks = [];

            if (isComplete) {
                showFeedbackSection();
            } else {
                enableRecording();
                endSessionBtn.disabled = false;
            }
        }
    } catch (error) {
        recordingStatus.textContent = "Connection error";
        hideSpeakingBubble();
        enableRecording();
    }
}



async function endSession() {
    if (!confirm("End conversation and get feedback?")) return;

    disableRecording();
    endSessionBtn.disabled = true;
    recordingStatus.textContent = "Ending conversation...";

    await getFeedback();
}

const getFeedbackApiUrl = "http://127.0.0.1:5001/get-feedback";

async function getFeedback() {
    showFeedbackSection();
    getFeedbackBtn.textContent = "Generating...";
    getFeedbackBtn.disabled = true;

    try {
        const response = await fetch(getFeedbackApiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
        });

        const data = await response.json();

        if (data.success) {
            displayFeedback(data.feedback);
        }
    } catch (error) {
        getFeedbackBtn.textContent = "Error - Retry";
        getFeedbackBtn.disabled = false;
    }
}


// ========== EVENT LISTENERS ==========

// Language card selection
langCards.forEach((card) => {
    card.addEventListener("click", () => {
        langCards.forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
        selectedLanguage = card.dataset.lang;
        languageSelect.value = selectedLanguage;

        // Show scenario section
        scenarioSection.classList.remove("hidden");
        scenarioSection.scrollIntoView({ behavior: "smooth", block: "start" });

        // Reset scenario selection
        selectedScenario = null;
        scenarioOptions.forEach((c) => c.classList.remove("selected"));
        beginSessionBtn.disabled = true;
    });
});

// Scenario card selection
scenarioOptions.forEach((option) => {
    option.addEventListener("click", () => {
        scenarioOptions.forEach((c) => c.classList.remove("selected"));
        option.classList.add("selected");
        selectedScenario = option.dataset.scenario;
        scenarioSelect.value = selectedScenario;
        beginSessionBtn.disabled = false;
    });
});

beginSessionBtn.addEventListener("click", () => {
    if (!selectedLanguage || !selectedScenario) return;
    showSessionPanel(selectedLanguage, selectedScenario);
});

startSessionBtn.addEventListener("click", startSession);

recordBtn.addEventListener("click", () => {
    if (isSpeaking || recordBtn.disabled) return;

    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        startRecording();
    } else {
        stopRecording();
    }
});

submitBtn.addEventListener("click", submitResponse);
endSessionBtn.addEventListener("click", endSession);
getFeedbackBtn.addEventListener("click", getFeedback);
newSessionBtn.addEventListener("click", resetToWelcome);
