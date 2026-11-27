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

function averageActivation(keys, activation) {
    return keys.reduce((sum, key) => sum + (activation[key] || 0), 0) / keys.length;
}

function muscleGroupScore(keys, activation) {
    return Math.round(50 * averageActivation(keys, activation));
}

let pullupTutorialStep = '';
let pullupTutorialSide = null;
let curlTutorialStep = '';
let tutorialPauseStartedAt = null;

function isTutorialPaused() {
    return ['explain-solo', 'explain-combine'].includes(curlTutorialStep) || pullupTutorialStep === 'explain';
}

function showTutorialPause(title, copy, now) {
    tutorialPauseStartedAt = now;
    byId('level-tutorial-title').textContent = title;
    byId('level-tutorial-copy').textContent = copy;
    byId('level-tutorial-continue').textContent = 'Continue';
    byId('level-tutorial').hidden = false;
    byId('level-tutorial-continue').focus();
}

const TASKS = {
    curl: {
        name: 'Bicep curl',
        controlHelp: 'Tutorial · Start with Q only.',
        muscles: [
            ['q', 'Biceps brachii', 'Bends elbow'],
            ['w', 'Brachialis', 'Primary elbow flexor'],
            ['e', 'Brachioradialis', 'Assists elbow flexion']
        ],
        init: () => ({ flex: 0 }),
        config: { flex: [7, 3, 0, 2.6] },
        torque: (state, activation) => ({ flex: .45 * activation.q + .8 * activation.w + .65 * activation.e - .55 * sin(state.flex) }),
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
                ['e', pointOnLine(shoulder, elbow, .72, -10), pointOnLine(elbow, movingArm[2], .72, -8), 11]
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
        keySide: { a: 'LEFT SIDE', s: 'LEFT SIDE', k: 'RIGHT SIDE', l: 'RIGHT SIDE' },
        sideControls: {
            left: { key: 'f', label: 'Left side', muscles: ['a', 's'] },
            right: { key: 'j', label: 'Right side', muscles: ['k', 'l'] }
        },
        controlHelp: 'Tutorial · Choose one side first.',
        holdHint: 'Both shoulder rings together · keep level · hold 0.5s',
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
            if (pullupTutorialStep === 'choose-side') return { pull: 0, lean: 0 };
            if (pullupTutorialStep === 'one-side-demo') {
                const sideEffort = pullupTutorialSide === 'left' ? left : right;
                return {
                    pull: 1.7 * sideEffort - .42 - .18 * state.pull,
                    lean: .7 * (left - right) - 1.1 * state.lean
                };
            }
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
            const leftShoulder = [centerX - 48, shoulderY + 10 - lean * 22];
            const rightShoulder = [centerX + 48, shoulderY + 10 + lean * 22];
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
                isDone(state) {
                    const pose = TASKS.pullup.pose(state);
                    const target = TASKS.pullup.pose({ pull: 1.3, lean: 0 }).points;
                    const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
                    return distance(pose.points.leftShoulder, target.leftShoulder) <= 24
                        && distance(pose.points.rightShoulder, target.rightShoulder) <= 24
                        && Math.abs(state.lean) <= .08;
                },
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
    },
    squat: {
        name: 'Barbell squat',
        muscles: [
            ['q', 'Quadriceps', 'Extend the knees'],
            ['w', 'Gluteus maximus', 'Extends the hips'],
            ['e', 'Hamstrings', 'Assist hip extension'],
            ['r', 'Erector spinae + core', 'Stabilize the trunk']
        ],
        init: () => ({ depth: 0 }),
        config: { depth: [7, 4, 0, 1.15] },
        torque: (state, activation) => {
            const effort = averageActivation(['q', 'w', 'e', 'r'], activation);
            return { depth: stage === 0 ? .42 - effort * .12 : .15 - effort * 1.05 };
        },
        pose(state) {
            const depth = clamp(state.depth / 1.15, 0, 1);
            const hip = [320, 280 + depth * 88];
            const shoulder = [320 + depth * 22, 165 + depth * 78];
            const leftKnee = [286 - depth * 20, 390 + depth * 28];
            const rightKnee = [354 - depth * 20, 390 + depth * 28];
            const ankles = [[280, 490], [365, 490]];
            const leftArm = [[shoulder[0] - 22, shoulder[1] + 14], [shoulder[0] - 48, shoulder[1] + 5], [shoulder[0] - 83, shoulder[1] - 2]];
            const rightArm = [[shoulder[0] + 22, shoulder[1] + 14], [shoulder[0] + 48, shoulder[1] + 5], [shoulder[0] + 83, shoulder[1] - 2]];
            return {
                shoulder, hip,
                legs: [
                    [hip, leftKnee, ankles[0], [ankles[0][0] + 30, 495]],
                    [hip, rightKnee, ankles[1], [ankles[1][0] + 30, 495]]
                ],
                arms: [leftArm, rightArm],
                points: { hip },
                drawFront: () => {},
                muscles: [
                    ['q', [leftKnee[0] - 8, leftKnee[1] - 58], [leftKnee[0], leftKnee[1] - 8], 18],
                    ['q', [rightKnee[0] + 8, rightKnee[1] - 58], [rightKnee[0], rightKnee[1] - 8], 18],
                    ['w', [hip[0] - 35, hip[1] - 12], [hip[0] - 8, hip[1] + 22], 18],
                    ['e', [hip[0] + 15, hip[1] + 12], [rightKnee[0] + 8, rightKnee[1] - 8], 13],
                    ['r', [shoulder[0] + 5, shoulder[1] + 24], [hip[0] + 5, hip[1] - 20], 12]
                ],
                drawEquipment: () => drawBarbell(145, 495, shoulder[1] + 8)
            };
        },
        stages: [
            { text: 'Lower under control until your hips reach the checkpoint', isDone: state => state.depth >= 1.02, goal: { depth: 1.15 }, point: 'hip', score: (state, activation) => muscleGroupScore(['q', 'w', 'e', 'r'], activation) },
            { text: 'Drive through your feet and stand tall', isDone: state => state.depth <= .08, goal: { depth: 0 }, point: 'hip', score: (state, activation) => muscleGroupScore(['q', 'w', 'e', 'r'], activation) }
        ]
    },
    bench: {
        name: 'Bench press',
        muscles: [
            ['q', 'Pectoralis major', 'Horizontally adducts the arm'],
            ['w', 'Triceps brachii', 'Extends the elbows'],
            ['e', 'Anterior deltoid', 'Assists shoulder flexion']
        ],
        init: () => ({ press: 0 }),
        config: { press: [8, 4, 0, 1.15] },
        torque: (state, activation) => {
            const effort = averageActivation(['q', 'w', 'e'], activation);
            return { press: stage === 0 ? effort * 1.1 - .5 : -.25 + effort * .15 };
        },
        pose(state) {
            const press = clamp(state.press / 1.15, 0, 1);
            const barY = 330 - press * 132;
            const shoulder = [418, 395];
            const hip = [222, 412];
            const elbowA = [398, barY + 48];
            const elbowB = [408, barY + 52];
            const handA = [370, barY];
            const handB = [380, barY];
            return {
                view: 'bench', shoulder, hip,
                points: { bar: [375, barY] },
                drawFront: () => {},
                arms: [[shoulder, elbowA, handA], [shoulder, elbowB, handB]],
                legs: [
                    [hip, [165, 445], [132, 482], [100, 486]],
                    [hip, [195, 445], [175, 482], [150, 486]]
                ],
                muscles: [
                    ['q', [shoulder[0] - 6, shoulder[1] - 17], [shoulder[0] - 68, shoulder[1] + 8], 20],
                    ['w', [shoulder[0] - 8, shoulder[1] + 7], [elbowA[0] - 3, elbowA[1] - 4], 12],
                    ['e', [shoulder[0] - 1, shoulder[1] - 5], [shoulder[0] - 26, shoulder[1] + 23], 13]
                ],
                drawScene: drawBench,
                drawEquipment: () => drawBarbell(285, 475, barY)
            };
        },
        stages: [
            { text: 'Press the bar upward until your elbows extend', isDone: state => state.press >= 1.02, goal: { press: 1.15 }, point: 'bar', score: (state, activation) => muscleGroupScore(['q', 'w', 'e'], activation) },
            { text: 'Lower the bar with control toward your chest', isDone: state => state.press <= .08, goal: { press: 0 }, point: 'bar', score: (state, activation) => muscleGroupScore(['q', 'w', 'e'], activation) }
        ]
    },
    deadlift: {
        name: 'Deadlift',
        muscles: [
            ['q', 'Quadriceps', 'Assist knee extension from the floor'],
            ['w', 'Gluteus maximus', 'Extends the hips'],
            ['e', 'Hamstrings', 'Assist hip extension'],
            ['r', 'Erector spinae', 'Stabilize the spine'],
            ['t', 'Latissimus dorsi', 'Keep the bar close']
        ],
        init: () => ({ lift: 0 }),
        config: { lift: [7, 4, 0, 1.15] },
        torque: (state, activation) => {
            const effort = averageActivation(['q', 'w', 'e', 'r', 't'], activation);
            return { lift: stage === 0 ? effort * 1.15 - .45 : -.3 + effort * .15 };
        },
        pose(state) {
            const lift = clamp(state.lift / 1.15, 0, 1);
            const hip = [320, 390 - lift * 100];
            const shoulder = [320 + (1 - lift) * 48, hip[1] - 108];
            const kneeY = 425 - lift * 48;
            const leftKnee = [288 - (1 - lift) * 12, kneeY];
            const rightKnee = [352 - (1 - lift) * 12, kneeY];
            const barY = 475 - lift * 166;
            const barHand = [382, barY];
            const elbowY = (shoulder[1] + barY) / 2;
            return {
                shoulder, hip,
                points: { bar: [barHand[0], barY] },
                drawFront: () => {},
                legs: [
                    [hip, leftKnee, [280, 490], [310, 495]],
                    [hip, rightKnee, [365, 490], [395, 495]]
                ],
                arms: [
                    [[shoulder[0] - 18, shoulder[1] + 12], [barHand[0] - 17, elbowY], barHand],
                    [[shoulder[0] + 18, shoulder[1] + 12], [barHand[0] + 17, elbowY], [barHand[0] + 12, barY]]
                ],
                muscles: [
                    ['q', [leftKnee[0] - 7, leftKnee[1] - 55], [leftKnee[0], leftKnee[1] - 8], 16],
                    ['w', [hip[0] - 34, hip[1] - 16], [hip[0] - 8, hip[1] + 18], 17],
                    ['e', [hip[0] + 20, hip[1] + 4], [rightKnee[0] + 6, rightKnee[1] - 10], 13],
                    ['r', [shoulder[0] + 4, shoulder[1] + 20], [hip[0] + 4, hip[1] - 18], 12],
                    ['t', [shoulder[0] - 25, shoulder[1] + 24], [hip[0] - 24, hip[1] - 14], 10]
                ],
                drawEquipment: () => drawBarbell(245, 430, barY)
            };
        },
        stages: [
            { text: 'Drive through your feet and stand with the bar close', isDone: state => state.lift >= 1.02, goal: { lift: 1.15 }, point: 'bar', score: (state, activation) => muscleGroupScore(['q', 'w', 'e', 'r', 't'], activation) },
            { text: 'Hinge at your hips and lower the bar to the floor', isDone: state => state.lift <= .08, goal: { lift: 0 }, point: 'bar', score: (state, activation) => muscleGroupScore(['q', 'w', 'e', 'r', 't'], activation) }
        ]
    }
};

