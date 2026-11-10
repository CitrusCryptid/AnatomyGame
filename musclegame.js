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

const TASK = {
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
};

const GUIDE = {
    title: 'Elbow flexors: biceps brachii, brachialis, and brachioradialis',
    text: 'These muscles bend the elbow. The biceps also turns the palm up and assists shoulder flexion; the brachialis is a strong elbow flexor in any hand position. The triceps straightens the elbow. Keep the upper arm quiet and wrist neutral to control both lifting and lowering.',
    video: 'https://www.youtube.com/results?search_query=ACE+Fitness+bicep+curl+proper+form'
};
const FORM_STEPS = [
    'CONCENTRIC · Exhale and bend the elbows; keep elbows close to your sides, wrists straight, and shoulders relaxed. Pause at the top without swinging.',
    'ECCENTRIC · Inhale and lower smoothly until arms are nearly straight; keep control and do not let the weight pull your shoulders forward.'
];

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
    const best = bestScores.curl;
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

    if (!bestScores.curl || points > bestScores.curl) {
        bestScores.curl = points;
        try { localStorage.setItem('mm-best', JSON.stringify(bestScores)); } catch (error) { }
        buildInterface();
    }
    resultTimer = setTimeout(() => { byId('ov').style.display = 'flex'; }, 150);
}

byId('retry').addEventListener('click', reset);
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

function drawHuman(pose) {
    const skin = color('--skin');
    const shorts = color('--short');
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

    const goal = TASK.pose({ ...TASK.init(), ...TASK.stages[Math.min(stage, 1)].goal }).points.hand;
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = color('--ok');
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(goal[0], goal[1], 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

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

    byId('goal').textContent = completed ? '' : `${Math.min(stage + 1, 2)}/2 · ${FORM_STEPS[Math.min(stage, 1)]} · hold accurate target for 0.5s`;
    render();
    requestAnimationFrame(frame);
}

buildInterface();
reset();
requestAnimationFrame(frame);