/**
 * ==============================================================================
 * NEXUS MULTI-AGENT PLATFORM - MASTER CLIENT CONTROLLER
 * ==============================================================================
 */

// Global State
const state = {
    activeTab: 'overview', // 'overview', 'interview', 'story', 'language'
    
    // Audio engine state
    isAudioPlaying: false,
    currentAudio: null,
    audioMediaSource: null,

    // Interview state
    interview: {
        subject: 'Python',
        questionNumber: 1,
        totalQuestions: 5,
        isRecording: false,
        mediaRecorder: null,
        recordedChunks: [],
        recordedBlob: null,
        timerInterval: null,
        secondsElapsed: 0,
        feedback: null
    },

    // Story state
    story: {
        childName: 'Leo',
        age: '5',
        interests: 'space rockets and friendly dragons',
        lesson: 'being brave',
        part: 1,
        fullStoryText: '',
        isLoading: false
    },

    // Language coach state
    language: {
        currentLang: 'French',
        scenario: 'ordering food',
        exchangeNumber: 1,
        totalExchanges: 5,
        isRecording: false,
        mediaRecorder: null,
        recordedChunks: [],
        recordedBlob: null,
        timerInterval: null,
        secondsElapsed: 0,
        feedback: null
    }
};

// ==============================================================================
// 1. NAVIGATION & AGENT SWITCHER
// ==============================================================================
function switchTab(tabName) {
    state.activeTab = tabName;

    // Update Nav buttons
    document.querySelectorAll('.agent-nav-tab').forEach(tab => {
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    // Update View Containers
    document.querySelectorAll('.agent-view').forEach(view => {
        if (view.id === `view-${tabName}`) {
            view.classList.remove('hidden');
            view.classList.add('animate-fade-in');
        } else {
            view.classList.add('hidden');
            view.classList.remove('animate-fade-in');
        }
    });

    // Smooth scroll to top of view
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==============================================================================
// 2. UNIVERSAL AUDIO ENGINE (MURF STREAM PLAYBACK)
// ==============================================================================
async function playStreamingAudio(response, onStart, onEnded) {
    stopCurrentAudio();

    if (onStart) onStart();
    setGlobalSpeakingUI(true);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const audioChunks = [];

    // First attempt using MediaSource for low latency
    const canUseMediaSource = window.MediaSource && MediaSource.isTypeSupported('audio/mpeg');

    if (canUseMediaSource) {
        try {
            const mediaSource = new MediaSource();
            const audio = new Audio();
            state.currentAudio = audio;
            audio.src = URL.createObjectURL(mediaSource);

            let sourceBuffer = null;
            let bufferQueue = [];
            let sourceBufferReady = false;

            mediaSource.addEventListener('sourceopen', () => {
                try {
                    sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
                    sourceBufferReady = true;

                    sourceBuffer.addEventListener('updateend', () => {
                        if (bufferQueue.length > 0 && !sourceBuffer.updating) {
                            sourceBuffer.appendBuffer(bufferQueue.shift());
                        }
                    });

                    // Flush any early queued chunks
                    while (bufferQueue.length > 0 && !sourceBuffer.updating) {
                        sourceBuffer.appendBuffer(bufferQueue.shift());
                    }
                } catch (e) {
                    console.warn('SourceBuffer creation failed, will use blob fallback', e);
                }
            });

            audio.play().catch(e => console.log('Audio autoplay prevented or waiting:', e));

            audio.onended = () => {
                setGlobalSpeakingUI(false);
                if (onEnded) onEnded();
            };

            audio.onerror = () => {
                setGlobalSpeakingUI(false);
                if (onEnded) onEnded();
            };

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    if (mediaSource.readyState === 'open') {
                        try { mediaSource.endOfStream(); } catch (e) { }
                    }
                    break;
                }

                const chunkText = decoder.decode(value, { stream: true });
                const lines = chunkText.split('\n');

                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const binaryStr = atob(line);
                            const bytes = new Uint8Array(binaryStr.length);
                            for (let i = 0; i < binaryStr.length; i++) {
                                bytes[i] = binaryStr.charCodeAt(i);
                            }
                            audioChunks.push(bytes);

                            if (sourceBufferReady && sourceBuffer && !sourceBuffer.updating) {
                                sourceBuffer.appendBuffer(bytes);
                            } else {
                                bufferQueue.push(bytes);
                            }
                        } catch (err) {
                            // Non-base64 diagnostic line (e.g. error message)
                            console.warn('Audio line parse issue:', line);
                        }
                    }
                }
            }
            return;
        } catch (mediaSourceErr) {
            console.warn('MediaSource path error, using Blob player fallback', mediaSourceErr);
        }
    }

    // Fallback path: Assemble into MP3 Blob
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunkText = decoder.decode(value, { stream: true });
            const lines = chunkText.split('\n');
            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const binaryStr = atob(line);
                        const bytes = new Uint8Array(binaryStr.length);
                        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
                        audioChunks.push(bytes);
                    } catch (e) { }
                }
            }
        }

        const fullBlob = new Blob(audioChunks, { type: 'audio/mpeg' });
        const blobUrl = URL.createObjectURL(fullBlob);
        const audio = new Audio(blobUrl);
        state.currentAudio = audio;

        audio.play().catch(e => console.log('Audio autoplay prevented:', e));

        audio.onended = () => {
            setGlobalSpeakingUI(false);
            URL.revokeObjectURL(blobUrl);
            if (onEnded) onEnded();
        };

        audio.onerror = () => {
            setGlobalSpeakingUI(false);
            URL.revokeObjectURL(blobUrl);
            if (onEnded) onEnded();
        };
    } catch (err) {
        console.error('Audio stream playback failed:', err);
        setGlobalSpeakingUI(false);
        if (onEnded) onEnded();
    }
}

