const notes = window.SPEAKER_NOTES || [];
const channel = 'BroadcastChannel' in window
  ? new BroadcastChannel('lost-in-translation-presenter')
  : null;
let audiencePort = null;

const elements = {
  connection: document.getElementById('connection'),
  phase: document.getElementById('phase'),
  scenePosition: document.getElementById('scenePosition'),
  buildPosition: document.getElementById('buildPosition'),
  currentPreview: document.getElementById('currentPreview'),
  nextPreview: document.getElementById('nextPreview'),
  nextPreviewFrame: document.getElementById('nextPreviewFrame'),
  nextTitle: document.getElementById('nextTitle'),
  missionComplete: document.getElementById('missionComplete'),
  notesTitle: document.getElementById('notesTitle'),
  notesPurpose: document.getElementById('notesPurpose'),
  notesContent: document.getElementById('notesContent'),
  elapsed: document.getElementById('elapsed'),
  clockToggle: document.getElementById('clockToggle'),
  clockReset: document.getElementById('clockReset'),
};

let currentState = {
  idx: 0,
  step: 0,
  sceneCount: notes.length || 18,
  fragmentCount: 0,
  phase: 'MISSION BRIEFING',
};
let lastAudienceUpdate = 0;
let elapsedSeconds = 0;
let clock = null;

function audienceController() {
  try {
    return window.opener?.presentationController || null;
  } catch (_) {
    return null;
  }
}

function sendCommand(action, detail = {}) {
  const command = {
    type: 'command',
    action,
    ...detail,
    sentAt: Date.now(),
    commandId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  };
  if (audiencePort) {
    try {
      audiencePort.postMessage(command);
      return;
    } catch (_) {
      audiencePort = null;
    }
  }

  const directController = audienceController();
  if (directController) {
    directController.runCommand(command);
    acceptState(directController.getState());
    return;
  }

  channel?.postMessage(command);
  try {
    localStorage.setItem('lost-in-translation-command', JSON.stringify(command));
  } catch (_) {
    // BroadcastChannel remains the primary path when storage is unavailable.
  }
}

function sendPreview(frame, idx, step) {
  frame.contentWindow?.postMessage({ type: 'preview-state', idx, step }, '*');
}

function addNoteBlock(label, text, className = '') {
  if (!text) return;
  const block = document.createElement('div');
  block.className = `note-block ${className}`.trim();
  const heading = document.createElement('span');
  heading.textContent = label;
  const copy = document.createElement('p');
  copy.textContent = text;
  block.append(heading, copy);
  elements.notesContent.append(block);
}

function renderNotes(sceneIndex) {
  const sceneNotes = notes[sceneIndex] || {
    title: `Scene ${sceneIndex + 1}`,
    purpose: '',
    beats: ['No speaker notes have been added for this scene.'],
  };

  elements.notesTitle.textContent = sceneNotes.title;
  elements.notesPurpose.textContent = sceneNotes.purpose || '';
  elements.notesContent.replaceChildren();

  if (sceneNotes.prompt) addNoteBlock('Audience prompt', sceneNotes.prompt, 'prompt-note');

  if (sceneNotes.beats?.length) {
    const beats = document.createElement('div');
    beats.className = 'note-block beat-note';
    const heading = document.createElement('span');
    heading.textContent = 'Talk track';
    const list = document.createElement('ul');
    sceneNotes.beats.forEach((beat) => {
      const item = document.createElement('li');
      item.textContent = beat;
      list.append(item);
    });
    beats.append(heading, list);
    elements.notesContent.append(beats);
  }

  addNoteBlock('Land this idea', sceneNotes.emphasis, 'emphasis-note');
  addNoteBlock('Transition', sceneNotes.transition, 'transition-note');
  elements.notesContent.scrollTop = 0;
}

function acceptState(nextState) {
  if (nextState?.type !== 'state') return;
  currentState = { ...currentState, ...nextState };
  lastAudienceUpdate = Date.now();
  render();
}

