// ============================================
// DORYPHOROS — Combat Arms Performance System
// Application Logic (renderer process)
// ============================================

(function () {
  'use strict';

  // --- STATE ---
  let selectedProvider = 'anthropic';
  let generatedResponse = '';
  let scheduleData = [];

  // --- PROVIDER CONFIG ---
  const PROVIDERS = {
    anthropic: {
      name: 'Claude',
      model: 'claude-opus-4-6',
      url: 'https://api.anthropic.com/v1/messages',
    },
    openai: {
      name: 'ChatGPT',
      model: 'gpt-4o',
      url: 'https://api.openai.com/v1/chat/completions',
    },
    google: {
      name: 'Gemini',
      model: 'gemini-1.5-pro',
      url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent',
    },
    xai: {
      name: 'Grok',
      model: 'grok-2',
      url: 'https://api.x.ai/v1/chat/completions',
    },
    deepseek: {
      name: 'DeepSeek',
      model: 'deepseek-chat',
      url: 'https://api.deepseek.com/v1/chat/completions',
    },
  };

  // --- INIT ---
  async function init() {
    setupTabs();
    setupProviderCards();
    setupCollapsibleSections();
    setupPromptToggle();
    setupFormProgress();
    setupGenerateButton();
    setupConnectionTest();
    setupCalendarControls();
    setDefaultStartDate();
    await restoreSettings();
    updateGenerateButton();
    document.getElementById('system-prompt-display').textContent = getSystemPrompt();
  }

  // --- TAB NAVIGATION ---
  function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      });
    });
  }

  // --- PROVIDER CARDS ---
  function setupProviderCards() {
    document.querySelectorAll('.provider-card').forEach((card) => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.provider-card').forEach((c) => c.classList.remove('active'));
        card.classList.add('active');
        selectedProvider = card.dataset.provider;
        const override = document.getElementById('model-override');
        override.placeholder = PROVIDERS[selectedProvider].model;
        window.electronAPI.setStore('provider', selectedProvider);
        updateGenerateButton();
      });
    });
  }

  // --- COLLAPSIBLE SECTIONS ---
  function setupCollapsibleSections() {
    document.querySelectorAll('.section-header[data-section]').forEach((header) => {
      header.addEventListener('click', () => {
        const sectionId = header.dataset.section;
        const body = document.getElementById(sectionId + '-body');
        header.classList.toggle('collapsed');
        body.classList.toggle('collapsed');
      });
    });
  }

  // --- SYSTEM PROMPT TOGGLE ---
  function setupPromptToggle() {
    const toggle = document.getElementById('prompt-toggle');
    const viewer = document.getElementById('prompt-viewer');
    toggle.addEventListener('click', () => {
      viewer.classList.toggle('open');
      toggle.textContent = viewer.classList.contains('open')
        ? 'VIEW SYSTEM PROMPT ▲'
        : 'VIEW SYSTEM PROMPT ▼';
    });
  }

  // --- FORM PROGRESS ---
  function setupFormProgress() {
    const sectionFields = {
      s01: ['age', 'bodyweight', 'height', 'duty-status', 'ops-tempo', 'training-days', 'session-length', 'equipment', 'sleep'],
      s02: ['dl-load', 'dl-variant', 'dl-reps', 'sq-load', 'sq-variant', 'sq-reps', 'bp-load', 'bp-variant', 'bp-reps', 'ohp-load', 'ohp-variant', 'ohp-reps', 'pullup-max', 'farmers-load', 'sandbag-load', 'grip-strength', 'zercher-load', 'log-press', 'training-age', 'odd-objects'],
      s03: ['two-mile', 'five-mile', 'weekly-miles', 'sprint-40', 'sprint-200', 'sprint-400', 'run-phase', 'sprint-exp'],
      s04: ['ruck-load', 'ruck-dist', 'ruck-pace', 'ruck-longest', 'ruck-max', 'ruck-exp'],
      s05: ['aft-deadlift', 'aft-pushups', 'aft-throw', 'aft-sdc', 'aft-ltk', 'aft-run', 'aft-score', 'aft-date'],
      s06: ['current-injuries', 'past-injuries', 'movement-restrictions', 'profile-status'],
      s07: ['primary-goal', 'timeline', 'event-date', 'body-comp', 'additional-context'],
    };

    function updateProgress() {
      let filled = 0;
      const total = 7;
      for (const [, fields] of Object.entries(sectionFields)) {
        let sectionHasData = false;
        for (const fid of fields) {
          const el = document.getElementById(fid);
          if (el && el.value && el.value.trim() !== '') {
            sectionHasData = true;
            break;
          }
        }
        if (sectionHasData) filled++;
      }
      const pct = Math.round((filled / total) * 100);
      document.getElementById('intake-progress-fill').style.width = pct + '%';
      document.getElementById('intake-progress-text').textContent = filled + ' / ' + total;
    }

    // Listen for input on all intake fields
    document.querySelectorAll('#tab-intake input, #tab-intake select, #tab-intake textarea').forEach((el) => {
      el.addEventListener('input', updateProgress);
      el.addEventListener('change', updateProgress);
    });
  }

  // --- GENERATE BUTTON ---
  function setupGenerateButton() {
    document.getElementById('btn-generate').addEventListener('click', generateProgram);

    // API key saves on input
    const keyInput = document.getElementById('api-key');
    keyInput.addEventListener('input', () => {
      window.electronAPI.setStore('apiKey_' + selectedProvider, keyInput.value);
      updateGenerateButton();
    });
  }

  function updateGenerateButton() {
    const key = document.getElementById('api-key').value.trim();
    document.getElementById('btn-generate').disabled = !key;
  }

  // --- CONNECTION TEST ---
  function setupConnectionTest() {
    document.getElementById('btn-test-connection').addEventListener('click', async () => {
      const statusEl = document.getElementById('connection-status');
      statusEl.textContent = 'Testing...';
      statusEl.className = 'connection-status';

      try {
        const key = document.getElementById('api-key').value.trim();
        if (!key) {
          statusEl.textContent = 'No API key entered.';
          statusEl.className = 'connection-status error';
          return;
        }

        const model = document.getElementById('model-override').value.trim() || PROVIDERS[selectedProvider].model;
        const response = await callProvider(key, model, 'Respond with OK.', 'You are a helpful assistant.');

        if (response) {
          statusEl.textContent = 'Connected — ' + PROVIDERS[selectedProvider].name + ' responded.';
          statusEl.className = 'connection-status success';
        } else {
          statusEl.textContent = 'Error — no response received.';
          statusEl.className = 'connection-status error';
        }
      } catch (err) {
        statusEl.textContent = 'Error — ' + (err.message || 'Connection failed.');
        statusEl.className = 'connection-status error';
      }
    });
  }

  // --- RESTORE SETTINGS ---
  async function restoreSettings() {
    try {
      const savedProvider = await window.electronAPI.getStore('provider');
      if (savedProvider && PROVIDERS[savedProvider]) {
        selectedProvider = savedProvider;
        document.querySelectorAll('.provider-card').forEach((c) => c.classList.remove('active'));
        document.querySelector('[data-provider="' + savedProvider + '"]').classList.add('active');
      }

      const savedKey = await window.electronAPI.getStore('apiKey_' + selectedProvider);
      if (savedKey) {
        document.getElementById('api-key').value = savedKey;
      }

      document.getElementById('model-override').placeholder = PROVIDERS[selectedProvider].model;
    } catch (e) {
      // electron-store not available (dev fallback)
    }
  }

  // --- SAFE GETTER ---
  function g(id) {
    const el = document.getElementById(id);
    if (!el) return 'Not provided';
    const val = el.value ? el.value.trim() : '';
    if (!val || val === '' || val === 'not_provided' || val === '— Not provided —' || val === '— Not sure —') {
      return 'Not provided';
    }
    return val;
  }

  // --- COLLECT INTAKE DATA ---
  function collectIntakeData() {
    return {
      age: g('age'),
      bodyweight: g('bodyweight'),
      height: g('height'),
      dutyStatus: g('duty-status'),
      opsTempo: g('ops-tempo'),
      trainingDays: g('training-days'),
      sessionLength: g('session-length'),
      equipment: g('equipment'),
      sleep: g('sleep'),
      dlLoad: g('dl-load'),
      dlVariant: g('dl-variant'),
      dlReps: g('dl-reps'),
      sqLoad: g('sq-load'),
      sqVariant: g('sq-variant'),
      sqReps: g('sq-reps'),
      bpLoad: g('bp-load'),
      bpVariant: g('bp-variant'),
      bpReps: g('bp-reps'),
      ohpLoad: g('ohp-load'),
      ohpVariant: g('ohp-variant'),
      ohpReps: g('ohp-reps'),
      pullupMax: g('pullup-max'),
      farmersLoad: g('farmers-load'),
      sandbagLoad: g('sandbag-load'),
      gripStrength: g('grip-strength'),
      zercherLoad: g('zercher-load'),
      logPress: g('log-press'),
      trainingAge: g('training-age'),
      oddObjects: g('odd-objects'),
      twoMile: g('two-mile'),
      fiveMile: g('five-mile'),
      weeklyMiles: g('weekly-miles'),
      sprint40: g('sprint-40'),
      sprint200: g('sprint-200'),
      sprint400: g('sprint-400'),
      runPhase: g('run-phase'),
      sprintExp: g('sprint-exp'),
      ruckLoad: g('ruck-load'),
      ruckDist: g('ruck-dist'),
      ruckPace: g('ruck-pace'),
      ruckLongest: g('ruck-longest'),
      ruckMax: g('ruck-max'),
      ruckExp: g('ruck-exp'),
      aftDeadlift: g('aft-deadlift'),
      aftPushups: g('aft-pushups'),
      aftThrow: g('aft-throw'),
      aftSDC: g('aft-sdc'),
      aftLTK: g('aft-ltk'),
      aftRun: g('aft-run'),
      aftScore: g('aft-score'),
      aftDate: g('aft-date'),
      currentInjuries: g('current-injuries'),
      pastInjuries: g('past-injuries'),
      movementRestrictions: g('movement-restrictions'),
      profileStatus: g('profile-status'),
      primaryGoal: g('primary-goal'),
      timeline: g('timeline'),
      eventDate: g('event-date'),
      bodyComp: g('body-comp'),
      additionalContext: g('additional-context'),
    };
  }

  // --- DEADLIFT NORMALIZATION ---
  function normalizeDeadlift(load, variant, reps) {
    if (load === 'Not provided' || !load) return null;
    const lbs = parseFloat(load);
    if (isNaN(lbs) || lbs <= 0) return null;

    let est1RM = lbs;
    let note = '';

    // Rep scheme conversion
    if (reps === '3RM' || variant === 'Trap Bar — AFT 3RM') {
      est1RM = lbs * 1.0667;
      note += `${lbs} lbs × 1.0667 (Epley 3RM) = est. 1RM ≈ ${Math.round(est1RM)} lbs`;
    } else if (reps === '5RM') {
      est1RM = lbs * 1.1;
      note += `${lbs} lbs × 1.1 (Epley 5RM) = est. 1RM ≈ ${Math.round(est1RM)} lbs`;
    } else if (reps === 'Estimated 1RM' || reps === '1RM (true max)') {
      est1RM = lbs;
      note += `${lbs} lbs (reported 1RM)`;
    }

    // Trap bar to conventional conversion
    if (variant && (variant.includes('Trap Bar') || variant.includes('trap bar'))) {
      const estConv = est1RM * 0.92;
      note += ` → Est. conventional 1RM ≈ ${Math.round(estConv)} lbs (×0.92 trap bar factor)`;
    }

    return note || null;
  }

  // --- BUILD USER MESSAGE ---
  function buildUserMessage(data) {
    const dlNorm = normalizeDeadlift(data.dlLoad, data.dlVariant, data.dlReps);
    const dlNormLine = dlNorm ? `\n  → ${dlNorm}` : '';
    const days = data.trainingDays !== 'Not provided' ? data.trainingDays : '4';

    return `ATHLETE INTAKE DATA — GENERATE INITIAL PROGRAM

IMPORTANT: Many fields below may read "Not provided." This is not an error. Build a complete, specific, tier-appropriate program using whatever data is present. Where data is missing, program conservatively and note what additional information would allow for more precise calibration. Do not refuse to generate a program due to missing data. An athlete with only their bodyweight and a goal still deserves a real program.

IDENTITY & CONTEXT:
Age: ${data.age}
Bodyweight: ${data.bodyweight} lbs
Height: ${data.height}
Duty Status: ${data.dutyStatus}
Operational Tempo: ${data.opsTempo}
Training Days/Week: ${data.trainingDays}
Session Length: ${data.sessionLength}
Equipment Access: ${data.equipment}
Average Sleep: ${data.sleep} hours/night

STRENGTH BASELINES:
Deadlift/Hip Hinge: ${data.dlLoad} lbs | Variant: ${data.dlVariant} | Rep Scheme: ${data.dlReps}${dlNormLine}
Squat: ${data.sqLoad} lbs | Variant: ${data.sqVariant} | Rep Scheme: ${data.sqReps}
Horizontal Press: ${data.bpLoad} lbs | Variant: ${data.bpVariant} | Rep Scheme: ${data.bpReps}
Overhead Press: ${data.ohpLoad} lbs | Variant: ${data.ohpVariant} | Rep Scheme: ${data.ohpReps}
Pull-Up Max: ${data.pullupMax} strict reps
Farmer's Walk Max: ${data.farmersLoad} lbs/hand (40 yards)
Sandbag Max Load: ${data.sandbagLoad} lbs
Grip Strength: ${data.gripStrength}
Zercher Carry/Load: ${data.zercherLoad}
Log Press: ${data.logPress}
Training Age: ${data.trainingAge}
Odd Object / Nonstandard Lift Experience: ${data.oddObjects}

RUNNING BASELINES:
2-Mile Best: ${data.twoMile}
5-Mile Best: ${data.fiveMile}
Weekly Mileage: ${data.weeklyMiles} miles/week
40m Sprint: ${data.sprint40}
200m Sprint: ${data.sprint200}
400m Sprint: ${data.sprint400}
Current Run Phase: ${data.runPhase}
Sprint Training Experience: ${data.sprintExp}

RUCK & LOAD CARRIAGE:
Target: 12 miles / 35 lb dry (water additional) / under 3 hours
Current Ruck Load: ${data.ruckLoad} lbs
Comfortable Distance: ${data.ruckDist} miles
Current Ruck Pace: ${data.ruckPace} min/mile
Longest Recent Ruck: ${data.ruckLongest} miles
Max Load Carried: ${data.ruckMax} lbs
Ruck Experience: ${data.ruckExp}

ARMY FITNESS TEST (AFT):
3RM Trap Bar Deadlift: ${data.aftDeadlift} lbs
Hand-Release Push-Ups: ${data.aftPushups} reps
Seated Power Throw: ${data.aftThrow} meters
Sprint-Drag-Carry: ${data.aftSDC}
Leg Tuck / Plank: ${data.aftLTK}
2-Mile Run: ${data.aftRun}
Overall Score: ${data.aftScore}
Last Test: ${data.aftDate}

INJURIES & LIMITATIONS:
Current Injuries/Pain: ${data.currentInjuries}
Previous Surgeries/Structural: ${data.pastInjuries}
Movement Restrictions: ${data.movementRestrictions}
Profile Status: ${data.profileStatus}

GOALS:
Primary Goal: ${data.primaryGoal}
Target Timeline: ${data.timeline}
Event/Test Date: ${data.eventDate}
Body Composition Goal: ${data.bodyComp}
Additional Context: ${data.additionalContext}

INSTRUCTIONS:
1. Assign this athlete a tier (1–4) with brief justification based on available data. If strength data is absent, assign Tier 1 and note that the assignment will be revised once strength data is collected in session.
2. Calculate training maxes (90% of estimated 1RM) for every lift where data exists. For any lift without data, note "TM to be established in Week 1 — use conservative working weight and record" and specify how to determine it in the first session. Show normalization calculations for any nonstandard variant.
3. Determine their current HTK run phase. If run data is absent, begin at Phase 0 and note this.
4. Assess their ruck baseline. If ruck data is absent, begin at zero-load ruck protocol and note this.
5. Generate their complete FIRST WEEK of programming — use ${days} training days (or 4 if not provided) — using the full Doryphoros methodology appropriate to their tier. Every session must be complete and specific. Do not produce placeholder sessions.
6. For each session: Session Overview, Athlete Context, Warm-Up Protocol, Main Work Block, Accessory Block, Conditioning Block, Cool-Down, Performance Log Prompt, Adaptation Preview.
7. Include a Dinosaur Training Accessory Plan — which specific nonstandard movements are introduced this block, which slot they occupy, starting load/rep scheme, and what barbell gap they fill. Be specific.
8. Include a ruck development note — where they are vs. the 12-mile target and the first steps.
9. End with a concise 12-week development roadmap.
10. At the very end, output the machine-readable schedule block:

---SCHEDULE_START---
Day 1 | Mon | strength | Lower ME — Deadlift + Posterior Chain | Conventional deadlift 5/3/1 Week 1, RDL, Zercher carry, grip work
Day 2 | Tue | run | Interval Session — 8×200m | Mach drill warm-up, 200m at 90%, equal rest, extensive tempo cool-down
Day 3 | Wed | rest | Rest / Active Recovery | Mobility, soft tissue, no structured loading
[continue through Day 28]
---SCHEDULE_END---

Type field must be exactly one of: strength, run, ruck, recovery, rest`;
  }

  // --- API CALL DISPATCHER ---
  async function callProvider(apiKey, model, userMessage, systemMessage) {
    if (selectedProvider === 'anthropic') {
      return callAnthropic(apiKey, model, userMessage, systemMessage);
    } else if (selectedProvider === 'google') {
      return callGoogle(apiKey, model, userMessage, systemMessage);
    } else {
      // OpenAI-compatible: openai, xai, deepseek
      return callOpenAICompat(apiKey, model, userMessage, systemMessage);
    }
  }

  async function callAnthropic(apiKey, model, userMessage, systemMessage) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 8192,
        system: systemMessage,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API ${res.status}: ${err}`);
    }
    const data = await res.json();
    return data.content && data.content[0] ? data.content[0].text : '';
  }

  async function callOpenAICompat(apiKey, model, userMessage, systemMessage) {
    const url = PROVIDERS[selectedProvider].url;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 8192,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userMessage },
        ],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${PROVIDERS[selectedProvider].name} API ${res.status}: ${err}`);
    }
    const data = await res.json();
    return data.choices && data.choices[0] ? data.choices[0].message.content : '';
  }

  async function callGoogle(apiKey, model, userMessage, systemMessage) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemMessage }] },
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: { maxOutputTokens: 8192 },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini API ${res.status}: ${err}`);
    }
    const data = await res.json();
    return data.candidates && data.candidates[0]
      ? data.candidates[0].content.parts[0].text
      : '';
  }

  // --- GENERATE PROGRAM ---
  async function generateProgram() {
    const btn = document.getElementById('btn-generate');
    const status = document.getElementById('generate-status');

    btn.disabled = true;
    status.innerHTML = '<span class="loading-spinner"></span> Generating program — this may take 1–2 minutes...';

    try {
      const apiKey = document.getElementById('api-key').value.trim();
      const model = document.getElementById('model-override').value.trim() || PROVIDERS[selectedProvider].model;
      const data = collectIntakeData();
      const userMsg = buildUserMessage(data);
      const sysMsg = getSystemPrompt();

      generatedResponse = await callProvider(apiKey, model, userMsg, sysMsg);

      // Render program
      renderProgram(generatedResponse);

      // Parse calendar
      populateCalendar(generatedResponse);

      // Switch to program tab
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      document.querySelector('[data-tab="program"]').classList.add('active');
      document.getElementById('tab-program').classList.add('active');

      status.textContent = 'Program generated successfully.';
    } catch (err) {
      status.textContent = 'Error: ' + (err.message || 'Generation failed.');
    }

    btn.disabled = false;
  }

  // --- MARKDOWN → HTML RENDERER ---
  function renderMarkdown(text) {
    let html = text;

    // Escape HTML
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Headers
    html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

    // Bold + Italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Horizontal rules
    html = html.replace(/^---+$/gm, '<hr>');

    // Tables
    html = html.replace(/^(\|.+\|)\n(\|[-\s|:]+\|)\n((?:\|.+\|\n?)*)/gm, (match, header, sep, body) => {
      const ths = header.split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('');
      const rows = body.trim().split('\n').map(row => {
        const tds = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
        return `<tr>${tds}</tr>`;
      }).join('');
      return `<table><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>`;
    });

    // Unordered lists
    html = html.replace(/^(\s*)[-*]\s+(.+)$/gm, '$1<li>$2</li>');
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

    // Ordered lists
    html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');

    // Blockquotes
    html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote>$1</blockquote>');

    // Paragraphs
    html = html.replace(/\n\n+/g, '\n\n');
    html = html.split('\n\n').map((block) => {
      block = block.trim();
      if (!block) return '';
      if (block.startsWith('<')) return block;
      return '<p>' + block.replace(/\n/g, '<br>') + '</p>';
    }).join('\n');

    return html;
  }

  function renderProgram(text) {
    const container = document.getElementById('program-content');
    // Remove schedule block from display
    let display = text.replace(/---SCHEDULE_START---[\s\S]*?---SCHEDULE_END---/g, '').trim();
    container.innerHTML = '<div class="program-output">' + renderMarkdown(display) + '</div>';
  }

  // --- CALENDAR PARSING & RENDERING ---
  function populateCalendar(responseText) {
    scheduleData = [];

    // Try structured block first
    const blockMatch = responseText.match(/---SCHEDULE_START---([\s\S]*?)---SCHEDULE_END---/);
    if (blockMatch) {
      const lines = blockMatch[1].trim().split('\n');
      for (const line of lines) {
        const parts = line.split('|').map((s) => s.trim());
        if (parts.length >= 4) {
          const dayNum = parseInt(parts[0].replace(/\D/g, ''));
          const dayOfWeek = parts[1];
          const type = parts[2].toLowerCase();
          const title = parts[3];
          const detail = parts[4] || '';
          if (dayNum && ['strength', 'run', 'ruck', 'recovery', 'rest'].includes(type)) {
            scheduleData.push({ day: dayNum, dayOfWeek, type, title, detail });
          }
        }
      }
    }

    // Heuristic fallback
    if (scheduleData.length < 14) {
      scheduleData = buildFallbackSchedule();
    }

    if (scheduleData.length > 0) {
      document.getElementById('calendar-placeholder').style.display = 'none';
      document.getElementById('calendar-active').style.display = 'block';
      renderCalendar();
    }
  }

  function buildFallbackSchedule() {
    const days = parseInt(g('training-days')) || 4;
    const templates = {
      3: [
        { type: 'strength', title: 'Lower Body Strength' },
        { type: 'rest', title: 'Rest / Recovery' },
        { type: 'run', title: 'Interval Running' },
        { type: 'rest', title: 'Rest / Recovery' },
        { type: 'strength', title: 'Upper Body Strength' },
        { type: 'ruck', title: 'Ruck Development' },
        { type: 'rest', title: 'Rest / Active Recovery' },
      ],
      4: [
        { type: 'strength', title: 'Lower ME — Deadlift + Posterior Chain' },
        { type: 'run', title: 'Interval Session' },
        { type: 'rest', title: 'Rest / Active Recovery' },
        { type: 'strength', title: 'Upper ME — Press + Pull' },
        { type: 'run', title: 'Threshold / Continuous Run' },
        { type: 'ruck', title: 'Ruck Development' },
        { type: 'rest', title: 'Rest / Full Recovery' },
      ],
      5: [
        { type: 'strength', title: 'Lower ME — Deadlift' },
        { type: 'run', title: 'Interval Sprint Session' },
        { type: 'strength', title: 'Upper ME — Press' },
        { type: 'run', title: 'Threshold Run' },
        { type: 'strength', title: 'Lower DE — Squat' },
        { type: 'ruck', title: 'Ruck Development' },
        { type: 'rest', title: 'Rest / Full Recovery' },
      ],
      6: [
        { type: 'strength', title: 'Lower ME — Deadlift' },
        { type: 'run', title: 'Interval Sprint Session' },
        { type: 'strength', title: 'Upper ME — Press' },
        { type: 'run', title: 'Threshold Run' },
        { type: 'strength', title: 'Lower DE — Squat' },
        { type: 'run', title: 'Continuous Easy Run' },
        { type: 'rest', title: 'Rest / Full Recovery' },
      ],
    };

    const template = templates[days] || templates[4];
    const result = [];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (let i = 0; i < 28; i++) {
      const t = template[i % 7];
      result.push({
        day: i + 1,
        dayOfWeek: dayNames[i % 7],
        type: t.type,
        title: t.title,
        detail: '',
      });
    }
    return result;
  }

  function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const startInput = document.getElementById('start-date');
    const startDate = new Date(startInput.value + 'T00:00:00');

    const dayHeaders = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    let html = dayHeaders.map((d) => `<div class="day-header">${d}</div>`).join('');

    for (let i = 0; i < 28; i++) {
      const session = scheduleData[i] || { type: 'rest', title: 'Rest', detail: '' };
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const weekNum = Math.floor(i / 7) + 1;
      const dateStr = (date.getMonth() + 1) + '/' + date.getDate();

      html += `<div class="day-cell type-${session.type}">
        <div class="day-week">WK${weekNum}</div>
        <div class="day-date">${dateStr}</div>
        <div class="day-label">${escapeHtml(session.title)}</div>
        <div class="day-detail">${escapeHtml(session.detail)}</div>
      </div>`;
    }

    grid.innerHTML = html;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // --- CALENDAR CONTROLS ---
  function setupCalendarControls() {
    document.getElementById('start-date').addEventListener('change', () => {
      if (scheduleData.length > 0) renderCalendar();
    });

    document.getElementById('btn-gcal').addEventListener('click', exportGoogleCalendar);
    document.getElementById('btn-ical').addEventListener('click', exportICS);
  }

  function setDefaultStartDate() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilMon = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
    const nextMon = new Date(today);
    nextMon.setDate(today.getDate() + daysUntilMon);
    document.getElementById('start-date').value = formatDateInput(nextMon);
  }

  function formatDateInput(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // --- GOOGLE CALENDAR EXPORT ---
  async function exportGoogleCalendar() {
    if (!scheduleData.length) return;
    const startInput = document.getElementById('start-date');
    const startDate = new Date(startInput.value + 'T00:00:00');

    const durations = { strength: 75, run: 60, ruck: 120, recovery: 45, rest: 30 };

    for (let i = 0; i < scheduleData.length; i++) {
      const s = scheduleData[i];
      if (s.type === 'rest') continue;

      const date = new Date(startDate);
      date.setDate(date.getDate() + i);

      const startTime = new Date(date);
      startTime.setHours(6, 0, 0, 0);
      const endTime = new Date(startTime);
      endTime.setMinutes(endTime.getMinutes() + (durations[s.type] || 60));

      const fmt = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      const title = encodeURIComponent(`Doryphoros: ${s.title}`);
      const details = encodeURIComponent(s.detail || s.title);

      const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(startTime)}/${fmt(endTime)}&details=${details}&reminders=useDefault`;

      await window.electronAPI.openExternal(url);

      // Stagger 800ms between opens
      if (i < scheduleData.length - 1) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }

  // --- ICS EXPORT ---
  function exportICS() {
    if (!scheduleData.length) return;
    const startInput = document.getElementById('start-date');
    const startDate = new Date(startInput.value + 'T00:00:00');

    const durations = { strength: 75, run: 60, ruck: 120, recovery: 45, rest: 30 };

    let ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Doryphoros//Combat Arms Performance System//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n`;

    for (let i = 0; i < scheduleData.length; i++) {
      const s = scheduleData[i];
      if (s.type === 'rest') continue;

      const date = new Date(startDate);
      date.setDate(date.getDate() + i);

      const startTime = new Date(date);
      startTime.setHours(6, 0, 0, 0);
      const endTime = new Date(startTime);
      endTime.setMinutes(endTime.getMinutes() + (durations[s.type] || 60));

      const fmtDT = (d) => {
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
      };

      const uid = `doryphoros-${Date.now()}-${i}@doryphoros.local`;
      const now = fmtDT(new Date());

      ics += `BEGIN:VEVENT\r\n`;
      ics += `UID:${uid}\r\n`;
      ics += `DTSTAMP:${now}\r\n`;
      ics += `DTSTART:${fmtDT(startTime)}\r\n`;
      ics += `DTEND:${fmtDT(endTime)}\r\n`;
      ics += `SUMMARY:Doryphoros: ${s.title}\r\n`;
      ics += `DESCRIPTION:${(s.detail || s.title).replace(/\n/g, '\\n')}\r\n`;
      ics += `BEGIN:VALARM\r\nTRIGGER:-PT1440M\r\nACTION:DISPLAY\r\nDESCRIPTION:Doryphoros training in 24 hours\r\nEND:VALARM\r\n`;
      ics += `BEGIN:VALARM\r\nTRIGGER:-PT60M\r\nACTION:DISPLAY\r\nDESCRIPTION:Doryphoros training in 1 hour\r\nEND:VALARM\r\n`;
      ics += `END:VEVENT\r\n`;
    }

    ics += `END:VCALENDAR\r\n`;

    window.electronAPI.saveFile('doryphoros-4week.ics', ics);
  }

  // --- SYSTEM PROMPT ---
  function getSystemPrompt() {
    return `You are Doryphoros, an elite strength and conditioning coach specializing in combat arms performance. The name comes from Polykleitos's Doryphoros — the Spear-Bearer — the first systematic attempt to codify ideal human proportions and capacity through measurement and discipline. Your mission is the same: to take any soldier who meets the minimum entry standard — the ability to pass the Army Fitness Test (AFT) at the combat standard of 70 points per event — and build them toward elite tactical fitness through intelligent, adaptive, periodized programming.

You do not program for the unfit or sedentary. Your floor is a soldier who can already perform. Your ceiling is the operator-level hybrid athlete who deadlifts twice their bodyweight, runs five miles under 35 minutes, can sprint 400m under 62 seconds, and completes a 12-mile ruck with a 35-pound dry pack (water is additional weight) in under 3 hours.

HANDLING INCOMPLETE DATA: You will sometimes receive intake forms where many or all fields read "Not provided." This is normal and expected — athletes have different levels of data about themselves. You never refuse to generate a program due to missing data. You build the most specific, useful program possible from whatever is present. Where data is absent, you assign conservative defaults, note them explicitly, and explain how the athlete will establish the missing baselines in their first week of training. An athlete who provides only their bodyweight and a goal gets a real, complete, specific program — not a placeholder.

YOUR COMPLETE METHODOLOGY DRAWS FROM:

STRENGTH SYSTEMS:
- Wendler 5/3/1 and 3/5/1: Primary progressive overload vehicle. 5/3/1 for Tiers 1–2. 3/5/1 (heaviest week first) for Tiers 3–4. Leader/anchor block structure for advanced athletes. Training maxes set at 90% of true 1RM. Conservative progression (lower body +10 lbs/cycle, upper body +5 lbs).
- Westside Barbell Conjugate: Max effort (ME) rotating variations every 1–3 weeks to prevent accommodation. Dynamic effort (DE) at 55–65% TM for 8–10 sets of 2–3, compensatory acceleration, developing rate of force development. Posterior chain priority: RDLs, reverse hypers, GHD hip extensions, Nordic curls every week.
- Brooks Kubik Dinosaur Training — Nonstandard Lift Library and Progressive Integration: Kubik's core insight is that barbell lifts train a narrow range of motion with a predictable, balanced load. Real-world strength demands — casualty drag, equipment movement, obstacle negotiation, sustained ruck — occur through irregular planes, shifting loads, and positions the barbell never reaches. Nonstandard and odd-object lifts fill these gaps systematically, building the accessory muscles, connective tissue, grip strength, and full-range motor patterns that barbell training leaves underdeveloped. These movements are NOT substitutes for the big barbell lifts. They are layered in as accessories and refinements as the athlete gains proficiency.

CORE KUBIK PRINCIPLES (applied throughout all tiers):
(1) Train the basics brutally heavy first — deadlifts, squats, presses, rows, pull-ups are and remain the foundation. Nothing in the Dinosaur library replaces these.
(2) Odd objects build what barbells cannot — unpredictable load distribution forces the stabilizers, rotators, and grip to work maximally in every set. A 150 lb sandbag teaches more about full-body tension and positional strength than 150 lbs on a barbell.
(3) Grip is the foundation of all strength expression — if the grip fails, the lift fails. Thick bar work, farmer's walks, pinch grips, towel pull-ups, and two-finger deadlifts build the forearm, hand, and wrist integrity that transfers to every barbell lift and every tactical task.
(4) Heavy singles, doubles, and triples on nonstandard movements build tendon and ligament integrity that moderate rep ranges alone cannot achieve. Program heavy singles on Zercher carries, sandbag shouldering, and log press periodically.
(5) Power rack and pin work — bottom position strength via rack pulls, pin squats, and pin presses eliminates sticking points and builds starting strength independent of the stretch reflex.
(6) Abbreviated, focused sessions — when Dinosaur accessory work is added, it replaces weak accessory work, not adds to it. Fewer movements, maximum intent.
(7) Death sets used strategically — 20-rep sandbag squats, high-rep farmer's walk sets done occasionally to drive hypertrophy, mental toughness, and work capacity simultaneously.
(8) Deep focus on every rep — no casual sets. Every nonstandard lift requires greater positional awareness than a barbell movement.

NONSTANDARD LIFT LIBRARY — CATEGORIZED BY FUNCTION AND TIER INTRODUCTION:

ZERCHER MOVEMENTS (introduce Tier 2, develop through Tier 4):
The Zercher position — load carried in the crooks of the elbows — is the single most transferable strength position for the tactical athlete. It replicates the body position of a casualty drag, a bear hug carry, moving a wounded soldier over an obstacle, or relocating heavy gear. It builds the upper back, biceps, anterior core, and hip flexors through ranges and under loads that no standard barbell movement reaches.
- Zercher Deadlift: Load from floor in Zercher position. ME lower variation or heavy accessory: 3–5 sets of 3–5 reps.
- Zercher Squat: Demands upright torso, massive core bracing, quad/glute development. ME lower rotation or primary accessory: 3–4 sets of 3–6 reps.
- Zercher Carry: Walk with load in Zercher position. Loaded carry finisher: 3–4 sets of 20–40 yards.
- Zercher Good Morning: Hip hinge in Zercher position. Accessory: 2–3 sets of 5–8 reps.

SANDBAG MOVEMENTS (introduce Tier 1 for carries, Tier 2 for loading/shouldering):
- Sandbag Carry (bear hug, shoulder, Zercher): 4–6 sets of 30–50 yards.
- Sandbag Shouldering: Explosive hip extension, rotational core. Tier 2+: 3–5 sets of 3–5 reps per side.
- Sandbag Squat: Front-loaded shifting resistance. 3–4 sets of 6–10 reps or 1 death set of 15–20.
- Sandbag Rows: Unstable load forces grip engagement. 3–4 sets of 8–12 reps.
- Sandbag Clean and Press: Tier 2+: 3–5 sets of 3–5 reps.
- Lugging and Loading Drills: Session finisher 1x/week max: 3–5 rounds.

FARMER'S WALK AND LOADED CARRY VARIATIONS (all tiers, progressive loading):
- Standard Farmer's Walk: Build to bodyweight per hand for Tier 3+. 3–5 sets of 30–50 yards weekly.
- Thick Bar Farmer's Walk: Dramatically increases grip demand. Tier 2+.
- Unilateral Farmer's Walk (Suitcase Carry): Lateral core stabilization. 3–4 sets of 30 yards per side.
- Overhead Carry: Shoulder stability and core stiffness. Tier 2+: 2–3 sets of 20–30 yards.
- Trap Bar Carry: Closest gym equivalent to ruck demand. 3–5 sets of 40–60 yards.

LOG AND BARREL MOVEMENTS (introduce Tier 3, available Tier 2 if access exists):
- Log Clean and Press: Signature Dinosaur movement. ME upper variation, Tier 2+: 3–5 sets of 3–5 reps or heavy singles.
- Log Strict Press: ME upper rotation, Tier 3+.
- Log Row: Accessory pulling, Tier 2+.

THICK BAR AND GRIP WORK (all tiers, progressively loaded):
- Thick Bar Deadlift: ME lower variation or accessory, Tier 2+: 3–5 sets of 3–5 reps.
- Thick Bar / Towel Pull-Up: All tiers once basic pull-up proficiency established.
- Pinch Grip Holds: 2x/week grip finisher: 3–5 sets of 15–30 second holds.
- Two-Finger Deadlift: Grip specialization, Tier 3+: 2–3 sets of 3–5 reps sub-max.
- Wrist Roller: 2–3 sets 2x/week at end of sessions.

RACK WORK AND PIN MOVEMENTS (Tier 2+):
- Rack Pull (various heights): Supramaximal loads: 3–5 sets of 1–3 reps.
- Pin Squat: Pause on pins, no stretch reflex: 3–5 sets of 2–5 reps.
- Pin Press: Dead stop off chest: 3–5 sets of 2–5 reps.
- Floor Press: Lockout and tricep emphasis: 3–5 sets of 3–5 reps.

NONSTANDARD DEADLIFT VARIATIONS (progressive introduction by tier):
- Zercher Deadlift (Tier 2+), Trap Bar (all tiers), RDL (weekly staple: 3–4×6–10), Stiff-Leg (Tier 2+: 3–4×8–12), Snatch-Grip (Tier 2+: 3–5×3–5), Sumo (ME rotation), Jefferson (Tier 3+: 3–4×5/side), Deficit (3–5×3–5).

PROGRAMMING RULES FOR DINOSAUR ACCESSORY INTEGRATION:
Tier 1: Farmer's walks and standard sandbag carries only. Grip work (towel pull-ups, wrist roller) begins immediately.
Tier 2: Introduce Zercher movements, sandbag shouldering and squat, thick bar pulling, trap bar as ME option, rack pulls, pin press, log press if available. Start conservative.
Tier 3: Full library. Log clean and press in ME upper rotation. Jefferson deadlift occasional. Two-finger deadlift for grip. Lugging drills as weekly finisher.
Tier 4: Entire library in rotation. ME lower cycles all pulling variations. Every session has at least one nonstandard loaded carry. Grip work daily.

SUBSTITUTION LOGIC: When the athlete lacks access to a specific odd object, substitute the closest available implement. Dumbbell held end-up ≈ log press. Loaded backpack ≈ sandbag. Towel on pull-up bar ≈ thick bar. The principle — not the implement — is what matters.

PROGRESSIVE OVERLOAD ON ODD OBJECTS: Apply same logic as barbell training. RPE ≤8 on all reps → increase load next session. Death sets programmed deliberately (1x per 3–4 weeks on a given movement). Track odd object loads and reps identically to barbell work.

- Doggcrapp (DC Training): Rest-pause sets on accessories (never on ME/DE primary lifts). Extreme stretching (60–90 sec loaded end-range) after accessory work. Abbreviated volume with maximum intensity. Applicable Tiers 3–4 and during high running volume phases.
- Mountain Dog (John Meadows): Pre-exhaust sequencing for lagging muscle groups. Antagonist supersets (push always paired with pull). Peak-then-descend set structure on ME work.
- Pavel Tsatsouline: Strength as neurological skill — frequent sub-maximal practice, never to failure on primary skill development. Greasing the Groove (GTG) for pull-ups: sets at 40–60% of max distributed throughout the day. Easy Strength during deloads: 2×5 at 40% TM daily. Rule of 10 Reps for speed work. Full-body tension and irradiation on every heavy lift.
- LeanGains (Martin Berkhan): Nutritional periodization — higher calories and carbohydrates on lifting days, lower on conditioning days and rest days. 16/8 intermittent fasting for garrison body composition management. Protein minimum 1g/lb bodyweight all days. Applied Tiers 3–4 in garrison only.

SPRINT DEVELOPMENT:
- Gerard Mach drill progressions: A-march, A-skip, B-skip, B-run as mandatory sprint warm-up.
- Charlie Francis: Hard separation between high-intensity (>75% sprint effort) and low-intensity — never on the same day. Extensive tempo (6–10×100m at 65–75%) for aerobic base without CNS cost. Sprint times degrading >5% across session = session ends.

RUNNING — HTK COMBAT RUNNER FRAMEWORK:
Four pillars mandatory every training week at appropriate phase:
1. Continuous Runs: 60–70% effort, conversational pace, Zone 2.
2. Sprint/Mixed Intervals: 90–100% effort, full recovery. 200m/400m with equal rest.
3. Threshold Runs: 80–85% effort, roughly 10K pace.
4. Recovery Sessions: Zone 1 only. Not optional.

HTK Phase structure:
- Phase 0 (Aerobic Base Builder): Walk-jog intervals, cross-modal, no sprints, no threshold. Entry if cannot sustain 30 min continuous — or if run data is absent.
- Phase 1 (2-Mile Protocol, 8 weeks): Target sub-13:00. Striders, continuous runs to 4.5 miles, tempo at 80–85%, intervals 8×200m → 2×400+6×200.
- Phase 2 (5-Mile Protocol, 8 weeks): Target sub-35:00. Long runs to 6.5 miles, threshold to 2.5 miles at 85–88%.
- Phase 3 (Integration/Maintenance): 3–4 sessions/week, quality preserved, woven into lifting schedule.

RUCK AND LOADED CARRY:
Target: 12 miles with 35 lb dry pack in under 3 hours (15:00/mile pace). Water is additional weight.
Progressive loading: never increase load and distance in the same two-week period. +5 lbs or +1 mile per two weeks maximum. Pace degradation >45 sec/mile = reduce load OR distance, not both. Loaded carries in gym are strength work, not conditioning.
If ruck data is absent: begin with 30-minute ruck walks at bodyweight + 10 lbs, establish baseline pace, progress from there.
Kubik Dinosaur integration: Zercher carries, sandbag shouldering, bear hug carries, and lugging/loading drills program the exact motor patterns of casualty drag, equipment relocation, and obstacle negotiation.

TACTICAL REFERENCE:
SFAS, RASP, Ranger School, MARSOC, USAF Combat Control, Pararescue physical preparation doctrine. Posterior chain priority for ruck durability and injury prevention. Unilateral work (Bulgarian split squat, single-leg RDL, single-arm row) to close bilateral deficit.

ATHLETE TIER SYSTEM:
Tier 1 — Combat Standard: AFT 70 pts/event. DL <1.5×BW. 2-mile >15:00. Pull-ups <8.
Advancement: 2-mile <14:00, DL 1.75×BW, 10 pull-ups.

Tier 2 — Tactical Athlete: DL 1.5–2.0×BW. 2-mile 13:00–14:30. Pull-ups 10–14.
Advancement: 2-mile <13:00, 5-mile <40:00, DL 2.0×BW, squat 1.75×BW, 15 pull-ups.

Tier 3 — High Performer: DL 2.0–2.3×BW. 2-mile <13:00. 5-mile <37:00. Pull-ups 15–18.
Advancement: 2-mile <12:30, 5-mile <35:00, 400m <65s, 18+ pull-ups.

Tier 4 — Elite Operator: DL 2.0–2.5×BW. Squat 2.0×. Bench 1.5×. OHP 1.0×. Pull-ups 15–20. 2-mile <12:30. 5-mile <35:00. 400m <62s. 12-mile ruck <3:00.

If strength data is absent, assign Tier 1 and note the assignment will be confirmed once baseline data is collected in Week 1.

STRENGTH STANDARDS (targets):
Deadlift: 2.0–2.5× bodyweight
Squat: 2.0× bodyweight
Bench: 1.5× bodyweight
OHP: 1.0× bodyweight
Pull-ups: 15–20 strict reps

PERFORMANCE LOGIC ENGINE:
Set classification: Green (all reps, RPE ≤8), Yellow (1–2 reps missed or RPE spike), Red (<50% target reps).
Responses: All Green + AMRAP 3+ reps over target → progress TM. All Green within 1–2 reps → hold. Yellow → hold + back-off set. Red → autoregulated deload (TM -10%, full deload week 40/50/60%). Two consecutive Red → technical audit. Three consecutive below target → mandatory 3-day rest.

Sprint adaptation: Degrade >5% → CNS fatigue flag, reduce volume. Hold within 3% → add one rep or reduce rest 15 sec.
Running adaptation: Pace improves >15 sec/mile at same RPE → add 0.5 mile. RPE >7 on 60–70% session → hold, flag recovery. Threshold RPE ≤6 → increase. Threshold RPE 9+ → reduce, investigate.
Ruck adaptation: Pace degrades >45 sec/mile → reduce load OR distance (not both). Max 1 step progress per 2 weeks.

CONSTRAINTS (non-negotiable):
- Max effort lifting and sprint work never same day. Min 24hr separation, 48hr preferred.
- Never increase both volume and intensity simultaneously on any variable.
- Weekly mileage never increases >10% over previous week.
- 3+ consecutive nights poor sleep → mandatory recovery day, Easy Strength protocol.
- Pull-up max drops below 10 → GTG protocol activates, pulling volume prioritized 3 weeks.
- Acute injury flags → reduce loading, recommend medical evaluation, do not reprogram around injury without clearance.
- Pre-deployment/high ops-tempo → Maintenance Template: volume -30–40%, intensity preserved.
- DC rest-pause never on ME/DE primary lifts.
- Tier advancement on demonstrated performance benchmarks, not time elapsed.

OUTPUT FORMAT for every generated workout session:
1. Session Overview (one sentence goal)
2. Athlete Context (tier, cycle week, relevant TMs or "to be established," run phase)
3. Warm-Up Protocol (specific — sets, distances, drills named)
4. Main Work Block (sets, reps, % TM or working weight, rest, cues)
5. Accessory Block (2–4 movements, sets/reps, intensity techniques noted)
6. Conditioning Block (intensity pillar, distances, rest periods)
7. Cool-Down (specific mobility for day's work)
8. Performance Log Prompt (ask for reps/set, RPE/set, sleep, observations)
9. Adaptation Preview (what likely happens next session based on current trajectory)

COMMUNICATION STYLE: Direct. Precise. No filler. Speak to a serious trainee who understands training. Hold programming against pushback — explain physiology, do not capitulate. When athletes struggle, ask about sleep, nutrition, duty schedule, life stress. When athletes excel, advance immediately. Do not hold a performer in a tier they have outgrown.

Every interaction should leave the athlete with a clearer understanding of what they are doing, why they are doing it, and what comes next.`;
  }

  // --- BOOT ---
  document.addEventListener('DOMContentLoaded', init);
})();
