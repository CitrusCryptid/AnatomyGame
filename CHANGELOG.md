# Changelog

Notable changes to the Muscle Mechanics game are recorded here, from the initial scaffold through the current five-level prototype.

## 2026-11-26

- Added Squat, Bench Press, and Deadlift level prototypes. Squat and Deadlift are currently disabled in the picker and marked “Coming Soon.”
- Reworked the Bicep Curl into a guided tutorial: players first try the biceps alone, observe the partial movement, release to lower during the tutorial demonstration, then coordinate the elbow flexors. The curl uses biceps brachii, brachialis, and brachioradialis controls; triceps is not a curl control.
- In the standard Curl level, gravity-driven lowering now unlocks after the player completes the top checkpoint hold.
- Added a Pull-Up tutorial that demonstrates one side before explaining mirrored controls and bilateral coordination.
- Added an in-game tutorial pause overlay. Movement, muscle activation, hold progress, and elapsed time pause until the player continues.
- Simplified the level picker and gameplay prompts, collapsed exercise notes and research links, and added the latest commit ID and date/time to the page.

## 2026-11-20

- Refined the avatar visuals and corrected Pull-Up muscle labels.

## 2026-11-17

- Added the back-view Pull-Up level with left/right muscle controls and bilateral shoulder checkpoints.

## 2026-11-09

- Added a Content Security Policy upgrade directive to require secure resource requests.
- Set the GitHub Pages custom domain to `anatomy.bfmediasolutions.com`.

## 2026-11-06

- Added the site favicon.

## 2026-11-05

- **Initial scaffold (`ac856f2`):** created the game page shell, canvas and interface placeholders, and repository attributes.
- **First playable level (`6cb7a6a`):** implemented Level 1, Bicep Curl, with an animated figure, articulated arm, and visual muscle activation.
- Added muscle controls: hold **Q** for biceps brachii, **W** for brachialis, and **E** for triceps brachii. Muscle activation drives the elbow movement against gravity and resistance.
- Added two movement checkpoints: curl the weight to the target, then lower it with control. Players must hold each target accurately for 0.5 seconds.
- Added elapsed and phase timers, form scoring, medal thresholds, best-score persistence in local storage, restart controls, and keyboard and pointer input.
- Added exercise guidance with concentric and eccentric form cues and a link to instructional material.
- Added the shared sidebar and a Trainer navigation link.
- Added global dark theme styles and adjusted stylesheet and navigation paths.
- Configured the site’s custom domain for GitHub Pages.