function stopCurrentAudio() {
    if (state.currentAudio) {
        try {
            state.currentAudio.pause();
            state.currentAudio.src = '';
        } catch (e) { }
        state.currentAudio = null;
    }
    setGlobalSpeakingUI(false);
}

function setGlobalSpeakingUI(isPlaying) {
    state.isAudioPlaying = isPlaying;
    document.querySelectorAll('.equalizer').forEach(eq => {
        eq.style.opacity = isPlaying ? '1' : '0.2';
    });
}

// ==============================================================================
// 3. AGENT 1: INTERVIEW ASSISTANT (NATALIE)
// ==============================================================================
function initInterviewAgent() {
    // Subject Pills Click
    document.querySelectorAll('.subject-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.subject-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            state.interview.subject = pill.dataset.subject;
            document.getElementById('interviewSelectedSubjectName').textContent = state.interview.subject;
        });
    });

    // Start Interview Button
    const startBtn = document.getElementById('btnStartInterview');
    if (startBtn) {
        startBtn.addEventListener('click', startInterview);
    }

    // Mic Record Button
    const recordBtn = document.getElementById('interviewRecordBtn');
    if (recordBtn) {
        recordBtn.addEventListener('click', toggleInterviewRecording);
    }

    // Submit Answer Button
    const submitBtn = document.getElementById('interviewSubmitAnswerBtn');
    if (submitBtn) {
        submitBtn.addEventListener('click', submitInterviewAnswer);
    }

    // End Interview Early Button
    const endBtn = document.getElementById('interviewEndEarlyBtn');
    if (endBtn) {
        endBtn.addEventListener('click', endInterviewAndShowFeedback);
    }

    // Restart Interview Button
    const restartBtn = document.getElementById('interviewRestartBtn');
    if (restartBtn) {
        restartBtn.addEventListener('click', resetInterviewUI);
    }
}

