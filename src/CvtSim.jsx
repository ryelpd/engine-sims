import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import {
  Box,
  Grid3x3,
  Layers,
  Orbit,
  Pause,
  Play,
  RotateCcw,
  Sparkles
} from 'lucide-react';

function SquareRange({ min, max, step, value, label, onChange }) {
  const pct = ((Number(value) - min) / (max - min)) * 100;
  return (
    <div className="relative flex h-8 items-center">
      <span className="pointer-events-none absolute top-1/2 right-0 left-0 h-2 -translate-y-1/2 bg-[#d5dce3]" />
      <span
        className="pointer-events-none absolute top-1/2 left-0 h-2 -translate-y-1/2 bg-[#fb6514]"
        style={{ width: `calc(${pct / 100} * (100% - 16px) + 8px)` }}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={onChange}
        className="square-range relative z-10 h-8 w-full cursor-pointer"
      />
    </div>
  );
}

// ============================================================================
// CONTINUOUSLY VARIABLE TRANSMISSION (CVT) SPECIFICATION & KINEMATICS
// ============================================================================
// Transverse layout with two parallel shafts along Z axis:
//   Primary Pulley (Input / Drive) at (x = -1.35, y = 0.0)
//   Secondary Pulley (Output / Driven) at (x = +1.35, y = 0.0)
//   Center-to-Center Distance C = 2.70
const SHAFT_PULLEY_DIST = 2.70;
const PRIMARY_X = -1.35;
const SECONDARY_X = 1.35;

// Cone angle of sheaves is 11 degrees
const CONE_ANGLE = 11 * (Math.PI / 180);
const TAN_CONE = Math.tan(CONE_ANGLE);

// Virtual 7-Speed Stepped Ratios for Sport Mode
const VIRTUAL_7_SPEEDS = [
  { gear: 1, ratio: 2.55, label: 'Gear 1 (2.55:1)' },
  { gear: 2, ratio: 1.82, label: 'Gear 2 (1.82:1)' },
  { gear: 3, ratio: 1.35, label: 'Gear 3 (1.35:1)' },
  { gear: 4, ratio: 1.00, label: 'Gear 4 (1.00:1)' },
  { gear: 5, ratio: 0.78, label: 'Gear 5 (0.78:1)' },
  { gear: 6, ratio: 0.62, label: 'Gear 6 (0.62:1)' },
  { gear: 7, ratio: 0.45, label: 'Gear 7 (0.45:1)' }
];

