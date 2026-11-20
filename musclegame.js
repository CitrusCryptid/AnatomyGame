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

function elbowPoint(shoulder, hand, side, segmentLength = 102) {
    const dx = hand[0] - shoulder[0];
    const dy = hand[1] - shoulder[1];
    const distance = Math.max(1, Math.hypot(dx, dy));
    const half = Math.min(distance / 2, segmentLength - .01);
    const height = Math.sqrt(Math.max(0, segmentLength * segmentLength - half * half));
    const perpendicularX = -dy / distance;
    const perpendicularY = dx / distance;
    return [
        (shoulder[0] + hand[0]) / 2 + perpendicularX * height * side,
        (shoulder[1] + hand[1]) / 2 + perpendicularY * height * side
    ];
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
            ['a', 'Left latissimus dorsi', 'Pulls the upper arm down'],
            ['s', 'Left elbow flexors', 'Biceps + brachialis'],
            ['k', 'Right elbow flexors', 'Biceps + brachialis'],
            ['l', 'Right latissimus dorsi', 'Pulls the upper arm down']
        ],
        init: () => ({ pull: 0, lean: 0 }),
        config: { pull: [8, 4, 0, 1.3], lean: [5, 6, -.5, .5] },
        torque: (state, activation) => {
            const left = .65 * (activation.a || 0) + .35 * (activation.s || 0);
            const right = .65 * (activation.l || 0) + .35 * (activation.k || 0);
            return {
                pull: 1.7 * Math.min(left, right) - .42 - .18 * state.pull,
                lean: .7 * (left - right) - 1.1 * state.lean
            };
        },
        pose(state) {
            const amount = clamp(state.pull / 1.3, 0, 1);
            const lean = clamp(state.lean, -.5, .5);
            const centerX = 320 + lean * 12;
            const shoulderY = 280 - amount * 118;
            const shoulder = [centerX, shoulderY];
            const hip = [320 - lean * 18, 412 - amount * 108];
            const leftShoulder = [centerX - 48, shoulderY + 10 + lean * 22];
            const rightShoulder = [centerX + 48, shoulderY + 10 - lean * 22];
            const leftHand = [245, 108];
            const rightHand = [395, 108];
            const leftElbow = elbowPoint(leftShoulder, leftHand, -1);
            const rightElbow = elbowPoint(rightShoulder, rightHand, 1);
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
                points: {
                    chin: [centerX, shoulderY - 20],
                    leftShoulder,
                    rightShoulder
                },
                muscles: [
                    ['a', [leftShoulder[0] + 8, shoulderY + 25], [hip[0] - 26, hip[1] - 18], 25],
                    ['l', [rightShoulder[0] - 8, shoulderY + 25], [hip[0] + 26, hip[1] - 18], 25]
                ],
                flexorPoints: [['s', leftElbow], ['k', rightElbow]],
                drawFront: () => {}
            };
        },
        stages: [
            {
                text: 'Pull until both shoulders reach their rings together, without leaning',
                isDone: state => state.pull >= 1.08,
                goal: { pull: 1.3, lean: 0 },
                checkpoints: ['leftShoulder', 'rightShoulder'],
                score(state, activation) {
                    const pose = TASKS.pullup.pose(state);
                    const targets = TASKS.pullup.pose({ pull: 1.3, lean: 0 }).points;
                    const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
                    const leftError = distance(pose.points.leftShoulder, targets.leftShoulder);
                    const rightError = distance(pose.points.rightShoulder, targets.rightShoulder);
                    const levelFactor = clamp(1 - Math.abs(state.lean) / .35, 0, 1);
                    const allGroupsActive = ['a', 's', 'k', 'l'].every(key => (activation[key] || 0) >= .85);
                    if (leftError <= 16 && rightError <= 16 && Math.abs(state.lean) <= .04 && allGroupsActive) return 50;
                    const proximity = clamp(1 - (leftError + rightError) / 70, 0, 1);
                    const synchrony = clamp(1 - Math.abs(leftError - rightError) / 35, 0, 1);
                    const muscleUse = .65 * ((activation.a + activation.l) / 2) + .35 * ((activation.s + activation.k) / 2);
                    return Math.round(49 * proximity * synchrony * levelFactor * muscleUse);
                }
            },
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
        text: 'The latissimus dorsi helps pull the upper arms toward the torso. The biceps brachii, brachialis, and brachioradialis help flex the elbows, while trapezius and other shoulder-blade muscles help coordinate and stabilize the movement. A/L activate the left/right latissimus; S/K activate the left/right elbow-flexor group. This back view highlights the lats and uses elbow indicators for the flexors because the biceps lie on the front of the arm.',
        video: 'https://pubmed.ncbi.nlm.nih.gov/21068680/'
    }
};

