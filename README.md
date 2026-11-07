# FormCheck

[Live Demo](https://form-check-sepia.vercel.app)

A browser-based squat tracker built with React, TypeScript, and MediaPipe.
Use a webcam or upload a video to view pose landmarks, estimated knee
angles, and completed squat counts.

**Status:** Working experimental demo. Counting reliability is still
being evaluated.

## Features

- Webcam and local video input
- Live skeleton overlay
- Knee-angle estimation with time-based smoothing
- Movement state machine for counting completed squats
- Start, pause, and reset controls
- Visibility checks that interrupt counting when leg landmarks are lost
- Workout summaries saved in browser local storage
- Pose-detection performance measurements
- Downloadable evaluation reports with timestamped rep events

## Run locally

Use Node.js 22.12+ or a newer supported LTS version.

```bash
npm install
npm run dev
```

Open the localhost URL printed in the terminal.

## Checks

```bash
npm test
npm run lint
npm run build
```

Preview the production build:

```bash
npm run preview
```

Automated tests cover knee-angle geometry, counting behavior,
tracking interruptions, session resets, and performance calculations.

## Using the tracker

1. Choose your camera or upload a supported video.
2. Wait for the pose model to load.
3. Click **Start tracking**.
4. Begin from standing with the hip, knee, and ankle visible.
5. Complete a squat and return to standing.
6. Pause tracking or save the session when finished.

For initial testing, use one person, a stationary side-view camera,
good lighting, and an unobstructed view of the legs.

Saving pauses counting. Saving the same session again updates its entry.
Reset the session to begin a separate workout.

Seeking or replaying an uploaded video resets the current session.
Save or download the evaluation before resetting, switching sources,
or stopping the video.

## How counting works

MediaPipe estimates body landmarks. FormCheck uses the hip, knee,
and ankle coordinates to calculate a two-dimensional knee angle,
accounting for the video's aspect ratio.

The angle is smoothed to reduce jitter. A state machine tracks
standing, lowering, and rising phases.

Initial counting thresholds:

- Standing: knee angle at least 160°
- Lowering begins: knee angle below 145°
- Required minimum angle: 105° or less
- Completion: return to at least 160°
- Minimum movement duration: 600 ms after entering the lowering phase

Tracking interruptions discard unfinished movements while preserving
completed reps. These thresholds are software heuristics, not validated
exercise standards.

The minimum knee angle is a proxy for knee bend, not a measurement
of vertical squat depth.

## Preliminary evaluation

One manually checked uploaded-video run produced:

| Measurement                       | Result            |
| --------------------------------- | ----------------- |
| Manually observed complete squats | 2                 |
| Correctly detected squats         | 2                 |
| Missed reps                       | 0                 |
| Extra counts                      | 0                 |
| Completed pose-detection calls    | 973               |
| Measured processing time          | 17.195 seconds    |
| Average detection-call rate       | 56.6 calls/second |
| Average pose inference time       | 10.84 ms          |

Input: a 3024 × 1898 screen recording played at normal speed in Safari
on a MacBook Pro. Exact hardware specifications were not recorded.

The two-rep check is preliminary and does not establish accuracy across
a larger dataset. Different runs of the same video have previously
produced different counts.

The speed measurement counts completed detection calls and may include
repeated analysis of the same displayed frame. It does not establish
the number of distinct video frames analyzed per second.

The original targets of 90% counting accuracy across 50 squats and
15+ distinct pose updates per second remain unverified.

## Evaluation method

Manually label complete squat movements and their completion timestamps
before running additional evaluation clips.

Match detected rep events to labeled movements one-to-one. Record:

- Correct detections (TP)
- Extra counts (FP)
- Missed reps (FN)
- Precision: TP / (TP + FP)
- Recall: TP / (TP + FN)
- F1: 2TP / (2TP + FP + FN)

Choose and document a timestamp-matching tolerance before evaluation.
Retain repeated runs to measure consistency rather than selecting the
best result.

Record the video source, resolution, playback speed, camera angle,
lighting, browser, and hardware. Keep tuning clips separate from
final evaluation clips.

## Privacy

Video frames are processed in the browser and are not uploaded by
FormCheck. Initial model and runtime loading requires internet access.

Saved summaries stay in browser local storage. They are specific to
the browser and site address and may disappear if browser data is cleared.
Video files are not saved in workout history.

Downloaded evaluation reports include the input filename, browser
information, measurements, and detected-rep timestamps. Review them
before sharing.

## Known limitations

- Counts can vary between runs because of frame sampling and tracking loss.
- Starting mid-movement can miss the first squat.
- Occluded joints, camera motion, and unsuitable angles affect detection.
- Real-time video processing can skip frames.
- A two-dimensional knee angle depends on camera perspective.
- MediaPipe may estimate landmarks inaccurately.
- Feedback is an experimental movement estimate, not medical advice
  or a validated exercise-form assessment.

## Project structure

```text
src/
  App.tsx                  Video inputs and session controls
  PoseOverlay.tsx          Pose detection, rendering, and tracking
  poseMath.ts              Knee-angle calculation
  squatCounter.ts          Movement state machine
  evaluation.ts            Performance and rep-event recording
  sessionStorage.ts        Saved-summary validation and persistence
  WorkoutHistory.tsx       Workout-history interface
```

## Deployment

Deploy as a Vite application:

- Build command: `npm run build`
- Output directory: `dist`
- No API keys or environment variables required

## Next improvements

- Repeatable processing of uploaded-video frames
- Larger evaluation using manually labeled, permitted videos
- Better diagnostics for discarded movements
- More robust handling of short tracking interruptions
