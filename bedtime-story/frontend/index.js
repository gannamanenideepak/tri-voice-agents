


// Global State
let isSpeaking = false;
let currentAudio = null;
let storyPart = 1;

// DOM Elements
const welcomeState = document.getElementById("welcomeState");
const storyState = document.getElementById("storyState");
const childNameInput = document.getElementById("childNameInput");
const ageSelect = document.getElementById("ageSelect");
const interestsInput = document.getElementById("interestsInput");
const lessonSelect = document.getElementById("lessonSelect");
const tellStoryBtn = document.getElementById("tellStoryBtn");
const childBadge = document.getElementById("childBadge");
const lessonBadge = document.getElementById("lessonBadge");
const storyPartLabel = document.getElementById("storyPartLabel");
const speakingBubble = document.getElementById("speakingBubble");
const storyStatus = document.getElementById("storyStatus");
const continueStoryBtn = document.getElementById("continueStoryBtn");
const newStoryBtn = document.getElementById("newStoryBtn");
const storyTextSection = document.getElementById("storyTextSection");
const storyFullText = document.getElementById("storyFullText");


// ========== UI STATE FUNCTIONS ==========

function showStoryPanel() {
    welcomeState.classList.add("hidden");
    storyState.classList.remove("hidden");

    childBadge.textContent = childNameInput.value + "'s Story";
    lessonBadge.textContent = lessonSelect.value;
    storyPartLabel.textContent = "Part 1";
    storyPart = 1;

    speakingBubble.classList.add("hidden");
    storyTextSection.classList.add("hidden");
    storyFullText.textContent = "";
    continueStoryBtn.classList.add("hidden");
    continueStoryBtn.disabled = true;
    newStoryBtn.classList.add("hidden");
    storyStatus.textContent = "Preparing your story...";
}

function enableActions() {
    continueStoryBtn.classList.remove("hidden");
    continueStoryBtn.disabled = false;
    newStoryBtn.classList.remove("hidden");
    storyStatus.textContent = "Story complete! Want to hear more?";
}

function disableActions() {
    continueStoryBtn.disabled = true;
}

function displayStoryText(response) {
    const encoded = response.headers.get("X-Story-Text");
    if (encoded) {
        const text = atob(encoded);
        storyFullText.textContent = text;
        storyTextSection.classList.remove("hidden");
    }
}

function resetToWelcome() {
    isSpeaking = false;
    storyPart = 1;

    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }

    childNameInput.value = "";
    ageSelect.value = "";
    interestsInput.value = "";
    lessonSelect.value = "";
    tellStoryBtn.disabled = true;

    welcomeState.classList.remove("hidden");
    storyState.classList.add("hidden");

    speakingBubble.classList.add("hidden");
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
    let streamDone = false;

    // Show speaking bubble when streaming starts
    speakingBubble.classList.remove("hidden");
    isSpeaking = true;
    storyStatus.textContent = "Luna is telling your story...";

    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    currentAudio = new Audio(audioUrl);
    currentAudio.play().catch(() => {});

    function tryEndOfStream() {
        if (streamDone && queue.length === 0 && sourceBuffer && !sourceBuffer.updating && mediaSource.readyState === "open") {
            try {
                mediaSource.endOfStream();
            } catch (e) {}
        }
    }

    function onAudioFinished() {
        isSpeaking = false;
        speakingBubble.classList.add("hidden");
        enableActions();
        URL.revokeObjectURL(audioUrl);
    }

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
            tryEndOfStream();
        });
    });

    function processChunk({ done, value }) {
        if (done) {
            streamDone = true;
            tryEndOfStream();
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

    currentAudio.onended = onAudioFinished;
    currentAudio.onerror = onAudioFinished;
}


// ========== API FUNCTIONS ==========

const startStoryApiUrl = "http://127.0.0.1:5002/start-story";


async function startStory() {
    showStoryPanel();

    try {
        const response = await fetch(startStoryApiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                child_name: childNameInput.value,
                age: ageSelect.value,
                interests: interestsInput.value,
                lesson: lessonSelect.value
            })
        });

        const contentType = response.headers.get("content-type");

        if (contentType && contentType.includes("text/plain")) {
            displayStoryText(response);
            handleAudioStream(response, () => {});
        } else {
            const data = await response.json();
            console.log("Story:", data);
            enableActions();
        }
    } catch (error) {
        storyStatus.textContent = "Backend not connected";
    }
}

const continueStoryApiUrl = "http://127.0.0.1:5002/continue-story";


async function continueStory() {
    disableActions();
    storyPart += 1;
    storyPartLabel.textContent = "Part " + storyPart;
    storyStatus.textContent = "Luna is continuing the story...";

    try {
        const response = await fetch(continueStoryApiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
        });

        const contentType = response.headers.get("content-type");

        if (contentType && contentType.includes("text/plain")) {
            displayStoryText(response);
            handleAudioStream(response, () => {});
        } else {
            const data = await response.json();
            console.log("Continuation:", data);
            enableActions();
        }
    } catch (error) {
        storyStatus.textContent = "Connection error";
        enableActions();
    }
}


// ========== EVENT LISTENERS ==========

function checkInputs() {
    tellStoryBtn.disabled = !(childNameInput.value.trim() && ageSelect.value && interestsInput.value.trim() && lessonSelect.value);
}

childNameInput.addEventListener("input", checkInputs);
ageSelect.addEventListener("change", checkInputs);
interestsInput.addEventListener("input", checkInputs);
lessonSelect.addEventListener("change", checkInputs);

tellStoryBtn.addEventListener("click", startStory);
continueStoryBtn.addEventListener("click", continueStory);
newStoryBtn.addEventListener("click", resetToWelcome);