const FORM_STEPS_BY_LEVEL = {
    curl: [
        'CONCENTRIC · Exhale and bend the elbows; keep elbows close to your sides, wrists straight, and shoulders relaxed. Pause at the top without swinging.',
        'ECCENTRIC · Inhale and lower smoothly until arms are nearly straight; keep control and do not let the weight pull your shoulders forward.'
    ],
    pullup: [
        'CONCENTRIC · Coordinate A + S on the left with K + L on the right. Use all four groups to pull evenly until both shoulder rings align together.',
        'ECCENTRIC · Release the four inputs and watch the shoulders return to the hanging position together.'
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
        copy: 'Watch the back view as the lats and elbow flexors work together to pull the body toward the bar, then lower it again.',
        hint: 'A/L activate the left/right lats; S/K activate the left/right elbow flexors. Coordinate all four for full points and no lean.',
        aria: 'A back-view figure moves upward toward a pull-up bar and lowers again',
        markup: '<span class="motion-label extension-label">PULL UP</span><span class="motion-label flexion-label">LOWER</span><svg viewBox="0 0 360 220" aria-hidden="true" focusable="false"><line x1="68" y1="20" x2="292" y2="20" class="demo-pullup-bar"/><path d="M133 87 L105 63 L101 20 M227 87 L255 63 L259 20" class="demo-pullup-limb"/><g class="demo-pullup-body"><circle cx="180" cy="54" r="19" class="demo-pullup-head"/><ellipse cx="141" cy="87" rx="20" ry="17" class="demo-pullup-shoulder"/><ellipse cx="219" cy="87" rx="20" ry="17" class="demo-pullup-shoulder"/><path d="M143 78 Q180 66 217 78 L229 130 Q180 150 131 130 Z" class="demo-pullup-torso"/><path d="M131 128 Q150 137 169 135 L165 184 L145 184 Z M191 135 Q210 137 229 128 L215 184 L195 184 Z" class="demo-pullup-legs"/><path d="M151 89 Q160 103 173 124 L161 130 Q147 111 139 98 Z M209 89 Q200 103 187 124 L199 130 Q213 111 221 98 Z" class="demo-pullup-lats"/></g><circle cx="105" cy="63" r="8" class="demo-pullup-elbow"/><circle cx="255" cy="63" r="8" class="demo-pullup-elbow"/><text x="26" y="143" class="demo-pullup-label">LATS</text><text x="334" y="143" text-anchor="end" class="demo-pullup-label">LATS</text><text x="84" y="83" text-anchor="end" class="demo-pullup-flexor-label">ELBOW FLEXORS</text><text x="276" y="83" class="demo-pullup-flexor-label">ELBOW FLEXORS</text></svg>'
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

function drawPullupHuman(pose) {
    const skin = color('--skin');
    const shadow = color('--skin2');
    const shorts = color('--short');
    const cx = pose.shoulder[0];
    const sy = pose.shoulder[1];
    const hx = pose.hip[0];
    const hy = pose.hip[1];

    // Legs and arms sit behind the torso, with limb widths scaled to the head and trunk.
    pose.legs.forEach(leg => {
        drawLimb(leg[0], leg[1], 29, shadow);
        drawLimb(leg[1], leg[2], 22, skin);
        drawLimb(leg[2], leg[3], 13, skin);
    });
    pose.arms.forEach(arm => {
        drawLimb(arm[0], arm[1], 27, skin);
        drawLimb(arm[1], arm[2], 21, skin);
    });

    // Tapered torso silhouette with broad shoulders, a narrower waist, and defined hips.
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(cx - 48, sy + 5);
    ctx.bezierCurveTo(cx - 66, sy + 22, hx - 55, hy - 44, hx - 37, hy + 3);
    ctx.lineTo(hx + 37, hy + 3);
    ctx.bezierCurveTo(hx + 55, hy - 44, cx + 66, sy + 22, cx + 48, sy + 5);
    ctx.quadraticCurveTo(cx, sy - 10, cx - 48, sy + 5);
    ctx.closePath();
    ctx.fill();

    // Shoulder caps and posterior muscle shapes preserve the rear camera angle.
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.ellipse(cx - 48, sy + 16, 28, 24, -.22, 0, Math.PI * 2);
    ctx.ellipse(cx + 48, sy + 16, 28, 24, .22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color('--mus');
    ctx.globalAlpha = .48;
    ctx.beginPath();
    ctx.moveTo(cx - 16, sy + 7);
    ctx.quadraticCurveTo(cx - 35, sy + 28, cx - 42, sy + 54);
    ctx.quadraticCurveTo(cx - 14, sy + 67, cx, sy + 79);
    ctx.quadraticCurveTo(cx + 14, sy + 67, cx + 42, sy + 54);
    ctx.quadraticCurveTo(cx + 35, sy + 28, cx + 16, sy + 7);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 42, sy + 48);
    ctx.quadraticCurveTo(hx - 55, sy + 92, hx - 30, hy - 10);
    ctx.quadraticCurveTo(hx - 4, hy - 22, hx - 5, sy + 82);
    ctx.quadraticCurveTo(cx - 12, sy + 65, cx - 42, sy + 48);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 42, sy + 48);
    ctx.quadraticCurveTo(hx + 55, sy + 92, hx + 30, hy - 10);
    ctx.quadraticCurveTo(hx + 4, hy - 22, hx + 5, sy + 82);
    ctx.quadraticCurveTo(cx + 12, sy + 65, cx + 42, sy + 48);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // Spine and scapular contours clarify orientation without changing the visual palette.
    ctx.strokeStyle = color('--line');
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, sy + 30);
    ctx.lineTo(hx, hy - 7);
    ctx.moveTo(cx - 39, sy + 42);
    ctx.quadraticCurveTo(cx - 27, sy + 76, cx - 7, sy + 70);
    ctx.moveTo(cx + 39, sy + 42);
    ctx.quadraticCurveTo(cx + 27, sy + 76, cx + 7, sy + 70);
    ctx.stroke();

    ctx.fillStyle = shorts;
    ctx.beginPath();
    ctx.moveTo(hx - 38, hy - 3);
    ctx.quadraticCurveTo(hx, hy + 13, hx + 38, hy - 3);
    ctx.lineTo(hx + 34, hy + 23);
    ctx.lineTo(hx - 34, hy + 23);
    ctx.closePath();
    ctx.fill();

    // Neck, rear of head, hair, elbows, and gripping hands.
    drawLimb([cx, sy + 4], [cx, sy - 16], 20, shadow);
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(cx, sy - 41, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color('--card');
    ctx.beginPath();
    ctx.arc(cx, sy - 49, 22, Math.PI, Math.PI * 2);
    ctx.fill();
    pose.arms.forEach(arm => {
        ctx.fillStyle = shadow;
        ctx.beginPath();
        ctx.arc(arm[1][0], arm[1][1], 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = skin;
        ctx.beginPath();
        ctx.arc(arm[2][0], arm[2][1], 12, 0, Math.PI * 2);
        ctx.fill();
    });
}

function drawHuman(pose) {
    const skin = color('--skin');
    const shorts = color('--short');
    if (pose.view === 'back') {
        drawPullupHuman(pose);
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

function drawFlexorIndicator(point, amount, key) {
    ctx.beginPath();
    ctx.arc(point[0], point[1], 15, 0, Math.PI * 2);
    ctx.lineWidth = 5;
    ctx.strokeStyle = color('--mus');
    ctx.stroke();
    if (amount > .02) {
        ctx.beginPath();
        ctx.arc(point[0], point[1], 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * amount);
        ctx.lineWidth = 5;
        ctx.strokeStyle = color('--act');
        ctx.stroke();
    }

    const left = key === 's';
    const labelX = point[0] + (left ? -22 : 22);
    const labelY = point[1] + 27;
    ctx.textAlign = left ? 'right' : 'left';
    ctx.font = 'bold 11px system-ui';
    const titleWidth = ctx.measureText('ELBOW FLEXORS').width;
    ctx.font = '10px system-ui';
    const muscleWidth = ctx.measureText(`${key.toUpperCase()} · BICEPS + BRACHIALIS`).width;
    const width = Math.max(titleWidth, muscleWidth);
    ctx.fillStyle = 'rgba(20, 20, 20, .9)';
    ctx.fillRect(left ? labelX - width - 6 : labelX - 6, labelY - 14, width + 12, 31);
    ctx.fillStyle = color('--fg');
    ctx.font = 'bold 11px system-ui';
    ctx.fillText('ELBOW FLEXORS', labelX, labelY - 2);
    ctx.fillStyle = color('--act');
    ctx.font = '10px system-ui';
    ctx.fillText(`${key.toUpperCase()} · BICEPS + BRACHIALIS`, labelX, labelY + 11);
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
    const goalPose = TASK.pose({ ...TASK.init(), ...goalStage.goal });
    const goals = goalStage.checkpoints
        ? goalStage.checkpoints.map(name => goalPose.points[name])
        : [goalPose.points[goalStage.point]];
    if (pose.bar) drawPullupBar();
    drawHuman(pose);
    pose.muscles.forEach(([key, start, end, width]) => drawMuscle(start, end, width, activation[key] || 0));
    (pose.flexorPoints || []).forEach(([key, point]) => drawFlexorIndicator(point, activation[key] || 0, key));
    pose.drawFront();

    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = color('--ok');
    ctx.lineWidth = 3;
    goals.forEach(goal => {
        ctx.beginPath();
        ctx.arc(goal[0], goal[1], 24, 0, Math.PI * 2);
        ctx.stroke();
    });
    ctx.setLineDash([]);

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
                    const phaseScore = TASK.stages[stage].score ? TASK.stages[stage].score(state, activation) : 50;
                    points += phaseScore;
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