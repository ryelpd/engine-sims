import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  Play, Pause, RotateCcw, Eye, EyeOff,
  Layers, Box, Grid, Cpu, Flame,
  Sliders, Maximize2, Activity, Gauge, Zap, Info, Compass,
  Wind, Scissors, Sparkles, Thermometer, Droplets
} from 'lucide-react';

const DIESEL_SPECS = {
  crankRadius: 1.08,      // Long-stroke undersquare architecture (Stroke = 2.16)
  rodLength: 3.05,        // Heavy-duty forged I-beam connecting rod
  pistonRadius: 1.02,     // Bore radius
  pistonHeight: 1.32,     // Deep high-load piston skirt + 3 rings + Omega bowl
  compressionRatio: '18.5 : 1',
  displacementCc: '742 cc / Cyl',
  sprayNozzleCount: 6,    // 6-hole piezo common-rail atomizer
  strokes: [
    {
      id: 'intake',
      index: 1,
      name: 'Langkah Hisap Udara Murni (Air Intake)',
      range: [0, 180],
      desc: 'Katup Hisap terbuka, piston bergerak turun (TMA → TMB) menghisap UDARA MURNI bertekanan (Turbo Boost) dengan pusaran swirl tanpa bahan bakar.',
      badgeColor: 'text-sky-500 bg-sky-500/10 border-sky-500/30',
      activeBg: 'bg-sky-500 text-white border-sky-400 shadow-[0_0_16px_rgba(14,165,233,0.6)]'
    },
    {
      id: 'compression',
      index: 2,
      name: 'Kompresi Adiabatik Ekstrem (18.5 : 1)',
      range: [180, 360],
      desc: 'Kedua katup tertutup rapat. Piston naik (TMB → TMA) memampatkan udara murni ke dalam cekungan Omega (ω) piston hingga ~48 Bar & suhu ~720°C (melampaui titik nyala solar).',
      badgeColor: 'text-amber-500 bg-amber-500/10 border-amber-500/30',
      activeBg: 'bg-amber-500 text-white border-amber-400 shadow-[0_0_16px_rgba(245,158,11,0.6)]'
    },
    {
      id: 'power',
      index: 3,
      name: 'Injeksi Solar & Pembakaran Spontan (Auto-Ignition)',
      range: [360, 540],
      desc: 'Injektor Common Rail menyemprotkan kabut solar bertekanan tinggi (~2000 Bar) melalui 6 lubang ke udara panas 720°C. Solar terbakar spontan (tanpa busi api) menghasilkan torsi raksasa.',
      badgeColor: 'text-orange-500 bg-orange-500/10 border-orange-500/30',
      activeBg: 'bg-orange-500 text-white border-orange-400 shadow-[0_0_16px_rgba(251,101,20,0.7)]'
    },
    {
      id: 'exhaust',
      index: 4,
      name: 'Langkah Buang (Exhaust Gas Expulsion)',
      range: [540, 720],
      desc: 'Katup Buang terbuka, piston bergerak naik (TMB → TMA) mendorong gas sisa pembakaran diesel bertekanan menuju manifold buang & turbin turbocharger.',
      badgeColor: 'text-rose-500 bg-rose-500/10 border-rose-500/30',
      activeBg: 'bg-rose-500 text-white border-rose-400 shadow-[0_0_16px_rgba(244,63,94,0.6)]'
    }
  ]
};