async function startInterview() {
    const setupCard = document.getElementById('interviewSetupState');
    const roomCard = document.getElementById('interviewRoomState');
    const feedbackCard = document.getElementById('interviewFeedbackState');
    const statusText = document.getElementById('interviewLiveStatus');

    setupCard.classList.add('hidden');
    feedbackCard.classList.add('hidden');
    roomCard.classList.remove('hidden');

    state.interview.questionNumber = 1;
    updateInterviewProgress(1);

    statusText.textContent = `Connecting to Natalie for ${state.interview.subject}...`;
    document.getElementById('interviewSubmitAnswerBtn').disabled = true;

    try {
        const response = await fetch('/api/interview/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject: state.interview.subject })
        });

        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);

        statusText.textContent = 'Natalie is speaking...';

        await playStreamingAudio(
            response,
            () => {
                statusText.textContent = 'Natalie is speaking Question 1...';
                document.getElementById('interviewNatalieBubble').classList.remove('hidden');
            },
            () => {
                statusText.textContent = 'Press the microphone to record your answer.';
                document.getElementById('interviewRecordBtn').disabled = false;
            }
        );
    } catch (err) {
        console.error('Failed to start interview:', err);
        statusText.textContent = `Connection error: ${err.message}. Please verify API keys in .env.`;
        document.getElementById('interviewRecordBtn').disabled = false;
    }
}

async function toggleInterviewRecording() {
    if (!state.interview.isRecording) {
        // Start recording
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
            const recorder = new MediaRecorder(stream, { mimeType });
            state.interview.recordedChunks = [];
            state.interview.mediaRecorder = recorder;

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) state.interview.recordedChunks.push(e.data);
            };

            recorder.onstop = () => {
                state.interview.recordedBlob = new Blob(state.interview.recordedChunks, { type: mimeType });
                stream.getTracks().forEach(t => t.stop());
            };

            recorder.start();
            state.interview.isRecording = true;

            // UI
            const recordBtn = document.getElementById('interviewRecordBtn');
            recordBtn.classList.add('bg-red-600', 'record-pulse');
            recordBtn.classList.remove('bg-indigo-600');
            document.getElementById('interviewRecordIcon').className = 'fas fa-stop text-lg';
            document.getElementById('interviewRecordLabel').textContent = 'Stop Recording';
            document.getElementById('interviewLiveStatus').textContent = 'Listening to your response...';

            // Timer
            state.interview.secondsElapsed = 0;
            const timerEl = document.getElementById('interviewTimerBadge');
            timerEl.classList.remove('hidden');
            state.interview.timerInterval = setInterval(() => {
                state.interview.secondsElapsed++;
                const mins = String(Math.floor(state.interview.secondsElapsed / 60)).padStart(2, '0');
                const secs = String(state.interview.secondsElapsed % 60).padStart(2, '0');
                timerEl.textContent = `${mins}:${secs}`;
            }, 1000);

        } catch (err) {
            console.error('Microphone error:', err);
            alert('Microphone access denied or unavailable. You can also type your answer in the text box below.');
        }
    } else {
        // Stop recording
        state.interview.isRecording = false;
        if (state.interview.mediaRecorder && state.interview.mediaRecorder.state !== 'inactive') {
            state.interview.mediaRecorder.stop();
        }
        clearInterval(state.interview.timerInterval);

        const recordBtn = document.getElementById('interviewRecordBtn');
        recordBtn.classList.remove('bg-red-600', 'record-pulse');
        recordBtn.classList.add('bg-indigo-600');
        document.getElementById('interviewRecordIcon').className = 'fas fa-microphone text-lg';
        document.getElementById('interviewRecordLabel').textContent = 'Re-record Answer';
        document.getElementById('interviewLiveStatus').textContent = 'Answer recorded. Ready to submit!';
        document.getElementById('interviewSubmitAnswerBtn').disabled = false;
    }
}

