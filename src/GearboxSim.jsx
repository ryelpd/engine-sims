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
// MECHANICAL SPECIFICATION: 5-SPEED + REVERSE CONSTANT-MESH MANUAL GEARBOX
// ============================================================================
// Center distance between Mainshaft (y = +1.05) and Countershaft (y = -1.05)
// is strictly C = 2.10 units. Every meshing gear pair satisfies:
//   R_counter + R_output = 2.10  and  Z_counter / R_counter = Z_output / R_output
// so tooth pitch velocities match 100% physically without slip.
const SHAFT_CENTER_DIST = 2.10;
const MAINSHAFT_Y = 1.05;
const COUNTERSHAFT_Y = -1.05;

// Input Head Gear Set (Permanent Mesh at z = -2.35):
//   Input Shaft Gear: Z_in = 20 teeth, R_in = 0.82
//   Countershaft Head Gear: Z_head = 31 teeth, R_head = 1.28
//   Countershaft speed = -InputSpeed * (20 / 31) = -0.64516 * InputSpeed
const HEAD_GEAR = {
  zPos: -2.35,
  zIn: 20,
  rIn: 0.82,
  zCounter: 31,
  rCounter: 1.28,
  counterRatio: -20 / 31
};

const GEAR_DEFINITIONS = {
  N: {
    key: 'N',
    label: 'Neutral (N)',
    short: 'N',
    ratio: 0,
    ratioText: '0.000 : 1 (Freewheel)',
    syncIndex: -1,
    sleeveTargetZ: 0,
    color: '#94a3b8',
    desc: 'Semua sleeve sinkromes berada di posisi tengah (netral). Poros Input memutar Countershaft dan seluruh roda gigi bebas di atas needle bearing, tetapi tidak ada gigi yang terkunci ke Poros Output.'
  },
  '1': {
    key: '1',
    label: 'Gigi 1 (First Gear)',
    short: '1',
    zPos: 1.65,
    zCounter: 15,
    rCounter: 0.63,
    zOutput: 35,
    rOutput: 1.47,
    // Total ratio = (31/20) * (35/15) = 3.617 : 1
    ratio: (31 / 20) * (35 / 15),
    ratioText: '3.617 : 1',
    syncIndex: 1, // Sync #2 (1st / 2nd)
    sleeveTargetZ: 1.38,
    color: '#f97316',
    desc: 'Rasio reduksi terbesar (3.62:1) untuk melipatgandakan torsi awal saat kendaraan mulai bergerak. Sleeve Sinkromes #2 bergeser ke belakang mengunci roda gigi 1 (35T) ke Poros Output.'
  },
  '2': {
    key: '2',
    label: 'Gigi 2 (Second Gear)',
    short: '2',
    zPos: 0.55,
    zCounter: 21,
    rCounter: 0.88,
    zOutput: 29,
    rOutput: 1.22,
    // Total ratio = (31/20) * (29/21) = 2.140 : 1
    ratio: (31 / 20) * (29 / 21),
    ratioText: '2.140 : 1',
    syncIndex: 1, // Sync #2 (1st / 2nd)
    sleeveTargetZ: 0.82,
    color: '#fb923c',
    desc: 'Rasio akselerasi menengah-bawah (2.14:1). Garpu pemindah (Shift Fork #2) menarik sleeve ke depan untuk mengunci roda gigi 2 (29T) ke hub spline Poros Output.'
  },
  '3': {
    key: '3',
    label: 'Gigi 3 (Third Gear)',
    short: '3',
    zPos: -0.55,
    zCounter: 26,
    rCounter: 1.09,
    zOutput: 24,
    rOutput: 1.01,
    // Total ratio = (31/20) * (24/26) = 1.431 : 1
    ratio: (31 / 20) * (24 / 26),
    ratioText: '1.431 : 1',
    syncIndex: 0, // Sync #1 (4th Direct / 3rd)
    sleeveTargetZ: -1.02,
    color: '#facc15',
    desc: 'Rasio menengah (1.43:1) untuk akselerasi menyalip. Sleeve Sinkromes #1 bergeser ke belakang mengunci roda gigi 3 (24T) ke Poros Output.'
  },
  '4': {
    key: '4',
    label: 'Gigi 4 (Direct Drive)',
    short: '4',
    zPos: -2.35,
    zCounter: 31,
    rCounter: 1.28,
    zOutput: 20,
    rOutput: 0.82,
    // Direct 1:1 lockup between Input Shaft and Output Shaft!
    ratio: 1.0,
    ratioText: '1.000 : 1 (Direct)',
    syncIndex: 0, // Sync #1 (4th Direct / 3rd)
    sleeveTargetZ: -1.88,
    color: '#22c55e',
    desc: 'Direct Drive (1.000:1)! Sleeve Sinkromes #1 bergeser maju mengunci Poros Output langsung ke dog-teeth Poros Input. Torsi mengalir lurus tanpa beban reduksi pada Countershaft.'
  },
  '5': {
    key: '5',
    label: 'Gigi 5 (Overdrive)',
    short: '5',
    zPos: 2.35,
    zCounter: 33,
    rCounter: 1.38,
    zOutput: 17,
    rOutput: 0.72,
    // Total ratio = (31/20) * (17/33) = 0.798 : 1
    ratio: (31 / 20) * (17 / 33),
    ratioText: '0.798 : 1 (Overdrive)',
    syncIndex: 2, // Sync #3 (5th / Reverse)
    sleeveTargetZ: 2.52,
    color: '#38bdf8',
    desc: 'Overdrive (0.798:1) untuk kecepatan jelajah jalan tol. Roda gigi Countershaft (33T) lebih besar dari gigi Output (17T), sehingga Poros Output berputar LEBIH CEPAT daripada mesin!'
  },
  R: {
    key: 'R',
    label: 'Reverse (Gigi Mundur)',
    short: 'R',
    zPos: 3.25,
    zCounter: 14,
    rCounter: 0.58,
    zIdler: 17,
    rIdler: 0.70,
    zOutput: 34,
    rOutput: 1.42,
    // Total ratio = -(31/20) * (34/14) = -3.764 : 1
    ratio: -(31 / 20) * (34 / 14),
    ratioText: '-3.764 : 1 (Reverse)',
    syncIndex: 2, // Sync #3 (5th / Reverse)
    sleeveTargetZ: 3.00,
    color: '#ef4444',
    desc: 'Aliran daya melewati Roda Gigi Pembalik (Reverse Idler Gear) di antara Countershaft dan Poros Output, sehingga arah putaran Poros Output berbalik arah untuk bergerak mundur!'
  }
};

const SYNCHRO_HUBS = [
  { index: 0, name: 'Sync #1 (4th / 3rd)', neutralZ: -1.45, forkX: -0.55 },
  { index: 1, name: 'Sync #2 (2nd / 1st)', neutralZ: 1.10, forkX: 0.0 },
  { index: 2, name: 'Sync #3 (5th / Rev)', neutralZ: 2.76, forkX: 0.55 }
];

