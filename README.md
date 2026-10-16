# Engine Sims - 3D Mechanical & Aerospace Simulations

Interactive 3D mechanical simulations for a **V8 90° Cross-Plane Engine** and a **Twin-Spool Turbofan Jet Engine** built with **React**, **Three.js**, and **Tailwind CSS**, styled with the **Erlangga Tutor** design system with full **Dark & Light Mode** support.

## 🚀 Features

### 1. V8 90° Cross-Plane Engine Simulation
- **Kinematic Accuracy**: Slider-crank mathematics calculating exact connecting rod and piston wrist pin positions.
- **4-Stroke Cycle & Firing Order**: Realistic 720° cycle showing combustion sparks for the standard V8 cross-plane firing order (`1-8-4-3-6-5-7-2`).
- **Overhead Valvetrain**: Synchronized intake and exhaust valve lift animations.
- **Dynamic Telemetry**: Live RPM, horsepower, torque estimation, and cycle angle readout.
- **Exploded View & Cylinder Block Opacity**: Step-by-step assembly separation.

### 2. Twin-Spool Turbofan Jet Engine Simulation
- **Counter-Rotating Dual Spools**:
  - **N1 Low Pressure Spool**: Titanium wide-chord fan, spinner spiral, 3-stage booster compressor, 4-stage LP turbine.
  - **N2 High Pressure Spool**: 6-stage HP axial compressor, 2-stage single-crystal HP turbine.
- **Combustion Chamber & Afterburner (Reheat)**: 16 fuel nozzles, dynamic additive-blended flame cones, and 5 shock diamonds in the exhaust plume.
- **180° Top Section Cutaway**: Seamlessly inspect internal compressor and turbine stages.
- **Aerodynamic Airflow Streamlines**: Distinguishes cold bypass flow and core combustion gas paths.
- **Live FADEC Telemetry**: N1/N2 RPM, EGT (Exhaust Gas Temperature), and Net Thrust (kN).

### 🎨 Erlangga Tutor Design & Themes
- Built with the **Outfit** typography and signature **Erlangga Orange** accents.
- Instant toggle between **Dark Mode** and **Light Mode** that synchronizes UI cards and 3D studio lighting in real-time.

---

## 🛠️ Tech Stack
- **React 19**
- **Three.js**
- **Tailwind CSS v4**
- **Vite**
- **Lucide React**

---

## 💻 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Development Server
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

### 3. Build for Production
```bash
npm run build
```