async function submitInterviewAnswer() {
    if (!state.interview.recordedBlob) {
        alert('Please record your voice response with the microphone before submitting.');
        return;
    }

    const submitBtn = document.getElementById('interviewSubmitAnswerBtn');
    submitBtn.disabled = true;
    const statusText = document.getElementById('interviewLiveStatus');
    statusText.textContent = 'Transcribing your voice with AssemblyAI & analyzing...';

    const formData = new FormData();
    formData.append('audio', state.interview.recordedBlob, 'answer.webm');

    try {
        const response = await fetch('/api/interview/submit-answer', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);

        const nextQNum = parseInt(response.headers.get('X-Question-Number') || (state.interview.questionNumber + 1));
        const isComplete = response.headers.get('X-Interview-Complete') === 'true' || nextQNum > 5;

        state.interview.questionNumber = nextQNum;
        updateInterviewProgress(nextQNum);

        // Clear previous recording
        state.interview.recordedBlob = null;
        state.interview.recordedChunks = [];
        document.getElementById('interviewTimerBadge').classList.add('hidden');

        await playStreamingAudio(
            response,
            () => {
                statusText.textContent = isComplete ? 'Natalie is wrapping up the interview...' : `Natalie is asking Question ${nextQNum}...`;
            },
            () => {
                if (isComplete) {
                    endInterviewAndShowFeedback();
                } else {
                    statusText.textContent = 'Press microphone to record your answer.';
                    document.getElementById('interviewRecordBtn').disabled = false;
                }
            }
        );
    } catch (err) {
        console.error('Submit error:', err);
        statusText.textContent = `Error: ${err.message}`;
        submitBtn.disabled = false;
    }
}

function updateInterviewProgress(qNum) {
    const capped = Math.min(qNum, 5);
    document.getElementById('interviewProgressLabel').textContent = `Question ${capped} of 5`;
    const pct = (capped / 5) * 100;
    document.getElementById('interviewProgressBar').style.width = `${pct}%`;
}

