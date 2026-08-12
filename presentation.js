const scenes = [...document.querySelectorAll('.scene')];
const stage = document.getElementById('stage');
const stageSize = { width: 1600, height: 900 };
const params = new URLSearchParams(location.search);
const isPreview = params.has('preview');
const requested = Number.parseInt(location.hash.replace('#', ''), 10);
const requestedStep = Number.parseInt(params.get('step'), 10);

let idx = !Number.isNaN(requested) && requested >= 1 && requested <= scenes.length ? requested - 1 : 0;
let step = !Number.isNaN(requestedStep) && requestedStep >= 0 ? requestedStep : 0;

const phase = document.getElementById('phase');
const count = document.getElementById('count');
const syncChannel = !isPreview && 'BroadcastChannel' in window
  ? new BroadcastChannel('lost-in-translation-presenter')
  : null;
const processedCommandIds = new Set();
let presenterWindow = null;
let presenterPort = null;

function fitStage() {
  const scale = Math.max(0.01, Math.min(
    window.innerWidth / stageSize.width,
    window.innerHeight / stageSize.height,
  ));
  stage.style.setProperty('--stage-scale', scale);
}

window.addEventListener('resize', fitStage, { passive: true });
window.visualViewport?.addEventListener('resize', fitStage, { passive: true });
fitStage();

function fragments() {
  return [...scenes[idx].querySelectorAll('.fragment')];
}

function state() {
  return {
    type: 'state',
    idx,
    step,
    sceneCount: scenes.length,
    fragmentCount: fragments().length,
    phase: scenes[idx].dataset.phase || '',
    title: scenes[idx].querySelector('.scene-title')?.textContent.trim()
      || scenes[idx].querySelector('h1, h2')?.textContent.trim()
      || `Scene ${idx + 1}`,
  };
}

function publishState() {
  if (isPreview) return;
  const currentState = state();
  try {
    presenterPort?.postMessage(currentState);
  } catch (_) {
    presenterPort = null;
  }
  syncChannel?.postMessage(currentState);
  try {
    localStorage.setItem('lost-in-translation-state', JSON.stringify({
      ...currentState,
      updatedAt: Date.now(),
    }));
  } catch (_) {
    // Direct window communication and BroadcastChannel still work when storage is unavailable.
  }
}

function render({ publish = true } = {}) {
  scenes.forEach((scene, sceneIndex) => scene.classList.toggle('active', sceneIndex === idx));
  const sceneFragments = fragments();
  step = Math.max(0, Math.min(step, sceneFragments.length));
  sceneFragments.forEach((fragment, fragmentIndex) => fragment.classList.toggle('visible', fragmentIndex < step));

  phase.textContent = scenes[idx].dataset.phase || '';
  count.textContent = `${String(idx + 1).padStart(2, '0')} / ${String(scenes.length).padStart(2, '0')}`;

  const progress = scenes.length > 1 ? idx / (scenes.length - 1) : 1;
  document.getElementById('m1').style.setProperty('--v', `${Math.min(100, 20 + progress * 80)}%`);
  document.getElementById('m2').style.setProperty('--v', `${Math.min(100, progress * 105)}%`);
  document.getElementById('m3').style.setProperty('--v', `${Math.max(0, (progress - 0.35) * 145)}%`);

  if (publish) publishState();
}

function next() {
  const sceneFragments = fragments();
  if (step < sceneFragments.length) {
    step += 1;
    render();
    return;
  }
  if (idx < scenes.length - 1) {
    idx += 1;
    step = 0;
    render();
  }
}

function prev() {
  if (step > 0) {
    step -= 1;
    render();
    return;
  }
  if (idx > 0) {
    idx -= 1;
    step = fragments().length;
    render();
  }
}

function jump(delta) {
  const target = Math.max(0, Math.min(scenes.length - 1, idx + delta));
  if (target === idx) return;
  idx = target;
  step = fragments().length;
  render();
}

function goTo(sceneIndex, fragmentStep = 0) {
  idx = Math.max(0, Math.min(scenes.length - 1, sceneIndex));
  step = fragmentStep;
  render();
}