const GUIDES = {
    curl: {
        title: 'Elbow flexors: biceps brachii, brachialis, and brachioradialis',
        text: 'The biceps brachii, brachialis, and brachioradialis all help bend the elbow. The biceps also turns the palm up; the brachialis is a strong flexor in any forearm position; and brachioradialis also assists elbow flexion, with its activity influenced by forearm grip. Q, W, and E activate these muscles separately. Release the controls to let gravity lower the weight after the curl. Keep the upper arm quiet and wrist neutral.',
        video: 'https://www.youtube.com/results?search_query=ACE+Fitness+bicep+curl+proper+form',
        literature: [
            ['The Role of the Muscle Brachioradialis in Elbow Flexion: An Electromyographic Study', 'https://pubmed.ncbi.nlm.nih.gov/29409427/'],
            ['Differences in electromyographic activity of biceps brachii and brachioradialis while performing three variants of curl', 'https://pubmed.ncbi.nlm.nih.gov/30013836/']
        ]
    },
    pullup: {
        title: 'Back and arm pulling muscles',
        text: 'The latissimus dorsi helps pull the upper arms toward the torso. The biceps brachii, brachialis, and brachioradialis help flex the elbows, while trapezius and other shoulder-blade muscles help coordinate and stabilize the movement. A/L activate the left/right latissimus; S/K activate the left/right elbow-flexor group. This back view highlights the lats and uses elbow indicators for the flexors because the biceps lie on the front of the arm.',
        video: 'https://pubmed.ncbi.nlm.nih.gov/21068680/',
        literature: [
            ['Electromyographic analysis of muscle activation during pull-up variations', 'https://pubmed.ncbi.nlm.nih.gov/28011412/'],
            ['Avoiding high-risk rotator cuff loading: Muscle force during three pull-up techniques', 'https://pubmed.ncbi.nlm.nih.gov/32715526/']
        ]
    },
    squat: {
        title: 'Squat: legs and trunk',
        text: 'The quadriceps extend the knees, while gluteus maximus and hamstrings contribute to hip extension. The erector spinae and abdominal muscles help stabilize the trunk. Q, W, E, and R activate these groups in the simulation.',
        video: 'https://pubmed.ncbi.nlm.nih.gov/33345183/',
        literature: [
            ['The Effects of Barbell Placement on Kinematics and Muscle Activation Around the Sticking Region in Squats', 'https://pubmed.ncbi.nlm.nih.gov/33345183/'],
            ['Effect of external load on muscle activation during the barbell back squat', 'https://pubmed.ncbi.nlm.nih.gov/35603722/']
        ]
    },
    bench: {
        title: 'Bench press: chest, shoulders, and arms',
        text: 'The pectoralis major and triceps are major contributors to the press; the anterior deltoid assists at the shoulder. Q, W, and E activate these groups separately in the simulation. Keep the movement controlled on the press and return.',
        video: 'https://pubmed.ncbi.nlm.nih.gov/28170449/',
        literature: [
            ['A systematic review of surface electromyography analyses of the bench press movement task', 'https://pubmed.ncbi.nlm.nih.gov/28170449/'],
            ['Effect of verbal instruction on muscle activity during the bench press exercise', 'https://pubmed.ncbi.nlm.nih.gov/22076100/']
        ]
    },
    deadlift: {
        title: 'Deadlift: legs, hips, and trunk',
        text: 'The quadriceps contribute as the bar leaves the floor; gluteus maximus and hamstrings extend the hips. The erector spinae stabilize the trunk, and the lats help keep the bar close. Q, W, E, R, and T activate these groups in the simulation.',
        video: 'https://pubmed.ncbi.nlm.nih.gov/32107499/',
        literature: [
            ['Electromyographic activity in deadlift exercise and its variants: A systematic review', 'https://pubmed.ncbi.nlm.nih.gov/32107499/'],
            ['Analysis of Muscle Strength and Electromyographic Activity during Different Deadlift Positions', 'https://pubmed.ncbi.nlm.nih.gov/40757569/']
        ]
    }
};