async function endInterviewAndShowFeedback() {
    stopCurrentAudio();
    const statusText = document.getElementById('interviewLiveStatus');
    statusText.textContent = 'Generating comprehensive feedback scorecard...';

    const roomCard = document.getElementById('interviewRoomState');
    const feedbackCard = document.getElementById('interviewFeedbackState');

    try {
        const response = await fetch('/api/interview/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        const fb = data.feedback || {};

        roomCard.classList.add('hidden');
        feedbackCard.classList.remove('hidden');

        document.getElementById('feedbackSubjectBadge').textContent = fb.subject || state.interview.subject;
        document.getElementById('feedbackScoreValue').textContent = `${fb.candidate_score || 4}/5`;
        document.getElementById('feedbackStrengthsText').textContent = fb.feedback || 'Good articulation of technical concepts and clear communication.';
        document.getElementById('feedbackImprovementsText').textContent = fb.areas_of_improvement || 'Practice expanding on system scaling challenges and algorithmic edge cases.';

    } catch (err) {
        console.error('Feedback error:', err);
        roomCard.classList.add('hidden');
        feedbackCard.classList.remove('hidden');
        document.getElementById('feedbackScoreValue').textContent = '4/5';
        document.getElementById('feedbackStrengthsText').textContent = 'Good answers provided throughout the session.';
        document.getElementById('feedbackImprovementsText').textContent = 'Keep practicing with varied mock interview scenarios.';
    }
}

function resetInterviewUI() {
    stopCurrentAudio();
    document.getElementById('interviewFeedbackState').classList.add('hidden');
    document.getElementById('interviewRoomState').classList.add('hidden');
    document.getElementById('interviewSetupState').classList.remove('hidden');
    state.interview.questionNumber = 1;
    state.interview.recordedBlob = null;
}

// ==============================================================================
// 4. AGENT 2: BEDTIME STORYTELLER (LUNA)
// ==============================================================================
function initStoryAgent() {
    // Generate Story Button
    const genBtn = document.getElementById('btnGenerateStory');
    if (genBtn) {
        genBtn.addEventListener('click', startBedtimeStory);
    }

    // Continue Story Button (Part 2)
    const contBtn = document.getElementById('btnContinueStory');
    if (contBtn) {
        contBtn.addEventListener('click', continueBedtimeStory);
    }

    // Create New Story Button
    const newBtn = document.getElementById('btnNewStory');
    if (newBtn) {
        newBtn.addEventListener('click', () => {
            stopCurrentAudio();
            document.getElementById('storySanctuaryState').classList.add('hidden');
            document.getElementById('storySetupState').classList.remove('hidden');
        });
    }

    // Quick interest suggestion tags
    document.querySelectorAll('.story-tag').forEach(tag => {
        tag.addEventListener('click', () => {
            const input = document.getElementById('storyInterestsInput');
            if (input.value) {
                input.value += `, ${tag.textContent.trim()}`;
            } else {
                input.value = tag.textContent.trim();
            }
        });
    });
}

async function startBedtimeStory() {
    const childName = document.getElementById('storyChildNameInput').value.trim() || 'Little One';
    const age = document.getElementById('storyAgeSelect').value || '5';
    const interests = document.getElementById('storyInterestsInput').value.trim() || 'magical forest animals and stars';
    const lesson = document.getElementById('storyLessonSelect').value || 'kindness and bravery';

    state.story.childName = childName;
    state.story.age = age;
    state.story.interests = interests;
    state.story.lesson = lesson;
    state.story.part = 1;

    document.getElementById('storySetupState').classList.add('hidden');
    const sanctuary = document.getElementById('storySanctuaryState');
    sanctuary.classList.remove('hidden');

    document.getElementById('storyHeroBadge').textContent = `${childName}'s Adventure`;
    document.getElementById('storyLessonBadge').textContent = `Theme: ${lesson}`;
    document.getElementById('storyPartBadge').textContent = 'Part 1: The Journey Begins';
    document.getElementById('storyLiveStatus').textContent = `Luna is weaving a bedtime story for ${childName}...`;
    document.getElementById('storyBookText').textContent = 'Luna is preparing the enchanted story...';
    document.getElementById('btnContinueStory').classList.add('hidden');

    try {
        const response = await fetch('/api/story/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                child_name: childName,
                age: age,
                interests: interests,
                lesson: lesson
            })
        });

        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);

        // Extract story text from custom header
        const encodedText = response.headers.get('X-Story-Text');
        if (encodedText) {
            try {
                const decoded = decodeURIComponent(escape(atob(encodedText)));
                document.getElementById('storyBookText').textContent = decoded;
            } catch (e) {
                console.warn('Decode story text fallback', e);
            }
        }

        await playStreamingAudio(
            response,
            () => {
                document.getElementById('storyLiveStatus').textContent = 'Luna is narrating... Close your eyes and listen.';
            },
            () => {
                document.getElementById('storyLiveStatus').textContent = 'Story complete! Ready for Part 2?';
                document.getElementById('btnContinueStory').classList.remove('hidden');
            }
        );
    } catch (err) {
        console.error('Story start error:', err);
        document.getElementById('storyLiveStatus').textContent = `Error: ${err.message}`;
    }
}

async function continueBedtimeStory() {
    const contBtn = document.getElementById('btnContinueStory');
    contBtn.disabled = true;
    document.getElementById('storyLiveStatus').textContent = 'Luna is weaving Part 2 (The Next Night)...';

    try {
        const response = await fetch('/api/story/continue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });

        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);

        const encodedText = response.headers.get('X-Story-Text');
        if (encodedText) {
            try {
                const decoded = decodeURIComponent(escape(atob(encodedText)));
                const currentText = document.getElementById('storyBookText').textContent;
                document.getElementById('storyBookText').innerHTML = `
                    <div class="mb-6">${currentText}</div>
                    <div class="border-t border-purple-500/20 pt-6">
                        <span class="text-xs uppercase tracking-widest text-amber-400 font-semibold mb-2 block">Part 2: The Next Night</span>
                        <div>${decoded}</div>
                    </div>
                `;
                document.getElementById('storyPartBadge').textContent = 'Part 2: The Sweetest Dreams';
            } catch (e) { }
        }

        await playStreamingAudio(
            response,
            () => {
                document.getElementById('storyLiveStatus').textContent = 'Luna is narrating Chapter 2...';
            },
            () => {
                document.getElementById('storyLiveStatus').textContent = 'Story fully complete. Sweet dreams!';
                contBtn.classList.add('hidden');
            }
        );
    } catch (err) {
        console.error('Story continuation error:', err);
        document.getElementById('storyLiveStatus').textContent = `Error: ${err.message}`;
        contBtn.disabled = false;
    }
}

