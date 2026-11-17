const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const byId = id => document.getElementById(id);
const color = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const sin = Math.sin;

const FLOOR = 500;
const UPPER_ARM = 100;
const FOREARM = 95;

function pointOnLine(a, b, t, offset = 0) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy) || 1;
    return [a[0] + dx * t + dy / length * offset, a[1] + dy * t - dx / length * offset];
}

function polar(point, angle, length) {
    return [point[0] + sin(angle) * length, point[1] + Math.cos(angle) * length];
}

function armPoints(shoulder, upperAngle, elbowAngle) {
    const elbow = polar(shoulder, upperAngle, UPPER_ARM);
    return [shoulder, elbow, polar(elbow, upperAngle + elbowAngle, FOREARM)];
}

function standingPose() {
    const hip = [240, FLOOR - 220];
    const shoulder = [hip[0], hip[1] - 115];
    const makeLeg = offset => [
        [hip[0] + offset, hip[1]],
        [240 + offset, FLOOR - 110],
        [240 + offset, FLOOR],
        [270 + offset, FLOOR - 2]
    ];
    return { hip, shoulder, legs: [makeLeg(-8), makeLeg(0)], arms: [], muscles: [] };
}

function drawWeight(hand, radius) {
    ctx.fillStyle = color('--fg');
    ctx.beginPath();
    ctx.arc(hand[0], hand[1], radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color('--card');
    ctx.beginPath();
    ctx.arc(hand[0], hand[1], radius * .25, 0, Math.PI * 2);
    ctx.fill();
}

function applyPhysics(state, torque, config, delta) {
    for (const joint in config) {
        const [strength, damping, min, max] = config[joint];
        const velocity = `velocity${joint}`;
        state[velocity] = (state[velocity] || 0) + (torque[joint] * strength - damping * (state[velocity] || 0)) * delta;
        state[joint] += state[velocity] * delta;
        if (state[joint] < min || state[joint] > max) {
            state[joint] = clamp(state[joint], min, max);
            state[velocity] = 0;
        }
    }
}

const TASKS = {
    curl: {
        name: 'Bicep curl',
        muscles: [
            ['q', 'Biceps brachii', 'Bends elbow'],
            ['w', 'Brachialis', 'Bends elbow'],
            ['e', 'Triceps brachii', 'Straightens elbow']
        ],
        init: () => ({ flex: 0 }),
        config: { flex: [7, 3, 0, 2.6] },
        torque: (state, activation) => ({ flex: activation.q + .7 * activation.w - .9 * activation.e - .55 * sin(state.flex) }),
        pose(state) {
            const body = standingPose();
            const shoulder = body.shoulder;
            const movingArm = armPoints(shoulder, 0, state.flex);
            const elbow = movingArm[1];
            body.arms = [armPoints(shoulder, 0, 0), movingArm];
            body.points = { hand: movingArm[2] };
            body.muscles = [
                ['w', pointOnLine(shoulder, elbow, .45, 6), pointOnLine(elbow, movingArm[2], .22, 5), 13],
                ['q', pointOnLine(shoulder, elbow, .12, 9), pointOnLine(elbow, movingArm[2], .15, 8), 17],
                ['e', pointOnLine(shoulder, elbow, .12, -10), pointOnLine(elbow, movingArm[2], 0, -10), 16]
            ];
            body.drawFront = () => drawWeight(movingArm[2], 11);
            return body;
        },
        stages: [
            { text: 'Curl the weight up to the ring', isDone: state => state.flex >= 2.2, goal: { flex: 2.2 }, point: 'hand' },
            { text: 'Lower it back down', isDone: state => state.flex <= .25, goal: { flex: 0 }, point: 'hand' }
        ]
    },
    pullup: {
        name: 'Pull-up',
        muscles: [
            ['a', 'Left pulling group', 'Latissimus + elbow flexors'],
            ['l', 'Right pulling group', 'Latissimus + elbow flexors']
        ],
        init: () => ({ pull: 0, lean: 0 }),
        config: { pull: [8, 4, 0, 1.3], lean: [5, 6, -.5, .5] },
        torque: (state, activation) => {
            // Each side key represents a simplified latissimus + elbow-flexor synergy.
            const left = activation.a || 0;
            const right = activation.l || 0;
            return {
                pull: 1.25 * left * right - .32 - .2 * state.pull,
                lean: .55 * (left - right) - 1.1 * state.lean
            };
        },
        pose(state) {
            const amount = clamp(state.pull / 1.3, 0, 1);
            const lean = clamp(state.lean, -.5, .5);
            const centerX = 320 + lean * 12;
            const shoulderY = 280 - amount * 118;
            const shoulder = [centerX, shoulderY];
            const hip = [320 - lean * 18, 412 - amount * 108];
            const leftShoulder = [centerX - 48, shoulderY + 10];
            const rightShoulder = [centerX + 48, shoulderY + 10];
            const leftElbow = [232 - amount * 12, 198 + amount * 18];
            const rightElbow = [408 + amount * 12, 198 + amount * 18];
            const leftHand = [210, 108];
            const rightHand = [430, 108];
            return {
                view: 'back', bar: true, shoulder, hip,
                legs: [
                    [hip, [hip[0] - 29, hip[1] + 42], [hip[0] - 26, hip[1] + 92], [hip[0] - 43, hip[1] + 98]],
                    [hip, [hip[0] + 29, hip[1] + 42], [hip[0] + 26, hip[1] + 92], [hip[0] + 43, hip[1] + 98]]
                ],
                arms: [
                    [leftShoulder, leftElbow, leftHand],
                    [rightShoulder, rightElbow, rightHand]
                ],
                points: { chin: [centerX, shoulderY - 20] },
                muscles: [
                    ['a', [leftShoulder[0] + 8, shoulderY + 25], [hip[0] - 26, hip[1] - 18], 25],
                    ['l', [rightShoulder[0] - 8, shoulderY + 25], [hip[0] + 26, hip[1] - 18], 25]
                ],
                drawFront: () => {}
            };
        },
        stages: [
            { text: 'Pull up evenly toward the bar', isDone: state => state.pull >= 1.08 && Math.abs(state.lean) < .14, goal: { pull: 1.3, lean: 0 }, point: 'chin' },
            { text: 'Lower back to the hanging position', isDone: state => state.pull <= .08, goal: { pull: 0, lean: 0 }, point: 'chin' }
        ]
    }
};

const GUIDES = {
    curl: {
        title: 'Elbow flexors: biceps brachii, brachialis, and brachioradialis',
        text: 'These muscles bend the elbow. The biceps also turns the palm up and assists shoulder flexion; the brachialis is a strong elbow flexor in any hand position. The triceps straightens the elbow. Keep the upper arm quiet and wrist neutral to control both lifting and lowering.',
        video: 'https://www.youtube.com/results?search_query=ACE+Fitness+bicep+curl+proper+form'
    },
    pullup: {
        title: 'Back and arm pulling muscles',
        text: 'A pull-up uses more than the latissimus dorsi. The lats help pull the upper arms toward the torso, while elbow flexors such as the biceps brachii and brachialis bend the elbows. Shoulder-blade muscles also help coordinate and stabilize the movement. A and L each represent a simplified pulling group on one side, combining back and elbow-flexor contributions; they are not isolated muscles.',
        video: 'https://pubmed.ncbi.nlm.nih.gov/21068680/'
    }
};

const FORM_STEPS_BY_LEVEL = {
    curl: [
        'CONCENTRIC · Exhale and bend the elbows; keep elbows close to your sides, wrists straight, and shoulders relaxed. Pause at the top without swinging.',
        'ECCENTRIC · Inhale and lower smoothly until arms are nearly straight; keep control and do not let the weight pull your shoulders forward.'
    ],
    pullup: [
        'CONCENTRIC · Hold A and L together to activate the left and right pulling groups. Notice how balanced input moves the back and arms toward the bar.',
        'ECCENTRIC · Release both keys and observe the coordinated back and arm groups as the figure lowers to the hanging start position.'
    ]
};

const LEVEL_INFO = {
    curl: { number: 1, label: 'Level 1 · Bicep Curl', record: 'curl' },
    pullup: { number: 2, label: 'Level 2 · Pull-Up', record: 'pullup' }
};

const PREVIEWS = {
    curl: {
        title: 'Bicep Curl',
        copy: 'Watch the elbow move before you begin. This level practices elbow flexion to curl the weight and elbow extension to lower it with control.',
        hint: 'The upper arm stays quiet while the forearm bends and straightens.',
        aria: 'An animated arm repeatedly bends at the elbow, then straightens',
        markup: '<span class="motion-label extension-label">ELBOW EXTENSION</span><span class="motion-label flexion-label">ELBOW FLEXION</span><svg viewBox="0 0 320 230" aria-hidden="true" focusable="false"><line x1="20" y1="205" x2="300" y2="205" class="demo-floor"/><circle cx="112" cy="48" r="23" class="demo-skin"/><path d="M112 74 L112 150" class="demo-torso"/><path d="M112 148 L78 200 M112 148 L145 200" class="demo-legs"/><path d="M112 84 L160 145" class="demo-upper-arm"/><circle cx="160" cy="145" r="8" class="demo-joint"/><g class="demo-forearm"><path d="M160 145 L247 145" class="demo-limb"/><circle cx="247" cy="145" r="7" class="demo-hand"/></g><path d="M157 116 A33 33 0 0 1 189 139" class="demo-arrow"/><path d="M183 134 L190 140 L181 142" class="demo-arrow-head"/></svg>'
    },
    pullup: {
        title: 'Pull-Up',
        copy: 'Watch the back view as the back and arm muscles work together to pull the body toward the bar, then lower it again.',
        hint: 'A and L represent left and right pulling groups, combining the lats with elbow flexors such as the biceps. Hold both together for a balanced pull.',
        aria: 'A back-view figure moves upward toward a pull-up bar and lowers again',
        markup: '<span class="motion-label extension-label">PAIRED PULL</span><span class="motion-label flexion-label">CONTROLLED RETURN</span><svg viewBox="0 0 320 230" aria-hidden="true" focusable="false"><line x1="35" y1="46" x2="285" y2="46" class="demo-pullup-bar"/><g class="demo-pullup-body"><circle cx="160" cy="89" r="19" class="demo-skin"/><path d="M160 111 L160 177" class="demo-pullup-back"/><path d="M160 125 L129 170 M160 125 L191 170" class="demo-legs"/><path d="M139 122 L105 94 L83 47 M181 122 L215 94 L237 47" class="demo-pullup-limb"/><path d="M145 132 L157 174 M175 132 L163 174" class="demo-pullup-lats"/></g></svg>'
    }
};

let activeLevel = 'curl';
let TASK = TASKS[activeLevel];
let GUIDE = GUIDES[activeLevel];
let FORM_STEPS = FORM_STEPS_BY_LEVEL[activeLevel];
let state = TASK.init();
let stage = 0;
let startedAt = null;
let completed = false;
let levelReady = false;
let resultTimer;
let activation = {};
let held = {};
let keyMeters = {};
let phaseStartedAt = null;
let points = 0;
let accuratePhases = 0;

const bestScores = JSON.parse((() => {
    try { return localStorage.getItem('mm-best'); } catch (error) { return null; }
})() || '{}');

function buildInterface() {
    byId('keys').replaceChildren();
    activation = {};
    held = {};
    keyMeters = {};

    TASK.muscles.forEach(([key, name, role]) => {
        const card = document.createElement('div');
        card.className = 'key';
        card.innerHTML = `<span class="cap">${key.toUpperCase()}</span><b>${name}</b><small>${role}</small><i></i>`;
        const press = event => {
            event.preventDefault();
            if (!levelReady) return;
            held[key] = true;
            begin();
        };
        const release = () => { held[key] = false; };
        card.addEventListener('pointerdown', press);
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(event => card.addEventListener(event, release));
        byId('keys').appendChild(card);
        keyMeters[key] = card.querySelector('i');
        activation[key] = 0;
        held[key] = false;
    });

    byId('overview').innerHTML = `<h2>${GUIDE.title}</h2><p>${GUIDE.text}</p><p><b>Movement checkpoints</b></p><ol>${FORM_STEPS.map(step => `<li>${step}</li>`).join('')}</ol><p><a target="_blank" rel="noopener" href="${GUIDE.video}">Watch an instructional video ↗</a></p>`;
    const best = bestScores[activeLevel];
    byId('info').textContent = `🥇 90+ form points · 🥈 70+ · 🥉 50+ · hold each phase accurately · Space restarts${best ? ` · Best form score: ${best}/100` : ''}`;
}

function reset() {
    clearTimeout(resultTimer);
    state = TASK.init();
    stage = 0;
    startedAt = null;
    completed = false;
    phaseStartedAt = null;
    points = 0;
    accuratePhases = 0;
    byId('stepclock').textContent = '0.0';
    byId('t').textContent = '0.0';
    byId('goal').textContent = '';
    byId('ov').style.display = 'none';
    for (const key in activation) {
        activation[key] = 0;
        held[key] = false;
    }
}

function begin() {
    if (levelReady && startedAt === null && !completed) startedAt = performance.now();
}

function finish() {
    completed = true;
    const seconds = (performance.now() - startedAt) / 1000;
    const medalIndex = points >= 90 ? 0 : points >= 70 ? 1 : points >= 50 ? 2 : 3;
    byId('t').textContent = seconds.toFixed(1);
    byId('med').textContent = ['🥇', '🥈', '🥉', '—'][medalIndex];
    byId('mt').textContent = ['Gold!', 'Silver', 'Bronze', 'No medal'][medalIndex];
    byId('mi').textContent = `${points}/100 form points · ${accuratePhases}/2 accurate phases · ${seconds.toFixed(1)}s total. Medals reward controlled, accurate form.`;

    if (!bestScores[activeLevel] || points > bestScores[activeLevel]) {
        bestScores[activeLevel] = points;
        try { localStorage.setItem('mm-best', JSON.stringify(bestScores)); } catch (error) { }
        buildInterface();
    }
    resultTimer = setTimeout(() => { byId('ov').style.display = 'flex'; }, 150);
}

function renderPreview(levelId) {
    const level = LEVEL_INFO[levelId];
    const preview = PREVIEWS[levelId];
    byId('intro-kicker').textContent = `Level ${level.number} · Movement preview`;
    byId('intro-title').textContent = preview.title;
    byId('intro-copy').textContent = preview.copy;
    byId('intro-hint').textContent = preview.hint;
    byId('motion-demo').innerHTML = preview.markup;
    byId('motion-demo').setAttribute('aria-label', preview.aria);
    byId('start-level').textContent = `Start Level ${level.number}`;
    document.querySelectorAll('.level-option').forEach(button => {
        const selected = button.dataset.level === levelId;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-pressed', String(selected));
    });
}

function selectLevel(levelId) {
    if (!TASKS[levelId]) return;
    activeLevel = levelId;
    TASK = TASKS[levelId];
    GUIDE = GUIDES[levelId];
    FORM_STEPS = FORM_STEPS_BY_LEVEL[levelId];
    byId('current-level').textContent = LEVEL_INFO[levelId].label;
    renderPreview(levelId);
    buildInterface();
    reset();
}

byId('retry').addEventListener('click', reset);
byId('choose-level').addEventListener('click', () => {
    levelReady = false;
    byId('intro').hidden = false;
    reset();
});
document.querySelectorAll('.level-option').forEach(button => {
    button.addEventListener('click', () => selectLevel(button.dataset.level));
});
byId('start-level').addEventListener('click', () => {
    levelReady = true;
    byId('intro').hidden = true;
    reset();
});
addEventListener('keydown', event => {
    if (!levelReady) return;
    if (event.code === 'Space') {
        event.preventDefault();
        reset();
        return;
    }
    const key = event.key.toLowerCase();
    if (key in held) {
        held[key] = true;
        begin();
        event.preventDefault();
    }
});
addEventListener('keyup', event => {
    const key = event.key.toLowerCase();
    if (key in held) held[key] = false;
});

function drawLimb(a, b, width, colorValue) {
    ctx.strokeStyle = colorValue;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
}

function drawPullupBar() {
    ctx.strokeStyle = color('--line');
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(170, 108);
    ctx.lineTo(470, 108);
    ctx.moveTo(180, 108);
    ctx.lineTo(180, FLOOR);
    ctx.moveTo(460, 108);
    ctx.lineTo(460, FLOOR);
    ctx.stroke();
}

function drawHuman(pose) {
    const skin = color('--skin');
    const shorts = color('--short');
    if (pose.view === 'back') {
        pose.legs.forEach((leg, index) => {
            const tone = index === 0 ? color('--skin2') : skin;
            drawLimb(leg[0], leg[1], 25, tone);
            drawLimb(leg[1], leg[2], 19, tone);
            drawLimb(leg[2], leg[3], 12, tone);
        });
        drawLimb(pose.shoulder, pose.hip, 58, color('--skin2'));
        drawLimb([pose.hip[0] - 30, pose.hip[1] + 4], [pose.hip[0] + 30, pose.hip[1] + 4], 28, shorts);
        pose.arms.forEach(arm => {
            drawLimb(arm[0], arm[1], 22, skin);
            drawLimb(arm[1], arm[2], 17, skin);
            ctx.fillStyle = skin;
            ctx.beginPath();
            ctx.arc(arm[2][0], arm[2][1], 9, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.strokeStyle = color('--skin2');
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(pose.shoulder[0] - 25, pose.shoulder[1] + 6);
        ctx.lineTo(pose.shoulder[0] + 25, pose.shoulder[1] + 6);
        ctx.stroke();
        ctx.fillStyle = skin;
        ctx.beginPath();
        ctx.arc(pose.shoulder[0], pose.shoulder[1] - 38, 21, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = color('--card');
        ctx.beginPath();
        ctx.arc(pose.shoulder[0], pose.shoulder[1] - 49, 19, Math.PI, Math.PI * 2);
        ctx.fill();
        return;
    }
    const head = [pose.shoulder[0] + 8, pose.shoulder[1] - 40];

    pose.legs.forEach((leg, index) => {
        const tone = index === 0 ? color('--skin2') : skin;
        drawLimb(leg[0], leg[1], 27, tone);
        drawLimb(leg[1], leg[2], 19, tone);
        drawLimb(leg[2], leg[3], 12, tone);
    });
    drawLimb(pose.shoulder, pose.hip, 42, skin);
    drawLimb([pose.hip[0] - 24, pose.hip[1] + 4], [pose.hip[0] + 23, pose.hip[1] + 4], 28, shorts);

    pose.arms.forEach((arm, index) => {
        const tone = index === 0 ? color('--skin2') : skin;
        drawLimb(arm[0], arm[1], 21, tone);
        drawLimb(arm[1], arm[2], 16, tone);
        ctx.fillStyle = tone;
        ctx.beginPath();
        ctx.arc(arm[2][0], arm[2][1], 8, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(head[0], head[1], 21, 0, Math.PI * 2);
    ctx.fill();
}

function drawMuscle(a, b, width, amount) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = color('--mus');
    ctx.lineWidth = width * .7;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();

    if (amount > .02) {
        ctx.strokeStyle = color('--act');
        ctx.globalAlpha = amount * .85;
        ctx.lineWidth = width * .7;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }
}

function render() {
    const pose = TASK.pose(state);
    const floor = FLOOR;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color('--floor');
    ctx.fillRect(0, floor, canvas.width, canvas.height - floor);
    ctx.strokeStyle = color('--line');
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, floor);
    ctx.lineTo(canvas.width, floor);
    ctx.stroke();

    const goalStage = TASK.stages[Math.min(stage, TASK.stages.length - 1)];
    const goal = TASK.pose({ ...TASK.init(), ...goalStage.goal }).points[goalStage.point];
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = color('--ok');
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(goal[0], goal[1], 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (pose.bar) drawPullupBar();
    drawHuman(pose);
    pose.muscles.forEach(([key, start, end, width]) => drawMuscle(start, end, width, activation[key] || 0));
    pose.drawFront();

    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = color('--fg');
    pose.muscles.forEach(([key, start, end]) => {
        const x = (start[0] + end[0]) / 2;
        const y = (start[1] + end[1]) / 2 + 4;
        ctx.fillText(key.toUpperCase(), x, y);
    });
}

let lastFrame = performance.now();
function frame(now) {
    const delta = Math.min(.033, (now - lastFrame) / 1000);
    lastFrame = now;

    for (const key in activation) {
        activation[key] += ((levelReady && held[key] ? 1 : 0) - activation[key]) * Math.min(1, delta * 10);
        keyMeters[key].style.width = `${activation[key] * 100}%`;
    }

    if (levelReady && !completed) {
        for (let i = 0; i < 2; i++) applyPhysics(state, TASK.torque(state, activation), TASK.config, delta / 2);
        if (startedAt !== null) {
            byId('t').textContent = ((now - startedAt) / 1000).toFixed(1);
            const valid = TASK.stages[stage].isDone(state);
            if (valid) {
                if (phaseStartedAt === null) phaseStartedAt = now;
                const elapsed = (now - phaseStartedAt) / 1000;
                byId('stepclock').textContent = Math.max(0, .5 - elapsed).toFixed(1);
                if (elapsed >= .5) {
                    accuratePhases++;
                    points += 50;
                    stage++;
                    phaseStartedAt = null;
                    byId('stepclock').textContent = '0.5';
                    if (stage >= TASK.stages.length) finish();
                }
            } else {
                phaseStartedAt = null;
                byId('stepclock').textContent = '0.5';
            }
        }
    }

    const phaseIndex = Math.min(stage, TASK.stages.length - 1);
    byId('goal').textContent = completed ? '' : `${Math.min(stage + 1, TASK.stages.length)}/${TASK.stages.length} · ${FORM_STEPS[phaseIndex]} · hold accurate target for 0.5s`;
    render();
    requestAnimationFrame(frame);
}

selectLevel('curl');
requestAnimationFrame(frame);