function runCommand(command) {
  if (!command || typeof command.action !== 'string') return;
  if (command.commandId) {
    if (processedCommandIds.has(command.commandId)) return;
    processedCommandIds.add(command.commandId);
    if (processedCommandIds.size > 100) {
      processedCommandIds.delete(processedCommandIds.values().next().value);
    }
  }
  if (command.action === 'next') next();
  if (command.action === 'prev') prev();
  if (command.action === 'jump') jump(command.delta || 0);
  if (command.action === 'goto') goTo(command.idx, command.step || 0);
  if (command.action === 'request-state') publishState();
  if (command.action === 'fullscreen') document.documentElement.requestFullscreen?.();
}

function openPresenter() {
  presenterWindow = window.open('presenter.html', 'lost-in-translation-presenter');
  presenterWindow?.focus();
  connectPresenter(presenterWindow);
}

function connectPresenter(targetWindow) {
  if (!targetWindow || targetWindow.closed || !('MessageChannel' in window)) return;

  presenterPort?.close();
  const connection = new MessageChannel();
  presenterPort = connection.port1;
  presenterPort.addEventListener('message', (event) => runCommand(event.data));
  presenterPort.start();

  try {
    targetWindow.postMessage(
      { type: 'lost-in-translation-presenter-connect' },
      '*',
      [connection.port2],
    );
    presenterPort.postMessage(state());
  } catch (_) {
    presenterPort.close();
    presenterPort = null;
  }
}

window.presentationController = {
  runCommand,
  getState: state,
  openPresenter,
};

if (isPreview) {
  document.body.classList.add('preview-mode');
  window.addEventListener('message', (event) => {
    if (event.data?.type !== 'preview-state') return;
    idx = Math.max(0, Math.min(scenes.length - 1, event.data.idx));
    step = event.data.step || 0;
    render({ publish: false });
  });
} else {
  window.addEventListener('message', (event) => {
    if (event.data?.type !== 'lost-in-translation-presenter-ready') return;
    presenterWindow = event.source;
    connectPresenter(presenterWindow);
  });

  syncChannel?.addEventListener('message', (event) => runCommand(event.data));
  window.addEventListener('storage', (event) => {
    if (event.key !== 'lost-in-translation-command' || !event.newValue) return;
    try {
      runCommand(JSON.parse(event.newValue));
    } catch (_) {
      // Ignore malformed state left by another page.
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.shiftKey && event.key === 'ArrowRight') {
      event.preventDefault();
      jump(1);
      return;
    }
    if (event.shiftKey && event.key === 'ArrowLeft') {
      event.preventDefault();
      jump(-1);
      return;
    }
    if (['ArrowRight', ' ', 'PageDown'].includes(event.key)) {
      event.preventDefault();
      next();
    }
    if (['ArrowLeft', 'PageUp'].includes(event.key)) {
      event.preventDefault();
      prev();
    }
    if (event.key.toLowerCase() === 'f') document.documentElement.requestFullscreen?.();
    if (event.key.toLowerCase() === 'p') openPresenter();
  });

  stage.addEventListener('click', (event) => {
    if (event.target.tagName !== 'BUTTON') next();
  });
}

let timer = null;
let secs = 300;
const timerText = document.getElementById('timerText');
const timerButton = document.getElementById('timerBtn');

timerButton.addEventListener('click', (event) => {
  event.stopPropagation();
  if (timer) {
    clearInterval(timer);
    timer = null;
    timerButton.textContent = 'Resume Timer';
    return;
  }
  timerButton.textContent = 'Pause Timer';
  timer = setInterval(() => {
    secs -= 1;
    timerText.textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    if (secs <= 0) {
      clearInterval(timer);
      timer = null;
      timerButton.textContent = 'Complete';
    }
  }, 1000);
});

const prompts = [
  'Which question would you ask first to clarify this signal?',
  'Have you described the outcome or only the implementation?',
  'Is the ask concrete?',
  'Does this audience share your context?',
  'Where should this signal appear again?',
];
let promptIndex = 0;
setInterval(() => {
  const promptBar = document.getElementById('promptBar');
  if (!promptBar) return;
  promptIndex = (promptIndex + 1) % prompts.length;
  promptBar.textContent = prompts[promptIndex];
}, 12000);

if (params.get('all') === '1') step = fragments().length;
render();