// Helper to build a true 3D involute-style toothed gear geometry
function createGearGeometry({
  pitchRadius,
  teethCount,
  faceWidth = 0.34,
  boreRadius = 0.24,
  helicalAngle = 0.14,
  hasWebHoles = true
}) {
  const shape = new THREE.Shape();
  const addendum = Math.min(0.085, (pitchRadius * Math.PI) / (teethCount * 2.2));
  const dedendum = addendum * 1.15;
  const outerR = pitchRadius + addendum;
  const rootR = Math.max(boreRadius + 0.08, pitchRadius - dedendum);

  const step = (Math.PI * 2) / teethCount;
  for (let i = 0; i < teethCount; i++) {
    const baseAngle = i * step;
    const a0 = baseAngle;
    const a1 = baseAngle + step * 0.18;
    const a2 = baseAngle + step * 0.32;
    const a3 = baseAngle + step * 0.54;
    const a4 = baseAngle + step * 0.68;

    const p0x = Math.cos(a0) * rootR;
    const p0y = Math.sin(a0) * rootR;
    if (i === 0) {
      shape.moveTo(p0x, p0y);
    } else {
      shape.lineTo(p0x, p0y);
    }
    shape.lineTo(Math.cos(a1) * rootR, Math.sin(a1) * rootR);
    shape.lineTo(Math.cos(a2) * outerR, Math.sin(a2) * outerR);
    shape.lineTo(Math.cos(a3) * outerR, Math.sin(a3) * outerR);
    shape.lineTo(Math.cos(a4) * rootR, Math.sin(a4) * rootR);
  }
  shape.closePath();

  // Central shaft bore hole
  const borePath = new THREE.Path();
  borePath.absarc(0, 0, boreRadius, 0, Math.PI * 2, true);
  shape.holes.push(borePath);

  // Lightening holes on larger gears so rotation is visually distinct & authentic
  if (hasWebHoles && rootR - boreRadius > 0.42) {
    const holeOrbitR = (rootR + boreRadius) * 0.5;
    const holeR = Math.min(0.16, (rootR - boreRadius) * 0.24);
    const numHoles = 6;
    for (let h = 0; h < numHoles; h++) {
      const ha = (h / numHoles) * Math.PI * 2;
      const hPath = new THREE.Path();
      hPath.absarc(
        Math.cos(ha) * holeOrbitR,
        Math.sin(ha) * holeOrbitR,
        holeR,
        0,
        Math.PI * 2,
        true
      );
      shape.holes.push(hPath);
    }
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: faceWidth,
    steps: 2,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.014,
    bevelThickness: 0.014
  });
  geo.translate(0, 0, -faceWidth * 0.5);

  // Apply subtle helical twist across Z for constant-mesh helical gears
  if (helicalAngle !== 0) {
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const vx = pos.getX(k);
      const vy = pos.getY(k);
      const vz = pos.getZ(k);
      const twist = (vz / faceWidth) * helicalAngle;
      const cosT = Math.cos(twist);
      const sinT = Math.sin(twist);
      pos.setX(k, vx * cosT - vy * sinT);
      pos.setY(k, vx * sinT + vy * cosT);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  return geo;
}

