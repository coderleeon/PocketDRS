# Pocket-DRS

Pocket-DRS is an offline-first, browser-based cricket analytics platform designed to deliver a low-cost, DRS-style experience using a single smartphone camera and a fixed playing environment (e.g., an indoor tiled pitch with a wicket cardboard marker).

---

## Development Strategy: Single Shared Codebase

To ensure stability, simple maintenance, and high performance across devices, Pocket-DRS uses a **single shared codebase** for both desktop and mobile platforms.

### Core Assets Shared:
* **Calibration Logic**: The same coordinate math and homography solvers ([useCalibration.ts](file:///c:/GIT_projects/PocketDRS/frontend/src/hooks/useCalibration.ts)) are used by all devices.
* **OpenCV.js CV Engine**: The video processing loop, grayscaling, absolute difference motion tracking, and HSV masking logic ([tracker.ts](file:///c:/GIT_projects/PocketDRS/frontend/src/core/tracking/tracker.ts)) run identically on all browser instances.
* **Overlay Engine**: Canvas drawing logic ([PitchOverlay.tsx](file:///c:/GIT_projects/PocketDRS/frontend/src/components/PitchOverlay.tsx)) prints the pitch borders, popping creases, wickets, and visual flight path lines uniformly.
* **Data Models & Math**: Geometry algorithms, Shoelace polygon area calculations, and least-squares regression math ([geom.ts](file:///c:/GIT_projects/PocketDRS/frontend/src/core/geometry/geom.ts)) are shared.

### Presentation Adaptation:
* **Unified Interactions**: Interactive drag-and-drop handles ([CalibrationWorkspace.tsx](file:///c:/GIT_projects/PocketDRS/frontend/src/components/CalibrationWorkspace.tsx)) utilize HTML5 **Pointer Events** (`onPointerDown`, `onPointerMove`, `onPointerUp`). This automatically unifies desktop mouse drags and mobile screen touch inputs.
* **Responsive Layouts**: Designed utilizing Tailwind CSS breakpoints to adapt components gracefully from standard smartphone viewports (e.g., iPhone 12/14 and Samsung A52s) to larger desktop grids.
* **Sensor Integration**: Mobile-only capabilities, such as the digital level gyroscope indicator ([ARAlignment.tsx](file:///c:/GIT_projects/PocketDRS/frontend/src/components/ARAlignment.tsx)), fail gracefully or hide automatically on desktop environments.

---

## Architecture Principles

### 1. Offline-First Architecture
For Version 0 (MVP), Pocket-DRS functions completely on-device in the user's browser:
* **Camera Access & Recording**: Accomplished through standard HTML5 Media Devices and `MediaRecorder` APIs.
* **Computer Vision**: High-performance client-side operations (homography calculation, coordinates projection) using **OpenCV.js**.
* **Storage**: Calibration matrices and settings are persisted via browser `localStorage`.
* **Video Playback**: Videos recorded on-device are converted into temporary Object URLs for playback.
No server connections are required to run, record, calibrate, or visualize overlays.

### 2. Browser-First Computer Vision
The client browser is the primary computer vision engine. Future features (ball detection, path tracking, coordinate extraction) will execute client-side. The backend is designated as an analytical decision engine (future LBW projection calculations and match statistics) to minimize bandwidth and hosting costs.

### 3. Video Storage Policy
* Raw video recordings are kept **strictly on-device**. They are never uploaded to the cloud by default.
* Future history scaling will utilize browser `IndexedDB`.
* The cloud backend only receives lightweight, structured coordinate JSON metadata (e.g. ball trajectories, bounce points, calibration points) rather than media files.

---

## Repository Structure

```text
PocketDRS/
├── frontend/                  # Next.js, Tailwind CSS, and TypeScript application
│   ├── src/
│   │   ├── app/               # Next.js App Router and pages
│   │   ├── components/        # Camera, Calibration, Overlay, and Playback components
│   │   ├── core/              # Shared geometry, calibration, tracking, and models
│   │   └── hooks/             # React hooks wrappers
│   └── package.json
└── backend/                   # FastAPI Python application (Railway ready)
    ├── app/                   # FastAPI main entry points
    ├── Dockerfile             # Container configuration for Railway deployment
    └── requirements.txt       # Python dependencies
```

---

## Roadmap

* **Version 0 (MVP)**: Client-side mobile camera capture, on-device recording playback, OpenCV.js-based manual pitch & wicket calibration, persistent overlays, and gyroscope level alignment.
* **Version 1**: Client-side ball detection and tracking.
* **Version 2**: Analytical backend endpoints for LBW decisions (impact, bounce, wicket collision prediction) and speed estimation.
* **Version 3**: Bowling analytics, line/length heatmaps, and session history dashboard.
* **Version 4**: DRS 3D-style replay visualization screen.
* **Future Post-MVP**: 
  * Custom HSV threshold calibration panel.
  * AR-Assisted Calibration (auto-scanning pitch tile boundaries and floor orientation via camera scene understanding).

---

## Local Development Setup

### Prerequisites
* [Node.js](https://nodejs.org/) (v18+)
* [Python](https://www.python.org/) (v3.10+)

### Running the Frontend
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Access [http://localhost:3000](http://localhost:3000) in your browser.

### Running the Backend
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create a virtual environment and install packages:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```
3. Start the server:
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