const FORM_STEPS_BY_LEVEL = {
    curl: [
        'CONCENTRIC · Exhale and bend the elbows; keep elbows close to your sides, wrists straight, and shoulders relaxed. Pause at the top without swinging.',
        'ECCENTRIC · After reaching the top, release the flexor keys and let gravity lower the weight smoothly; keep control and do not let it pull your shoulders forward.'
    ],
    pullup: [
        'CONCENTRIC · Coordinate A + S on the left with K + L on the right. Use all four groups to pull evenly until both shoulder rings align together.',
        'ECCENTRIC · Release the four inputs and watch the shoulders return to the hanging position together.'
    ],
    squat: [
        'ECCENTRIC · Hold Q + W + E + R together and lower until your hips reach the ring; keep your chest lifted and knees tracking with your feet.',
        'CONCENTRIC · Keep the same muscle groups active and drive up to stand tall without letting your knees collapse inward.'
    ],
    bench: [
        'CONCENTRIC · Hold Q + W + E together to press the bar over your chest until your elbows extend.',
        'ECCENTRIC · Keep the bar controlled as it returns toward your chest; avoid bouncing at the bottom.'
    ],
    deadlift: [
        'CONCENTRIC · Hold Q + W + E + R + T together, push through your feet, and stand while keeping the bar close.',
        'ECCENTRIC · Hinge at your hips and lower the bar under control until it reaches the floor.'
    ]
};