export default function GearboxSim({ theme = 'dark' }) {
  const mountRef = useRef(null);

  // Simulation Controls & Mechanical State
  const [isPlaying, setIsPlaying] = useState(true);
  const [engineRpm, setEngineRpm] = useState(2200);
  const [engineTorqueNm, setEngineTorqueNm] = useState(320);
  const [selectedGear, setSelectedGear] = useState('1'); // 'N', '1', '2', '3', '4', '5', 'R'
  const [clutchEngagement, setClutchEngagement] = useState(1.0); // 1.0 = Fully Engaged, 0.0 = Disengaged
  const [autoClutchOnShift, setAutoClutchOnShift] = useState(true);

  // Visual / Viewport Controls
  const [renderMode, setRenderMode] = useState('realistic');
  const [casingOpacity, setCasingOpacity] = useState(0.24);
  const [cutawayMode, setCutawayMode] = useState(true);
  const [exploded, setExploded] = useState(0.0);
  const [autoRotateCam, setAutoRotateCam] = useState(false);

  // Component Layer Toggles
  const [showCasing, setShowCasing] = useState(true);
  const [showShiftMechanism, setShowShiftMechanism] = useState(true);
  const [showClutchAssy, setShowClutchAssy] = useState(true);
  const [showTorqueFlow, setShowTorqueFlow] = useState(true);

  // Live Telemetry Readouts
  const [telemetry, setTelemetry] = useState({
    inputRpm: 2200,
    counterRpm: -1419,
    outputRpm: 608,
    outputTorqueNm: 1157,
    roadSpeedKmh: 28,
    shiftState: 'LOCKED (SYNCHRO ENGAGED)'
  });

  const simParams = useRef({
    isPlaying,
    engineRpm,
    engineTorqueNm,
    selectedGear,
    clutchEngagement,
    autoClutchOnShift,
    renderMode,
    casingOpacity,
    cutawayMode,
    exploded,
    autoRotateCam,
    showCasing,
    showShiftMechanism,
    showClutchAssy,
    showTorqueFlow,
    theme
  });

  useEffect(() => {
    simParams.current = {
      isPlaying,
      engineRpm,
      engineTorqueNm,
      selectedGear,
      clutchEngagement,
      autoClutchOnShift,
      renderMode,
      casingOpacity,
      cutawayMode,
      exploded,
      autoRotateCam,
      showCasing,
      showShiftMechanism,
      showClutchAssy,
      showTorqueFlow,
      theme
    };
  }, [
    isPlaying,
    engineRpm,
    engineTorqueNm,
    selectedGear,
    clutchEngagement,
    autoClutchOnShift,
    renderMode,
    casingOpacity,
    cutawayMode,
    exploded,
    autoRotateCam,
    showCasing,
    showShiftMechanism,
    showClutchAssy,
    showTorqueFlow,
    theme
  ]);

  // Trigger smooth auto-clutch dip when user shifts gear
  const autoClutchTimerRef = useRef(null);
  const handleSelectGear = (nextGear) => {
    if (nextGear === selectedGear) return;
    setSelectedGear(nextGear);

    if (autoClutchOnShift) {
      if (autoClutchTimerRef.current) clearTimeout(autoClutchTimerRef.current);
      setClutchEngagement(0.08);
      autoClutchTimerRef.current = setTimeout(() => {
        setClutchEngagement(1.0);
      }, 360);
    }
  };

  // Keyboard shortcuts for shifting ('1'-'5', 'R', 'N'/'0', Space for Clutch)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const k = e.key.toUpperCase();
      if (['1', '2', '3', '4', '5', 'R', 'N'].includes(k)) {
        handleSelectGear(k);
      } else if (k === '0') {
        handleSelectGear('N');
      } else if (e.code === 'Space') {
        e.preventDefault();
        setClutchEngagement(0.0);
      }
    };
    const onKeyUp = (e) => {
      if (e.code === 'Space') {
        setClutchEngagement(1.0);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  });

  const cameraPresetRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // ------------------------------------------------------------------------
    // 1. SCENE, CAMERA, RENDERER & STUDIO LIGHTING
    // ------------------------------------------------------------------------
    const scene = new THREE.Scene();
    const isDarkTheme = simParams.current.theme === 'dark';
    scene.background = new THREE.Color(isDarkTheme ? 0x0b101b : 0xf1f5f9);
    scene.fog = new THREE.FogExp2(isDarkTheme ? 0x0b101b : 0xf1f5f9, 0.016);

    const camera = new THREE.PerspectiveCamera(
      40,
      container.clientWidth / container.clientHeight,
      0.1,
      200
    );
    camera.position.set(8.2, 4.4, 5.8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(0, 0.15, 0.35);
    controls.minDistance = 4.0;
    controls.maxDistance = 26.0;

    cameraPresetRef.current = (viewType) => {
      if (viewType === 'iso') {
        camera.position.set(8.2, 4.4, 5.8);
        controls.target.set(0, 0.15, 0.35);
      } else if (viewType === 'side') {
        camera.position.set(9.8, 0.35, 0.35);
        controls.target.set(0, 0.15, 0.35);
      } else if (viewType === 'top') {
        camera.position.set(0.01, 10.6, 0.35);
        controls.target.set(0, 0.15, 0.35);
      } else if (viewType === 'front') {
        camera.position.set(2.4, 1.8, -8.5);
        controls.target.set(0, 0.15, 0.0);
      }
      controls.update();
    };

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.72);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff8eb, 2.25);
    keyLight.position.set(9, 13, 8);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 1.05);
    fillLight.position.set(-9, 4, -6);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xf97316, 1.15);
    rimLight.position.set(0, -6, 9);
    scene.add(rimLight);

    const activeGearGlowLight = new THREE.PointLight(0xf97316, 1.8, 5.5);
    activeGearGlowLight.position.set(0, 0, 0);
    scene.add(activeGearGlowLight);

    const gridHelper = new THREE.GridHelper(
      26,
      26,
      isDarkTheme ? 0x1e293b : 0xcbd5e1,
      isDarkTheme ? 0x131c2e : 0xe2e8f0
    );
    gridHelper.position.y = -2.55;
    scene.add(gridHelper);

    // ------------------------------------------------------------------------
    // 2. PBR MATERIALS & RENDER MODE TRACKING
    // ------------------------------------------------------------------------
    const realisticMats = {
      inputShaft: new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.88, roughness: 0.18 }),
      counterShaft: new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.86, roughness: 0.22 }),
      outputShaft: new THREE.MeshStandardMaterial({ color: 0x10b981, metalness: 0.88, roughness: 0.18 }),
      gearSteel: new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.90, roughness: 0.20 }),
      gearActive: new THREE.MeshStandardMaterial({
        color: 0xf97316,
        metalness: 0.82,
        roughness: 0.18,
        emissive: 0xea580c,
        emissiveIntensity: 0.38
      }),
      gearReverse: new THREE.MeshStandardMaterial({
        color: 0xf87171,
        metalness: 0.85,
        roughness: 0.22,
        emissive: 0xdc2626,
        emissiveIntensity: 0.18
      }),
      synchroHub: new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.85, roughness: 0.26 }),
      synchroSleeve: new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        metalness: 0.85,
        roughness: 0.20,
        emissive: 0x0284c7,
        emissiveIntensity: 0.22
      }),
      synchroBrass: new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.92, roughness: 0.18 }),
      shiftFork: new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.78, roughness: 0.28 }),
      shiftRail: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.94, roughness: 0.12 }),
      flywheel: new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.84, roughness: 0.30 }),
      clutchDisc: new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.45, roughness: 0.55 }),
      pressurePlate: new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.65, roughness: 0.30 }),
      bearing: new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.92, roughness: 0.15 }),
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
      const baseMat = realisticMats[type] || realisticMats.gearSteel;
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

    // Soft-Glow Particle Texture
    const createSoftGlowTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
      grad.addColorStop(0.22, 'rgba(255, 255, 255, 0.85)');
      grad.addColorStop(0.55, 'rgba(255, 255, 255, 0.28)');
      grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      return tex;
    };
    const glowTexture = createSoftGlowTexture();

    const gearboxRoot = new THREE.Group();
    scene.add(gearboxRoot);

    // ------------------------------------------------------------------------
    // 3. ENGINE FLYWHEEL, DIAPHRAGM CLUTCH & INPUT SHAFT (z = -4.2 .. -2.1)
    // ------------------------------------------------------------------------
    const clutchGroup = new THREE.Group();
    gearboxRoot.add(clutchGroup);

    // Engine Crank Flange & Dual-Mass Flywheel (Spins purely at Engine RPM)
    const flywheelGroup = new THREE.Group();
    flywheelGroup.position.set(0, MAINSHAFT_Y, -3.95);
    clutchGroup.add(flywheelGroup);

    const fwDiscGeo = new THREE.CylinderGeometry(1.42, 1.42, 0.24, 40);
    fwDiscGeo.rotateX(Math.PI / 2);
    flywheelGroup.add(registerMesh(new THREE.Mesh(fwDiscGeo), 'flywheel'));

    // Flywheel Ring Gear Teeth
    const fwRingGeo = createGearGeometry({
      pitchRadius: 1.44,
      teethCount: 44,
      faceWidth: 0.14,
      boreRadius: 1.25,
      helicalAngle: 0,
      hasWebHoles: false
    });
    const fwRingMesh = registerMesh(new THREE.Mesh(fwRingGeo), 'synchroBrass', false);
    fwRingMesh.position.z = -0.06;
    flywheelGroup.add(fwRingMesh);

    // Friction Clutch Disc & Diaphragm Pressure Plate (Slides along Z when clutch disengages!)
    const clutchDiscGroup = new THREE.Group();
    clutchDiscGroup.position.set(0, MAINSHAFT_Y, -3.62);
    clutchGroup.add(clutchDiscGroup);

    const frictionDiscGeo = new THREE.CylinderGeometry(1.12, 1.12, 0.10, 32);
    frictionDiscGeo.rotateX(Math.PI / 2);
    clutchDiscGroup.add(registerMesh(new THREE.Mesh(frictionDiscGeo), 'clutchDisc'));

    // 6 Torsion Damper Springs on the Clutch Disc Hub
    const damperSpringGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.24, 12);
    for (let d = 0; d < 6; d++) {
      const da = (d / 6) * Math.PI * 2;
      const dMesh = registerMesh(new THREE.Mesh(damperSpringGeo), 'synchroBrass', false);
      dMesh.position.set(Math.cos(da) * 0.56, Math.sin(da) * 0.56, 0.04);
      dMesh.rotation.z = da + Math.PI / 2;
      clutchDiscGroup.add(dMesh);
    }

    // Red Anodized Diaphragm Pressure Plate Cover & Release Bearing
    const pressurePlateGroup = new THREE.Group();
    pressurePlateGroup.position.set(0, MAINSHAFT_Y, -3.40);
    clutchGroup.add(pressurePlateGroup);

    const ppCoverGeo = new THREE.CylinderGeometry(1.18, 0.92, 0.22, 32, 1, true);
    ppCoverGeo.rotateX(Math.PI / 2);
    pressurePlateGroup.add(registerMesh(new THREE.Mesh(ppCoverGeo), 'pressurePlate'));

    const throwoutBearingGeo = new THREE.TorusGeometry(0.34, 0.08, 14, 28);
    const throwoutBearingMesh = registerMesh(new THREE.Mesh(throwoutBearingGeo), 'bearing');
    throwoutBearingMesh.position.z = 0.22;
    pressurePlateGroup.add(throwoutBearingMesh);

    // Input Shaft & Permanent Input Head Gear (z = -2.35)
    const inputShaftGroup = new THREE.Group();
    inputShaftGroup.position.set(0, MAINSHAFT_Y, 0);
    gearboxRoot.add(inputShaftGroup);

    const inShaftGeo = new THREE.CylinderGeometry(0.22, 0.22, 1.95, 24);
    inShaftGeo.rotateX(Math.PI / 2);
    const inShaftMesh = registerMesh(new THREE.Mesh(inShaftGeo), 'inputShaft');
    inShaftMesh.position.z = -3.05;
    inputShaftGroup.add(inShaftMesh);

    const inputHeadGearGeo = createGearGeometry({
      pitchRadius: HEAD_GEAR.rIn,
      teethCount: HEAD_GEAR.zIn,
      faceWidth: 0.38,
      boreRadius: 0.22,
      helicalAngle: 0.14
    });
    const inputHeadGearMesh = registerMesh(new THREE.Mesh(inputHeadGearGeo), 'gearSteel');
    inputHeadGearMesh.position.z = HEAD_GEAR.zPos;
    inputShaftGroup.add(inputHeadGearMesh);

    // Dog Clutch Teeth Ring on the back of Input Head Gear (for 4th Gear Direct Drive Lockup!)
    const inDogGeo = createGearGeometry({
      pitchRadius: 0.48,
      teethCount: 18,
      faceWidth: 0.16,
      boreRadius: 0.22,
      helicalAngle: 0,
      hasWebHoles: false
    });
    const inDogMesh = registerMesh(new THREE.Mesh(inDogGeo), 'synchroBrass', false);
    inDogMesh.position.z = HEAD_GEAR.zPos + 0.25;
    inputShaftGroup.add(inDogMesh);

    // ------------------------------------------------------------------------
    // 4. COUNTERSHAFT / LAYSHAFT ASSEMBLY (All Gears Fixed Together at y = -1.05)
    // ------------------------------------------------------------------------
    const counterShaftGroup = new THREE.Group();
    counterShaftGroup.position.set(0, COUNTERSHAFT_Y, 0);
    gearboxRoot.add(counterShaftGroup);

    const counterShaftLen = 6.25;
    const cShaftGeo = new THREE.CylinderGeometry(0.24, 0.24, counterShaftLen, 24);
    cShaftGeo.rotateX(Math.PI / 2);
    const cShaftMesh = registerMesh(new THREE.Mesh(cShaftGeo), 'counterShaft');
    cShaftMesh.position.z = 0.45;
    counterShaftGroup.add(cShaftMesh);

    // Countershaft Head Gear (Meshes permanently with Input Head Gear at z = -2.35)
    const counterHeadGearGeo = createGearGeometry({
      pitchRadius: HEAD_GEAR.rCounter,
      teethCount: HEAD_GEAR.zCounter,
      faceWidth: 0.38,
      boreRadius: 0.24,
      helicalAngle: -0.14
    });
    const counterHeadGearMesh = registerMesh(new THREE.Mesh(counterHeadGearGeo), 'gearSteel');
    counterHeadGearMesh.position.z = HEAD_GEAR.zPos;
    counterShaftGroup.add(counterHeadGearMesh);

    // Countershaft Fixed Gears for 1st, 2nd, 3rd, 5th, and Reverse
    const counterGearMeshes = {};
    ['1', '2', '3', '5', 'R'].forEach((gKey) => {
      const def = GEAR_DEFINITIONS[gKey];
      const isRev = gKey === 'R';
      const cGeo = createGearGeometry({
        pitchRadius: def.rCounter,
        teethCount: def.zCounter,
        faceWidth: 0.36,
        boreRadius: 0.24,
        helicalAngle: isRev ? 0 : -0.14
      });
      const cMesh = registerMesh(new THREE.Mesh(cGeo), isRev ? 'gearReverse' : 'gearSteel');
      cMesh.position.z = def.zPos;
      counterShaftGroup.add(cMesh);
      counterGearMeshes[gKey] = cMesh;
    });

    // ------------------------------------------------------------------------
    // 5. OUTPUT SHAFT (MAINSHAFT), FREEWHEEL GEARS & 3 SYNCHRONIZER SLEEVES
    // ------------------------------------------------------------------------
    const outputShaftGroup = new THREE.Group();
    outputShaftGroup.position.set(0, MAINSHAFT_Y, 0);
    gearboxRoot.add(outputShaftGroup);

    const outShaftLen = 6.2;
    const outShaftGeo = new THREE.CylinderGeometry(0.24, 0.24, outShaftLen, 24);
    outShaftGeo.rotateX(Math.PI / 2);
    const outShaftMesh = registerMesh(new THREE.Mesh(outShaftGeo), 'outputShaft');
    outShaftMesh.position.z = 1.05;
    outputShaftGroup.add(outShaftMesh);

    // Rear Output Driveshaft 3-Arm Flange / Prop-Shaft Yoke (at z = +4.18)
    const flangeGeo = new THREE.CylinderGeometry(0.68, 0.34, 0.22, 6);
    flangeGeo.rotateX(Math.PI / 2);
    const flangeMesh = registerMesh(new THREE.Mesh(flangeGeo), 'outputShaft');
    flangeMesh.position.z = 4.18;
    outputShaftGroup.add(flangeMesh);

    // 3 Splined Synchronizer Hubs Fixed to the Output Shaft
    SYNCHRO_HUBS.forEach((hub) => {
      const hubGeo = createGearGeometry({
        pitchRadius: 0.52,
        teethCount: 20,
        faceWidth: 0.24,
        boreRadius: 0.24,
        helicalAngle: 0,
        hasWebHoles: false
      });
      const hubMesh = registerMesh(new THREE.Mesh(hubGeo), 'synchroHub');
      hubMesh.position.z = hub.neutralZ;
      outputShaftGroup.add(hubMesh);
    });

    // Freewheeling Output Gears (1st, 2nd, 3rd, 5th, Reverse) on Needle Roller Bearings!
    // Each rotates at its own speed driven by the Countershaft, independent of Output Shaft
    // until locked by a Synchronizer Sleeve!
    const outputFreewheelGroups = {};
    const outputGearMeshes = {};
    ['1', '2', '3', '5', 'R'].forEach((gKey) => {
      const def = GEAR_DEFINITIONS[gKey];
      const isRev = gKey === 'R';
      const fwGrp = new THREE.Group();
      fwGrp.position.set(0, MAINSHAFT_Y, def.zPos);
      gearboxRoot.add(fwGrp);

      const oGeo = createGearGeometry({
        pitchRadius: def.rOutput,
        teethCount: def.zOutput,
        faceWidth: 0.36,
        boreRadius: 0.28,
        helicalAngle: isRev ? 0 : 0.14
      });
      const oMesh = registerMesh(new THREE.Mesh(oGeo), isRev ? 'gearReverse' : 'gearSteel');
      fwGrp.add(oMesh);

      // Brass Synchro Baulk Ring & Dog Clutch Teeth facing the adjacent Synchronizer Hub
      const hubZ = SYNCHRO_HUBS[def.syncIndex].neutralZ;
      const dogDir = Math.sign(hubZ - def.zPos);
      const dogGeo = createGearGeometry({
        pitchRadius: 0.48,
        teethCount: 18,
        faceWidth: 0.16,
        boreRadius: 0.28,
        helicalAngle: 0,
        hasWebHoles: false
      });
      const dogMesh = registerMesh(new THREE.Mesh(dogGeo), 'synchroBrass', false);
      dogMesh.position.z = dogDir * 0.24;
      fwGrp.add(dogMesh);

      outputFreewheelGroups[gKey] = fwGrp;
      outputGearMeshes[gKey] = oMesh;
    });

    // Reverse Idler Shaft & Gear (Bridges Countershaft Reverse Gear and Output Reverse Gear at z = 3.25)
    const revIdlerGroup = new THREE.Group();
    revIdlerGroup.position.set(-1.08, -0.18, GEAR_DEFINITIONS.R.zPos);
    gearboxRoot.add(revIdlerGroup);

    const idlerGeo = createGearGeometry({
      pitchRadius: GEAR_DEFINITIONS.R.rIdler,
      teethCount: GEAR_DEFINITIONS.R.zIdler,
      faceWidth: 0.40,
      boreRadius: 0.18,
      helicalAngle: 0,
      hasWebHoles: false
    });
    const revIdlerMesh = registerMesh(new THREE.Mesh(idlerGeo), 'gearReverse');
    revIdlerGroup.add(revIdlerMesh);

    const idlerPinGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.95, 18);
    idlerPinGeo.rotateX(Math.PI / 2);
    const idlerPinMesh = registerMesh(new THREE.Mesh(idlerPinGeo), 'bearing', false);
    idlerPinMesh.position.set(-1.08, -0.18, GEAR_DEFINITIONS.R.zPos);
    gearboxRoot.add(idlerPinMesh);

    // ------------------------------------------------------------------------
    // 6. SLIDING SYNCHRONIZER SLEEVES, SHIFT FORKS, RAILS & H-GATE TURRET
    // ------------------------------------------------------------------------
    const shiftMechanismGroup = new THREE.Group();
    gearboxRoot.add(shiftMechanismGroup);

    const synchroSleeves = [];
    const shiftForkGroups = [];

    // 3 Longitudinal Steel Shift Rails above the Mainshaft
    const railLen = 6.2;
    const railGeo = new THREE.CylinderGeometry(0.075, 0.075, railLen, 16);
    railGeo.rotateX(Math.PI / 2);

    SYNCHRO_HUBS.forEach((hub) => {
      // A. Sliding Synchronizer Sleeve (Rotates with Output Shaft AND slides along Z!)
      const sleeveHolder = new THREE.Group();
      sleeveHolder.position.set(0, MAINSHAFT_Y, hub.neutralZ);
      gearboxRoot.add(sleeveHolder);

      const sleeveRingGeo = new THREE.CylinderGeometry(0.64, 0.64, 0.34, 28);
      sleeveRingGeo.rotateX(Math.PI / 2);
      const sleeveMesh = registerMesh(new THREE.Mesh(sleeveRingGeo), 'synchroSleeve');

      // Recessed Fork Groove around the Synchronizer Sleeve
      const grooveGeo = new THREE.TorusGeometry(0.64, 0.045, 12, 28);
      const grooveMesh = registerMesh(new THREE.Mesh(grooveGeo), 'synchroBrass', false);
      sleeveHolder.add(sleeveMesh, grooveMesh);
      synchroSleeves.push({
        holder: sleeveHolder,
        mesh: sleeveMesh,
        currentZ: hub.neutralZ,
        neutralZ: hub.neutralZ
      });

      // B. Shift Rail & Cast-Bronze Shift Fork (Slides along Z without rotating)
      const railMesh = registerMesh(new THREE.Mesh(railGeo), 'shiftRail', false);
      railMesh.position.set(hub.forkX, MAINSHAFT_Y + 1.25, 0.65);
      shiftMechanismGroup.add(railMesh);

      const forkGroup = new THREE.Group();
      forkGroup.position.set(0, MAINSHAFT_Y, hub.neutralZ);
      shiftMechanismGroup.add(forkGroup);

      // Half-ring fork yoke cradling the Synchronizer Sleeve
      const forkArcGeo = new THREE.TorusGeometry(0.69, 0.065, 12, 24, Math.PI * 1.15);
      forkArcGeo.rotateZ(-Math.PI * 0.075);
      const forkArcMesh = registerMesh(new THREE.Mesh(forkArcGeo), 'shiftFork');
      forkGroup.add(forkArcMesh);

      // Stem connecting fork yoke up to its Shift Rail collar
      const stemCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.68, 0),
        new THREE.Vector3(hub.forkX * 0.6, 0.96, 0),
        new THREE.Vector3(hub.forkX, 1.25, 0)
      ]);
      const stemGeo = new THREE.TubeGeometry(stemCurve, 12, 0.065, 10, false);
      forkGroup.add(registerMesh(new THREE.Mesh(stemGeo), 'shiftFork', false));

      const collarGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.34, 16);
      collarGeo.rotateX(Math.PI / 2);
      const collarMesh = registerMesh(new THREE.Mesh(collarGeo), 'shiftFork', false);
      collarMesh.position.set(hub.forkX, 1.25, 0);
      forkGroup.add(collarMesh);

      shiftForkGroups.push(forkGroup);
    });

    // ------------------------------------------------------------------------
    // 7. SCULPTED ORGANIC CAST-ALUMINUM TRANSMISSION HOUSING & BELLHOUSING
    // ------------------------------------------------------------------------
    const casingGroup = new THREE.Group();
    gearboxRoot.add(casingGroup);

    // A. Front Flared Conical Bellhousing (Framing the Flywheel & Clutch at z = -4.3 .. -2.65)
    const bellLathePts = [
      new THREE.Vector2(1.78, -4.35),
      new THREE.Vector2(1.72, -3.55),
      new THREE.Vector2(1.36, -2.95),
      new THREE.Vector2(0.96, -2.65),
      new THREE.Vector2(0.84, -2.65),
      new THREE.Vector2(1.26, -2.95),
      new THREE.Vector2(1.62, -3.55),
      new THREE.Vector2(1.66, -4.35)
    ];
    const fullBellGeo = new THREE.LatheGeometry(bellLathePts, 36);
    fullBellGeo.rotateX(Math.PI / 2);
    const cutBellGeo = new THREE.LatheGeometry(bellLathePts, 36, Math.PI * 0.65, Math.PI * 1.45);
    cutBellGeo.rotateX(Math.PI / 2);

    const bellHousingMesh = registerMesh(new THREE.Mesh(fullBellGeo), 'casing');
    bellHousingMesh.position.set(0, MAINSHAFT_Y, 0);
    casingGroup.add(bellHousingMesh);

    // B. Sculpted Figure-8 Dual-Shaft Cast Transmission Main Case (z = -2.65 .. +3.65)
    // Back/Left Structural Half (Always visible when Casing is enabled)
    const caseLen = 6.30;
    const backCaseShape = new THREE.Shape();
    backCaseShape.moveTo(0.15, -2.28);
    backCaseShape.lineTo(-1.42, -2.28);
    backCaseShape.quadraticCurveTo(-1.88, -1.75, -1.82, -1.05);
    backCaseShape.quadraticCurveTo(-1.76, -0.15, -1.58, 0.35);
    backCaseShape.quadraticCurveTo(-1.78, 1.15, -1.45, 2.15);
    backCaseShape.lineTo(-0.85, 2.58);
    backCaseShape.lineTo(0.35, 2.58);
    backCaseShape.lineTo(0.35, 2.40);
    backCaseShape.lineTo(-0.78, 2.40);
    backCaseShape.lineTo(-1.28, 2.02);
    backCaseShape.quadraticCurveTo(-1.58, 1.15, -1.38, 0.35);
    backCaseShape.quadraticCurveTo(-1.56, -0.15, -1.62, -1.05);
    backCaseShape.quadraticCurveTo(-1.66, -1.65, -1.25, -2.10);
    backCaseShape.lineTo(0.15, -2.10);
    backCaseShape.closePath();

    const backCaseGeo = new THREE.ExtrudeGeometry(backCaseShape, {
      depth: caseLen,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.045,
      bevelThickness: 0.045
    });
    backCaseGeo.translate(0, 0, -2.65);
    const backCaseMesh = registerMesh(new THREE.Mesh(backCaseGeo), 'casing');
    casingGroup.add(backCaseMesh);

    // Front/Right (+X) Cutaway Case Half (Toggled by Cutaway Mode or Exploded View)
    const frontCaseShape = new THREE.Shape();
    frontCaseShape.moveTo(0.15, -2.28);
    frontCaseShape.lineTo(1.42, -2.28);
    frontCaseShape.quadraticCurveTo(1.88, -1.75, 1.82, -1.05);
    frontCaseShape.quadraticCurveTo(1.66, -0.15, 1.52, 0.35);
    frontCaseShape.quadraticCurveTo(1.78, 1.15, 1.45, 2.15);
    frontCaseShape.lineTo(0.85, 2.58);
    frontCaseShape.lineTo(0.35, 2.58);
    frontCaseShape.lineTo(0.35, 2.40);
    frontCaseShape.lineTo(0.78, 2.40);
    frontCaseShape.lineTo(1.28, 2.02);
    frontCaseShape.quadraticCurveTo(1.58, 1.15, 1.34, 0.35);
    frontCaseShape.quadraticCurveTo(1.48, -0.15, 1.62, -1.05);
    frontCaseShape.quadraticCurveTo(1.66, -1.65, 1.25, -2.10);
    frontCaseShape.lineTo(0.15, -2.10);
    frontCaseShape.closePath();

    const frontCaseGeo = new THREE.ExtrudeGeometry(frontCaseShape, {
      depth: caseLen,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.045,
      bevelThickness: 0.045
    });
    frontCaseGeo.translate(0, 0, -2.65);
    const frontCaseMesh = registerMesh(new THREE.Mesh(frontCaseGeo), 'casing');
    casingGroup.add(frontCaseMesh);

    // 3 Internal Bearing Bulkhead Walls (Front, Center-Rear, and Tail Housing Bulkhead)
    const bulkheadPlateShape = new THREE.Shape();
    bulkheadPlateShape.moveTo(-1.55, -1.85);
    bulkheadPlateShape.lineTo(-1.42, 1.85);
    bulkheadPlateShape.lineTo(1.42, 1.85);
    bulkheadPlateShape.lineTo(1.55, -1.85);
    bulkheadPlateShape.closePath();

    const mainHole = new THREE.Path();
    mainHole.absarc(0, MAINSHAFT_Y, 0.42, 0, Math.PI * 2, true);
    bulkheadPlateShape.holes.push(mainHole);

    const counterHole = new THREE.Path();
    counterHole.absarc(0, COUNTERSHAFT_Y, 0.42, 0, Math.PI * 2, true);
    bulkheadPlateShape.holes.push(counterHole);

    const bulkheadWallGeo = new THREE.ExtrudeGeometry(bulkheadPlateShape, {
      depth: 0.16,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.02,
      bevelThickness: 0.02
    });
    bulkheadWallGeo.translate(0, 0, -0.08);

    [-2.65, 2.02, 3.65].forEach((bz) => {
      const bWall = registerMesh(new THREE.Mesh(bulkheadWallGeo), 'casing');
      bWall.position.z = bz;
      casingGroup.add(bWall);

      // Machined Ball Bearing Races at both shafts
      [MAINSHAFT_Y, COUNTERSHAFT_Y].forEach((by) => {
        const brgGeo = new THREE.TorusGeometry(0.35, 0.075, 12, 24);
        const brgMesh = registerMesh(new THREE.Mesh(brgGeo), 'bearing', false);
        brgMesh.position.set(0, by, bz);
        casingGroup.add(brgMesh);
      });
    });

    // External Cast Cooling Fins under the Gearbox Sump & Side Stiffening Ribs
    const finGeo = new THREE.BoxGeometry(0.05, 0.12, caseLen - 0.4);
    for (let f = -4; f <= 4; f++) {
      const fMesh = registerMesh(new THREE.Mesh(finGeo), 'casing', false);
      fMesh.position.set(f * 0.24, -2.35, 0.5);
      casingGroup.add(fMesh);
    }

    // ------------------------------------------------------------------------
    // 8. ACTIVE TORQUE PATH PARTICLES (VISUALIZES EXACT POWER ROUTING!)
    // ------------------------------------------------------------------------
    const torqueFlowGroup = new THREE.Group();
    gearboxRoot.add(torqueFlowGroup);

    const flowParticles = [];
    for (let i = 0; i < 56; i++) {
      const pMat = new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const sprite = new THREE.Sprite(pMat);
      sprite.scale.set(0.36, 0.36, 1);
      torqueFlowGroup.add(sprite);
      flowParticles.push({
        sprite,
        mat: pMat,
        u: i / 56,
        radialJitter: (Math.random() - 0.5) * 0.16
      });
    }

    // Helper to build the active 3D torque path curve based on selected gear
    const buildTorqueCurve = (gearKey) => {
      if (gearKey === 'N') {
        // In Neutral, power enters Input Shaft -> Head Gear -> spins Countershaft only
        return new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, MAINSHAFT_Y, -3.95),
          new THREE.Vector3(0, MAINSHAFT_Y, HEAD_GEAR.zPos),
          new THREE.Vector3(0, 0.0, HEAD_GEAR.zPos),
          new THREE.Vector3(0, COUNTERSHAFT_Y, HEAD_GEAR.zPos),
          new THREE.Vector3(0, COUNTERSHAFT_Y, 3.25)
        ]);
      }
      if (gearKey === '4') {
        // Direct Drive (1.000:1): Straight line along Mainshaft from Input to Output Flange!
        return new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, MAINSHAFT_Y, -3.95),
          new THREE.Vector3(0, MAINSHAFT_Y, -2.35),
          new THREE.Vector3(0, MAINSHAFT_Y, -1.45),
          new THREE.Vector3(0, MAINSHAFT_Y, 1.50),
          new THREE.Vector3(0, MAINSHAFT_Y, 4.25)
        ]);
      }
      const def = GEAR_DEFINITIONS[gearKey] || GEAR_DEFINITIONS['1'];
      const hubZ = SYNCHRO_HUBS[def.syncIndex].neutralZ;
      if (gearKey === 'R') {
        // Reverse Path: Input -> Head Mesh -> Countershaft -> Reverse Idler -> Output Reverse Gear -> Sync #3 -> Output Flange
        return new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, MAINSHAFT_Y, -3.95),
          new THREE.Vector3(0, MAINSHAFT_Y, HEAD_GEAR.zPos),
          new THREE.Vector3(0, COUNTERSHAFT_Y, HEAD_GEAR.zPos),
          new THREE.Vector3(0, COUNTERSHAFT_Y, def.zPos),
          new THREE.Vector3(-1.08, -0.18, def.zPos),
          new THREE.Vector3(0, MAINSHAFT_Y, def.zPos),
          new THREE.Vector3(0, MAINSHAFT_Y, hubZ),
          new THREE.Vector3(0, MAINSHAFT_Y, 4.25)
        ]);
      }
      // 1st, 2nd, 3rd, 5th Path: Input -> Head Mesh -> Countershaft -> Active Gear Pair -> Synchro Hub -> Output Flange
      return new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, MAINSHAFT_Y, -3.95),
        new THREE.Vector3(0, MAINSHAFT_Y, HEAD_GEAR.zPos),
        new THREE.Vector3(0, 0.1, HEAD_GEAR.zPos),
        new THREE.Vector3(0, COUNTERSHAFT_Y, HEAD_GEAR.zPos),
        new THREE.Vector3(0, COUNTERSHAFT_Y, def.zPos),
        new THREE.Vector3(0, 0.0, def.zPos),
        new THREE.Vector3(0, MAINSHAFT_Y, def.zPos),
        new THREE.Vector3(0, MAINSHAFT_Y, hubZ),
        new THREE.Vector3(0, MAINSHAFT_Y, 4.25)
      ]);
    };

    // ------------------------------------------------------------------------
    // 9. MATERIAL MODES, VISIBILITY & REAL-TIME MECHANICAL ANIMATION LOOP
    // ------------------------------------------------------------------------
    const updateMaterialModes = () => {
      const {
        renderMode: rMode,
        casingOpacity: cOp,
        cutawayMode: cut,
        showCasing: sCase,
        showShiftMechanism: sShift,
        showClutchAssy: sClutch,
        showTorqueFlow: sFlow,
        exploded: exp,
        selectedGear: activeGearKey,
        theme: activeTheme
      } = simParams.current;

      realisticMats.casing.opacity = cOp;
      rawCasingMat.opacity = cOp;
      wireframeCasingMat.opacity = Math.max(0.14, cOp);

      // Highlight the currently engaged gear pair in Realistic Mode
      ['1', '2', '3', '5', 'R'].forEach((gKey) => {
        const isSelected = activeGearKey === gKey;
        const defaultMat = gKey === 'R' ? realisticMats.gearReverse : realisticMats.gearSteel;
        const targetMat = isSelected ? realisticMats.gearActive : defaultMat;
        counterGearMeshes[gKey].userData.activeMat = targetMat;
        outputGearMeshes[gKey].userData.activeMat = targetMat;
      });
      inputHeadGearMesh.userData.activeMat =
        activeGearKey !== 'N' ? realisticMats.gearActive : realisticMats.gearSteel;
      counterHeadGearMesh.userData.activeMat =
        activeGearKey !== 'N' && activeGearKey !== '4'
          ? realisticMats.gearActive
          : realisticMats.gearSteel;
      revIdlerMesh.userData.activeMat =
        activeGearKey === 'R' ? realisticMats.gearActive : realisticMats.gearReverse;

      trackedMeshes.forEach(({ mesh, type, baseMat, wireOverlay }) => {
        const isTranslucent = type === 'casing';
        const effectiveRealMat = mesh.userData.activeMat || baseMat;

        if (rMode === 'realistic') {
          mesh.material = effectiveRealMat;
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
          mesh.material = effectiveRealMat;
          if (wireOverlay) {
            wireOverlay.visible = true;
            wireOverlay.material.color.setHex(0xfb6514);
            wireOverlay.material.opacity = isTranslucent ? 0.18 : 0.42;
          }
        }
      });

      casingGroup.visible = sCase;
      frontCaseMesh.visible = sCase && (!cut || exp > 0.08);
      bellHousingMesh.geometry = cut && exp < 0.08 ? cutBellGeo : fullBellGeo;
      shiftMechanismGroup.visible = sShift;
      clutchGroup.visible = sClutch;
      torqueFlowGroup.visible = sFlow;

      // Exploded View Separation
      shiftMechanismGroup.position.y = exp * 1.15;
      frontCaseMesh.position.x = exp * 1.35;
      backCaseMesh.position.x = -exp * 0.65;
      clutchGroup.position.z = -exp * 1.10;
      counterShaftGroup.position.y = COUNTERSHAFT_Y - exp * 0.65;
    };

    let lastTime = performance.now();
    let uiCounter = 0;
    let animationFrameId;
    let currentInputOmega = 0;
    let currentOutputOmega = 0;

    const animate = (now) => {
      animationFrameId = requestAnimationFrame(animate);
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Number.isFinite(rawDt) && rawDt > 0 ? Math.min(rawDt, 0.05) : 0.016;

      const {
        isPlaying: playing,
        engineRpm: engRpm,
        engineTorqueNm: engNm,
        selectedGear: gearKey,
        clutchEngagement: clutch,
        autoRotateCam: autoCam
      } = simParams.current;

      const gearDef = GEAR_DEFINITIONS[gearKey] || GEAR_DEFINITIONS.N;

      // 1. Engine Flywheel Rotation (Always turns at Engine RPM when playing)
      const visualSpeedScale = 0.095;
      const engineOmega = playing ? ((engRpm * 2 * Math.PI) / 60) * visualSpeedScale : 0;
      flywheelGroup.rotation.z += engineOmega * dt;

      // 2. Physical Clutch Engagement & Synchromesh Dynamics
      const targetInputOmega = engineOmega * clutch;
      currentInputOmega += (targetInputOmega - currentInputOmega) * Math.min(1, dt * 12);

      // Animate Clutch Disc & Pressure Plate separation when Clutch is depressed
      const clutchGap = (1 - clutch) * 0.22;
      clutchDiscGroup.position.z = -3.62 + clutchGap * 0.55;
      pressurePlateGroup.position.z = -3.40 + clutchGap;
      clutchDiscGroup.rotation.z += currentInputOmega * dt;
      pressurePlateGroup.rotation.z += engineOmega * dt;

      // 3. Input Shaft & Countershaft Rotation (Permanent Constant-Mesh!)
      inputShaftGroup.rotation.z += currentInputOmega * dt;
      const counterOmega = currentInputOmega * HEAD_GEAR.counterRatio; // Opposite direction!
      counterShaftGroup.rotation.z += counterOmega * dt;

      // 4. Freewheeling Speed Gears on Mainshaft (Each driven at its exact tooth ratio by the Countershaft!)
      ['1', '2', '3', '5', 'R'].forEach((gKey) => {
        const def = GEAR_DEFINITIONS[gKey];
        const fwGrp = outputFreewheelGroups[gKey];
        if (gKey === 'R') {
          // Reverse Idler reverses the rotation direction!
          const idlerOmega = -counterOmega * (def.zCounter / def.zIdler);
          revIdlerGroup.rotation.z += idlerOmega * dt;
          const revOutOmega = -idlerOmega * (def.zIdler / def.zOutput);
          fwGrp.rotation.z += revOutOmega * dt;
        } else {
          const gearOmega = -counterOmega * (def.zCounter / def.zOutput);
          fwGrp.rotation.z += gearOmega * dt;
        }
      });

      // 5. Sliding Synchronizer Sleeves & Shift Forks (Smooth spring-damper actuation)
      SYNCHRO_HUBS.forEach((hub, idx) => {
        const sleeveObj = synchroSleeves[idx];
        const forkGrp = shiftForkGroups[idx];
        const targetZ = gearDef.syncIndex === idx ? gearDef.sleeveTargetZ : hub.neutralZ;
        sleeveObj.currentZ += (targetZ - sleeveObj.currentZ) * Math.min(1, dt * 14);
        sleeveObj.holder.position.z = sleeveObj.currentZ;
        forkGrp.position.z = sleeveObj.currentZ;
      });

      // 6. Output Shaft Rotation (Locked to active gear via Synchronizer Sleeve, or coasts to 0 in Neutral!)
      const targetOutputOmega =
        gearKey === 'N' ? 0 : currentInputOmega / gearDef.ratio;
      currentOutputOmega += (targetOutputOmega - currentOutputOmega) * Math.min(1, dt * 10);
      outputShaftGroup.rotation.z += currentOutputOmega * dt;

      // All 3 Synchronizer Sleeves are splined to the Output Shaft, so they rotate with Output Shaft!
      synchroSleeves.forEach((sl) => {
        sl.holder.rotation.z = outputShaftGroup.rotation.z;
      });

      // Move active gear glow light to highlight the active meshing zone
      activeGearGlowLight.position.set(0, 0, gearDef.zPos || 0);
      activeGearGlowLight.color.set(gearDef.color || '#38bdf8');

      // 7. Animate Active Torque Flow Stream Particles along the engaged mechanical path
      const activeCurve = buildTorqueCurve(gearKey);
      const flowSpeed = playing ? Math.max(0.18, (Math.abs(currentInputOmega) / 18) * (0.4 + clutch * 0.6)) : 0;
      const flowColor = new THREE.Color(gearDef.color || '#38bdf8');

      flowParticles.forEach((fp) => {
        if (playing && clutch > 0.02) {
          fp.u = (fp.u + dt * flowSpeed) % 1.0;
        }
        const safeU = Math.max(0.001, Math.min(0.999, fp.u));
        const pt = activeCurve.getPoint(safeU);
        const swirlAng = now * 0.006 + fp.u * Math.PI * 8;
        fp.sprite.position.set(
          pt.x + Math.cos(swirlAng) * fp.radialJitter,
          pt.y + Math.sin(swirlAng) * fp.radialJitter,
          pt.z
        );
        fp.mat.color.copy(flowColor);
        fp.mat.opacity = clutch > 0.02 ? 0.72 * Math.sin(safeU * Math.PI) : 0.15;
      });

      updateMaterialModes();

      controls.autoRotate = autoCam;
      controls.autoRotateSpeed = 1.1;
      controls.update();
      renderer.render(scene, camera);

      // Update React Telemetry HUD every ~6 frames
      uiCounter++;
      if (uiCounter % 6 === 0) {
        const actualInRpm = Math.round(engRpm * clutch);
        const actualCounterRpm = Math.round(actualInRpm * HEAD_GEAR.counterRatio);
        const actualOutRpm =
          gearKey === 'N' ? 0 : Math.round(actualInRpm / gearDef.ratio);
        const actualOutTorque =
          gearKey === 'N'
            ? 0
            : Math.round(engNm * clutch * Math.abs(gearDef.ratio) * 0.96);
        // Calculate road speed assuming 3.42 final drive & 0.32m tire radius
        const wheelRpm = actualOutRpm / 3.42;
        const speedKmh = Math.round((wheelRpm * 2 * Math.PI * 0.32 * 60) / 1000);

        setTelemetry({
          inputRpm: actualInRpm,
          counterRpm: actualCounterRpm,
          outputRpm: actualOutRpm,
          outputTorqueNm: actualOutTorque,
          roadSpeedKmh: speedKmh,
          shiftState:
            clutch < 0.25
              ? 'CLUTCH DISENGAGED (FREE SHIFT)'
              : gearKey === 'N'
              ? 'NEUTRAL (IDLE FREEWHEEL)'
              : `LOCKED · ${gearDef.label.toUpperCase()}`
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

  // Update background and grid when theme changes
  useEffect(() => {
    // Handled reactively via simParams + CSS backdrop
  }, [theme]);

  const currentGearObj = GEAR_DEFINITIONS[selectedGear] || GEAR_DEFINITIONS.N;

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
          TOP-LEFT: GEARBOX TELEMETRY & H-PATTERN SHIFTER SELECTOR
      ========================================================= */}
      <div className="pointer-events-none absolute top-4 left-4 z-10 max-h-[calc(100%-11rem)] w-[min(28rem,calc(100%-2rem))] overflow-y-auto max-[720px]:max-h-[50%] max-[720px]:w-[calc(100%-2rem)]">
        <section
          aria-label="5-Speed Manual Gearbox"
          className={`pointer-events-auto flex flex-col gap-5 p-5 ${sheet.panel}`}
          style={{ colorScheme: 'light' }}
        >
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="m-0 text-[1.75rem] font-semibold leading-none tracking-[-0.03em]">
              5-Speed Gearbox
            </h1>
            <p
              className="m-0 text-[1.75rem] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[#fb6514]"
              aria-label={`Gigi aktif ${currentGearObj.label}`}
            >
              {currentGearObj.short === 'N'
                ? 'N · Free'
                : `${currentGearObj.short} · ${currentGearObj.ratioText.split(' ')[0]}:1`}
            </p>
          </div>

          <p className="m-0 text-base leading-relaxed">{currentGearObj.desc}</p>

          {/* Interactive H-Pattern Gear Selector (1 - 3 - 5 / N / 2 - 4 - R) */}
          <div className="flex flex-col gap-1.5" role="group" aria-label="H-Pattern Gear Selector">
            <div className="grid grid-cols-3 gap-1.5">
              {['1', '3', '5'].map((g) => {
                const active = selectedGear === g;
                return (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={active}
                    onClick={() => handleSelectGear(g)}
                    className={`py-2.5 text-center text-base font-semibold tabular-nums ${hit} ${
                      active ? 'bg-[#fb6514] text-[#101828]' : sheet.idle
                    }`}
                  >
                    Gigi {g}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              aria-pressed={selectedGear === 'N'}
              onClick={() => handleSelectGear('N')}
              className={`w-full py-2 text-center text-base font-semibold ${hit} ${
                selectedGear === 'N' ? 'bg-[#fb6514] text-[#101828]' : sheet.idle
              }`}
            >
              Neutral (N)
            </button>

            <div className="grid grid-cols-3 gap-1.5">
              {['2', '4', 'R'].map((g) => {
                const active = selectedGear === g;
                return (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={active}
                    onClick={() => handleSelectGear(g)}
                    className={`py-2.5 text-center text-base font-semibold tabular-nums ${hit} ${
                      active ? 'bg-[#fb6514] text-[#101828]' : sheet.idle
                    }`}
                  >
                    {g === 'R' ? 'Reverse (R)' : `Gigi ${g}`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2x2 Telemetry Readouts */}
          <div className="grid grid-cols-2 gap-2">
            {[
              {
                label: 'Poros input',
                value: isPlaying ? telemetry.inputRpm : 0,
                unit: 'rpm'
              },
              {
                label: 'Poros output',
                value: isPlaying ? telemetry.outputRpm : 0,
                unit: 'rpm'
              },
              {
                label: 'Torsi output',
                value: isPlaying ? telemetry.outputTorqueNm : 0,
                unit: 'Nm'
              },
              {
                label: 'Countershaft / Speed',
                value: isPlaying ? `${Math.abs(telemetry.counterRpm)}` : '0',
                unit: `rpm · ${isPlaying ? Math.abs(telemetry.roadSpeedKmh) : 0} km/j`
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
          aria-label="Gearbox view"
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
              { label: 'Shift forks & rails', state: showShiftMechanism, setter: setShowShiftMechanism },
              { label: 'Clutch & flywheel', state: showClutchAssy, setter: setShowClutchAssy },
              { label: 'Torque flow', state: showTorqueFlow, setter: setShowTorqueFlow }
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
          {/* Column 1: Engine Input RPM */}
          <div className="flex flex-col gap-2">
            <p className="m-0 text-base">
              <span className="font-semibold tabular-nums">{engineRpm}</span> rpm input
            </p>
            <SquareRange
              min={600}
              max={7000}
              step={50}
              value={engineRpm}
              label="Input RPM"
              onChange={(e) => setEngineRpm(Number(e.target.value))}
            />
            <div className="flex flex-wrap gap-2">
              {[
                { value: 800, label: '800 idle' },
                { value: 2200, label: '2200 cruise' },
                { value: 4200, label: '4200 pull' },
                { value: 6500, label: '6500 redline' }
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

          {/* Column 2: Friction Clutch Engagement */}
          <div className="flex flex-col gap-2">
            <p className="m-0 text-base">
              <span className="font-semibold tabular-nums">
                {Math.round(clutchEngagement * 100)}%
              </span>{' '}
              kopling (clutch)
            </p>
            <SquareRange
              min={0}
              max={1}
              step={0.02}
              value={clutchEngagement}
              label="Clutch engagement"
              onChange={(e) => setClutchEngagement(Number(e.target.value))}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onMouseDown={() => setClutchEngagement(0.0)}
                onMouseUp={() => setClutchEngagement(1.0)}
                onMouseLeave={() => setClutchEngagement(1.0)}
                className={`px-2 py-1 ${hit} ${
                  clutchEngagement < 0.2 ? sheet.chosen : sheet.idle
                }`}
              >
                Injak (Space)
              </button>
              <button
                type="button"
                aria-pressed={autoClutchOnShift}
                onClick={() => setAutoClutchOnShift((v) => !v)}
                className={`px-2 py-1 ${hit} ${
                  autoClutchOnShift ? sheet.chosen : sheet.idle
                }`}
              >
                Auto-clutch {autoClutchOnShift ? 'ON' : 'OFF'}
              </button>
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
              setSelectedGear('1');
              setEngineRpm(2200);
              setClutchEngagement(1.0);
              setExploded(0);
              setCasingOpacity(0.24);
              setCutawayMode(true);
              setRenderMode('realistic');
              setShowCasing(true);
              setShowShiftMechanism(true);
              setShowClutchAssy(true);
              setShowTorqueFlow(true);
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