// ==============================================================================
// 5. AGENT 3: LANGUAGE COACH (NANCY)
// ==============================================================================
function initLanguageAgent() {
    // Language card selection
    document.querySelectorAll('.lang-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.lang-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            state.language.currentLang = card.dataset.language;
            document.getElementById('langSelectedBadge').textContent = state.language.currentLang;
        });
    });

    // Scenario pill selection
    document.querySelectorAll('.scenario-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.scenario-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            state.language.scenario = pill.dataset.scenario;
            document.getElementById('scenarioSelectedBadge').textContent = state.language.scenario;
        });
    });

    // Begin Session Button
    const beginBtn = document.getElementById('btnStartLangSession');
    if (beginBtn) {
        beginBtn.addEventListener('click', startLanguageSession);
    }

    // Mic Record Button
    const recordBtn = document.getElementById('langRecordBtn');
    if (recordBtn) {
        recordBtn.addEventListener('click', toggleLanguageRecording);
    }

    // Submit Response Button
    const submitBtn = document.getElementById('langSubmitResponseBtn');
    if (submitBtn) {
        submitBtn.addEventListener('click', submitLanguageResponse);
    }

    // End Session Early Button
    const endBtn = document.getElementById('langEndEarlyBtn');
    if (endBtn) {
        endBtn.addEventListener('click', endLanguageAndShowAssessment);
    }

    // New Session Button
    const restartBtn = document.getElementById('langRestartBtn');
    if (restartBtn) {
        restartBtn.addEventListener('click', resetLanguageUI);
    }
}

async function startLanguageSession() {
    document.getElementById('langSetupState').classList.add('hidden');
    document.getElementById('langAssessmentState').classList.add('hidden');
    const room = document.getElementById('langRoomState');
    room.classList.remove('hidden');

    state.language.exchangeNumber = 1;
    updateLanguageProgress(1);

    document.getElementById('langActiveBadge').textContent = `${state.language.currentLang} • ${state.language.scenario}`;
    const statusText = document.getElementById('langLiveStatus');
    statusText.textContent = `Connecting with Nancy for ${state.language.currentLang} practice...`;
    document.getElementById('langSubmitResponseBtn').disabled = true;

    try {
        const response = await fetch('/api/language/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                language: state.language.currentLang,
                scenario: state.language.scenario
            })
        });

        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);

        await playStreamingAudio(
            response,
            () => {
                statusText.textContent = `Nancy is speaking in ${state.language.currentLang}...`;
            },
            () => {
                statusText.textContent = `Press microphone to reply in ${state.language.currentLang}.`;
                document.getElementById('langRecordBtn').disabled = false;
            }
        );
    } catch (err) {
        console.error('Language start error:', err);
        statusText.textContent = `Error: ${err.message}. Please check credentials in .env.`;
        document.getElementById('langRecordBtn').disabled = false;
    }
}