const LEVEL_INFO = {
    curl: { number: 1, label: 'Level 1 · Bicep Curl', record: 'curl' },
    pullup: { number: 2, label: 'Level 2 · Pull-Up', record: 'pullup' },
    squat: { number: 3, label: 'Level 3 · Squat', record: 'squat' },
    bench: { number: 4, label: 'Level 4 · Bench Press', record: 'bench' },
    deadlift: { number: 5, label: 'Level 5 · Deadlift', record: 'deadlift' }
};

const PREVIEWS = {
    curl: {
        title: 'Bicep Curl',
        copy: 'Watch the elbow bend, then straighten.',
        hint: 'The upper arm stays quiet while the forearm bends and straightens.',
        aria: 'An animated arm repeatedly bends at the elbow, then straightens',
        markup: '<span class="motion-label extension-label">ELBOW EXTENSION</span><span class="motion-label flexion-label">ELBOW FLEXION</span><svg viewBox="0 0 320 230" aria-hidden="true" focusable="false"><line x1="20" y1="205" x2="300" y2="205" class="demo-floor"/><circle cx="112" cy="48" r="23" class="demo-skin"/><path d="M112 74 L112 150" class="demo-torso"/><path d="M112 148 L78 200 M112 148 L145 200" class="demo-legs"/><path d="M112 84 L160 145" class="demo-upper-arm"/><circle cx="160" cy="145" r="8" class="demo-joint"/><g class="demo-forearm"><path d="M160 145 L247 145" class="demo-limb"/><circle cx="247" cy="145" r="7" class="demo-hand"/></g><path d="M157 116 A33 33 0 0 1 189 139" class="demo-arrow"/><path d="M183 134 L190 140 L181 142" class="demo-arrow-head"/></svg>'
    },
    pullup: {
        title: 'Pull-Up',
        copy: 'Watch the back rise toward the bar, then lower.',
        hint: 'Watch how the shoulder markers move together. After the level starts, explore the controls shown below the avatar.',
        aria: 'A back-view figure moves upward toward a pull-up bar and lowers again',
        markup: '<span class="motion-label extension-label">PULL UP</span><span class="motion-label flexion-label">LOWER</span><svg viewBox="0 0 360 220" aria-hidden="true" focusable="false"><line x1="68" y1="20" x2="292" y2="20" class="demo-pullup-bar"/><path d="M133 87 L105 63 L101 20 M227 87 L255 63 L259 20" class="demo-pullup-limb"/><g class="demo-pullup-body"><circle cx="180" cy="54" r="19" class="demo-pullup-head"/><ellipse cx="141" cy="87" rx="20" ry="17" class="demo-pullup-shoulder"/><ellipse cx="219" cy="87" rx="20" ry="17" class="demo-pullup-shoulder"/><path d="M143 78 Q180 66 217 78 L229 130 Q180 150 131 130 Z" class="demo-pullup-torso"/><path d="M131 128 Q150 137 169 135 L165 184 L145 184 Z M191 135 Q210 137 229 128 L215 184 L195 184 Z" class="demo-pullup-legs"/><path d="M151 89 Q160 103 173 124 L161 130 Q147 111 139 98 Z M209 89 Q200 103 187 124 L199 130 Q213 111 221 98 Z" class="demo-pullup-lats"/></g><circle cx="105" cy="63" r="8" class="demo-pullup-elbow"/><circle cx="255" cy="63" r="8" class="demo-pullup-elbow"/><text x="26" y="143" class="demo-pullup-label">LATS</text><text x="334" y="143" text-anchor="end" class="demo-pullup-label">LATS</text><text x="84" y="83" text-anchor="end" class="demo-pullup-flexor-label">ELBOW FLEXORS</text><text x="276" y="83" class="demo-pullup-flexor-label">ELBOW FLEXORS</text></svg>'
    },
    squat: {
        title: 'Squat',
        copy: 'Watch the hips and knees bend, then stand.',
        hint: 'Quadriceps, gluteals, hamstrings, and trunk stabilizers contribute across the movement.',
        aria: 'A figure with a barbell lowers into a squat and stands back up',
        markup: '<span class="motion-label extension-label">LOWER</span><span class="motion-label flexion-label">STAND</span><svg viewBox="0 0 360 220" aria-hidden="true" focusable="false"><line x1="20" y1="205" x2="340" y2="205" class="demo-floor"/><g class="demo-squat-bar"><line x1="66" y1="53" x2="294" y2="53" class="demo-pullup-bar"/><line x1="116" y1="48" x2="246" y2="48" class="demo-bar"/><circle cx="112" cy="48" r="13" class="demo-plate"/><circle cx="250" cy="48" r="13" class="demo-plate"/></g><g class="demo-squat-figure"><circle cx="180" cy="56" r="18" class="demo-skin"/><path d="M180 76 L184 132" class="demo-torso"/><path d="M182 91 L128 53 M182 91 L232 53" class="demo-upper-arm"/><path d="M184 130 L138 160 L132 195 M184 130 L220 160 L228 195" class="demo-limb"/><circle cx="184" cy="130" r="7" class="demo-joint"/></g></svg>'
    },
    bench: {
        title: 'Bench Press',
        copy: 'Watch the bar press up, then return to the chest.',
        hint: 'Pectoralis major, triceps, and anterior deltoids contribute to the press.',
        aria: 'A figure lying on a bench presses a bar upward and lowers it',
        markup: '<span class="motion-label extension-label">PRESS</span><span class="motion-label flexion-label">LOWER</span><svg viewBox="0 0 360 220" aria-hidden="true" focusable="false"><line x1="40" y1="174" x2="316" y2="174" class="demo-bench"/><path d="M84 171 L104 204 M280 171 L260 204" class="demo-bench-leg"/><path d="M90 159 L262 159" class="demo-bench-pad"/><path d="M120 145 L244 145" class="demo-bench-body"/><circle cx="263" cy="141" r="17" class="demo-skin"/><g class="demo-bench-arms"><path d="M239 143 L221 105 L193 72 M239 143 L226 105 L204 72" class="demo-limb"/></g><g class="demo-bench-bar"><line x1="150" y1="70" x2="265" y2="70" class="demo-bar"/><circle cx="147" cy="70" r="12" class="demo-plate"/><circle cx="268" cy="70" r="12" class="demo-plate"/></g></svg>'
    },
    deadlift: {
        title: 'Deadlift',
        copy: 'Watch the bar rise close to the body, then lower.',
        hint: 'Quadriceps, gluteals, hamstrings, spinal extensors, and lats contribute to the lift.',
        aria: 'A figure hinges to lift a bar from the floor, stands, and lowers it again',
        markup: '<span class="motion-label extension-label">STAND</span><span class="motion-label flexion-label">HINGE</span><svg viewBox="0 0 360 220" aria-hidden="true" focusable="false"><line x1="20" y1="205" x2="340" y2="205" class="demo-floor"/><g class="demo-deadlift-body"><circle cx="181" cy="70" r="18" class="demo-skin"/><path d="M181 89 L205 137" class="demo-torso"/><path d="M205 137 L153 163 L146 194 M205 137 L229 165 L236 194" class="demo-limb"/><path d="M189 101 L225 150 M197 112 L232 153" class="demo-limb"/></g><g class="demo-deadlift-bar"><line x1="102" y1="190" x2="270" y2="190" class="demo-bar"/><circle cx="98" cy="190" r="13" class="demo-plate"/><circle cx="274" cy="190" r="13" class="demo-plate"/></g></svg>'
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
let directHeld = {};
let sideHeld = {};
let sideToggled = {};
let keyMeters = {};
let keyCards = {};
let sideButtons = {};
let phaseStartedAt = null;
let holdingTarget = false;
let completedCheckpoints = 0;
let points = 0;
let accuratePhases = 0;

const bestScores = JSON.parse((() => {
    try { return localStorage.getItem('mm-best'); } catch (error) { return null; }
})() || '{}');

function buildInterface() {
    byId('keys').replaceChildren();
    byId('side-controls').replaceChildren();
    activation = {};
    held = {};
    directHeld = {};
    sideHeld = {};
    sideToggled = {};
    keyMeters = {};
    keyCards = {};
    sideButtons = {};

    TASK.muscles.forEach(([key, name, role]) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `key${TASK.keySide?.[key] ? ' key--pullup' : ''}`;
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-pressed', 'false');
        card.innerHTML = `${TASK.keySide?.[key] ? `<span class="key-side">${TASK.keySide[key]}</span>` : ''}<span class="cap">${key.toUpperCase()}</span><b>${name}</b><small>${role}</small><span class="key-state">Ready</span><i></i>`;
        const press = event => {
            event.preventDefault();
            if (!levelReady || isTutorialPaused()) return;
            directHeld[key] = true;
            refreshHeldInputs();
            begin();
            if (event.pointerId !== undefined) card.setPointerCapture(event.pointerId);
        };
        const release = () => {
            directHeld[key] = false;
            refreshHeldInputs();
        };
        card.addEventListener('pointerdown', press);
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(event => card.addEventListener(event, release));
        card.addEventListener('click', event => {
            if (event.detail !== 0 || !levelReady || isTutorialPaused()) return;
            directHeld[key] = !directHeld[key];
            refreshHeldInputs();
            if (directHeld[key]) begin();
        });
        byId('keys').appendChild(card);
        keyMeters[key] = card.querySelector('i');
        keyCards[key] = card;
        activation[key] = 0;
        directHeld[key] = false;
        held[key] = false;
    });

    const sideControls = TASK.sideControls || {};
    const hasSideControls = Object.keys(sideControls).length > 0;
    byId('control-help').hidden = !TASK.controlHelp;
    byId('control-help').textContent = TASK.controlHelp || '';
    byId('level-tutorial').hidden = true;
    byId('side-controls').hidden = !hasSideControls;
    Object.entries(sideControls).forEach(([side, control]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'side-control';
        button.setAttribute('aria-pressed', 'false');
        button.innerHTML = `<span class="cap">${control.key.toUpperCase()}</span><b>${control.label}</b><small>Toggle ${control.muscles.map(key => TASK.muscles.find(muscle => muscle[0] === key)?.[1]).join(' + ')}</small>`;
        button.addEventListener('click', () => {
            if (isTutorialPaused()) return;
            sideToggled[side] = !sideToggled[side];
            refreshHeldInputs();
            if (sideToggled[side]) begin();
        });
        byId('side-controls').appendChild(button);
        sideButtons[side] = button;
        sideHeld[side] = false;
        sideToggled[side] = false;
    });

    byId('overview').innerHTML = `<summary>Muscles & anatomy</summary><h2>${GUIDE.title}</h2><p>${GUIDE.text}</p><p><a target="_blank" rel="noopener" href="${GUIDE.video}">More about this exercise ↗</a></p>`;
    const best = bestScores[activeLevel];
    byId('info').textContent = best ? `Best form: ${best}/100` : '';
}

function refreshHeldInputs() {
    Object.keys(directHeld).forEach(key => {
        const paired = Object.entries(TASK.sideControls || {}).some(([side, control]) =>
            control.muscles.includes(key) && (sideHeld[side] || sideToggled[side])
        );
        held[key] = Boolean(directHeld[key] || paired);
        const card = keyCards[key];
        if (!card) return;
        card.setAttribute('aria-pressed', String(held[key]));
        card.classList.toggle('is-held', held[key]);
    });
    Object.entries(sideButtons).forEach(([side, button]) => {
        const active = Boolean(sideHeld[side] || sideToggled[side]);
        button.setAttribute('aria-pressed', String(active));
        button.classList.toggle('is-held', active);
    });
}

function releaseAllControls() {
    Object.keys(directHeld).forEach(key => { directHeld[key] = false; });
    Object.keys(sideHeld).forEach(side => { sideHeld[side] = false; });
    Object.keys(sideToggled).forEach(side => { sideToggled[side] = false; });
    refreshHeldInputs();
}

function setHoldProgress(progress) {
    const percent = Math.round(clamp(progress, 0, 1) * 100);
    byId('hold-fill').style.width = `${percent}%`;
    byId('hold-fill').parentElement.setAttribute('aria-valuenow', String(percent));
}

function controlKeyFromEvent(event) {
    return event.code.startsWith('Key') ? event.code.slice(3).toLowerCase() : '';
}

function setKeyboardControl(key, pressed) {
    const sideEntry = Object.entries(TASK.sideControls || {}).find(([, control]) => control.key === key);
    if (sideEntry) {
        sideHeld[sideEntry[0]] = pressed;
    } else if (key in directHeld) {
        directHeld[key] = pressed;
    } else {
        return false;
    }
    refreshHeldInputs();
    if (pressed) begin();
    return true;
}

function reset() {
    clearTimeout(resultTimer);
    state = TASK.init();
    stage = 0;
    startedAt = null;
    completed = false;
    phaseStartedAt = null;
    holdingTarget = false;
    completedCheckpoints = 0;
    pullupTutorialStep = activeLevel === 'pullup' && levelReady ? 'choose-side' : '';
    pullupTutorialSide = null;
    curlTutorialStep = activeLevel === 'curl' && levelReady ? 'choose-biceps' : '';
    tutorialPauseStartedAt = null;
    points = 0;
    accuratePhases = 0;
    byId('stepclock').textContent = '0.0';
    setHoldProgress(0);
    byId('hold-status').textContent = TASK.holdHint || 'Reach ring · hold 0.5s';
    byId('t').textContent = '0.0';
    byId('goal').textContent = '';
    byId('ov').style.display = 'none';
    byId('level-tutorial').hidden = true;
    tutorialPauseStartedAt = null;
    if (levelReady && activeLevel === 'curl') {
        byId('control-help').textContent = 'Tutorial · Start with Q only.';
    } else if (activeLevel === 'pullup' && levelReady) {
        byId('control-help').textContent = 'Tutorial · Choose one side first.';
    }
    for (const key in activation) {
        activation[key] = 0;
        directHeld[key] = false;
    }
    Object.keys(sideHeld).forEach(side => { sideHeld[side] = false; });
    Object.keys(sideToggled).forEach(side => {
        sideToggled[side] = false;
        sideButtons[side]?.setAttribute('aria-pressed', 'false');
        sideButtons[side]?.classList.remove('is-held');
    });
    refreshHeldInputs();
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
    byId('mi').textContent = `${points}/100 · ${accuratePhases}/2 holds · ${seconds.toFixed(1)}s`;

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
    byId('intro-literature').innerHTML = `<h2>Research behind this level</h2><ul>${GUIDE.literature.map(([title, url]) => `<li><a target="_blank" rel="noopener" href="${url}">${title} ↗</a></li>`).join('')}</ul><p>These studies report muscle activity or modeled forces during specific exercises; they inform the muscle selection but do not establish one universally best technique.</p>`;
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
byId('level-tutorial-continue').addEventListener('click', () => {
    if (!isTutorialPaused()) return;
    const pausedFor = tutorialPauseStartedAt === null ? 0 : performance.now() - tutorialPauseStartedAt;
    if (startedAt !== null) startedAt += pausedFor;
    if (phaseStartedAt !== null) phaseStartedAt += pausedFor;
    tutorialPauseStartedAt = null;
    releaseAllControls();
    if (activeLevel === 'curl' && curlTutorialStep === 'explain-solo') {
        curlTutorialStep = 'solo-return';
        byId('control-help').textContent = 'Release Q · Watch the arm lower.';
    } else if (activeLevel === 'curl' && curlTutorialStep === 'explain-combine') {
        curlTutorialStep = 'full-practice';
        state = TASK.init();
        stage = 0;
        phaseStartedAt = null;
        holdingTarget = false;
        byId('stepclock').textContent = '0.0';
        setHoldProgress(0);
        byId('hold-status').textContent = 'Reach the ring · hold 0.5s';
        byId('control-help').textContent = 'Q + W/E · Reach the top, then release to lower.';
    } else if (activeLevel === 'pullup' && pullupTutorialStep === 'explain') {
        pullupTutorialStep = 'full-practice';
        pullupTutorialSide = null;
        state = TASK.init();
        stage = 0;
        phaseStartedAt = null;
        holdingTarget = false;
        setHoldProgress(0);
        byId('stepclock').textContent = '0.0';
        byId('hold-status').textContent = 'Both shoulder rings · hold 0.5s';
        byId('control-help').textContent = 'Both sides · A/S + K/L · Stay level.';
    }
    Object.keys(activation).forEach(key => {
        activation[key] = 0;
        keyMeters[key].style.width = '0%';
    });
    byId('level-tutorial').hidden = true;
    keyCards[Object.keys(keyCards)[0]]?.focus();
});
addEventListener('keydown', event => {
    if (!levelReady) return;
    if (isTutorialPaused()) {
        if (!['Tab', 'Enter', ' '].includes(event.key)) event.preventDefault();
        return;
    }
    if (event.code === 'Space') {
        if (event.target.closest?.('.key, .side-control')) return;
        event.preventDefault();
        reset();
        return;
    }
    const key = controlKeyFromEvent(event);
    if (setKeyboardControl(key, true)) {
        event.preventDefault();
    }
});
addEventListener('keyup', event => {
    const key = controlKeyFromEvent(event);
    setKeyboardControl(key, false);
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

function drawBarbell(x1, x2, y) {
    ctx.strokeStyle = color('--fg');
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
    ctx.fillStyle = color('--line');
    ctx.strokeStyle = color('--fg');
    ctx.lineWidth = 2;
    [x1 + 10, x2 - 10].forEach(x => {
        ctx.beginPath();
        ctx.roundRect(x - 10, y - 25, 20, 50, 4);
        ctx.fill();
        ctx.stroke();
    });
}

function drawBench() {
    ctx.strokeStyle = color('--line');
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(165, 426);
    ctx.lineTo(490, 426);
    ctx.moveTo(250, 426);
    ctx.lineTo(220, FLOOR);
    ctx.moveTo(430, 426);
    ctx.lineTo(460, FLOOR);
    ctx.stroke();
    ctx.strokeStyle = color('--fg');
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(295, 330);
    ctx.lineTo(295, 458);
    ctx.moveTo(470, 330);
    ctx.lineTo(470, 458);
    ctx.stroke();
}

function drawBenchHuman(pose) {
    const skin = color('--skin');
    const shadow = color('--skin2');
    pose.legs.forEach(leg => {
        drawLimb(leg[0], leg[1], 27, shadow);
        drawLimb(leg[1], leg[2], 19, skin);
        drawLimb(leg[2], leg[3], 13, skin);
    });
    pose.arms.forEach(arm => {
        drawLimb(arm[0], arm[1], 21, shadow);
        drawLimb(arm[1], arm[2], 15, skin);
    });
    drawLimb(pose.hip, pose.shoulder, 42, skin);
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(pose.shoulder[0] + 26, pose.shoulder[1] - 22, 21, 0, Math.PI * 2);
    ctx.fill();
    pose.arms.forEach(arm => {
        drawLimb(arm[0], arm[1], 21, shadow);
        drawLimb(arm[1], arm[2], 15, skin);
    });
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
    if (pose.view === 'bench') {
        drawBenchHuman(pose);
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
    pose.drawScene?.();
    if (pose.bar) drawPullupBar();
    drawHuman(pose);
    pose.drawEquipment?.();
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
    const paused = isTutorialPaused();

    for (const key in activation) {
        if (!paused) activation[key] += ((levelReady && held[key] ? 1 : 0) - activation[key]) * Math.min(1, delta * 10);
        keyMeters[key].style.width = `${activation[key] * 100}%`;
        const card = keyCards[key];
        if (card) {
            const stateLabel = held[key] ? 'Pressed' : activation[key] > .12 ? 'Active' : 'Ready';
            const stateElement = card.querySelector('.key-state');
            if (stateElement.textContent !== stateLabel) stateElement.textContent = stateLabel;
            card.classList.toggle('is-active', activation[key] > .12);
        }
    }

    if (levelReady && !completed) {
        if (activeLevel === 'curl' && curlTutorialStep === 'choose-biceps' && held.q && !held.w && !held.e) {
            curlTutorialStep = 'biceps-only';
            byId('control-help').textContent = 'Q only · Watch the arm move.';
        }
        if (activeLevel === 'pullup' && pullupTutorialStep === 'choose-side') {
            if (held.a && held.s && !held.k && !held.l) {
                pullupTutorialSide = 'left';
                pullupTutorialStep = 'one-side-demo';
                byId('control-help').textContent = 'Left side · Watch the shoulders.';
            } else if (held.k && held.l && !held.a && !held.s) {
                pullupTutorialSide = 'right';
                pullupTutorialStep = 'one-side-demo';
                byId('control-help').textContent = 'Right side · Watch the shoulders.';
            }
        }
        if (!isTutorialPaused()) {
            for (let i = 0; i < 2; i++) applyPhysics(state, TASK.torque(state, activation), TASK.config, delta / 2);
        }
        if (activeLevel === 'curl' && curlTutorialStep === 'biceps-only' && state.flex >= 1.05) {
            curlTutorialStep = 'explain-solo';
            releaseAllControls();
            showTutorialPause('Pause · Biceps alone', 'In this game’s simplified model, Q moves the curl partway. Continue, then release Q and watch gravity lower the arm.', now);
        }
        if (activeLevel === 'curl' && curlTutorialStep === 'solo-return' && state.flex <= .25) {
            curlTutorialStep = 'explain-combine';
            showTutorialPause('Pause · Add elbow flexors', 'Now combine Q with W or E. The biceps, brachialis, and brachioradialis can move the curl to the top checkpoint.', now);
        }
        if (activeLevel === 'pullup' && pullupTutorialStep === 'one-side-demo' && state.pull >= .42) {
            pullupTutorialStep = 'explain';
            releaseAllControls();
            byId('control-help').textContent = 'Paused · Controls mirror left/right.';
            showTutorialPause('Pause · Both sides together', 'One side moved first. A + S mirror K + L. Continue, then use both sides together and keep your shoulders level.', now);
        }
        if (startedAt !== null && !isTutorialPaused()) {
            byId('t').textContent = ((now - startedAt) / 1000).toFixed(1);
            const valid = TASK.stages[stage].isDone(state);
            if (valid) {
                if (phaseStartedAt === null) {
                    phaseStartedAt = now;
                    holdingTarget = true;
                    byId('hold-status').textContent = 'In ring · hold steady';
                }
                const elapsed = (now - phaseStartedAt) / 1000;
                byId('stepclock').textContent = Math.min(.5, elapsed).toFixed(1);
                setHoldProgress(elapsed / .5);
                if (elapsed >= .5) {
                    accuratePhases++;
                    const phaseScore = TASK.stages[stage].score ? TASK.stages[stage].score(state, activation) : 50;
                    points += phaseScore;
                    completedCheckpoints++;
                    stage++;
                    phaseStartedAt = null;
                    holdingTarget = false;
                    if (stage >= TASK.stages.length) {
                        byId('stepclock').textContent = '0.5';
                        setHoldProgress(1);
                        byId('hold-status').textContent = 'Both checkpoints complete.';
                        finish();
                    } else {
                        byId('stepclock').textContent = '0.0';
                        setHoldProgress(0);
                        byId('hold-status').textContent = `Checkpoint ${completedCheckpoints} · ${TASK.stages[stage].text}`;
                    }
                }
            } else {
                if (holdingTarget) {
                    byId('hold-status').textContent = TASK.holdHint
                        ? 'Hold reset · return both shoulders to the rings.'
                        : 'Hold reset · return to the ring.';
                }
                holdingTarget = false;
                phaseStartedAt = null;
                byId('stepclock').textContent = '0.0';
                setHoldProgress(0);
            }
        }
    }

    const phaseIndex = Math.min(stage, TASK.stages.length - 1);
    if (completed) {
        byId('goal').textContent = '';
    } else if (activeLevel === 'curl' && curlTutorialStep === 'choose-biceps') {
        byId('goal').textContent = 'Tutorial · Press Q only.';
    } else if (activeLevel === 'curl' && curlTutorialStep === 'biceps-only') {
        byId('goal').textContent = 'Tutorial · Watch the curl.';
    } else if (activeLevel === 'curl' && curlTutorialStep === 'solo-return') {
        byId('goal').textContent = 'Tutorial · Release Q.';
    } else if (activeLevel === 'curl' && curlTutorialStep === 'explain-solo') {
        byId('goal').textContent = 'Paused · Biceps alone';
    } else if (activeLevel === 'curl' && curlTutorialStep === 'explain-combine') {
        byId('goal').textContent = 'Paused · Combine flexors';
    } else if (activeLevel === 'curl' && curlTutorialStep === 'full-practice') {
        byId('goal').textContent = `Step ${Math.min(stage + 1, TASK.stages.length)} of ${TASK.stages.length} · ${TASK.stages[phaseIndex].text}`;
    } else if (activeLevel === 'pullup' && pullupTutorialStep === 'choose-side') {
        byId('goal').textContent = 'Tutorial · Choose one side.';
    } else if (activeLevel === 'pullup' && pullupTutorialStep === 'one-side-demo') {
        byId('goal').textContent = 'Tutorial · Watch the shoulders.';
    } else if (activeLevel === 'pullup' && pullupTutorialStep === 'explain') {
        byId('goal').textContent = 'Paused · Both sides together';
    } else {
        byId('goal').textContent = `Step ${Math.min(stage + 1, TASK.stages.length)} of ${TASK.stages.length} · ${TASK.stages[phaseIndex].text}`;
    }
    render();
    requestAnimationFrame(frame);
}

selectLevel('curl');
requestAnimationFrame(frame);