export default function CvtSim({ theme = 'dark' }) {
  const mountRef = useRef(null);

  // Mechanical State & Driver Inputs
  const [isPlaying, setIsPlaying] = useState(true);
  const [engineRpm, setEngineRpm] = useState(2200);
  const [throttlePct, setThrottlePct] = useState(45);
  const [driveMode, setDriveMode] = useState('D'); // 'P', 'R', 'N', 'D', 'S'
  const [cvtRatio, setCvtRatio] = useState(1.0); // 2.60 (Low) to 0.45 (Overdrive)
  const [isVirtualMode, setIsVirtualMode] = useState(false);
  const [virtualGear, setVirtualGear] = useState(4);

  // Visual / Viewport Controls
  const [renderMode, setRenderMode] = useState('realistic');
  const [casingOpacity, setCasingOpacity] = useState(0.24);
  const [cutawayMode, setCutawayMode] = useState(true);
  const [exploded, setExploded] = useState(0);
  const [autoRotateCam, setAutoRotateCam] = useState(false);

  // Component Layers Visibility
  const [showCasing, setShowCasing] = useState(true);
  const [showSteelBelt, setShowSteelBelt] = useState(true);
  const [showHydraulics, setShowHydraulics] = useState(true);
  const [showTorqueConverter, setShowTorqueConverter] = useState(true);
  const [showFinalDrive, setShowFinalDrive] = useState(true);

  // Live Telemetry Readouts
  const [telemetry, setTelemetry] = useState({
    inputRpm: 2200,
    outputRpm: 2200,
    actualRatio: 1.0,
    outputTorqueNm: 250,
    roadSpeedKmh: 68,
    primaryRadius: 1.0,
    secondaryRadius: 1.0,
    clampPressureBar: 42
  });

  const simParams = useRef({
    isPlaying,
    engineRpm,
    throttlePct,
    driveMode,
    cvtRatio,
    isVirtualMode,
    virtualGear,
    renderMode,
    casingOpacity,
    cutawayMode,
    exploded,
    autoRotateCam,
    showCasing,
    showSteelBelt,
    showHydraulics,
    showTorqueConverter,
    showFinalDrive,
    theme
  });

  useEffect(() => {
    simParams.current = {
      isPlaying,
      engineRpm,
      throttlePct,
      driveMode,
      cvtRatio,
      isVirtualMode,
      virtualGear,
      renderMode,
      casingOpacity,
      cutawayMode,
      exploded,
      autoRotateCam,
      showCasing,
      showSteelBelt,
      showHydraulics,
      showTorqueConverter,
      showFinalDrive,
      theme
    };
  }, [
    isPlaying,
    engineRpm,
    throttlePct,
    driveMode,
    cvtRatio,
    isVirtualMode,
    virtualGear,
    renderMode,
    casingOpacity,
    cutawayMode,
    exploded,
    autoRotateCam,
    showCasing,
    showSteelBelt,
    showHydraulics,
    showTorqueConverter,
    showFinalDrive,
    theme
  ]);

  const cameraPresetRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // ------------------------------------------------------------------------
    // 1. THREE.JS SCENE, CAMERA, RENDERER & LIGHTING
    // ------------------------------------------------------------------------
    const scene = new THREE.Scene();
    const isDarkTheme = simParams.current.theme === 'dark';
    scene.background = new THREE.Color(isDarkTheme ? 0x0b101b : 0xf1f5f9);
    scene.fog = new THREE.FogExp2(isDarkTheme ? 0x0b101b : 0xf1f5f9, 0.016);

    const camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / container.clientHeight,
      0.1,
      150
    );
    camera.position.set(0.2, 5.2, 6.8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(0, 0, 0);
    controls.minDistance = 3.5;
    controls.maxDistance = 22.0;

    cameraPresetRef.current = (viewType) => {
      if (viewType === 'iso') {
        camera.position.set(0.2, 5.2, 6.8);
        controls.target.set(0, 0, 0);
      } else if (viewType === 'front') {
        camera.position.set(0, 0.2, 7.5);
        controls.target.set(0, 0, 0);
      } else if (viewType === 'top') {
        camera.position.set(0.01, 8.5, 0.01);
        controls.target.set(0, 0, 0);
      } else if (viewType === 'side') {
        camera.position.set(7.5, 0.2, 0);
        controls.target.set(0, 0, 0);
      }
      controls.update();
    };

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff8ed, 2.3);
    keyLight.position.set(7, 12, 9);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 1.1);
    fillLight.position.set(-8, -4, -6);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xf97316, 1.2);
    rimLight.position.set(0, 6, -8);
    scene.add(rimLight);

    const gridHelper = new THREE.GridHelper(
      24,
      24,
      isDarkTheme ? 0x1e293b : 0xcbd5e1,
      isDarkTheme ? 0x131c2e : 0xe2e8f0
    );
    gridHelper.position.y = -2.6;
    scene.add(gridHelper);

    // ------------------------------------------------------------------------
    // 2. MATERIALS & SHADER DEFINITIONS
    // ------------------------------------------------------------------------
    const realisticMats = {
      primarySheave: new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        metalness: 0.92,
        roughness: 0.16
      }),
      secondarySheave: new THREE.MeshStandardMaterial({
        color: 0x10b981,
        metalness: 0.92,
        roughness: 0.16
      }),
      steelBeltBlock: new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        metalness: 0.96,
        roughness: 0.14
      }),
      steelBand: new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.90,
        roughness: 0.25
      }),
      hydraulicChamber: new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        metalness: 0.78,
        roughness: 0.26
      }),
      torqueConverter: new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        metalness: 0.85,
        roughness: 0.22
      }),
      gears: new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        metalness: 0.88,
        roughness: 0.20
      }),
      shaftSteel: new THREE.MeshStandardMaterial({
        color: 0x64748b,
        metalness: 0.92,
        roughness: 0.18
      }),
      casing: new THREE.MeshPhysicalMaterial({
        color: 0x94a3b8,
        metalness: 0.32,
        roughness: 0.24,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    };

    const rawSolidMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.15, roughness: 0.55 });
    const rawCasingMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.1,
      roughness: 0.6,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const wireframePrimaryMat = new THREE.MeshBasicMaterial({ color: 0xfb6514, wireframe: true });
    const wireframeCasingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.22
    });

    const trackedMeshes = [];
    const registerMesh = (mesh, type, includeWire = true) => {
      const baseMat = realisticMats[type] || realisticMats.shaftSteel;
      mesh.material = baseMat;
      const isTranslucent = type === 'casing';
      mesh.castShadow = !isTranslucent;
      mesh.receiveShadow = true;

      let wireOverlay = null;
      if (includeWire) {
        const wireGeo = new THREE.WireframeGeometry(mesh.geometry);
        const wireMat = new THREE.LineBasicMaterial({
          color: 0xfb6514,
          transparent: true,
          opacity: isTranslucent ? 0.16 : 0.32
        });
        wireOverlay = new THREE.LineSegments(wireGeo, wireMat);
        wireOverlay.visible = false;
        mesh.add(wireOverlay);
      }

      trackedMeshes.push({ mesh, type, baseMat, wireOverlay });
      return mesh;
    };

    const cvtRoot = new THREE.Group();
    scene.add(cvtRoot);

    // ------------------------------------------------------------------------
    // 3. VARIABLE CONICAL PULLEY SHEAVES & HYDRAULIC ACTUATORS
    // ------------------------------------------------------------------------
    // Helper to generate an authentic 11-degree conical sheave face
    const createConicalSheaveGeo = (facingDir = 1) => {
      // Points along radial profile from center bore out to outer rim
      // facingDir = +1 means cone slopes towards +Z, -1 means slopes towards -Z
      const innerR = 0.32;
      const outerR = 1.62;
      const coneHeight = (outerR - innerR) * TAN_CONE; // ~0.252
      const backThickness = 0.14;

      const pts = [
        new THREE.Vector2(innerR, 0),
        new THREE.Vector2(outerR, coneHeight * facingDir),
        new THREE.Vector2(outerR, (coneHeight + backThickness) * facingDir),
        new THREE.Vector2(innerR, (coneHeight + backThickness) * facingDir)
      ];
      const latheGeo = new THREE.LatheGeometry(pts, 36);
      return latheGeo;
    };

    // A. PRIMARY PULLEY (Input / Drive) at x = PRIMARY_X (-1.35)
    const primaryGroup = new THREE.Group();
    primaryGroup.position.set(PRIMARY_X, 0, 0);
    cvtRoot.add(primaryGroup);

    // Input Shaft
    const pShaftGeo = new THREE.CylinderGeometry(0.24, 0.24, 3.8, 24);
    pShaftGeo.rotateX(Math.PI / 2);
    const pShaftMesh = registerMesh(new THREE.Mesh(pShaftGeo), 'shaftSteel');
    primaryGroup.add(pShaftMesh);

    // Primary Fixed Sheave (Stationary along Z at rear, facing forward +Z)
    const pFixedGeo = createConicalSheaveGeo(1);
    const pFixedMesh = registerMesh(new THREE.Mesh(pFixedGeo), 'primarySheave');
    pFixedMesh.position.z = -0.38;
    primaryGroup.add(pFixedMesh);

    // Primary Sliding Sheave Holder (Moves along Z via hydraulic pressure)
    const pSlidingGroup = new THREE.Group();
    primaryGroup.add(pSlidingGroup);

    const pSlidingGeo = createConicalSheaveGeo(-1);
    const pSlidingMesh = registerMesh(new THREE.Mesh(pSlidingGeo), 'primarySheave');
    pSlidingGroup.add(pSlidingMesh);

    // Primary Hydraulic Chamber & Actuator Piston Cylinder
    const pPistonGeo = new THREE.CylinderGeometry(0.96, 0.96, 0.44, 28);
    pPistonGeo.rotateX(Math.PI / 2);
    const pPistonMesh = registerMesh(new THREE.Mesh(pPistonGeo), 'hydraulicChamber');
    pPistonMesh.position.z = 0.42;
    pSlidingGroup.add(pPistonMesh);

    // B. SECONDARY PULLEY (Output / Driven) at x = SECONDARY_X (+1.35)
    const secondaryGroup = new THREE.Group();
    secondaryGroup.position.set(SECONDARY_X, 0, 0);
    cvtRoot.add(secondaryGroup);

    // Output Shaft
    const sShaftGeo = new THREE.CylinderGeometry(0.24, 0.24, 3.8, 24);
    sShaftGeo.rotateX(Math.PI / 2);
    const sShaftMesh = registerMesh(new THREE.Mesh(sShaftGeo), 'shaftSteel');
    secondaryGroup.add(sShaftMesh);

    // Secondary Fixed Sheave (Stationary along Z at front, facing rear -Z)
    const sFixedGeo = createConicalSheaveGeo(-1);
    const sFixedMesh = registerMesh(new THREE.Mesh(sFixedGeo), 'secondarySheave');
    sFixedMesh.position.z = 0.38;
    secondaryGroup.add(sFixedMesh);

    // Secondary Sliding Sheave Holder (Moves along Z with heavy clamping spring)
    const sSlidingGroup = new THREE.Group();
    secondaryGroup.add(sSlidingGroup);

    const sSlidingGeo = createConicalSheaveGeo(1);
    const sSlidingMesh = registerMesh(new THREE.Mesh(sSlidingGeo), 'secondarySheave');
    sSlidingGroup.add(sSlidingMesh);

    // Secondary Hydraulic Chamber & Diaphragm Preload Clamping Spring
    const sSpringChamberGeo = new THREE.CylinderGeometry(1.02, 1.02, 0.48, 28);
    sSpringChamberGeo.rotateX(Math.PI / 2);
    const sSpringChamberMesh = registerMesh(new THREE.Mesh(sSpringChamberGeo), 'hydraulicChamber');
    sSpringChamberMesh.position.z = -0.44;
    sSlidingGroup.add(sSpringChamberMesh);

    // ------------------------------------------------------------------------
    // 4. VAN DOORNE STEEL PUSH-BELT & TENSION BANDS
    // ------------------------------------------------------------------------
    const beltGroup = new THREE.Group();
    cvtRoot.add(beltGroup);

    // Model 60 individual interlocking trapezoidal steel push-blocks
    const blockCount = 60;
    const blockShape = new THREE.Shape();
    // Trapezoidal cross-section matching the 11-deg sheave angle
    const bwTop = 0.32;
    const bwBottom = 0.22;
    const bh = 0.24;
    blockShape.moveTo(-bwTop * 0.5, bh * 0.5);
    blockShape.lineTo(bwTop * 0.5, bh * 0.5);
    blockShape.lineTo(bwBottom * 0.5, -bh * 0.5);
    blockShape.lineTo(-bwBottom * 0.5, -bh * 0.5);
    blockShape.closePath();

    // Central slot cutout for the laminated steel tension bands
    const slotPath = new THREE.Path();
    slotPath.moveTo(-0.09, 0.04);
    slotPath.lineTo(0.09, 0.04);
    slotPath.lineTo(0.09, 0.12);
    slotPath.lineTo(-0.09, 0.12);
    slotPath.closePath();
    blockShape.holes.push(slotPath);

    const pushBlockGeo = new THREE.ExtrudeGeometry(blockShape, {
      depth: 0.055,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.008,
      bevelThickness: 0.008
    });
    pushBlockGeo.translate(0, 0, -0.0275);

    const pushBlockMeshes = [];
    for (let b = 0; b < blockCount; b++) {
      const bMesh = registerMesh(new THREE.Mesh(pushBlockGeo), 'steelBeltBlock', false);
      beltGroup.add(bMesh);
      pushBlockMeshes.push(bMesh);
    }

    // 2 Laminated Flexible Steel Tension Bands threading through the blocks
    const leftBandMesh = registerMesh(new THREE.Mesh(new THREE.BufferGeometry()), 'steelBand', false);
    const rightBandMesh = registerMesh(new THREE.Mesh(new THREE.BufferGeometry()), 'steelBand', false);
    beltGroup.add(leftBandMesh, rightBandMesh);

    // ------------------------------------------------------------------------
    // 5. TORQUE CONVERTER, REVERSER UNIT, FINAL REDUCTION & DIFFERENTIAL
    // ------------------------------------------------------------------------
    const torqueConverterGroup = new THREE.Group();
    torqueConverterGroup.position.set(PRIMARY_X, 0, -2.15);
    cvtRoot.add(torqueConverterGroup);

    // Impeller & Turbine Round Housing
    const tcGeo = new THREE.SphereGeometry(1.28, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.65);
    tcGeo.rotateX(Math.PI / 2);
    const tcMesh = registerMesh(new THREE.Mesh(tcGeo), 'torqueConverter');
    torqueConverterGroup.add(tcMesh);

    const tcHubGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.35, 20);
    tcHubGeo.rotateX(Math.PI / 2);
    torqueConverterGroup.add(registerMesh(new THREE.Mesh(tcHubGeo), 'shaftSteel'));

    // Final Drive Reduction Gear & Differential on Secondary Shaft (+Z side)
    const finalDriveGroup = new THREE.Group();
    cvtRoot.add(finalDriveGroup);

    // Helical Pinion on Secondary Shaft
    const sPinionGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.42, 24);
    sPinionGeo.rotateX(Math.PI / 2);
    const sPinionMesh = registerMesh(new THREE.Mesh(sPinionGeo), 'gears');
    sPinionMesh.position.set(SECONDARY_X, 0, 1.85);
    finalDriveGroup.add(sPinionMesh);

    // Large Final Drive Crown Gear & Differential Case at (x = 0.0, y = -1.25, z = 1.85)
    const diffGroup = new THREE.Group();
    diffGroup.position.set(0.0, -1.25, 1.85);
    finalDriveGroup.add(diffGroup);

    const crownGearGeo = new THREE.CylinderGeometry(1.42, 1.42, 0.36, 36);
    crownGearGeo.rotateX(Math.PI / 2);
    const crownGearMesh = registerMesh(new THREE.Mesh(crownGearGeo), 'gears');
    diffGroup.add(crownGearMesh);

    const diffAxleGeo = new THREE.CylinderGeometry(0.18, 0.18, 4.4, 20);
    diffAxleGeo.rotateZ(Math.PI / 2);
    diffGroup.add(registerMesh(new THREE.Mesh(diffAxleGeo), 'shaftSteel'));

    // ------------------------------------------------------------------------
    // 6. SCULPTED CAST-ALUMINUM CVT HOUSING & SECTION CUTAWAY
    // ------------------------------------------------------------------------
    const casingGroup = new THREE.Group();
    cvtRoot.add(casingGroup);

    // Hourglass dual-pulley casing profile wrapping around Primary and Secondary
    const casingLen = 4.2;
    const casingShape = new THREE.Shape();
    casingShape.moveTo(PRIMARY_X, 1.85);
    casingShape.quadraticCurveTo(0, 1.15, SECONDARY_X, 1.85);
    casingShape.absarc(SECONDARY_X, 0, 1.85, Math.PI * 0.5, -Math.PI * 0.5, true);
    casingShape.quadraticCurveTo(0, -1.15, PRIMARY_X, -1.85);
    casingShape.absarc(PRIMARY_X, 0, 1.85, -Math.PI * 0.5, Math.PI * 0.5, true);

    const backCasingGeo = new THREE.ExtrudeGeometry(casingShape, {
      depth: casingLen * 0.55,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.06,
      bevelThickness: 0.06
    });
    backCasingGeo.translate(0, 0, -casingLen * 0.55);
    const backCasingMesh = registerMesh(new THREE.Mesh(backCasingGeo), 'casing');
    casingGroup.add(backCasingMesh);

    const frontCasingGeo = new THREE.ExtrudeGeometry(casingShape, {
      depth: casingLen * 0.45,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.06,
      bevelThickness: 0.06
    });
    frontCasingGeo.translate(0, 0, 0.02);
    const frontCasingMesh = registerMesh(new THREE.Mesh(frontCasingGeo), 'casing');
    casingGroup.add(frontCasingMesh);

    // Mechatronic Valve Body & Fluid Oil Pan under the transmission
    const valveBodyGeo = new THREE.BoxGeometry(2.4, 0.52, 2.2);
    const valveBodyMesh = registerMesh(new THREE.Mesh(valveBodyGeo), 'casing', false);
    valveBodyMesh.position.set(0, -2.15, 0);
    casingGroup.add(valveBodyMesh);

    // ------------------------------------------------------------------------
    // 7. REAL-TIME BELT KINEMATICS, RATIO CALCULATIONS & ANIMATION LOOP
    // ------------------------------------------------------------------------
    // Calculate Primary & Secondary running radii for constant belt length
    const computePulleyRadii = (ratioVal) => {
      // ratio = R2 / R1  ->  R2 = ratio * R1
      // Constant belt length constraint: R1 + R2 + deltaTerm ≈ Const
      // For ratio range 2.60 (low) down to 0.45 (overdrive):
      const minR = 0.56;
      const maxR = 1.46;
      // Normalizing ratioVal from 2.60 down to 0.45
      const t = Math.max(0, Math.min(1, (2.60 - ratioVal) / (2.60 - 0.45)));
      const r1 = minR + t * (maxR - minR);
      const r2 = maxR - t * (maxR - minR);
      return { r1, r2 };
    };

    // Calculate closed 2D loop path of the belt around the two pulleys
    const generateBeltPathPoints = (r1, r2, numSamples = 120) => {
      const pCenter = new THREE.Vector2(PRIMARY_X, 0);
      const sCenter = new THREE.Vector2(SECONDARY_X, 0);
      const dist = SHAFT_PULLEY_DIST;

      // Tangent angle due to difference in radii
      const sinTheta = Math.max(-0.99, Math.min(0.99, (r2 - r1) / dist));
      const cosTheta = Math.sqrt(1 - sinTheta * sinTheta);
      const theta = Math.asin(sinTheta);

      // Top tangent line connects pTop to sTop
      // Normal vector to tangent line is (-sinTheta, cosTheta)
      const pTop = new THREE.Vector2(pCenter.x - r1 * sinTheta, pCenter.y + r1 * cosTheta);
      const sTop = new THREE.Vector2(sCenter.x - r2 * sinTheta, sCenter.y + r2 * cosTheta);

      // Bottom tangent line connects sBottom to pBottom
      const sBottom = new THREE.Vector2(sCenter.x + r2 * sinTheta, sCenter.y - r2 * cosTheta);
      const pBottom = new THREE.Vector2(pCenter.x + r1 * sinTheta, pCenter.y - r1 * cosTheta);

      const pts = [];
      // 1. Primary arc from bottom to top (counter-clockwise wrap)
      const pStartAngle = -Math.PI / 2 + theta;
      const pEndAngle = Math.PI / 2 + theta;
      const pSteps = Math.round(numSamples * 0.35);
      for (let i = 0; i <= pSteps; i++) {
        const a = pStartAngle + (pEndAngle - pStartAngle) * (i / pSteps);
        pts.push(new THREE.Vector3(pCenter.x - Math.cos(a) * r1, pCenter.y + Math.sin(a) * r1, 0));
      }

      // 2. Top straight tangent from Primary to Secondary
      const tSteps = Math.round(numSamples * 0.15);
      for (let i = 1; i <= tSteps; i++) {
        const u = i / tSteps;
        pts.push(new THREE.Vector3(pTop.x + (sTop.x - pTop.x) * u, pTop.y + (sTop.y - pTop.y) * u, 0));
      }

      // 3. Secondary arc from top to bottom
      const sStartAngle = Math.PI / 2 + theta;
      const sEndAngle = -Math.PI / 2 + theta;
      const sSteps = Math.round(numSamples * 0.35);
      for (let i = 0; i <= sSteps; i++) {
        const a = sStartAngle + (sEndAngle - sStartAngle) * (i / sSteps);
        pts.push(new THREE.Vector3(sCenter.x + Math.cos(a) * r2, sCenter.y + Math.sin(a) * r2, 0));
      }

      // 4. Bottom straight tangent from Secondary back to Primary
      for (let i = 1; i < tSteps; i++) {
        const u = i / tSteps;
        pts.push(new THREE.Vector3(sBottom.x + (pBottom.x - sBottom.x) * u, sBottom.y + (pBottom.y - sBottom.y) * u, 0));
      }

      return pts;
    };

    const updateMaterialModes = () => {
      const {
        renderMode: rMode,
        casingOpacity: cOp,
        cutawayMode: cut,
        showCasing: sCase,
        showSteelBelt: sBelt,
        showTorqueConverter: sTc,
        showFinalDrive: sFd,
        exploded: exp,
        theme: activeTheme
      } = simParams.current;

      realisticMats.casing.opacity = cOp;
      rawCasingMat.opacity = cOp;
      wireframeCasingMat.opacity = Math.max(0.14, cOp);

      trackedMeshes.forEach(({ mesh, type, baseMat, wireOverlay }) => {
        const isTranslucent = type === 'casing';

        if (rMode === 'realistic') {
          mesh.material = baseMat;
          if (wireOverlay) wireOverlay.visible = false;
        } else if (rMode === 'raw') {
          mesh.material = isTranslucent ? rawCasingMat : rawSolidMat;
          if (wireOverlay) {
            wireOverlay.visible = !isTranslucent;
            wireOverlay.material.color.setHex(activeTheme === 'dark' ? 0x1f2937 : 0x94a3b8);
            wireOverlay.material.opacity = 0.2;
          }
        } else if (rMode === 'wireframe') {
          mesh.material = isTranslucent ? wireframeCasingMat : wireframePrimaryMat;
          if (wireOverlay) wireOverlay.visible = false;
        } else if (rMode === 'shaded_wire') {
          mesh.material = baseMat;
          if (wireOverlay) {
            wireOverlay.visible = true;
            wireOverlay.material.color.setHex(0xfb6514);
            wireOverlay.material.opacity = isTranslucent ? 0.18 : 0.42;
          }
        }
      });

      casingGroup.visible = sCase;
      frontCasingMesh.visible = sCase && (!cut || exp > 0.08);
      beltGroup.visible = sBelt;
      torqueConverterGroup.visible = sTc;
      finalDriveGroup.visible = sFd;

      // Exploded View Offsets
      frontCasingMesh.position.z = exp * 1.45;
      backCasingMesh.position.z = -exp * 1.25;
      torqueConverterGroup.position.z = -2.15 - exp * 0.95;
      finalDriveGroup.position.z = exp * 0.85;
    };

    let lastTime = performance.now();
    let beltPhase = 0;
    let uiCounter = 0;
    let animationFrameId;

    const animate = (now) => {
      animationFrameId = requestAnimationFrame(animate);
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Number.isFinite(rawDt) && rawDt > 0 ? Math.min(rawDt, 0.05) : 0.016;

      const {
        isPlaying: playing,
        engineRpm: engRpm,
        throttlePct: throttle,
        driveMode: mode,
        cvtRatio: targetCvtRatio,
        isVirtualMode: isVirt,
        virtualGear: vGear,
        autoRotateCam: autoCam
      } = simParams.current;

      // Calculate active ratio based on Drive Mode & Virtual Gear
      let activeRatio = targetCvtRatio;
      if (isVirt) {
        const vg = VIRTUAL_7_SPEEDS.find((v) => v.gear === vGear) || VIRTUAL_7_SPEEDS[3];
        activeRatio = vg.ratio;
      }

      const { r1, r2 } = computePulleyRadii(activeRatio);

      // Move primary & secondary sliding sheaves along Z based on cone slope
      const deltaZPrimary = (r1 - 1.0) * TAN_CONE * 2.2;
      const deltaZSecondary = (r2 - 1.0) * TAN_CONE * 2.2;
      pSlidingGroup.position.z = -deltaZPrimary;
      sSlidingGroup.position.z = deltaZSecondary;

      // Rotational speeds
      const inOmega = playing && mode !== 'P' && mode !== 'N'
        ? ((engRpm * 2 * Math.PI) / 60) * 0.085
        : 0;
      const outOmega = inOmega / activeRatio;

      primaryGroup.rotation.z += inOmega * dt;
      // Secondary spins in same direction via wrap-around belt
      secondaryGroup.rotation.z += outOmega * dt;
      diffGroup.rotation.z -= (outOmega / 3.8) * dt;

      // Animate Van Doorne Steel Belt blocks along the exact closed path
      const beltPts = generateBeltPathPoints(r1, r2, 120);
      const beltCurve = new THREE.CatmullRomCurve3(beltPts, true);

      if (playing && mode !== 'P' && mode !== 'N') {
        const beltSpeed = (inOmega * r1) * 0.22;
        beltPhase = (beltPhase + dt * beltSpeed) % 1.0;
      }

      for (let b = 0; b < blockCount; b++) {
        const u = (beltPhase + b / blockCount) % 1.0;
        const pt = beltCurve.getPoint(u);
        const tangent = beltCurve.getTangent(u);
        const bMesh = pushBlockMeshes[b];
        bMesh.position.copy(pt);
        // Align block perpendicular to tangent
        const angle = Math.atan2(tangent.y, tangent.x);
        bMesh.rotation.z = angle - Math.PI / 2;
      }

      // Update the 2 Laminated Steel Tension Bands geometry along the belt path
      leftBandMesh.geometry.dispose();
      rightBandMesh.geometry.dispose();
      const bandGeo = new THREE.TubeGeometry(beltCurve, 90, 0.024, 8, true);
      leftBandMesh.geometry = bandGeo;
      rightBandMesh.geometry = bandGeo.clone();
      leftBandMesh.position.z = -0.06;
      rightBandMesh.position.z = 0.06;

      updateMaterialModes();

      controls.autoRotate = autoCam;
      controls.autoRotateSpeed = 1.1;
      controls.update();
      renderer.render(scene, camera);

      // Update React Telemetry every ~6 frames
      uiCounter++;
      if (uiCounter % 6 === 0) {
        const actualInRpm = mode === 'P' || mode === 'N' ? Math.round(engRpm * 0.45) : engRpm;
        const actualOutRpm = mode === 'P' || mode === 'N' ? 0 : Math.round(actualInRpm / activeRatio);
        const engineTorqueNm = Math.round(180 + (throttle / 100) * 120);
        const actualOutTorque = mode === 'P' || mode === 'N' ? 0 : Math.round(engineTorqueNm * activeRatio * 0.94);
        const wheelRpm = actualOutRpm / 3.8;
        const speedKmh = Math.round((wheelRpm * 2 * Math.PI * 0.31 * 60) / 1000);
        const clampPressure = Math.round(28 + (throttle / 100) * 26 + (activeRatio > 1.5 ? 12 : 0));

        setTelemetry({
          inputRpm: actualInRpm,
          outputRpm: actualOutRpm,
          actualRatio: +activeRatio.toFixed(2),
          outputTorqueNm: actualOutTorque,
          roadSpeedKmh: Math.max(0, speedKmh),
          primaryRadius: +(r1 * 85).toFixed(1),
          secondaryRadius: +(r2 * 85).toFixed(1),
          clampPressureBar: clampPressure
        });
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  const sheet = {
    panel: 'bg-white text-[#101828]',
    idle: 'bg-[#eef1f4] text-[#101828] hover:bg-[#e2e7ec]',
    chosen: 'bg-[#101828] text-white'
  };
  const hit =
    'cursor-pointer text-base leading-snug focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fb6514]';

  return (
    <div className="relative h-full w-full select-none overflow-hidden font-sans">
      {/* 3D WebGL Viewport */}
      <div
        ref={mountRef}
        className="absolute inset-0 z-0 h-full w-full cursor-grab active:cursor-grabbing"
      />

      {/* =========================================================
          TOP-LEFT: CVT TELEMETRY, RATIO MONITOR & DRIVE MODES
      ========================================================= */}
      <div className="pointer-events-none absolute top-4 left-4 z-10 max-h-[calc(100%-11rem)] w-[min(28rem,calc(100%-2rem))] overflow-y-auto max-[720px]:max-h-[50%] max-[720px]:w-[calc(100%-2rem)]">
        <section
          aria-label="Steel-Belt CVT Transmission"
          className={`pointer-events-auto flex flex-col gap-5 p-5 ${sheet.panel}`}
          style={{ colorScheme: 'light' }}
        >
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="m-0 text-[1.75rem] font-semibold leading-none tracking-[-0.03em]">
              Steel-Belt CVT
            </h1>
            <p
              className="m-0 text-[1.75rem] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[#fb6514]"
              aria-label={`Rasio CVT ${telemetry.actualRatio} banding 1`}
            >
              {telemetry.actualRatio} : 1
            </p>
          </div>

          <p className="m-0 text-base leading-relaxed">
            Transmisi otomatis variabel kontinu sabuk baja Van Doorne. Mentransmisikan torsi tanpa jeda gigi melalui perubahan diameter hidrolis puli primer dan sekunder.
          </p>

          {/* Drive Mode Selector Buttons: P - R - N - D - S */}
          <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Drive Mode Selector">
            {['P', 'R', 'N', 'D', 'S'].map((m) => {
              const active = driveMode === m;
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setDriveMode(m);
                    if (m === 'S') setIsVirtualMode(true);
                    else if (m === 'D') setIsVirtualMode(false);
                  }}
                  className={`py-2.5 text-center text-base font-semibold tabular-nums ${hit} ${
                    active ? 'bg-[#fb6514] text-[#101828]' : sheet.idle
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>

          {/* Virtual 7-Speed Stepped Selector when in Sport Mode (S) */}
          {isVirtualMode && (
            <div className="flex flex-col gap-1.5 bg-[#eef1f4] p-2.5">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span>Mode Virtual Sport (7-Percepatan)</span>
                <span className="font-mono text-[#fb6514]">Gear {virtualGear}</span>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {VIRTUAL_7_SPEEDS.map((vg) => (
                  <button
                    key={vg.gear}
                    type="button"
                    onClick={() => setVirtualGear(vg.gear)}
                    className={`py-1 text-center text-sm font-bold ${hit} ${
                      virtualGear === vg.gear ? 'bg-[#fb6514] text-[#101828]' : 'bg-white text-[#101828]'
                    }`}
                  >
                    G{vg.gear}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 2x2 Telemetry Readouts */}
          <div className="grid grid-cols-2 gap-2">
            {[
              {
                label: 'Putaran Primer (In)',
                value: isPlaying ? telemetry.inputRpm : 0,
                unit: 'rpm'
              },
              {
                label: 'Putaran Sekunder (Out)',
                value: isPlaying ? telemetry.outputRpm : 0,
                unit: 'rpm'
              },
              {
                label: 'Torsi Output',
                value: isPlaying ? telemetry.outputTorqueNm : 0,
                unit: 'Nm'
              },
              {
                label: 'Tekanan Sabuk / Kecepatan',
                value: isPlaying ? `${telemetry.clampPressureBar}` : '0',
                unit: `bar · ${isPlaying ? telemetry.roadSpeedKmh : 0} km/j`
              }
            ].map((item) => (
              <div key={item.label} className="bg-[#eef1f4] px-3 py-2">
                <span className="block text-base">{item.label}</span>
                <span className="block text-base font-semibold tabular-nums text-[#fb6514]">
                  {item.value}
                  <span className="ml-1 font-normal text-[#101828]">{item.unit}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* =========================================================
          TOP-RIGHT: RENDER MODE & COMPONENT VISIBILITY
      ========================================================= */}
      <div className="pointer-events-none absolute top-4 right-4 z-10 w-[min(20rem,calc(100%-2rem))] max-[720px]:top-auto max-[720px]:bottom-44 max-[720px]:left-4 max-[720px]:right-4 max-[720px]:max-h-[28%] max-[720px]:w-auto max-[720px]:overflow-y-auto">
        <section
          aria-label="CVT view"
          className={`pointer-events-auto flex flex-col gap-5 p-5 ${sheet.panel}`}
          style={{ colorScheme: 'light' }}
        >
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Render mode">
            {[
              { id: 'realistic', label: 'Realistic', icon: Sparkles },
              { id: 'raw', label: 'Shaded', icon: Box },
              { id: 'wireframe', label: 'Wireframe', icon: Grid3x3 },
              { id: 'shaded_wire', label: 'Shaded wire', icon: Layers }
            ].map((mode) => {
              const active = renderMode === mode.id;
              const Icon = mode.icon;
              return (
                <button
                  key={mode.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setRenderMode(mode.id)}
                  className={`flex w-full items-center gap-2 px-3 py-3 text-left ${hit} ${
                    active ? 'bg-[#fb6514] text-[#101828]' : sheet.idle
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {mode.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Visible parts">
            <button
              type="button"
              aria-pressed={cutawayMode}
              onClick={() => setCutawayMode(!cutawayMode)}
              className={`col-span-2 px-3 py-3 text-left ${hit} ${
                cutawayMode ? sheet.chosen : sheet.idle
              }`}
            >
              Cutaway
            </button>
            {[
              { label: 'Casing & housing', state: showCasing, setter: setShowCasing },
              { label: 'Sabuk baja Van Doorne', state: showSteelBelt, setter: setShowSteelBelt },
              { label: 'Torque converter', state: showTorqueConverter, setter: setShowTorqueConverter },
              { label: 'Gardan & final drive', state: showFinalDrive, setter: setShowFinalDrive }
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                aria-pressed={item.state}
                onClick={() => item.setter(!item.state)}
                className={`px-3 py-3 text-left ${hit} ${item.state ? sheet.chosen : sheet.idle}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* =========================================================
          BOTTOM: HORIZONTAL SLIDER BAR & TRANSPORT CONTROLS
      ========================================================= */}
      <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-10 flex flex-col items-stretch justify-between gap-3 lg:flex-row lg:items-end">
        <section
          aria-label="Simulation controls"
          className={`pointer-events-auto grid flex-1 grid-cols-1 gap-6 p-5 sm:grid-cols-2 xl:grid-cols-4 ${sheet.panel}`}
          style={{ colorScheme: 'light' }}
        >
          {/* Column 1: Input RPM */}
          <div className="flex flex-col gap-2">
            <p className="m-0 text-base">
              <span className="font-semibold tabular-nums">{engineRpm}</span> rpm input
            </p>
            <SquareRange
              min={800}
              max={6500}
              step={50}
              value={engineRpm}
              label="Input RPM"
              onChange={(e) => setEngineRpm(Number(e.target.value))}
            />
            <div className="flex flex-wrap gap-2">
              {[
                { value: 800, label: '800 idle' },
                { value: 2000, label: '2000 cruise' },
                { value: 4000, label: '4000 pass' },
                { value: 6000, label: '6000 max' }
              ].map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  aria-pressed={engineRpm === preset.value}
                  onClick={() => {
                    setEngineRpm(preset.value);
                    setIsPlaying(true);
                  }}
                  className={`px-2 py-1 ${hit} ${
                    engineRpm === preset.value ? sheet.chosen : sheet.idle
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Column 2: Continuous CVT Ratio Slider */}
          <div className="flex flex-col gap-2">
            <p className="m-0 text-base">
              <span className="font-semibold tabular-nums">{cvtRatio.toFixed(2)}:1</span> rasio CVT
            </p>
            <SquareRange
              min={0.45}
              max={2.60}
              step={0.05}
              value={cvtRatio}
              label="CVT Ratio"
              onChange={(e) => {
                setCvtRatio(Number(e.target.value));
                setIsVirtualMode(false);
              }}
            />
            <div className="flex flex-wrap gap-2">
              {[
                { value: 2.60, label: '2.60 Low' },
                { value: 1.00, label: '1.00 Direct' },
                { value: 0.45, label: '0.45 Overdrive' }
              ].map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  aria-pressed={!isVirtualMode && Math.abs(cvtRatio - preset.value) < 0.04}
                  onClick={() => {
                    setCvtRatio(preset.value);
                    setIsVirtualMode(false);
                  }}
                  className={`px-2 py-1 ${hit} ${
                    !isVirtualMode && Math.abs(cvtRatio - preset.value) < 0.04
                      ? sheet.chosen
                      : sheet.idle
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Column 3: Exploded View */}
          <div className="flex flex-col gap-2">
            <p className="m-0 text-base">
              <span className="font-semibold tabular-nums">{Math.round(exploded * 100)}%</span>{' '}
              exploded
            </p>
            <SquareRange
              min={0}
              max={1}
              step={0.02}
              value={exploded}
              label="Exploded view"
              onChange={(e) => setExploded(Number(e.target.value))}
            />
            <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-base">
              <span>Assembled</span>
              <span>Separated</span>
              <span>Exploded</span>
            </p>
          </div>

          {/* Column 4: Casing Opacity */}
          <div className="flex flex-col gap-2">
            <p className="m-0 text-base">
              <span className="font-semibold tabular-nums">
                {Math.round(casingOpacity * 100)}%
              </span>{' '}
              solid
            </p>
            <SquareRange
              min={0.05}
              max={0.95}
              step={0.02}
              value={casingOpacity}
              label="Casing opacity"
              onChange={(e) => setCasingOpacity(Number(e.target.value))}
            />
            <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-base">
              <span>Clear</span>
              <span>Glass</span>
              <span>Solid</span>
            </p>
          </div>
        </section>

        {/* Transport Bar: Play / Pause, Orbit, Reset */}
        <div className={`pointer-events-auto flex flex-wrap items-center gap-2 p-3 ${sheet.panel}`}>
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className={`inline-flex items-center gap-2 px-4 py-3 ${hit} ${
              isPlaying ? 'bg-[#fb6514] text-[#101828]' : sheet.chosen
            }`}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            aria-pressed={autoRotateCam}
            onClick={() => setAutoRotateCam(!autoRotateCam)}
            className={`inline-flex items-center gap-2 px-3 py-3 ${hit} ${
              autoRotateCam ? sheet.chosen : sheet.idle
            }`}
          >
            <Orbit className="h-4 w-4" />
            Orbit
          </button>
          <button
            type="button"
            onClick={() => {
              setEngineRpm(2200);
              setCvtRatio(1.0);
              setDriveMode('D');
              setIsVirtualMode(false);
              setExploded(0);
              setCasingOpacity(0.24);
              setCutawayMode(true);
              setRenderMode('realistic');
              setShowCasing(true);
              setShowSteelBelt(true);
              setShowHydraulics(true);
              setShowTorqueConverter(true);
              setShowFinalDrive(true);
              setAutoRotateCam(false);
              if (cameraPresetRef.current) cameraPresetRef.current('iso');
            }}
            className={`inline-flex items-center gap-2 px-3 py-3 ${hit} ${sheet.idle}`}
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