async function toggleLanguageRecording() {
    if (!state.language.isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
            const recorder = new MediaRecorder(stream, { mimeType });
            state.language.recordedChunks = [];
            state.language.mediaRecorder = recorder;

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) state.language.recordedChunks.push(e.data);
            };

            recorder.onstop = () => {
                state.language.recordedBlob = new Blob(state.language.recordedChunks, { type: mimeType });
                stream.getTracks().forEach(t => t.stop());
            };

            recorder.start();
            state.language.isRecording = true;

            const recordBtn = document.getElementById('langRecordBtn');
            recordBtn.classList.add('bg-red-600', 'record-pulse');
            recordBtn.classList.remove('bg-pink-600');
            document.getElementById('langRecordIcon').className = 'fas fa-stop text-lg';
            document.getElementById('langRecordLabel').textContent = 'Stop Recording';
            document.getElementById('langLiveStatus').textContent = `Listening to your response in ${state.language.currentLang}...`;

            state.language.secondsElapsed = 0;
            const timerEl = document.getElementById('langTimerBadge');
            timerEl.classList.remove('hidden');
            state.language.timerInterval = setInterval(() => {
                state.language.secondsElapsed++;
                const mins = String(Math.floor(state.language.secondsElapsed / 60)).padStart(2, '0');
                const secs = String(state.language.secondsElapsed % 60).padStart(2, '0');
                timerEl.textContent = `${mins}:${secs}`;
            }, 1000);

        } catch (err) {
            console.error('Microphone error:', err);
            alert('Microphone access denied. You can type your response below instead.');
        }
    } else {
        state.language.isRecording = false;
        if (state.language.mediaRecorder && state.language.mediaRecorder.state !== 'inactive') {
            state.language.mediaRecorder.stop();
        }
        clearInterval(state.language.timerInterval);

        const recordBtn = document.getElementById('langRecordBtn');
        recordBtn.classList.remove('bg-red-600', 'record-pulse');
        recordBtn.classList.add('bg-pink-600');
        document.getElementById('langRecordIcon').className = 'fas fa-microphone text-lg';
        document.getElementById('langRecordLabel').textContent = 'Re-record Response';
        document.getElementById('langLiveStatus').textContent = 'Response recorded! Ready to send.';
        document.getElementById('langSubmitResponseBtn').disabled = false;
    }
}

async function submitLanguageResponse() {
    if (!state.language.recordedBlob) {
        alert('Please record your voice response with the microphone before submitting.');
        return;
    }

    const submitBtn = document.getElementById('langSubmitResponseBtn');
    submitBtn.disabled = true;
    const statusText = document.getElementById('langLiveStatus');
    statusText.textContent = 'Transcribing your voice with AssemblyAI & analyzing...';

    const formData = new FormData();
    formData.append('audio', state.language.recordedBlob, 'response.webm');

    try {
        const response = await fetch('/api/language/submit-response', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);

        const nextExchange = parseInt(response.headers.get('X-Exchange-Number') || (state.language.exchangeNumber + 1));
        const isComplete = response.headers.get('X-Session-Complete') === 'true' || nextExchange > 5;

        state.language.exchangeNumber = nextExchange;
        updateLanguageProgress(nextExchange);

        state.language.recordedBlob = null;
        state.language.recordedChunks = [];
        document.getElementById('langTimerBadge').classList.add('hidden');

        await playStreamingAudio(
            response,
            () => {
                statusText.textContent = isComplete ? 'Nancy is wrapping up the session...' : `Nancy is responding (Exchange ${nextExchange})...`;
            },
            () => {
                if (isComplete) {
                    endLanguageAndShowAssessment();
                } else {
                    statusText.textContent = `Press microphone to reply in ${state.language.currentLang}.`;
                    document.getElementById('langRecordBtn').disabled = false;
                }
            }
        );
    } catch (err) {
        console.error('Submit language error:', err);
        statusText.textContent = `Error: ${err.message}`;
        submitBtn.disabled = false;
    }
}

function updateLanguageProgress(exchangeNum) {
    const capped = Math.min(exchangeNum, 5);
    document.getElementById('langProgressLabel').textContent = `Exchange ${capped} of 5`;
    const pct = (capped / 5) * 100;
    document.getElementById('langProgressBar').style.width = `${pct}%`;
}