function render() {
  const { idx, step, sceneCount, fragmentCount, phase } = currentState;
  const nextIndex = idx + 1;
  const isComplete = nextIndex >= sceneCount;

  elements.phase.textContent = phase;
  elements.scenePosition.textContent = `${String(idx + 1).padStart(2, '0')} / ${String(sceneCount).padStart(2, '0')}`;
  elements.buildPosition.textContent = `Build ${step} / ${fragmentCount}`;
  elements.nextTitle.textContent = isComplete ? 'End of presentation' : notes[nextIndex]?.title || `Scene ${nextIndex + 1}`;
  elements.nextPreviewFrame.classList.toggle('complete', isComplete);
  elements.missionComplete.hidden = !isComplete;
  elements.nextPreview.hidden = isComplete;

  renderNotes(idx);
  sendPreview(elements.currentPreview, idx, step);
  if (!isComplete) sendPreview(elements.nextPreview, nextIndex, 0);
}

function updateConnection() {
  const connected = Date.now() - lastAudienceUpdate < 4500;
  elements.connection.classList.toggle('waiting', !connected);
  elements.connection.classList.toggle('connected', connected);
  elements.connection.lastChild.textContent = connected ? ' Audience connected' : ' Connecting to audience';
}

function formatElapsed(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function renderClock() {
  elements.elapsed.textContent = formatElapsed(elapsedSeconds);
  elements.clockToggle.textContent = clock ? 'Pause' : elapsedSeconds > 0 ? 'Resume' : 'Start';
}

function toggleClock() {
  if (clock) {
    clearInterval(clock);
    clock = null;
  } else {
    clock = setInterval(() => {
      elapsedSeconds += 1;
      renderClock();
    }, 1000);
  }
  renderClock();
}

function resetClock() {
  if (clock) {
    clearInterval(clock);
    clock = null;
  }
  elapsedSeconds = 0;
  renderClock();
}

channel?.addEventListener('message', (event) => acceptState(event.data));
window.addEventListener('message', (event) => {
  if (event.data?.type !== 'lost-in-translation-presenter-connect' || !event.ports[0]) return;

  audiencePort?.close();
  audiencePort = event.ports[0];
  audiencePort.addEventListener('message', (portEvent) => acceptState(portEvent.data));
  audiencePort.start();
  sendCommand('request-state');
});
window.addEventListener('storage', (event) => {
  if (event.key !== 'lost-in-translation-state' || !event.newValue) return;
  try {
    acceptState(JSON.parse(event.newValue));
  } catch (_) {
    // Ignore malformed state left by another page.
  }
});

elements.currentPreview.addEventListener('load', render);
elements.nextPreview.addEventListener('load', render);
document.getElementById('previousBuild').addEventListener('click', () => sendCommand('prev'));
document.getElementById('nextBuild').addEventListener('click', () => sendCommand('next'));
document.getElementById('previousScene').addEventListener('click', () => sendCommand('jump', { delta: -1 }));
document.getElementById('nextScene').addEventListener('click', () => sendCommand('jump', { delta: 1 }));
elements.clockToggle.addEventListener('click', toggleClock);
elements.clockReset.addEventListener('click', resetClock);

document.addEventListener('keydown', (event) => {
  if (event.shiftKey && event.key === 'ArrowRight') {
    event.preventDefault();
    sendCommand('jump', { delta: 1 });
    return;
  }
  if (event.shiftKey && event.key === 'ArrowLeft') {
    event.preventDefault();
    sendCommand('jump', { delta: -1 });
    return;
  }
  if (['ArrowRight', ' ', 'PageDown'].includes(event.key)) {
    event.preventDefault();
    sendCommand('next');
  }
  if (['ArrowLeft', 'PageUp'].includes(event.key)) {
    event.preventDefault();
    sendCommand('prev');
  }
  if (event.key.toLowerCase() === 't') toggleClock();
});

try {
  const storedState = JSON.parse(localStorage.getItem('lost-in-translation-state'));
  if (storedState) acceptState(storedState);
} catch (_) {
  // The audience will provide fresh state.
}

const directController = audienceController();
if (directController) acceptState(directController.getState());
try {
  window.opener?.postMessage({ type: 'lost-in-translation-presenter-ready' }, '*');
} catch (_) {
  // The other synchronization paths can still connect the windows.
}
sendCommand('request-state');
setInterval(() => {
  sendCommand('request-state');
  updateConnection();
}, 2000);
render();
renderClock();
updateConnection();