export default function DieselEngine({ theme = 'dark' }) {
  const mountRef = useRef(null);

  // Simulation States
  const [rpm, setRpm] = useState(160); // Educational default speed so spray + auto-ignition are super clear
  const [railPressureBar, setRailPressureBar] = useState(2000); // 1200 to 2500 Bar Common Rail
  const [glowPlugActive, setGlowPlugActive] = useState(true); // Busi Pijar (Pre-heat incandescent glow)
  const [isPlaying, setIsPlaying] = useState(true);
  const [manualDeg, setManualDeg] = useState(0); // 0 to 720 deg
  const [renderMode, setRenderMode] = useState('realistic');
  const [exploded, setExploded] = useState(0);
  const [blockOpacity, setBlockOpacity] = useState(0.32);
  const [cutawayMode, setCutawayMode] = useState(true);
  const [showBlock, setShowBlock] = useState(true);
  const [showHead, setShowHead] = useState(true);
  const [showValvetrain, setShowValvetrain] = useState(true);
  const [showGasFlow, setShowGasFlow] = useState(true);
  const [autoRotateCam, setAutoRotateCam] = useState(false);

  // Live Telemetry States
  const [crankDeg, setCrankDeg] = useState(0);
  const [activeStrokeIdx, setActiveStrokeIdx] = useState(0);
  const [cylPressureBar, setCylPressureBar] = useState(1.8);
  const [cylTempC, setCylTempC] = useState(55);
  const [instantTorqueNm, setInstantTorqueNm] = useState(580);

  const simParams = useRef({
    theme,
    rpm: 160,
    railPressureBar: 2000,
    glowPlugActive: true,
    isPlaying: true,
    manualDeg: 0,
    renderMode: 'realistic',
    exploded: 0,
    blockOpacity: 0.32,
    cutawayMode: true,
    showBlock: true,
    showHead: true,
    showValvetrain: true,
    showGasFlow: true,
    autoRotateCam: false
  });

  const crankThetaRef = useRef(0);

  const sceneElements = useRef({
    scene: null,
    gridHelper: null,
    ambientLight: null,
    rimLight1: null,
    rimLight2: null
  });

  const camControl = useRef({
    isDragging: false,
    isPanning: false,
    prevX: 0,
    prevY: 0,
    theta: 0.54,
    phi: 1.30,
    radius: 12.8,
    target: new THREE.Vector3(0, 2.35, 0)
  });

  useEffect(() => {
    simParams.current = {
      theme,
      rpm,
      railPressureBar,
      glowPlugActive,
      isPlaying,
      manualDeg,
      renderMode,
      exploded,
      blockOpacity,
      cutawayMode,
      showBlock,
      showHead,
      showValvetrain,
      showGasFlow,
      autoRotateCam
    };
  }, [
    theme,
    rpm,
    railPressureBar,
    glowPlugActive,
    isPlaying,
    manualDeg,
    renderMode,
    exploded,
    blockOpacity,
    cutawayMode,
    showBlock,
    showHead,
    showValvetrain,
    showGasFlow,
    autoRotateCam
  ]);

  // Dynamic Theme Update for Three.js Canvas
  useEffect(() => {
    const { scene, gridHelper, ambientLight, rimLight1, rimLight2 } = sceneElements.current;
    if (!scene) return;
    const isDark = theme === 'dark';

    scene.background.setHex(isDark ? 0x101828 : 0xf8fafc);

    if (gridHelper) {
      scene.remove(gridHelper);
      gridHelper.geometry.dispose();
      if (Array.isArray(gridHelper.material)) {
        gridHelper.material.forEach((m) => m.dispose());
      } else {
        gridHelper.material.dispose();
      }
      const newGrid = new THREE.GridHelper(
        28,
        28,
        isDark ? 0x344054 : 0x94a3b8,
        isDark ? 0x1d2939 : 0xe2e8f0
      );
      newGrid.position.y = -3.1;
      scene.add(newGrid);
      sceneElements.current.gridHelper = newGrid;
    }

    if (ambientLight) ambientLight.intensity = isDark ? 0.68 : 1.25;
    if (rimLight1) rimLight1.intensity = isDark ? 1.25 : 0.7;
    if (rimLight2) rimLight2.intensity = isDark ? 0.95 : 0.55;
  }, [theme]);

  // Jump to a specific Diesel stroke
  const jumpToStroke = (strokeIdx) => {
    const targetAngles = [45, 290, 372, 620]; // Mid-points (Power set right at peak multi-jet diesel injection!)
    const deg = targetAngles[strokeIdx] ?? 0;
    crankThetaRef.current = (deg * Math.PI) / 180;
    setManualDeg(deg);
    setCrankDeg(deg);
    setActiveStrokeIdx(strokeIdx);
  };

  // Manual Crank Angle Scrubber handler
  const handleManualAngleChange = (deg) => {
    setIsPlaying(false);
    setManualDeg(deg);
    crankThetaRef.current = (deg * Math.PI) / 180;
    setCrankDeg(Math.round(deg) % 720);
    setActiveStrokeIdx(Math.min(3, Math.floor(((deg % 720) / 180))));
  };

  // Camera view presets
  const setCameraPreset = (preset) => {
    camControl.current.isDragging = false;
    setAutoRotateCam(false);
    if (preset === 'iso') {
      camControl.current.theta = 0.54;
      camControl.current.phi = 1.30;
      camControl.current.radius = 12.8;
      camControl.current.target.set(0, 2.35, 0);
    } else if (preset === 'front') {
      camControl.current.theta = 0.0;
      camControl.current.phi = 1.48;
      camControl.current.radius = 11.8;
      camControl.current.target.set(0, 2.35, 0);
    } else if (preset === 'side') {
      camControl.current.theta = Math.PI / 2;
      camControl.current.phi = 1.45;
      camControl.current.radius = 12.5;
      camControl.current.target.set(0, 2.35, 0);
    } else if (preset === 'injector') {
      // Close-up on Omega Piston Bowl, Common Rail Piezo Injector & Glow Plug
      camControl.current.theta = 0.25;
      camControl.current.phi = 1.36;
      camControl.current.radius = 6.8;
      camControl.current.target.set(0, 4.15, 0);
    }
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const isInitialDark = simParams.current.theme === 'dark';

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isInitialDark ? 0x101828 : 0xf8fafc);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 2. Lighting Setup
    const ambientLight = new THREE.AmbientLight(0xdbeafe, isInitialDark ? 0.68 : 1.25);
    scene.add(ambientLight);

    const mainDirLight = new THREE.DirectionalLight(0xffffff, 2.1);
    mainDirLight.position.set(10, 18, 14);
    mainDirLight.castShadow = true;
    mainDirLight.shadow.mapSize.width = 2048;
    mainDirLight.shadow.mapSize.height = 2048;
    scene.add(mainDirLight);

    const rimLight1 = new THREE.DirectionalLight(0x38bdf8, isInitialDark ? 1.25 : 0.7);
    rimLight1.position.set(-14, 8, -10);
    scene.add(rimLight1);

    const rimLight2 = new THREE.DirectionalLight(0xfb6514, isInitialDark ? 0.95 : 0.55);
    rimLight2.position.set(12, -8, 10);
    scene.add(rimLight2);

    const gridHelper = new THREE.GridHelper(
      28,
      28,
      isInitialDark ? 0x344054 : 0x94a3b8,
      isInitialDark ? 0x1d2939 : 0xe2e8f0
    );
    gridHelper.position.y = -3.1;
    scene.add(gridHelper);

    sceneElements.current = {
      scene,
      gridHelper,
      ambientLight,
      rimLight1,
      rimLight2
    };

    // 3. PBR & Technical Material Library (Heavy-Duty Industrial Diesel Palette)
    const realisticMats = {
      crankSteel: new THREE.MeshStandardMaterial({
        color: 0xd0d7de,
        metalness: 0.92,
        roughness: 0.18
      }),
      counterweight: new THREE.MeshStandardMaterial({
        color: 0x3b4454,
        metalness: 0.82,
        roughness: 0.36
      }),
      forgedRod: new THREE.MeshStandardMaterial({
        color: 0x8b95a5,
        metalness: 0.88,
        roughness: 0.25
      }),
      dieselPiston: new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.85,
        roughness: 0.20,
        side: THREE.DoubleSide
      }),
      omegaBowlSurface: new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.78,
        roughness: 0.32,
        emissive: 0xd97706,
        emissiveIntensity: 0.0,
        side: THREE.DoubleSide
      }),
      pistonRing: new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        metalness: 0.95,
        roughness: 0.12
      }),
      oilRing: new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        metalness: 0.90,
        roughness: 0.18
      }),
      wristPin: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.96,
        roughness: 0.08
      }),
      intakeValve: new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        metalness: 0.85,
        roughness: 0.2
      }),
      exhaustValve: new THREE.MeshStandardMaterial({
        color: 0xf97316,
        metalness: 0.85,
        roughness: 0.2
      }),
      springSteel: new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.88,
        roughness: 0.22
      }),
      camshaft: new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        metalness: 0.9,
        roughness: 0.18
      }),
      camGear: new THREE.MeshStandardMaterial({
        color: 0xfb6514,
        metalness: 0.78,
        roughness: 0.28
      }),
      timingBelt: new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.25,
        roughness: 0.75
      }),
      injectorBody: new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.85,
        roughness: 0.22
      }),
      injectorBrass: new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        metalness: 0.92,
        roughness: 0.16
      }),
      commonRailSteel: new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.95,
        roughness: 0.12
      }),
      glowPlugBody: new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.88,
        roughness: 0.22
      }),
      glowPlugTip: new THREE.MeshStandardMaterial({
        color: 0xff5500,
        emissive: 0xff3b00,
        emissiveIntensity: 2.2,
        roughness: 0.2
      }),
      castIronBlock: new THREE.MeshPhysicalMaterial({
        color: 0x475467,
        metalness: 0.45,
        roughness: 0.28,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        side: THREE.DoubleSide
      }),
      cylinderLiner: new THREE.MeshPhysicalMaterial({
        color: 0x94a3b8,
        metalness: 0.7,
        roughness: 0.15,
        transparent: true,
        opacity: 0.36,
        depthWrite: false,
        side: THREE.DoubleSide
      }),
      headCast: new THREE.MeshPhysicalMaterial({
        color: 0x64748b,
        metalness: 0.45,
        roughness: 0.24,
        transparent: true,
        opacity: 0.30,
        depthWrite: false,
        side: THREE.DoubleSide
      }),
      intakeManifold: new THREE.MeshPhysicalMaterial({
        color: 0x0ea5e9,
        metalness: 0.3,
        roughness: 0.25,
        transparent: true,
        opacity: 0.36,
        depthWrite: false,
        side: THREE.DoubleSide
      }),
      exhaustManifold: new THREE.MeshPhysicalMaterial({
        color: 0xf97316,
        metalness: 0.3,
        roughness: 0.25,
        transparent: true,
        opacity: 0.36,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    };

    const rawSolidMat = new THREE.MeshLambertMaterial({
      color: 0x94a3b8,
      side: THREE.DoubleSide
    });
    const rawTransMat = new THREE.MeshLambertMaterial({
      color: 0x64748b,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const pureWireframeMat = new THREE.MeshBasicMaterial({
      color: 0xfb6514,
      wireframe: true,
      transparent: true,
      opacity: 0.82
    });
    const wireOverlayMat = new THREE.MeshBasicMaterial({
      color: 0xfb6514,
      wireframe: true,
      transparent: true,
      opacity: 0.32,
      depthTest: true
    });

    const trackedMeshes = [];
    const wireOverlays = [];

    const registerMesh = (mesh, realMat, isTransparentPart = false) => {
      mesh.material = realMat;
      mesh.castShadow = !isTransparentPart;
      mesh.receiveShadow = true;
      trackedMeshes.push({ mesh, realMat, isTransparentPart });

      const overlay = new THREE.Mesh(mesh.geometry, wireOverlayMat);
      overlay.visible = false;
      mesh.add(overlay);
      wireOverlays.push(overlay);
      return mesh;
    };

    // Helper to create 3D Helical Valve Spring Geometry
    const createHelicalSpringGeo = (radius, height, turns, wireRadius) => {
      const pts = [];
      const steps = 110;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const angle = t * turns * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(angle) * radius, -t * height, Math.sin(angle) * radius));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      return new THREE.TubeGeometry(curve, 96, wireRadius, 8, false);
    };

    const engineRoot = new THREE.Group();
    scene.add(engineRoot);

    const { crankRadius, rodLength, pistonRadius, pistonHeight, sprayNozzleCount } = DIESEL_SPECS;

    // Cylinder Deck & Head Geometry Constants
    // TDC piston top Y = crankRadius (1.08) + rodLength (3.05) + pistonPinToCrown (0.58) = 4.71
    // Diesel has a very tight flat-deck squish clearance (0.14 units above piston crown at TDC)
    const deckY = 4.85;
    const camCenterY = 6.95;

    // =========================================================
    // A. HEAVY-DUTY DIESEL CRANKSHAFT & FLYWHEEL ASSEMBLY
    // =========================================================
    const crankGroup = new THREE.Group();
    engineRoot.add(crankGroup);

    // Front & Rear Main Journals (Thicker for high-torque Diesel)
    const mainJournalGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.95, 32);
    mainJournalGeo.rotateX(Math.PI / 2);

    const frontMain = registerMesh(new THREE.Mesh(mainJournalGeo), realisticMats.crankSteel);
    frontMain.position.z = 1.2;
    crankGroup.add(frontMain);

    const rearMain = registerMesh(new THREE.Mesh(mainJournalGeo), realisticMats.crankSteel);
    rearMain.position.z = -1.2;
    crankGroup.add(rearMain);

    // Crankpin (Offset at Y = crankRadius when theta = 0)
    const crankPinGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.95, 32);
    crankPinGeo.rotateX(Math.PI / 2);
    const crankPin = registerMesh(new THREE.Mesh(crankPinGeo), realisticMats.crankSteel);
    crankPin.position.set(0, crankRadius, 0);
    crankGroup.add(crankPin);

    // Heavy Forged Crank Webs & Teardrop Counterweights
    const webShape = new THREE.Shape();
    webShape.moveTo(-0.55, 1.32);
    webShape.lineTo(0.55, 1.32);
    webShape.lineTo(1.15, -0.35);
    webShape.absarc(0, -0.58, 1.22, -0.2, Math.PI + 0.2, true);
    webShape.lineTo(-0.55, 1.32);

    const webExtrude = new THREE.ExtrudeGeometry(webShape, {
      depth: 0.32,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 3
    });
    webExtrude.center();

    const frontWeb = registerMesh(new THREE.Mesh(webExtrude), realisticMats.counterweight);
    frontWeb.position.set(0, 0.12, 0.62);
    crankGroup.add(frontWeb);

    const rearWeb = registerMesh(new THREE.Mesh(webExtrude), realisticMats.counterweight);
    rearWeb.position.set(0, 0.12, -0.62);
    crankGroup.add(rearWeb);

    // High-Inertia Diesel Dual-Mass Flywheel (Rear Z = -1.78)
    const flywheelGeo = new THREE.CylinderGeometry(1.75, 1.75, 0.32, 52);
    flywheelGeo.rotateX(Math.PI / 2);
    const flywheel = registerMesh(new THREE.Mesh(flywheelGeo), realisticMats.counterweight);
    flywheel.position.z = -1.78;
    crankGroup.add(flywheel);

    // Flywheel Starter Ring Gear Teeth
    const ringGearGeo = new THREE.CylinderGeometry(1.82, 1.82, 0.14, 36);
    ringGearGeo.rotateX(Math.PI / 2);
    const ringGear = registerMesh(new THREE.Mesh(ringGearGeo), realisticMats.crankSteel);
    ringGear.position.z = -1.68;
    crankGroup.add(ringGear);

    // Front Crank Timing Gear (Z = 1.72)
    const crankSprocketGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.24, 24);
    crankSprocketGeo.rotateX(Math.PI / 2);
    const crankSprocket = registerMesh(new THREE.Mesh(crankSprocketGeo), realisticMats.camGear);
    crankSprocket.position.z = 1.72;
    crankGroup.add(crankSprocket);

    // =========================================================
    // B. PISTON WITH OMEGA (ω) TOROIDAL COMBUSTION BOWL & ROD
    // =========================================================
    const pistonAssembly = new THREE.Group();
    engineRoot.add(pistonAssembly);

    // 1. Custom Lathe Profile for Diesel Piston with Recessed Omega (ω) Toroidal Bowl
    // The Omega bowl has a central conical pip (0 -> 0.58 height), dips down to a deep toroidal swirl pocket (r=0.45, y=0.22),
    // and rises back up to the flat squish lip (r=0.68..1.02, y=0.58)
    const pistonLathePts = [
      new THREE.Vector2(0.0, 0.50),    // Center conical pip apex inside Omega bowl
      new THREE.Vector2(0.18, 0.42),   // Pip slope
      new THREE.Vector2(0.38, 0.16),   // Deepest floor of toroidal swirl bowl
      new THREE.Vector2(0.58, 0.18),   // Outer bottom curve of Omega bowl
      new THREE.Vector2(0.68, 0.36),   // Re-entrant Omega lip undercut
      new THREE.Vector2(0.64, 0.58),   // Top inner lip of Omega bowl
      new THREE.Vector2(pistonRadius, 0.58),        // Top flat squish crown
      new THREE.Vector2(pistonRadius, -0.74),       // Piston outer skirt bottom
      new THREE.Vector2(pistonRadius - 0.14, -0.74),// Inner skirt wall bottom
      new THREE.Vector2(pistonRadius - 0.14, -0.05),// Inner skirt ceiling
      new THREE.Vector2(0.0, -0.05)                 // Under-crown center
    ];

    const fullPistonGeo = new THREE.LatheGeometry(pistonLathePts, 56);
    // Rotate -90 deg Y so when cutaway (half-lathe) is active, the front +Z half is open toward the viewer!
    const cutawayPistonGeo = new THREE.LatheGeometry(pistonLathePts, 40, 0, Math.PI);

    const pistonCrown = registerMesh(new THREE.Mesh(fullPistonGeo), realisticMats.dieselPiston);
    pistonAssembly.add(pistonCrown);

    // Glowing Thermal Bowl Liner Overlay inside the Omega (ω) recess (heats up during Adiabatic Compression & Auto-Ignition)
    const bowlOverlayPts = [
      new THREE.Vector2(0.0, 0.505),
      new THREE.Vector2(0.18, 0.425),
      new THREE.Vector2(0.38, 0.165),
      new THREE.Vector2(0.58, 0.185),
      new THREE.Vector2(0.67, 0.365),
      new THREE.Vector2(0.64, 0.578)
    ];
    const fullBowlGeo = new THREE.LatheGeometry(bowlOverlayPts, 48);
    const cutawayBowlGeo = new THREE.LatheGeometry(bowlOverlayPts, 32, 0, Math.PI);
    const omegaBowlMesh = registerMesh(new THREE.Mesh(fullBowlGeo), realisticMats.omegaBowlSurface);
    pistonAssembly.add(omegaBowlMesh);

    // 3 Heavy-Duty Piston Rings (Top Fire Ring, Second Scraper Ring, Oil Control Ring)
    const ringGeo = new THREE.TorusGeometry(pistonRadius + 0.015, 0.030, 12, 48);
    ringGeo.rotateX(Math.PI / 2);
    for (let r = 0; r < 3; r++) {
      const ringMat = r < 2 ? realisticMats.pistonRing : realisticMats.oilRing;
      const ring = registerMesh(new THREE.Mesh(ringGeo), ringMat);
      ring.position.y = 0.42 - r * 0.14;
      pistonAssembly.add(ring);
    }

    // Heavy-Duty Gudgeon / Wrist Pin (Full-floating steel pin)
    const wristPinGeo = new THREE.CylinderGeometry(0.26, 0.26, pistonRadius * 1.76, 28);
    wristPinGeo.rotateX(Math.PI / 2);
    const wristPin = registerMesh(new THREE.Mesh(wristPinGeo), realisticMats.wristPin);
    wristPin.position.y = -0.18;
    pistonAssembly.add(wristPin);

    // Forged I-Beam Connecting Rod (Sturdier for 195 Bar peak Diesel combustion pressure)
    const rodGroup = new THREE.Group();
    engineRoot.add(rodGroup);

    const bigEndGeo = new THREE.CylinderGeometry(0.54, 0.54, 0.48, 32);
    bigEndGeo.rotateX(Math.PI / 2);
    const bigEnd = registerMesh(new THREE.Mesh(bigEndGeo), realisticMats.forgedRod);
    rodGroup.add(bigEnd);

    // Big-End Bearing Cap Bolts (visual mechanical detail)
    const boltGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.55, 12);
    [-0.42, 0.42].forEach((bx) => {
      const bolt = registerMesh(new THREE.Mesh(boltGeo), realisticMats.wristPin);
      bolt.position.set(bx, -0.15, 0);
      rodGroup.add(bolt);
    });

    const smallEndGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.44, 28);
    smallEndGeo.rotateX(Math.PI / 2);
    const smallEnd = registerMesh(new THREE.Mesh(smallEndGeo), realisticMats.forgedRod);
    smallEnd.position.y = rodLength;
    rodGroup.add(smallEnd);

    const beamGeo = new THREE.BoxGeometry(0.34, rodLength - 0.45, 0.26);
    const beam = registerMesh(new THREE.Mesh(beamGeo), realisticMats.forgedRod);
    beam.position.y = rodLength / 2;
    rodGroup.add(beam);

    const flangeGeo = new THREE.BoxGeometry(0.12, rodLength - 0.55, 0.36);
    const leftFlange = registerMesh(new THREE.Mesh(flangeGeo), realisticMats.crankSteel);
    leftFlange.position.set(-0.14, rodLength / 2, 0);
    rodGroup.add(leftFlange);

    const rightFlange = registerMesh(new THREE.Mesh(flangeGeo), realisticMats.crankSteel);
    rightFlange.position.set(0.14, rodLength / 2, 0);
    rodGroup.add(rightFlange);

    // =========================================================
    // C. FLAT-DECK DIESEL VALVETRAIN, COMMON RAIL INJECTOR & GLOW PLUG
    // =========================================================
    const valvetrainGroup = new THREE.Group();
    engineRoot.add(valvetrainGroup);

    // Vertical Overhead Valves (Characteristic of Flat-Deck Direct Injection Diesel)
    const createValveAssembly = (xOffset, isIntake) => {
      const pivot = new THREE.Group();
      pivot.position.set(xOffset, deckY, 0.18); // Slightly offset in Z so center X=0,Z=0 is clear for Injector!
      valvetrainGroup.add(pivot);

      const moveGroup = new THREE.Group();
      pivot.add(moveGroup);

      const mat = isIntake ? realisticMats.intakeValve : realisticMats.exhaustValve;
      const headRadius = isIntake ? 0.38 : 0.34;
      const stemLen = 1.65;

      // Flat-bottomed Diesel Poppet Valve Head
      const headGeo = new THREE.CylinderGeometry(headRadius * 0.65, headRadius, 0.09, 28);
      const headMesh = registerMesh(new THREE.Mesh(headGeo), mat);
      headMesh.position.y = 0.04;
      moveGroup.add(headMesh);

      // Valve Stem
      const stemGeo = new THREE.CylinderGeometry(0.055, 0.055, stemLen, 16);
      const stemMesh = registerMesh(new THREE.Mesh(stemGeo), mat);
      stemMesh.position.y = stemLen / 2;
      moveGroup.add(stemMesh);

      // Upper Valve Retainer Cap
      const retainerGeo = new THREE.CylinderGeometry(0.22, 0.16, 0.10, 20);
      const retainerMesh = registerMesh(new THREE.Mesh(retainerGeo), realisticMats.crankSteel);
      retainerMesh.position.y = stemLen - 0.08;
      moveGroup.add(retainerMesh);

      // 3D Helical Valve Spring
      const baseSpringHeight = 1.15;
      const springGeo = createHelicalSpringGeo(0.20, baseSpringHeight, 6.5, 0.032);
      const springMesh = registerMesh(new THREE.Mesh(springGeo), realisticMats.springSteel);
      springMesh.position.y = stemLen - 0.12;
      pivot.add(springMesh);

      return { pivot, moveGroup, springMesh, baseSpringHeight, stemLen };
    };

    const intakeValveObj = createValveAssembly(-0.56, true);
    const exhaustValveObj = createValveAssembly(0.56, false);

    // Overhead Camshafts (Intake Cam on Left X=-0.56, Exhaust Cam on Right X=+0.56)
    const createCamshaft = (xPos, lobePeakAngle) => {
      const camGroup = new THREE.Group();
      camGroup.position.set(xPos, camCenterY, 0);
      valvetrainGroup.add(camGroup);

      const shaftGeo = new THREE.CylinderGeometry(0.18, 0.18, 2.75, 24);
      shaftGeo.rotateX(Math.PI / 2);
      const shaft = registerMesh(new THREE.Mesh(shaftGeo), realisticMats.camshaft);
      camGroup.add(shaft);

      // Egg-shaped Cam Lobe
      const lobeShape = new THREE.Shape();
      lobeShape.absarc(0, 0, 0.25, 0, Math.PI, false);
      lobeShape.quadraticCurveTo(-0.22, -0.34, 0, -0.50);
      lobeShape.quadraticCurveTo(0.22, -0.34, 0.25, 0);

      const lobeGeo = new THREE.ExtrudeGeometry(lobeShape, {
        depth: 0.26,
        bevelEnabled: true,
        bevelThickness: 0.02,
        bevelSize: 0.02,
        bevelSegments: 2
      });
      lobeGeo.center();

      const lobe = registerMesh(new THREE.Mesh(lobeGeo), realisticMats.crankSteel);
      lobe.position.z = 0.18;
      lobe.rotation.z = lobePeakAngle;
      camGroup.add(lobe);

      // Front Cam Sprocket Gear (Z = 1.72)
      const gearGeo = new THREE.CylinderGeometry(0.58, 0.58, 0.18, 32);
      gearGeo.rotateX(Math.PI / 2);
      const gear = registerMesh(new THREE.Mesh(gearGeo), realisticMats.camGear);
      gear.position.z = 1.72;
      camGroup.add(gear);

      return camGroup;
    };

    const intakeCam = createCamshaft(-0.56, -Math.PI / 4);
    const exhaustCam = createCamshaft(0.56, (-5 * Math.PI) / 4);

    // Front Timing Belt Loop
    const beltShape = new THREE.Shape();
    beltShape.moveTo(-0.56, camCenterY + 0.60);
    beltShape.lineTo(0.56, camCenterY + 0.60);
    beltShape.lineTo(1.02, camCenterY - 0.15);
    beltShape.lineTo(0.46, -0.45);
    beltShape.lineTo(-0.46, -0.45);
    beltShape.lineTo(-1.02, camCenterY - 0.15);
    beltShape.closePath();

    const beltHole = new THREE.Path();
    beltHole.moveTo(-0.52, camCenterY + 0.50);
    beltHole.lineTo(0.52, camCenterY + 0.50);
    beltHole.lineTo(0.90, camCenterY - 0.15);
    beltHole.lineTo(0.38, -0.36);
    beltHole.lineTo(-0.38, -0.36);
    beltHole.lineTo(-0.90, camCenterY - 0.15);
    beltHole.closePath();
    beltShape.holes.push(beltHole);

    const beltGeo = new THREE.ExtrudeGeometry(beltShape, { depth: 0.14, bevelEnabled: false });
    const timingBelt = registerMesh(new THREE.Mesh(beltGeo), realisticMats.timingBelt);
    timingBelt.position.z = 1.65;
    valvetrainGroup.add(timingBelt);

    // =========================================================
    // D. HIGH-PRESSURE COMMON RAIL INJECTOR & GLOW PLUG (BUSI PIJAR)
    // =========================================================
    const headAndInjectorGroup = new THREE.Group();
    engineRoot.add(headAndInjectorGroup);

    // 1. Central Piezo Common-Rail Fuel Injector (Mounted vertically at X=0, Z=-0.05)
    const injectorGroup = new THREE.Group();
    injectorGroup.position.set(0, deckY, -0.05);
    headAndInjectorGroup.add(injectorGroup);

    // Multi-Hole Nozzle Tip protruding slightly below flat cylinder deck into Omega bowl center
    const nozzleTipGeo = new THREE.CylinderGeometry(0.08, 0.045, 0.26, 20);
    const nozzleTip = registerMesh(new THREE.Mesh(nozzleTipGeo), realisticMats.commonRailSteel);
    nozzleTip.position.y = -0.06;
    injectorGroup.add(nozzleTip);

    // Brass Copper Washer Seal & Lower Injector Barrel
    const brassSealGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.12, 20);
    const brassSeal = registerMesh(new THREE.Mesh(brassSealGeo), realisticMats.injectorBrass);
    brassSeal.position.y = 0.12;
    injectorGroup.add(brassSeal);

    // Main High-Pressure Injector Body
    const injBarrelGeo = new THREE.CylinderGeometry(0.21, 0.17, 1.85, 24);
    const injBarrel = registerMesh(new THREE.Mesh(injBarrelGeo), realisticMats.injectorBody);
    injBarrel.position.y = 1.08;
    injectorGroup.add(injBarrel);

    // Piezo Solenoid Cap (Orange/Brass Industrial Top)
    const piezoCapGeo = new THREE.CylinderGeometry(0.26, 0.24, 0.45, 24);
    const piezoCap = registerMesh(new THREE.Mesh(piezoCapGeo), realisticMats.camGear);
    piezoCap.position.y = 2.22;
    injectorGroup.add(piezoCap);

    // 2. High-Pressure Common Rail Fuel Manifold Log & Steel Feed Pipe
    const railLogGeo = new THREE.CylinderGeometry(0.24, 0.24, 2.6, 24);
    railLogGeo.rotateZ(Math.PI / 2);
    const commonRailLog = registerMesh(new THREE.Mesh(railLogGeo), realisticMats.commonRailSteel);
    commonRailLog.position.set(0, 2.55, -1.05);
    injectorGroup.add(commonRailLog);

    // High-Pressure Bent Fuel Line connecting Common Rail Log to Injector
    const fuelLineCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 2.55, -1.05),
      new THREE.Vector3(0, 2.85, -0.55),
      new THREE.Vector3(0, 2.45, -0.05)
    ]);
    const fuelLineGeo = new THREE.TubeGeometry(fuelLineCurve, 24, 0.055, 12, false);
    const fuelLineMesh = registerMesh(new THREE.Mesh(fuelLineGeo), realisticMats.injectorBrass);
    injectorGroup.add(fuelLineMesh);

    // 3. Diesel Glow Plug (Busi Pijar) angled into the Combustion Chamber for Cold-Start Pre-Heating
    const glowPlugGroup = new THREE.Group();
    glowPlugGroup.position.set(-0.62, deckY + 0.08, -0.22);
    glowPlugGroup.rotation.z = -0.62; // Angled so the tip points toward the Omega piston bowl edge
    headAndInjectorGroup.add(glowPlugGroup);

    // Glow Plug Threaded Hex Body
    const gpBodyGeo = new THREE.CylinderGeometry(0.09, 0.08, 1.35, 16);
    const gpBody = registerMesh(new THREE.Mesh(gpBodyGeo), realisticMats.glowPlugBody);
    gpBody.position.y = 0.65;
    glowPlugGroup.add(gpBody);

    // Incandescent Ceramic Heating Pencil Tip (Protrudes into chamber)
    const gpTipGeo = new THREE.CylinderGeometry(0.038, 0.028, 0.34, 16);
    const glowPlugTipMesh = new THREE.Mesh(gpTipGeo, realisticMats.glowPlugTip);
    glowPlugTipMesh.position.y = -0.14;
    glowPlugGroup.add(glowPlugTipMesh);

    // Glow Plug Warm Light inside Chamber
    const glowPlugLight = new THREE.PointLight(0xff4500, 1.2, 2.5);
    glowPlugLight.position.set(-0.42, deckY - 0.12, -0.22);
    headAndInjectorGroup.add(glowPlugLight);

    // =========================================================
    // E. MULTI-JET ATOMIZED DIESEL SPRAY & TOROIDAL AUTO-IGNITION
    // =========================================================
    const combustionGroup = new THREE.Group();
    engineRoot.add(combustionGroup);

    // 1. 6 Radial Atomized Diesel Fuel Spray Plumes (Emanating from Injector Nozzle Tip)
    const sprayConesGroup = new THREE.Group();
    sprayConesGroup.position.set(0, deckY - 0.16, -0.05);
    combustionGroup.add(sprayConesGroup);

    const sprayMat = new THREE.MeshBasicMaterial({
      color: 0xbae6fd, // High-pressure atomized diesel mist (turns fiery orange upon ignition)
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const sprayCones = [];
    for (let s = 0; s < sprayNozzleCount; s++) {
      const azimuth = (s / sprayNozzleCount) * Math.PI * 2;
      const plumeHolder = new THREE.Group();
      plumeHolder.rotation.y = azimuth;
      // Angle spray cone downward at ~68 deg from vertical into the Omega piston bowl!
      plumeHolder.rotation.z = 1.12;

      // Cone with apex at origin (0,0,0) extending along -Y
      const coneGeo = new THREE.ConeGeometry(0.11, 0.72, 14, 1, true);
      coneGeo.translate(0, -0.36, 0);
      const coneMesh = new THREE.Mesh(coneGeo, sprayMat);
      plumeHolder.add(coneMesh);
      sprayConesGroup.add(plumeHolder);
      sprayCones.push(coneMesh);
    }

    // 2. Toroidal Swirling Auto-Ignition Fireball (Fits inside the Omega Piston Bowl!)
    const torusFlameGeo = new THREE.TorusGeometry(0.46, 0.20, 20, 40);
    torusFlameGeo.rotateX(Math.PI / 2);
    const torusFlameMat = new THREE.MeshBasicMaterial({
      color: 0xff5500,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const torusFlameMesh = new THREE.Mesh(torusFlameGeo, torusFlameMat);
    combustionGroup.add(torusFlameMesh);

    // 3. Central Adiabatic Hot-Air & Combustion Core Volume
    const chamberCoreGeo = new THREE.CylinderGeometry(pistonRadius * 0.92, pistonRadius * 0.92, 1.0, 32);
    const chamberCoreMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const chamberCoreMesh = new THREE.Mesh(chamberCoreGeo, chamberCoreMat);
    combustionGroup.add(chamberCoreMesh);

    const combustionLight = new THREE.PointLight(0xff6b00, 0, 9);
    combustionLight.position.set(0, deckY - 0.35, 0);
    combustionGroup.add(combustionLight);

    // =========================================================
    // F. CAST-IRON CYLINDER BLOCK, LINER & MANIFOLDS (WITH 180° CUTAWAY)
    // =========================================================
    const blockGroup = new THREE.Group();
    engineRoot.add(blockGroup);

    const sleeveMinY = 1.05;
    const sleeveMaxY = deckY;
    const sleeveHeight = sleeveMaxY - sleeveMinY;
    const sleeveMidY = (sleeveMinY + sleeveMaxY) / 2;

    const fullLinerGeo = new THREE.CylinderGeometry(
      pistonRadius + 0.08,
      pistonRadius + 0.08,
      sleeveHeight,
      44,
      1,
      true
    );
    const cutLinerGeo = new THREE.CylinderGeometry(
      pistonRadius + 0.08,
      pistonRadius + 0.08,
      sleeveHeight,
      44,
      1,
      true,
      Math.PI / 2,
      Math.PI
    );
    const cylinderLiner = registerMesh(
      new THREE.Mesh(fullLinerGeo),
      realisticMats.cylinderLiner,
      true
    );
    cylinderLiner.position.y = sleeveMidY;
    blockGroup.add(cylinderLiner);

    // Heavy Ribbed Cast-Iron Diesel Block Jacket
    const fullJacketGeo = new THREE.CylinderGeometry(
      pistonRadius + 0.56,
      pistonRadius + 0.56,
      sleeveHeight - 0.15,
      44,
      1,
      false
    );
    const cutJacketGeo = new THREE.CylinderGeometry(
      pistonRadius + 0.56,
      pistonRadius + 0.56,
      sleeveHeight - 0.15,
      44,
      1,
      false,
      Math.PI / 2,
      Math.PI
    );
    const blockJacket = registerMesh(
      new THREE.Mesh(fullJacketGeo),
      realisticMats.castIronBlock,
      true
    );
    blockJacket.position.y = sleeveMidY;
    blockGroup.add(blockJacket);

    // Cast-Iron Structural Cooling/Strength Ribs on Block Exterior
    const ribRings = [];
    for (let i = 0; i < 6; i++) {
      const fullRib = new THREE.CylinderGeometry(
        pistonRadius + 0.72,
        pistonRadius + 0.72,
        0.11,
        40
      );
      const cutRib = new THREE.CylinderGeometry(
        pistonRadius + 0.72,
        pistonRadius + 0.72,
        0.11,
        40,
        1,
        false,
        Math.PI / 2,
        Math.PI
      );
      const rib = registerMesh(new THREE.Mesh(fullRib), realisticMats.castIronBlock, true);
      rib.position.y = 1.55 + i * 0.58;
      blockGroup.add(rib);
      ribRings.push({ mesh: rib, fullRib, cutRib });
    }

    // Lower Deep-Skirt Diesel Crankcase Housing
    const fullCrankcaseGeo = new THREE.CylinderGeometry(2.10, 2.10, 3.3, 44, 1, false);
    fullCrankcaseGeo.rotateX(Math.PI / 2);
    const cutCrankcaseGeo = new THREE.CylinderGeometry(
      2.10,
      2.10,
      3.3,
      44,
      1,
      false,
      Math.PI,
      Math.PI
    );
    cutCrankcaseGeo.rotateX(Math.PI / 2);

    const crankcaseMesh = registerMesh(
      new THREE.Mesh(fullCrankcaseGeo),
      realisticMats.castIronBlock,
      true
    );
    crankcaseMesh.position.y = -0.15;
    blockGroup.add(crankcaseMesh);

    // Cylinder Head Casting & Turbo Intake / Exhaust Manifolds
    const headHousingGroup = new THREE.Group();
    headAndInjectorGroup.add(headHousingGroup);

    const headBoxGeo = new THREE.BoxGeometry(3.2, 2.05, 2.65);
    const headBox = registerMesh(new THREE.Mesh(headBoxGeo), realisticMats.headCast, true);
    headBox.position.y = deckY + 1.05;
    headHousingGroup.add(headBox);

    // Turbocharged Boosted Air Intake Runner (Left X < 0, Blue)
    const intakeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-2.75, deckY + 1.15, 0.18),
      new THREE.Vector3(-1.45, deckY + 0.95, 0.18),
      new THREE.Vector3(-0.62, deckY + 0.25, 0.18)
    ]);
    const intakeRunnerGeo = new THREE.TubeGeometry(intakeCurve, 28, 0.36, 20, false);
    const intakeRunner = registerMesh(
      new THREE.Mesh(intakeRunnerGeo),
      realisticMats.intakeManifold,
      true
    );
    headHousingGroup.add(intakeRunner);

    // Diesel Exhaust Manifold Runner to Turbocharger (Right X > 0, Orange)
    const exhaustCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.62, deckY + 0.25, 0.18),
      new THREE.Vector3(1.45, deckY + 0.95, 0.18),
      new THREE.Vector3(2.75, deckY + 1.15, 0.18)
    ]);
    const exhaustRunnerGeo = new THREE.TubeGeometry(exhaustCurve, 28, 0.36, 20, false);
    const exhaustRunner = registerMesh(
      new THREE.Mesh(exhaustRunnerGeo),
      realisticMats.exhaustManifold,
      true
    );
    headHousingGroup.add(exhaustRunner);

    // =========================================================
    // G. SWIRLING AIR, ADIABATIC HEAT & EXHAUST PARTICLE SYSTEM
    // =========================================================
    const gasParticlesGroup = new THREE.Group();
    engineRoot.add(gasParticlesGroup);

    const particleCount = 135;
    const particleGeo = new THREE.SphereGeometry(0.058, 8, 8);
    const particles = [];

    for (let i = 0; i < particleCount; i++) {
      const pMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.85
      });
      const pMesh = new THREE.Mesh(particleGeo, pMat);
      gasParticlesGroup.add(pMesh);
      particles.push({
        mesh: pMesh,
        mat: pMat,
        phase: Math.random(),
        radiusFrac: 0.18 + Math.random() * 0.72,
        angleOffset: Math.random() * Math.PI * 2,
        heightFrac: Math.random()
      });
    }

    // =========================================================
    // H. INTERACTIVE CAMERA ORBIT & PAN CONTROLS
    // =========================================================
    const updateCameraPosition = () => {
      const { theta, phi, radius, target } = camControl.current;
      camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
      camera.position.y = target.y + radius * Math.cos(phi);
      camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);
      camera.lookAt(target);
    };
    updateCameraPosition();

    const onPointerDown = (e) => {
      camControl.current.isDragging = true;
      camControl.current.isPanning = e.button === 2 || e.shiftKey;
      camControl.current.prevX = e.clientX;
      camControl.current.prevY = e.clientY;
    };

    const onPointerMove = (e) => {
      if (!camControl.current.isDragging) return;
      const dx = e.clientX - camControl.current.prevX;
      const dy = e.clientY - camControl.current.prevY;
      camControl.current.prevX = e.clientX;
      camControl.current.prevY = e.clientY;

      if (camControl.current.isPanning) {
        const panSpeed = 0.012;
        camControl.current.target.x -= dx * panSpeed * Math.cos(camControl.current.theta);
        camControl.current.target.y += dy * panSpeed;
      } else {
        camControl.current.theta -= dx * 0.007;
        camControl.current.phi = Math.max(
          0.18,
          Math.min(Math.PI - 0.2, camControl.current.phi - dy * 0.007)
        );
      }
      updateCameraPosition();
    };

    const onPointerUp = () => {
      camControl.current.isDragging = false;
    };

    const onWheel = (e) => {
      e.preventDefault();
      camControl.current.radius = Math.max(
        4.8,
        Math.min(26, camControl.current.radius + e.deltaY * 0.01)
      );
      updateCameraPosition();
    };

    const onContextMenu = (e) => e.preventDefault();

    const domElem = renderer.domElement;
    domElem.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    domElem.addEventListener('wheel', onWheel, { passive: false });
    domElem.addEventListener('contextmenu', onContextMenu);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    window.addEventListener('resize', handleResize);

    // =========================================================
    // I. ANIMATION & DIESEL COMPRESSION-IGNITION KINEMATICS LOOP
    // =========================================================
    let reqId;
    let lastTime = performance.now();
    let uiTimer = 0;
    let lastCutawayState = null;

    const animate = (now) => {
      reqId = requestAnimationFrame(animate);
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      const params = simParams.current;

      // 1. Update Render Modes & Opacity
      realisticMats.castIronBlock.opacity = params.blockOpacity;
      realisticMats.cylinderLiner.opacity = Math.min(0.85, params.blockOpacity + 0.06);
      realisticMats.headCast.opacity = Math.max(0.12, params.blockOpacity - 0.04);
      rawTransMat.opacity = params.blockOpacity;

      trackedMeshes.forEach(({ mesh, realMat, isTransparentPart }) => {
        if (params.renderMode === 'realistic' || params.renderMode === 'shaded_wire') {
          mesh.material = realMat;
        } else if (params.renderMode === 'raw') {
          mesh.material = isTransparentPart ? rawTransMat : rawSolidMat;
        } else if (params.renderMode === 'wireframe') {
          mesh.material = pureWireframeMat;
        }
      });

      const showOverlay = params.renderMode === 'shaded_wire';
      wireOverlays.forEach((ov) => {
        ov.visible = showOverlay;
      });

      // 2. Update 180° Cutaway Geometry (Also cuts the Diesel Piston so the Omega ω Bowl is visible!)
      if (lastCutawayState !== params.cutawayMode) {
        lastCutawayState = params.cutawayMode;
        cylinderLiner.geometry = params.cutawayMode ? cutLinerGeo : fullLinerGeo;
        blockJacket.geometry = params.cutawayMode ? cutJacketGeo : fullJacketGeo;
        crankcaseMesh.geometry = params.cutawayMode ? cutCrankcaseGeo : fullCrankcaseGeo;
        pistonCrown.geometry = params.cutawayMode ? cutawayPistonGeo : fullPistonGeo;
        omegaBowlMesh.geometry = params.cutawayMode ? cutawayBowlGeo : fullBowlGeo;
        ribRings.forEach((r) => {
          r.mesh.geometry = params.cutawayMode ? r.cutRib : r.fullRib;
        });
      }

      // 3. Component Visibility & Exploded View Offsets
      const exp = params.exploded;
      blockGroup.visible = params.showBlock;
      headAndInjectorGroup.visible = params.showHead;
      valvetrainGroup.visible = params.showValvetrain;
      gasParticlesGroup.visible = params.showGasFlow;
      combustionGroup.visible = params.showGasFlow;

      // Glow Plug Incandescent State (Busi Pijar)
      realisticMats.glowPlugTip.emissiveIntensity = params.glowPlugActive ? 2.6 : 0.08;
      realisticMats.glowPlugTip.color.setHex(params.glowPlugActive ? 0xff5500 : 0x475569);
      glowPlugLight.intensity = params.glowPlugActive ? 1.35 : 0;

      // Axial / Radial Exploded Separation
      crankGroup.position.y = -exp * 1.3;
      blockGroup.position.z = -exp * 1.6;
      headHousingGroup.position.y = exp * 1.45;
      injectorGroup.position.y = deckY + exp * 2.35;
      glowPlugGroup.position.x = -0.62 - exp * 1.1;
      glowPlugGroup.position.y = deckY + 0.08 + exp * 1.1;
      valvetrainGroup.position.y = exp * 2.1;

      if (params.autoRotateCam && !camControl.current.isDragging) {
        camControl.current.theta += dt * 0.32;
        updateCameraPosition();
      }

      // 4. Advance Crankshaft Angle (0 to 4*PI for 720-degree 4-Stroke Diesel Cycle)
      if (params.isPlaying) {
        const omega = (params.rpm * 2 * Math.PI) / 60;
        crankThetaRef.current = (crankThetaRef.current + omega * dt) % (4 * Math.PI);
      }

      const theta = crankThetaRef.current; // 0 to 4*PI
      const deg720 = ((theta * 180) / Math.PI) % 720;

      // 5. Exact Slider-Crank Kinematics
      // Crankpin coordinates when rotating clockwise:
      const pinX = crankRadius * Math.sin(theta);
      const pinY = crankRadius * Math.cos(theta);
      crankGroup.rotation.z = -theta;

      // Piston wrist-pin center Y
      const underSqrt = Math.max(0.001, rodLength * rodLength - pinX * pinX);
      const pistonY = pinY + Math.sqrt(underSqrt);

      pistonAssembly.position.set(0, pistonY - exp * 0.35, 0);

      // Connecting Rod Position & Tilt Angle
      rodGroup.position.set(pinX, pinY - exp * 0.75, 0);
      const rodAngle = Math.asin(pinX / rodLength);
      rodGroup.rotation.z = rodAngle;

      // 6. Overhead Camshaft Rotation (0.5x Crankshaft Speed) & Vertical Valve Lift
      intakeCam.rotation.z = -theta * 0.5;
      exhaustCam.rotation.z = -theta * 0.5;

      // Intake Valve opens during Stroke 1 (0° to 180°)
      let intakeLift = 0;
      if (deg720 >= 0 && deg720 <= 192) {
        intakeLift = Math.max(0, Math.sin((deg720 / 192) * Math.PI)) * 0.42;
      }

      // Exhaust Valve opens during Stroke 4 (525° to 720°)
      let exhaustLift = 0;
      if (deg720 >= 525 && deg720 <= 720) {
        exhaustLift = Math.max(0, Math.sin(((deg720 - 525) / 195) * Math.PI)) * 0.42;
      }

      // Move valves downward into cylinder & compress 3D helical valve springs
      intakeValveObj.moveGroup.position.y = -intakeLift;
      const inSpringScale = (intakeValveObj.baseSpringHeight - intakeLift) / intakeValveObj.baseSpringHeight;
      intakeValveObj.springMesh.scale.y = inSpringScale;
      intakeValveObj.springMesh.position.y = intakeValveObj.stemLen - 0.12 - intakeLift;

      exhaustValveObj.moveGroup.position.y = -exhaustLift;
      const exSpringScale = (exhaustValveObj.baseSpringHeight - exhaustLift) / exhaustValveObj.baseSpringHeight;
      exhaustValveObj.springMesh.scale.y = exSpringScale;
      exhaustValveObj.springMesh.position.y = exhaustValveObj.stemLen - 0.12 - exhaustLift;

      // 7. DIESEL COMPRESSION-IGNITION THERMODYNAMICS, 6-JET SPRAY & TOROIDAL FIREBALL
      const pistonTopY = pistonY + 0.58;
      const currentChamberHeight = Math.max(0.14, deckY - pistonTopY);
      const chamberMidY = pistonTopY + currentChamberHeight / 2;

      chamberCoreMesh.scale.set(1, currentChamberHeight, 1);
      chamberCoreMesh.position.y = chamberMidY;

      // Toroidal flame sits right inside the recessed Omega (ω) bowl of the moving piston!
      torusFlameMesh.position.set(0, pistonY + 0.34, 0);
      torusFlameMesh.rotation.y += dt * 9.5; // High-speed diesel swirl inside Omega bowl

      let simPressure = 1.8; // Bar (Turbo boost baseline)
      let simTemp = 55;      // °C
      let simTorque = 120;   // Nm
      const railFactor = params.railPressureBar / 2000;

      if (deg720 < 180) {
        // STROKE 1: PURE TURBOCHARGED AIR INTAKE (0° - 180°)
        sprayMat.opacity = 0;
        torusFlameMat.opacity = 0;
        realisticMats.omegaBowlSurface.emissiveIntensity = 0.0;

        chamberCoreMat.color.setHex(0x0ea5e9);
        chamberCoreMat.opacity = 0.12 * Math.sin((deg720 / 180) * Math.PI);
        combustionLight.intensity = 0;

        simPressure = 1.85; // 0.85 Bar Turbo Boost
        simTemp = 52;
        simTorque = 110;
      } else if (deg720 < 360) {
        // STROKE 2: ADIABATIC HIGH-RATIO COMPRESSION (180° - 360°, 18.5:1 Ratio)
        const compProg = (deg720 - 180) / 180; // 0 to 1
        const adiabaticCurve = Math.pow(compProg, 2.35);

        // Pre-injection pilot spray starts right before TDC (354° - 360°)
        if (deg720 >= 354) {
          const pilotProg = (deg720 - 354) / 6;
          sprayMat.color.setHex(0xe0f2fe);
          sprayMat.opacity = pilotProg * 0.85;
          sprayCones.forEach((c) => {
            c.scale.set(0.7 + pilotProg * 0.3, 0.5 + pilotProg * 0.5, 0.7 + pilotProg * 0.3);
          });
        } else {
          sprayMat.opacity = 0;
        }

        torusFlameMat.opacity = 0;
        // Omega Piston Bowl glows warm amber as pure air reaches 720°C!
        realisticMats.omegaBowlSurface.emissiveIntensity = adiabaticCurve * 1.15;

        chamberCoreMat.color.lerpColors(
          new THREE.Color(0x0ea5e9),
          new THREE.Color(0xf59e0b),
          compProg
        );
        chamberCoreMat.opacity = 0.12 + adiabaticCurve * 0.42;
        combustionLight.color.setHex(0xf59e0b);
        combustionLight.intensity = adiabaticCurve * 1.6;

        simPressure = 1.85 + adiabaticCurve * 46.5; // Reaches ~48.3 Bar at TDC!
        simTemp = 55 + adiabaticCurve * 675;        // Reaches ~730°C (Exceeds Diesel Auto-Ignition 210°C!)
        simTorque = 95;
      } else if (deg720 < 540) {
        // STROKE 3: COMMON RAIL MULTI-JET INJECTION & AUTO-IGNITION POWER STROKE (360° - 540°)
        const pwrProg = (deg720 - 360) / 180; // 0 to 1

        // High-Pressure 6-Hole Diesel Fuel Spray Plumes (Active 360° to 418°)
        if (deg720 <= 418) {
          const injProg = (deg720 - 360) / 58; // 0 to 1
          const sprayPulse = Math.sin(injProg * Math.PI);
          sprayMat.opacity = Math.min(0.95, (0.45 + sprayPulse * 0.55) * railFactor);
          // Core of spray transitions from atomized silver-cyan mist to incandescent yellow-orange auto-ignition
          sprayMat.color.lerpColors(
            new THREE.Color(0xe0f2fe),
            new THREE.Color(0xffb703),
            Math.min(1, injProg * 1.4)
          );
          const plumeLen = (0.75 + 0.45 * sprayPulse) * Math.sqrt(railFactor);
          sprayCones.forEach((c, idx) => {
            const flutter = 1 + 0.08 * Math.sin(now * 0.05 + idx);
            c.scale.set(flutter, plumeLen, flutter);
          });
        } else {
          sprayMat.opacity = 0;
        }

        // Swirling Toroidal Auto-Ignition Fireball inside the Piston's Omega (ω) Bowl!
        if (pwrProg < 0.55) {
          const burnCurve = Math.sin((pwrProg / 0.55) * Math.PI);
          torusFlameMat.opacity = Math.min(0.92, burnCurve * 0.95 * railFactor);
          torusFlameMat.color.lerpColors(
            new THREE.Color(0xffffff),
            new THREE.Color(0xff4500),
            pwrProg / 0.55
          );
          const bowlScale = 0.88 + burnCurve * 0.28;
          torusFlameMesh.scale.set(bowlScale, 0.85 + burnCurve * 0.45, bowlScale);
        } else {
          torusFlameMat.opacity = Math.max(0, (1 - pwrProg) * 0.35);
        }

        const fireIntensity = Math.pow(Math.max(0, 1 - pwrProg), 1.65);
        realisticMats.omegaBowlSurface.emissiveIntensity = fireIntensity * 2.2;

        chamberCoreMat.color.lerpColors(
          new THREE.Color(0xffaa00),
          new THREE.Color(0xdc2626),
          Math.min(1, pwrProg * 1.4)
        );
        chamberCoreMat.opacity = fireIntensity * 0.68;
        combustionLight.color.setHex(0xff5500);
        combustionLight.intensity = fireIntensity * 6.5 * railFactor;

        simPressure = (16.0 + fireIntensity * 178.0) * railFactor; // Up to ~195 Bar!
        simTemp = 720 + fireIntensity * 1430;                      // Up to ~2150°C
        simTorque = Math.round((420 + fireIntensity * 310) * railFactor);
      } else {
        // STROKE 4: EXHAUST EXPULSION TO TURBOCHARGER (540° - 720°)
        const exhProg = (deg720 - 540) / 180;
        sprayMat.opacity = 0;
        torusFlameMat.opacity = 0;
        realisticMats.omegaBowlSurface.emissiveIntensity = Math.max(0, (1 - exhProg) * 0.3);

        chamberCoreMat.color.setHex(0x64748b);
        chamberCoreMat.opacity = 0.22 * (1 - exhProg * 0.65);
        combustionLight.intensity = 0;

        simPressure = 2.4 - exhProg * 0.8;
        simTemp = 580 - exhProg * 290;
        simTorque = 135;
      }

      // 8. Update Swirling Air, Fuel Droplets & Exhaust Gas Particles
      const flowSpeed = Math.max(0.35, params.rpm / 160);
      particles.forEach((p, idx) => {
        if ( params.isPlaying ) {
          p.phase = (p.phase + dt * 0.9 * flowSpeed) % 1.0;
        }
        const t = p.phase;

        if (deg720 < 180) {
          // Stroke 1: Pure Air Intake from Left Manifold + High-Swirl Vortex into Cylinder
          p.mat.color.setHex(0x38bdf8); // Pure boosted air (Cyan-Blue)
          if (idx % 2 === 0) {
            const pt = intakeCurve.getPoint(t);
            p.mesh.position.set(
              pt.x,
              pt.y + Math.sin(t * 10 + idx) * 0.08,
              pt.z + Math.cos(t * 8 + idx) * 0.08
            );
            p.mat.opacity = 0.82 * Math.sin(t * Math.PI);
          } else {
            const swirlAngle = p.angleOffset + deg720 * 0.055 + t * 5.0;
            const r = p.radiusFrac * (pistonRadius * 0.82);
            const y = deckY - 0.15 - t * (deckY - pistonTopY - 0.15);
            p.mesh.position.set(Math.cos(swirlAngle) * r, y, Math.sin(swirlAngle) * r);
            p.mat.opacity = 0.72;
          }
        } else if (deg720 < 360) {
          // Stroke 2: Adiabatic Compression into the Piston's Omega (ω) Toroidal Bowl
          const compProg = (deg720 - 180) / 180;
          p.mat.color.lerpColors(
            new THREE.Color(0x38bdf8),
            new THREE.Color(0xfbbf24),
            compProg
          );
          const swirlAngle = p.angleOffset + compProg * 9.0; // Intense swirl inside Omega bowl
          // As piston nears TDC, particles pack tightly into the Omega bowl radius (0.55)
          const maxR = THREE.MathUtils.lerp(pistonRadius * 0.82, 0.54, compProg);
          const r = p.radiusFrac * maxR;
          const bowlBottomY = pistonY + 0.22;
          const y = bowlBottomY + p.heightFrac * Math.max(0.18, deckY - bowlBottomY - 0.08);
          p.mesh.position.set(Math.cos(swirlAngle) * r, y, Math.sin(swirlAngle) * r);
          p.mat.opacity = 0.65 + compProg * 0.3;
        } else if (deg720 < 540) {
          // Stroke 3: Auto-Ignition Toroidal Vortex Expansion
          const pwrProg = (deg720 - 360) / 180;
          p.mat.color.lerpColors(
            new THREE.Color(0xffffff),
            new THREE.Color(0xf97316),
            Math.min(1, pwrProg * 1.2)
          );
          const swirlAngle = p.angleOffset + pwrProg * 12.0;
          const r = p.radiusFrac * THREE.MathUtils.lerp(0.55, pistonRadius * 0.86, pwrProg);
          const bowlBottomY = pistonY + 0.24;
          const y = bowlBottomY + p.heightFrac * Math.max(0.2, deckY - bowlBottomY - 0.1);
          p.mesh.position.set(Math.cos(swirlAngle) * r, y, Math.sin(swirlAngle) * r);
          p.mat.opacity = Math.max(0.25, 0.95 - pwrProg * 0.55);
        } else {
          // Stroke 4: Diesel Exhaust Expulsion out Right Runner
          p.mat.color.setHex(0x94a3b8);
          if (idx % 2 === 0) {
            const pt = exhaustCurve.getPoint(t);
            p.mesh.position.set(
              pt.x,
              pt.y + Math.sin(t * 10 + idx) * 0.08,
              pt.z + Math.cos(t * 8 + idx) * 0.08
            );
            p.mat.opacity = 0.82 * Math.sin(t * Math.PI);
          } else {
            const swirlAngle = p.angleOffset + t * 3.0;
            const r = p.radiusFrac * (pistonRadius * 0.78);
            const y = pistonTopY + 0.12 + t * Math.max(0.15, deckY - pistonTopY - 0.15);
            p.mesh.position.set(Math.cos(swirlAngle) * r, y, Math.sin(swirlAngle) * r);
            p.mat.opacity = 0.58;
          }
        }
      });

      // 9. Throttled React Telemetry State Updates
      uiTimer += dt;
      if (uiTimer > 0.06) {
        uiTimer = 0;
        const roundedDeg = Math.round(deg720) % 720;
        const sIdx = Math.min(3, Math.floor(deg720 / 180));
        setCrankDeg(roundedDeg);
        if (params.isPlaying) {
          setManualDeg(roundedDeg);
        }
        setActiveStrokeIdx(sIdx);
        setCylPressureBar(Number(simPressure.toFixed(1)));
        setCylTempC(Math.round(simTemp));
        setInstantTorqueNm(simTorque);
      }

      renderer.render(scene, camera);
    };

    reqId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(reqId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      domElem.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      domElem.removeEventListener('wheel', onWheel);
      domElem.removeEventListener('contextmenu', onContextMenu);
      renderer.dispose();
    };
  }, []);

  const isDark = theme === 'dark';
  const currentStroke = DIESEL_SPECS.strokes[activeStrokeIdx] || DIESEL_SPECS.strokes[0];

  const cardClass = isDark
    ? 'bg-[#101828]/90 backdrop-blur-xl border border-gray-800 shadow-[0_16px_36px_rgba(0,0,0,0.45)]'
    : 'bg-white/95 backdrop-blur-xl border border-gray-200 shadow-[0_16px_38px_rgba(16,24,40,0.08)]';
  const subCardClass = isDark
    ? 'bg-[#161f30]/90 border border-gray-800'
    : 'bg-gray-50/90 border border-gray-200/80';
  const headingText = isDark ? 'text-white' : 'text-gray-900';
  const bodyText = isDark ? 'text-gray-300' : 'text-gray-600';
  const mutedText = isDark ? 'text-gray-400' : 'text-gray-500';
  const dividerClass = isDark ? 'border-gray-800' : 'border-gray-200';
  const btnSecondary = isDark
    ? 'bg-[#161f30] hover:bg-[#1f2c42] text-gray-300 border border-gray-700'
    : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 shadow-xs';

  return (
    <div className="relative w-full h-full overflow-hidden select-none font-sans">
      {/* Three.js 3D Viewport */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing" />

      {/* =========================================================
          TOP-LEFT: HEADER & 4-STROKE DIESEL CYCLE MONITOR
      ========================================================= */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2.5 max-w-xs sm:max-w-md pointer-events-none">
        <div className={`${cardClass} rounded-2xl p-4 pointer-events-auto transition-colors duration-300`}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-orange-500/15 border border-orange-500/30">
                <Droplets className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-orange-500 mb-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
                  Compression Ignition • Common Rail DI
                </span>
                <h1 className={`text-base sm:text-lg font-extrabold tracking-tight ${headingText}`}>
                  SIMULASI MESIN DIESEL 4-TAK
                </h1>
              </div>
            </div>

            {/* Camera View Presets */}
            <div className="hidden sm:flex items-center gap-1">
              {[
                { id: 'iso', label: 'ISO' },
                { id: 'front', label: 'Depan' },
                { id: 'side', label: 'Samping' },
                { id: 'injector', label: 'Injektor' }
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setCameraPreset(p.id)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer active:scale-95 ${btnSecondary}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive 4-Stroke Diesel Cycle Step Selector */}
          <div className={`mt-2 pt-2.5 border-t ${dividerClass}`}>
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider mb-1.5">
              <span className={`font-bold flex items-center gap-1 ${mutedText}`}>
                <Activity className="w-3.5 h-3.5 text-orange-500" /> Siklus Kerja Diesel (Klik Tahap)
              </span>
              <span className="font-mono font-bold text-orange-500">
                {crankDeg}° / 720°
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {DIESEL_SPECS.strokes.map((st, idx) => {
                const isActive = activeStrokeIdx === idx;
                return (
                  <button
                    key={st.id}
                    onClick={() => jumpToStroke(idx)}
                    className={`flex flex-col items-center py-1.5 px-1 rounded-xl border text-center transition-all cursor-pointer active:scale-95 ${
                      isActive ? st.activeBg : subCardClass
                    }`}
                  >
                    <span className={`text-[9px] font-bold uppercase ${isActive ? 'text-white/90' : mutedText}`}>
                      Tahap {st.index}
                    </span>
                    <span className={`text-[11px] font-extrabold tracking-tight ${isActive ? 'text-white' : headingText}`}>
                      {st.id === 'intake'
                        ? 'Hisap Udara'
                        : st.id === 'compression'
                        ? 'Kompresi'
                        : st.id === 'power'
                        ? 'Injeksi/Usaha'
                        : 'Buang'}
                    </span>
                    <span className={`text-[8px] font-mono ${isActive ? 'text-white/80' : mutedText}`}>
                      {st.range[0]}°–{st.range[1]}°
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Active Stroke Detailed Explanation Card */}
            <div className={`mt-2.5 p-2.5 rounded-xl border ${currentStroke.badgeColor} transition-all`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-extrabold tracking-tight">
                  #{currentStroke.index} • {currentStroke.name}
                </span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-black/10">
                  {activeStrokeIdx === 0 || activeStrokeIdx === 2 ? 'Piston ↓ (TMA→TMB)' : 'Piston ↑ (TMB→TMA)'}
                </span>
              </div>
              <p className={`text-[11px] leading-relaxed ${bodyText}`}>
                {currentStroke.desc}
              </p>
            </div>
          </div>

          {/* Live Diesel Telemetry Readouts */}
          <div className={`grid grid-cols-4 gap-1.5 text-xs border-t ${dividerClass} pt-2.5 mt-2.5`}>
            <div className={`${subCardClass} rounded-xl px-2 py-1.5`}>
              <span className={`${mutedText} block text-[9px] uppercase font-bold`}>Putaran</span>
              <span className="font-mono text-sm font-extrabold text-orange-500">{rpm}</span>
              <span className={`text-[9px] ml-0.5 ${mutedText}`}>RPM</span>
            </div>
            <div className={`${subCardClass} rounded-xl px-2 py-1.5`}>
              <span className={`${mutedText} block text-[9px] uppercase font-bold`}>Tekanan Sil.</span>
              <span className={`font-mono text-sm font-extrabold ${headingText}`}>{cylPressureBar}</span>
              <span className={`text-[9px] ml-0.5 ${mutedText}`}>Bar</span>
            </div>
            <div className={`${subCardClass} rounded-xl px-2 py-1.5`}>
              <span className={`${mutedText} block text-[9px] uppercase font-bold`}>Suhu Udara</span>
              <span className="font-mono text-sm font-extrabold text-amber-500">{cylTempC}°C</span>
            </div>
            <div className={`${subCardClass} rounded-xl px-2 py-1.5`}>
              <span className={`${mutedText} block text-[9px] uppercase font-bold`}>Torsi Puncak</span>
              <span className="font-mono text-sm font-extrabold text-emerald-500">{instantTorqueNm}</span>
              <span className={`text-[9px] ml-0.5 ${mutedText}`}>Nm</span>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================
          TOP-RIGHT: SHADING MODE & COMPONENT VISIBILITY
      ========================================================= */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2.5 w-64 pointer-events-none">
        <div className={`${cardClass} rounded-2xl p-3.5 pointer-events-auto transition-colors duration-300`}>
          <div className={`text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5 ${mutedText}`}>
            <Layers className="w-3.5 h-3.5 text-orange-500" /> Mode Visualisasi CAD
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { id: 'realistic', label: 'Realistic PBR', icon: Sparkles },
              { id: 'raw', label: 'Raw Shaded', icon: Box },
              { id: 'wireframe', label: 'Wireframe', icon: Grid },
              { id: 'shaded_wire', label: 'Shaded + Wire', icon: Cpu }
            ].map((mode) => {
              const IconComp = mode.icon;
              const active = renderMode === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => setRenderMode(mode.id)}
                  className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer active:scale-95 ${
                    active
                      ? 'bg-orange-500 text-white shadow-[0_4px_14px_rgba(251,101,20,0.35)] border border-orange-400'
                      : btnSecondary
                  }`}
                >
                  <IconComp className="w-3.5 h-3.5" />
                  <span>{mode.label}</span>
                </button>
              );
            })}
          </div>

          <div className={`mt-3 pt-2.5 border-t ${dividerClass}`}>
            <div className={`text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5 ${mutedText}`}>
              <Eye className="w-3.5 h-3.5 text-orange-500" /> Komponen & Belahan
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {/* 180 deg Cutaway Mode */}
              <button
                onClick={() => setCutawayMode(!cutawayMode)}
                className={`col-span-2 flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 border ${
                  cutawayMode
                    ? 'bg-orange-500/15 border-orange-500/40 text-orange-500'
                    : isDark
                    ? 'bg-gray-900/40 border-gray-800 text-gray-400'
                    : 'bg-gray-100 border-gray-200 text-gray-600'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Scissors className="w-3.5 h-3.5" /> Belahan Piston Omega & Blok
                </span>
                <span className="text-[10px] uppercase font-extrabold">
                  {cutawayMode ? 'AKTIF' : 'PENUH'}
                </span>
              </button>

              {/* Glow Plug (Busi Pijar) Pre-Heat Toggle */}
              <button
                onClick={() => setGlowPlugActive(!glowPlugActive)}
                className={`col-span-2 flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 border ${
                  glowPlugActive
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-500'
                    : isDark
                    ? 'bg-gray-900/40 border-gray-800 text-gray-500'
                    : 'bg-gray-100 border-gray-200 text-gray-400'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5" /> Busi Pijar (Glow Plug 1050°C)
                </span>
                <span className="text-[10px] uppercase font-extrabold">
                  {glowPlugActive ? 'MENYALA' : 'MATI'}
                </span>
              </button>

              {[
                { label: 'Blok Besi Cor', state: showBlock, setter: setShowBlock },
                { label: 'Head & Injektor', state: showHead, setter: setShowHead },
                { label: 'Katup & Cam', state: showValvetrain, setter: setShowValvetrain },
                { label: 'Kabut Solar/Api', state: showGasFlow, setter: setShowGasFlow }
              ].map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => item.setter(!item.state)}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer active:scale-95 border ${
                    item.state
                      ? isDark
                        ? 'bg-[#161f30] border-orange-500/40 text-gray-200'
                        : 'bg-orange-50/70 border-orange-300 text-gray-800'
                      : isDark
                      ? 'bg-gray-900/40 border-gray-800/80 text-gray-500'
                      : 'bg-gray-100/70 border-gray-200 text-gray-400'
                  }`}
                >
                  <span className="truncate">{item.label}</span>
                  {item.state ? (
                    <Eye className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================
          BOTTOM: SIMULATOR CONTROLS & MANUAL CRANK ANGLE SCRUBBER
      ========================================================= */}
      <div className="absolute bottom-4 left-4 right-4 z-10 flex flex-col lg:flex-row items-stretch lg:items-end justify-between gap-3 pointer-events-none">
        <div className={`${cardClass} rounded-2xl p-4 pointer-events-auto flex-1 max-w-4xl transition-colors duration-300`}>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-center">
            {/* 1. Engine RPM Slider */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className={`${bodyText} font-semibold flex items-center gap-1.5`}>
                  <Gauge className="w-3.5 h-3.5 text-orange-500" /> Putaran Mesin
                </span>
                <span className="font-mono font-bold text-orange-500">{rpm} RPM</span>
              </div>
              <input
                type="range"
                min="30"
                max="3200"
                step="10"
                value={rpm}
                onChange={(e) => setRpm(Number(e.target.value))}
                className="w-full h-2 bg-gray-300 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
              <div className={`flex justify-between text-[9px] font-medium ${mutedText}`}>
                <button
                  onClick={() => setRpm(60)}
                  className="hover:text-orange-500 underline cursor-pointer"
                >
                  60 (Slow-Mo)
                </button>
                <button
                  onClick={() => setRpm(750)}
                  className="hover:text-orange-500 underline cursor-pointer"
                >
                  750 (Idle)
                </button>
                <button
                  onClick={() => setRpm(2400)}
                  className="hover:text-orange-500 underline cursor-pointer"
                >
                  2400 (Puncak)
                </button>
              </div>
            </div>

            {/* 2. Common Rail Injection Pressure Slider */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className={`${bodyText} font-semibold flex items-center gap-1.5`}>
                  <Droplets className="w-3.5 h-3.5 text-orange-500" /> Tekanan Rail
                </span>
                <span className="font-mono font-bold text-orange-500">{railPressureBar} Bar</span>
              </div>
              <input
                type="range"
                min="1200"
                max="2500"
                step="50"
                value={railPressureBar}
                onChange={(e) => setRailPressureBar(Number(e.target.value))}
                className="w-full h-2 bg-gray-300 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
              <div className={`flex justify-between text-[9px] font-medium ${mutedText}`}>
                <span>1200 Bar</span>
                <span>Piezo 6-Jet</span>
                <span>2500 Bar</span>
              </div>
            </div>

            {/* 3. Manual Crankshaft Angle Scrubber (0° - 720°) */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className={`${bodyText} font-semibold flex items-center gap-1.5`}>
                  <Compass className="w-3.5 h-3.5 text-orange-500" /> Sudut Kruk As
                </span>
                <span className="font-mono font-bold text-orange-500">{crankDeg}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="719"
                step="1"
                value={manualDeg}
                onChange={(e) => handleManualAngleChange(Number(e.target.value))}
                className="w-full h-2 bg-gray-300 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
              <div className={`flex justify-between text-[9px] font-medium ${mutedText}`}>
                <span>0° Hisap</span>
                <span>360° Injeksi</span>
                <span>720°</span>
              </div>
            </div>

            {/* 4. Exploded View & Block Opacity */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className={`${bodyText} font-semibold flex items-center gap-1.5`}>
                  <Maximize2 className="w-3.5 h-3.5 text-orange-500" /> Exploded & Opacity
                </span>
                <span className={`font-mono font-bold ${headingText}`}>
                  {Math.round(exploded * 100)}% / {Math.round(blockOpacity * 100)}%
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={exploded}
                  onChange={(e) => setExploded(Number(e.target.value))}
                  title="Exploded View"
                  className="w-full h-2 bg-gray-300 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
                <input
                  type="range"
                  min="0.08"
                  max="0.9"
                  step="0.01"
                  value={blockOpacity}
                  onChange={(e) => setBlockOpacity(Number(e.target.value))}
                  title="Transparansi Blok"
                  className="w-full h-2 bg-gray-300 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
              </div>
              <div className={`flex justify-between text-[9px] font-medium ${mutedText}`}>
                <span>urai Komponen</span>
                <span>Transparansi Blok</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Transport Buttons */}
        <div className={`${cardClass} rounded-2xl p-2.5 pointer-events-auto flex items-center justify-end gap-2 transition-colors duration-300`}>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 ${
              isPlaying
                ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-[0_6px_18px_rgba(251,101,20,0.35)]'
                : 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/40'
            }`}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>

          <button
            onClick={() => setAutoRotateCam(!autoRotateCam)}
            className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 border ${
              autoRotateCam
                ? 'bg-orange-500 text-white border-orange-400 shadow-[0_4px_12px_rgba(251,101,20,0.3)]'
                : btnSecondary
            }`}
          >
            Auto-Orbit
          </button>

          <button
            onClick={() => {
              setRpm(160);
              setRailPressureBar(2000);
              setGlowPlugActive(true);
              setExploded(0);
              setBlockOpacity(0.32);
              setCutawayMode(true);
              setRenderMode('realistic');
              setShowBlock(true);
              setShowHead(true);
              setShowValvetrain(true);
              setShowGasFlow(true);
              setAutoRotateCam(false);
              setCameraPreset('iso');
            }}
            title="Reset Simulasi"
            className={`p-2.5 rounded-xl transition-all cursor-pointer active:scale-95 ${btnSecondary}`}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