async function endLanguageAndShowAssessment() {
    stopCurrentAudio();
    const statusText = document.getElementById('langLiveStatus');
    statusText.textContent = 'Compiling fluency & grammar evaluation...';

    const roomCard = document.getElementById('langRoomState');
    const assessmentCard = document.getElementById('langAssessmentState');

    try {
        const response = await fetch('/api/language/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        const fb = data.feedback || {};

        roomCard.classList.add('hidden');
        assessmentCard.classList.remove('hidden');

        document.getElementById('assessFluencyScore').textContent = `${fb.fluency_score || 8}/10`;
        document.getElementById('assessGrammarScore').textContent = `${fb.grammar_accuracy || 8}/10`;
        document.getElementById('assessVocabRange').textContent = (fb.vocabulary_range || 'Moderate').toUpperCase();
        document.getElementById('assessTipText').textContent = fb.conversation_tip || 'Keep practicing natural colloquial transitions and listening to native dialogues.';

        // Render mistakes table
        const tbody = document.getElementById('assessMistakesTbody');
        tbody.innerHTML = '';
        const mistakes = fb.grammar_mistakes || [];
        if (mistakes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="px-4 py-3 text-center text-gray-400">No major grammar errors detected! Excellent fluency.</td></tr>`;
        } else {
            mistakes.forEach(m => {
                const tr = document.createElement('tr');
                tr.className = 'border-b border-white/5';
                tr.innerHTML = `
                    <td class="px-4 py-3 text-red-400 text-sm font-mono">${m.said || '-'}</td>
                    <td class="px-4 py-3 text-green-400 text-sm font-mono">${m.correct || '-'}</td>
                    <td class="px-4 py-3 text-gray-300 text-sm">${m.rule || '-'}</td>
                `;
                tbody.appendChild(tr);
            });
        }

        // Render new words
        const wordsContainer = document.getElementById('assessNewWordsContainer');
        wordsContainer.innerHTML = '';
        const words = fb.new_words_to_learn || [];
        words.forEach(word => {
            const span = document.createElement('span');
            span.className = 'px-3 py-1 bg-pink-500/10 border border-pink-500/20 text-pink-300 rounded-full text-xs font-medium';
            span.textContent = word;
            wordsContainer.appendChild(span);
        });

    } catch (err) {
        console.error('Language feedback error:', err);
        roomCard.classList.add('hidden');
        assessmentCard.classList.remove('hidden');
        document.getElementById('assessFluencyScore').textContent = '8/10';
        document.getElementById('assessGrammarScore').textContent = '8/10';
        document.getElementById('assessTipText').textContent = 'Practice speaking daily with conversational partners.';
    }
}

function resetLanguageUI() {
    stopCurrentAudio();
    document.getElementById('langAssessmentState').classList.add('hidden');
    document.getElementById('langRoomState').classList.add('hidden');
    document.getElementById('langSetupState').classList.remove('hidden');
    state.language.exchangeNumber = 1;
    state.language.recordedBlob = null;
}

// ==============================================================================
// 6. HEALTH CHECK & BOOTSTRAP
// ==============================================================================
async function checkSystemHealth() {
    try {
        const res = await fetch('/health');
        if (res.ok) {
            document.getElementById('systemStatusPill').innerHTML = `
                <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>System Online • 3 Agents Ready</span>
            `;
        }
    } catch (e) {
        document.getElementById('systemStatusPill').innerHTML = `
            <span class="w-2 h-2 rounded-full bg-amber-400"></span>
            <span>Running Local Offline</span>
        `;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Nav tabs listeners
    document.querySelectorAll('.agent-nav-tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Quick launch buttons in overview
    document.querySelectorAll('[data-launch-agent]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = e.currentTarget.dataset.launchAgent;
            switchTab(target);
        });
    });

    initInterviewAgent();
    initStoryAgent();
    initLanguageAgent();
    checkSystemHealth();
});
