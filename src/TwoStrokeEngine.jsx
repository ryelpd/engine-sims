import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  Play, Pause, RotateCcw, Eye, EyeOff,
  Layers, Box, Grid, Cpu, Flame,
  Sliders, Maximize2, Activity, Gauge, Zap, Info, Compass,
  Wind, Scissors, Sparkles, Thermometer, Repeat
} from 'lucide-react';

const TWO_STROKE_SPECS = {
  crankRadius: 0.90,       // Stroke = 1.80 (Square / High-revving)
  rodLength: 2.65,         // Forged racing rod with needle bearings
  pistonRadius: 1.02,      // Bore radius (~65mm)
  pistonHeight: 1.15,      // Lightweight ported skirt with 2 thin chrome rings
  compressionRatio: '12.0 : 1',
  displacementCc: '249 cc (Single Racing 2T)',
  tunedRpm: 8500,
  strokes: [
    {
      id: 'power_transfer',
      index: 1,
      name: 'Langkah Usaha, Buang & Pembilasan (TMA → TMB)',
      range: [0, 180],
      desc: 'Busi menyala di TMA. Ledakan mendorong piston turun menghasilkan tenaga, sekaligus memampatkan campuran bahan bakar-udara-oli di bak engkol (kompresi primer). Lubang buang terbuka, disusul lubang transfer/bilas yang menyemburkan campuran baru ke atas.',
      badgeColor: 'text-orange-500 bg-orange-500/10 border-orange-500/30',
      activeBg: 'bg-orange-500 text-white border-orange-400 shadow-[0_0_16px_rgba(251,101,20,0.7)]'
    },
    {
      id: 'compression_intake',
      index: 2,
      name: 'Langkah Kompresi & Hisap Bak Engkol (TMB → TMA)',
      range: [180, 360],
      desc: 'Piston bergerak naik menutup saluran bilas & buang, mengompresi campuran di ruang bakar atas. Bersamaan dengan itu, kevakuman di bawah piston membuka katup buluh (reed valve) untuk menghisap campuran bahan bakar baru ke bak engkol.',
      badgeColor: 'text-sky-500 bg-sky-500/10 border-sky-500/30',
      activeBg: 'bg-sky-500 text-white border-sky-400 shadow-[0_0_16px_rgba(14,165,233,0.6)]'
    }
  ]
};

export default function TwoStrokeEngine({ theme = 'dark' }) {
  const mountRef = useRef(null);

  // Simulation Controls
  const [rpm, setRpm] = useState(240); // Educational speed so ports opening & loop scavenging are clear
  const [isPlaying, setIsPlaying] = useState(true);
  const [manualDeg, setManualDeg] = useState(0); // 0 to 360 deg (2-stroke is 360° per complete cycle!)
  const [renderMode, setRenderMode] = useState('realistic');
  const [exploded, setExploded] = useState(0);
  const [blockOpacity, setBlockOpacity] = useState(0.32);
  const [cutawayMode, setCutawayMode] = useState(true);
  const [showBlock, setShowBlock] = useState(true);
  const [showHead, setShowHead] = useState(true);
  const [showExhaustPipe, setShowExhaustPipe] = useState(true);
  const [showGasFlow, setShowGasFlow] = useState(true);
  const [autoRotateCam, setAutoRotateCam] = useState(false);

  // Live Telemetry States
  const [crankDeg, setCrankDeg] = useState(0);
  const [activeStrokeIdx, setActiveStrokeIdx] = useState(0);
  const [cylPressureBar, setCylPressureBar] = useState(1.2);
  const [crankcasePressureBar, setCrankcasePressureBar] = useState(1.4);
  const [cylTempC, setCylTempC] = useState(85);
  const [instantPowerHp, setInstantPowerHp] = useState(48);

  const simParams = useRef({
    theme,
    rpm: 240,
    isPlaying: true,
    manualDeg: 0,
    renderMode: 'realistic',
    exploded: 0,
    blockOpacity: 0.32,
    cutawayMode: true,
    showBlock: true,
    showHead: true,
    showExhaustPipe: true,
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
    theta: 0.58,
    phi: 1.32,
    radius: 12.5,
    target: new THREE.Vector3(0, 1.95, 0)
  });

  useEffect(() => {
    simParams.current = {
      theme,
      rpm,
      isPlaying,
      manualDeg,
      renderMode,
      exploded,
      blockOpacity,
      cutawayMode,
      showBlock,
      showHead,
      showExhaustPipe,
      showGasFlow,
      autoRotateCam
    };
  }, [
    theme,
    rpm,
    isPlaying,
    manualDeg,
    renderMode,
    exploded,
    blockOpacity,
    cutawayMode,
    showBlock,
    showHead,
    showExhaustPipe,
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
      newGrid.position.y = -2.85;
      scene.add(newGrid);
      sceneElements.current.gridHelper = newGrid;
    }

    if (ambientLight) ambientLight.intensity = isDark ? 0.70 : 1.25;
    if (rimLight1) rimLight1.intensity = isDark ? 1.25 : 0.7;
    if (rimLight2) rimLight2.intensity = isDark ? 0.95 : 0.55;
  }, [theme]);

  // Jump to a specific 2-Stroke phase
  const jumpToStroke = (strokeIdx) => {
    const targetAngles = [55, 235]; // Phase 1: Expansion & Transfer (~55°); Phase 2: Compression & Intake (~235°)
    const deg = targetAngles[strokeIdx] ?? 0;
    crankThetaRef.current = (deg * Math.PI) / 180;
    setManualDeg(deg);
    setCrankDeg(deg);
    setActiveStrokeIdx(strokeIdx);
  };

  // Manual Crank Angle Scrubber
  const handleManualAngleChange = (deg) => {
    setIsPlaying(false);
    setManualDeg(deg);
    crankThetaRef.current = (deg * Math.PI) / 180;
    setCrankDeg(Math.round(deg) % 360);
    setActiveStrokeIdx(deg < 180 ? 0 : 1);
  };

  // Camera presets
  const setCameraPreset = (preset) => {
    camControl.current.isDragging = false;
    setAutoRotateCam(false);
    if (preset === 'iso') {
      camControl.current.theta = 0.58;
      camControl.current.phi = 1.32;
      camControl.current.radius = 12.5;
      camControl.current.target.set(0, 1.95, 0);
    } else if (preset === 'front') {
      camControl.current.theta = 0.0;
      camControl.current.phi = 1.48;
      camControl.current.radius = 11.2;
      camControl.current.target.set(0, 1.95, 0);
    } else if (preset === 'side') {
      camControl.current.theta = Math.PI / 2;
      camControl.current.phi = 1.45;
      camControl.current.radius = 11.8;
      camControl.current.target.set(0, 1.95, 0);
    } else if (preset === 'ports') {
      // Close-up on the 3 internal ports & scavenge channels
      camControl.current.theta = 0.22;
      camControl.current.phi = 1.35;
      camControl.current.radius = 6.4;
      camControl.current.target.set(0, 2.75, 0);
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

    // 2. Studio Lighting Setup
    const ambientLight = new THREE.AmbientLight(0xdbeafe, isInitialDark ? 0.70 : 1.25);
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
    gridHelper.position.y = -2.85;
    scene.add(gridHelper);

    sceneElements.current = {
      scene,
      gridHelper,
      ambientLight,
      rimLight1,
      rimLight2
    };

    // 3. Realistic PBR Materials Library
    const realisticMats = {
      polishedAlu: new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.90,
        roughness: 0.16,
        side: THREE.DoubleSide
      }),
      castAluFins: new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.78,
        roughness: 0.32,
        side: THREE.DoubleSide
      }),
      crankSteel: new THREE.MeshStandardMaterial({
        color: 0xd0d7de,
        metalness: 0.92,
        roughness: 0.15
      }),
      counterweightWeb: new THREE.MeshStandardMaterial({
        color: 0x475569,
        metalness: 0.85,
        roughness: 0.28
      }),
      racingRod: new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        metalness: 0.88,
        roughness: 0.20
      }),
      chromeRings: new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        metalness: 0.98,
        roughness: 0.08
      }),
      wristPin: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.96,
        roughness: 0.08
      }),
      sparkHex: new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.88,
        roughness: 0.22
      }),
      sparkCeramic: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.1,
        roughness: 0.35
      }),
      reedPetals: new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        metalness: 0.75,
        roughness: 0.25,
        side: THREE.DoubleSide
      }),
      reedBlock: new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.65,
        roughness: 0.35
      }),
      tunedExpansionChamber: new THREE.MeshStandardMaterial({
        color: 0xd97706, // Heat-treated raw steel with weld rings & bronze temper
        metalness: 0.88,
        roughness: 0.24,
        side: THREE.DoubleSide
      }),
      weldBeads: new THREE.MeshStandardMaterial({
        color: 0x92400e,
        metalness: 0.92,
        roughness: 0.32
      }),
      carbonSilencer: new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        metalness: 0.45,
        roughness: 0.22
      }),
      cylinderBarrelTrans: new THREE.MeshPhysicalMaterial({
        color: 0x64748b,
        metalness: 0.45,
        roughness: 0.24,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        side: THREE.DoubleSide
      }),
      cylinderLinerSteel: new THREE.MeshPhysicalMaterial({
        color: 0x94a3b8,
        metalness: 0.75,
        roughness: 0.14,
        transparent: true,
        opacity: 0.36,
        depthWrite: false,
        side: THREE.DoubleSide
      }),
      crankcaseTrans: new THREE.MeshPhysicalMaterial({
        color: 0x475569,
        metalness: 0.50,
        roughness: 0.26,
        transparent: true,
        opacity: 0.30,
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

    const engineRoot = new THREE.Group();
    scene.add(engineRoot);

    const { crankRadius, rodLength, pistonRadius, pistonHeight } = TWO_STROKE_SPECS;

    // Kinematic Heights
    // TDC Piston Top Y: crankRadius (0.90) + rodLength (2.65) + pinToCrown (0.55) = 4.10
    // BDC Piston Top Y: 4.10 - (2 * 0.90) = 2.30
    const deckY = 4.22;
    const exhaustPortY = 3.12;   // Uncovered when piston drops below this
    const transferPortY = 2.78;  // Uncovered slightly after exhaust port
    const intakeReedY = 0.55;    // Lower crankcase intake runner

    // =========================================================
    // A. 2-STROKE STUFFER CRANKSHAFT & FLYWHEEL
    // (Full-circle circular web wheels to maximize crankcase primary pre-compression)
    // =========================================================
    const crankGroup = new THREE.Group();
    engineRoot.add(crankGroup);

    // Front & Rear Main Journals
    const mainJournalGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.85, 28);
    mainJournalGeo.rotateX(Math.PI / 2);

    const frontMain = registerMesh(new THREE.Mesh(mainJournalGeo), realisticMats.crankSteel);
    frontMain.position.z = 0.95;
    crankGroup.add(frontMain);

    const rearMain = registerMesh(new THREE.Mesh(mainJournalGeo), realisticMats.crankSteel);
    rearMain.position.z = -0.95;
    crankGroup.add(rearMain);

    // Crankpin offset at Y = crankRadius
    const crankPinGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.82, 28);
    crankPinGeo.rotateX(Math.PI / 2);
    const crankPin = registerMesh(new THREE.Mesh(crankPinGeo), realisticMats.crankSteel);
    crankPin.position.set(0, crankRadius, 0);
    crankGroup.add(crankPin);

    // Full-Circle "Stuffer" Crank Webs (Characteristic 2-Stroke full round webs with hollow balance holes)
    const stufferShape = new THREE.Shape();
    stufferShape.absarc(0, 0, 1.25, 0, Math.PI * 2, false);

    // Balance cutout hole opposite the crankpin to counterbalance piston
    const balanceHole = new THREE.Path();
    balanceHole.absarc(0, -0.65, 0.42, 0, Math.PI * 2, true);
    stufferShape.holes.push(balanceHole);

    const stufferGeo = new THREE.ExtrudeGeometry(stufferShape, {
      depth: 0.34,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 3
    });
    stufferGeo.center();

    const frontStuffer = registerMesh(new THREE.Mesh(stufferGeo), realisticMats.counterweightWeb);
    frontStuffer.position.set(0, 0, 0.52);
    crankGroup.add(frontStuffer);

    const rearStuffer = registerMesh(new THREE.Mesh(stufferGeo), realisticMats.counterweightWeb);
    rearStuffer.position.set(0, 0, -0.52);
    crankGroup.add(rearStuffer);

    // Lightweight Ignition Flywheel / Magneto Rotor on Front
    const magnetoGeo = new THREE.CylinderGeometry(1.35, 1.35, 0.28, 40);
    magnetoGeo.rotateX(Math.PI / 2);
    const magneto = registerMesh(new THREE.Mesh(magnetoGeo), realisticMats.polishedAlu);
    magneto.position.z = 1.35;
    crankGroup.add(magneto);

    // =========================================================
    // B. LIGHTWEIGHT RACING 2-STROKE PISTON & CONNECTING ROD
    // =========================================================
    const pistonAssembly = new THREE.Group();
    engineRoot.add(pistonAssembly);

    // Sculpted Piston Profile with Domed Crown & Skirt Window Cutouts
    const pistonPts = [
      new THREE.Vector2(0.0, 0.58),                   // Slight domed crown apex for high squish
      new THREE.Vector2(pistonRadius * 0.7, 0.56),    // Dome slope
      new THREE.Vector2(pistonRadius - 0.04, 0.52),   // Crown edge chamfer
      new THREE.Vector2(pistonRadius, 0.48),          // Ring land top
      new THREE.Vector2(pistonRadius, -0.58),         // Skirt bottom
      new THREE.Vector2(pistonRadius - 0.12, -0.58),  // Inner skirt edge
      new THREE.Vector2(pistonRadius - 0.12, 0.15),   // Inner skirt ceiling
      new THREE.Vector2(0.0, 0.18)                    // Under-crown center
    ];

    const fullPistonGeo = new THREE.LatheGeometry(pistonPts, 52);
    const cutawayPistonGeo = new THREE.LatheGeometry(pistonPts, 36, 0, Math.PI);

    const pistonCrown = registerMesh(new THREE.Mesh(fullPistonGeo), realisticMats.polishedAlu);
    pistonAssembly.add(pistonCrown);

    // 2 Thin Chrome Piston Rings (Top Dykes / Keystone compression ring & 2nd scraper ring)
    const ringGeo = new THREE.TorusGeometry(pistonRadius + 0.012, 0.024, 10, 48);
    ringGeo.rotateX(Math.PI / 2);
    for (let r = 0; r < 2; r++) {
      const ring = registerMesh(new THREE.Mesh(ringGeo), realisticMats.chromeRings);
      ring.position.y = 0.38 - r * 0.12;
      pistonAssembly.add(ring);
    }

    // Wrist Pin (Full floating with needle bearing cage)
    const pinGeo = new THREE.CylinderGeometry(0.22, 0.22, pistonRadius * 1.76, 24);
    pinGeo.rotateX(Math.PI / 2);
    const wristPin = registerMesh(new THREE.Mesh(pinGeo), realisticMats.wristPin);
    wristPin.position.y = -0.05;
    pistonAssembly.add(wristPin);

    // Forged H-Beam Connecting Rod with Big-End Needle Roller Bearing
    const rodGroup = new THREE.Group();
    engineRoot.add(rodGroup);

    const bigEndGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.42, 28);
    bigEndGeo.rotateX(Math.PI / 2);
    const bigEnd = registerMesh(new THREE.Mesh(bigEndGeo), realisticMats.racingRod);
    rodGroup.add(bigEnd);

    const smallEndGeo = new THREE.CylinderGeometry(0.30, 0.30, 0.38, 24);
    smallEndGeo.rotateX(Math.PI / 2);
    const smallEnd = registerMesh(new THREE.Mesh(smallEndGeo), realisticMats.racingRod);
    smallEnd.position.y = rodLength;
    rodGroup.add(smallEnd);

    const beamGeo = new THREE.BoxGeometry(0.28, rodLength - 0.42, 0.22);
    const beam = registerMesh(new THREE.Mesh(beamGeo), realisticMats.racingRod);
    beam.position.y = rodLength / 2;
    rodGroup.add(beam);

    // =========================================================
    // C. SCULPTED 2-STROKE CYLINDER, COOLING FINS & REED VALVE
    // =========================================================
    const blockGroup = new THREE.Group();
    engineRoot.add(blockGroup);

    const barrelMinY = 1.35;
    const barrelMaxY = deckY;
    const barrelHeight = barrelMaxY - barrelMinY;
    const barrelMidY = (barrelMinY + barrelMaxY) / 2;

    // Steel Cylinder Liner (with 180 deg cutaway option)
    const fullLinerGeo = new THREE.CylinderGeometry(
      pistonRadius + 0.08,
      pistonRadius + 0.08,
      barrelHeight,
      44,
      1,
      true
    );
    const cutLinerGeo = new THREE.CylinderGeometry(
      pistonRadius + 0.08,
      pistonRadius + 0.08,
      barrelHeight,
      44,
      1,
      true,
      Math.PI / 2,
      Math.PI
    );
    const cylinderLiner = registerMesh(
      new THREE.Mesh(fullLinerGeo),
      realisticMats.cylinderLinerSteel,
      true
    );
    cylinderLiner.position.y = barrelMidY;
    blockGroup.add(cylinderLiner);

    // Aluminum Cylinder Barrel Casting with Port Cavities
    const fullBarrelGeo = new THREE.CylinderGeometry(
      pistonRadius + 0.52,
      pistonRadius + 0.52,
      barrelHeight - 0.12,
      44,
      1,
      false
    );
    const cutBarrelGeo = new THREE.CylinderGeometry(
      pistonRadius + 0.52,
      pistonRadius + 0.52,
      barrelHeight - 0.12,
      44,
      1,
      false,
      Math.PI / 2,
      Math.PI
    );
    const cylinderBarrel = registerMesh(
      new THREE.Mesh(fullBarrelGeo),
      realisticMats.cylinderBarrelTrans,
      true
    );
    cylinderBarrel.position.y = barrelMidY;
    blockGroup.add(cylinderBarrel);

    // Radial Cooling Fins along Cylinder Barrel (8 Radiating Fins with Filleted Outlines)
    const finRings = [];
    for (let f = 0; f < 8; f++) {
      const finY = barrelMinY + 0.28 + f * 0.32;
      const finR = pistonRadius + 0.65 + Math.sin((f / 7) * Math.PI) * 0.45;

      const fullFin = new THREE.CylinderGeometry(finR, finR, 0.055, 40);
      const cutFin = new THREE.CylinderGeometry(finR, finR, 0.055, 40, 1, false, Math.PI / 2, Math.PI);

      const finMesh = registerMesh(new THREE.Mesh(fullFin), realisticMats.castAluFins, true);
      finMesh.position.y = finY;
      blockGroup.add(finMesh);
      finRings.push({ mesh: finMesh, fullFin, cutFin });
    }

    // Lower Crankcase Housing (Encircles the stuffer crank)
    const fullCrankcaseGeo = new THREE.CylinderGeometry(1.68, 1.68, 2.7, 40, 1, false);
    fullCrankcaseGeo.rotateX(Math.PI / 2);
    const cutCrankcaseGeo = new THREE.CylinderGeometry(1.68, 1.68, 2.7, 40, 1, false, Math.PI, Math.PI);
    cutCrankcaseGeo.rotateX(Math.PI / 2);

    const crankcaseMesh = registerMesh(
      new THREE.Mesh(fullCrankcaseGeo),
      realisticMats.crankcaseTrans,
      true
    );
    crankcaseMesh.position.y = 0;
    blockGroup.add(crankcaseMesh);

    // Dual Schnürle Loop-Scavenging Transfer Channels (Left X < 0, curving from crankcase up to transferPortY)
    const leftTransferCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.25, 0.65, 0),
      new THREE.Vector3(-1.55, 1.85, 0),
      new THREE.Vector3(-1.08, transferPortY, 0)
    ]);
    const leftTransferGeo = new THREE.TubeGeometry(leftTransferCurve, 24, 0.22, 16, false);
    const leftTransferMesh = registerMesh(
      new THREE.Mesh(leftTransferGeo),
      realisticMats.cylinderBarrelTrans,
      true
    );
    blockGroup.add(leftTransferMesh);

    // Right Transfer Channel (Symmetrical)
    const rightTransferCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.55, 0.65, -0.75),
      new THREE.Vector3(1.25, 1.85, -0.75),
      new THREE.Vector3(0.92, transferPortY, -0.35)
    ]);
    const rightTransferGeo = new THREE.TubeGeometry(rightTransferCurve, 24, 0.20, 16, false);
    const rightTransferMesh = registerMesh(
      new THREE.Mesh(rightTransferGeo),
      realisticMats.cylinderBarrelTrans,
      true
    );
    blockGroup.add(rightTransferMesh);

    // Reed Valve Assembly at Intake Port (Crankcase Intake, Rear Z < -1.1)
    const reedGroup = new THREE.Group();
    reedGroup.position.set(0, intakeReedY, -1.35);
    blockGroup.add(reedGroup);

    // Reed Cage Block (V-Wedge shape)
    const reedCageGeo = new THREE.ConeGeometry(0.48, 0.65, 4);
    reedCageGeo.rotateX(Math.PI / 2);
    const reedCage = registerMesh(new THREE.Mesh(reedCageGeo), realisticMats.reedBlock);
    reedGroup.add(reedCage);

    // Flexible Reed Petals (Carbon / Fiberglass petals that flex open on vacuum!)
    const petalGeo = new THREE.BoxGeometry(0.35, 0.02, 0.42);
    const topPetal = registerMesh(new THREE.Mesh(petalGeo), realisticMats.reedPetals);
    topPetal.position.set(0, 0.16, 0.12);
    reedGroup.add(topPetal);

    const bottomPetal = registerMesh(new THREE.Mesh(petalGeo), realisticMats.reedPetals);
    bottomPetal.position.set(0, -0.16, 0.12);
    reedGroup.add(bottomPetal);

    // Carburetor Bellmouth Intake Horn behind Reed Valve
    const carbCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, intakeReedY, -2.6),
      new THREE.Vector3(0, intakeReedY, -1.8),
      new THREE.Vector3(0, intakeReedY, -1.35)
    ]);
    const carbGeo = new THREE.TubeGeometry(carbCurve, 20, 0.32, 18, false);
    const carbMesh = registerMesh(new THREE.Mesh(carbGeo), realisticMats.polishedAlu, true);
    blockGroup.add(carbMesh);

    // =========================================================
    // D. CYLINDER HEAD DOME & CENTRAL SPARK PLUG
    // =========================================================
    const headGroup = new THREE.Group();
    headGroup.position.set(0, deckY, 0);
    engineRoot.add(headGroup);

    // High-Compression Squish Band Head Dome
    const headLathePts = [
      new THREE.Vector2(0.0, 0.45),                 // Central hemi dome
      new THREE.Vector2(pistonRadius * 0.55, 0.38), // Squish bowl transition
      new THREE.Vector2(pistonRadius * 0.92, 0.12), // Narrow squish band lip
      new THREE.Vector2(pistonRadius + 0.65, 0.12), // Outer deck flange
      new THREE.Vector2(pistonRadius + 0.65, 0.85), // Outer fin perimeter
      new THREE.Vector2(0.0, 0.85)                  // Top head center
    ];
    const headGeo = new THREE.LatheGeometry(headLathePts, 44);
    const headMesh = registerMesh(new THREE.Mesh(headGeo), realisticMats.castAluFins, true);
    headGroup.add(headMesh);

    // Cylinder Head Radial Cooling Spikes / Top Fins
    for (let tf = 0; tf < 6; tf++) {
      const topFinGeo = new THREE.CylinderGeometry(pistonRadius + 0.72 - tf * 0.08, pistonRadius + 0.72 - tf * 0.08, 0.055, 36);
      const topFin = registerMesh(new THREE.Mesh(topFinGeo), realisticMats.castAluFins, true);
      topFin.position.y = 0.92 + tf * 0.14;
      headGroup.add(topFin);
    }

    // Central Spark Plug
    const sparkPlugSub = new THREE.Group();
    sparkPlugSub.position.set(0, 1.45, 0);
    headGroup.add(sparkPlugSub);

    const sparkHexGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.35, 6);
    const sparkHex = registerMesh(new THREE.Mesh(sparkHexGeo), realisticMats.sparkHex);
    sparkPlugSub.add(sparkHex);

    const sparkCeramicGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.65, 20);
    sparkCeramicGeo.translate(0, 0.45, 0);
    const sparkCeramic = registerMesh(new THREE.Mesh(sparkCeramicGeo), realisticMats.sparkCeramic);
    sparkPlugSub.add(sparkCeramic);

    // Spark Flash Mesh & Light
    const sparkFlashMat = new THREE.MeshBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const sparkFlashGeo = new THREE.SphereGeometry(0.24, 16, 16);
    const sparkFlashMesh = new THREE.Mesh(sparkFlashGeo, sparkFlashMat);
    sparkFlashMesh.position.set(0, 0.45, 0);
    headGroup.add(sparkFlashMesh);

    const combustionLight = new THREE.PointLight(0xff6600, 0, 10);
    combustionLight.position.set(0, 0.45, 0);
    headGroup.add(combustionLight);

    // Internal Combustion Fireball Mesh inside Cylinder Head Dome
    const fireballGeo = new THREE.SphereGeometry(pistonRadius * 0.88, 24, 24);
    const fireballMat = new THREE.MeshBasicMaterial({
      color: 0xff5500,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const fireballMesh = new THREE.Mesh(fireballGeo, fireballMat);
    fireballMesh.position.set(0, 0.35, 0);
    headGroup.add(fireballMesh);

    // =========================================================
    // E. 2-STROKE TUNED EXPANSION CHAMBER EXHAUST (KNALPOT PERUT 2-TAK)
    // Header -> Expanding Cone (Diffuser) -> Belly Chamber -> Converging Cone (Baffle) -> Stinger & Silencer!
    // =========================================================
    const exhaustSystemGroup = new THREE.Group();
    engineRoot.add(exhaustSystemGroup);

    // Sculpted Tuned Pipe Centerline Curve (Originates at Exhaust Port X > 0, curves out into belly, loops back to silencer)
    const pipePoints = [
      new THREE.Vector3(pistonRadius + 0.12, exhaustPortY, 0),        // Port flange
      new THREE.Vector3(1.75, exhaustPortY - 0.15, 0),                // Header pipe start
      new THREE.Vector3(2.65, exhaustPortY - 0.55, 0.25),             // Header pipe curve
      new THREE.Vector3(3.35, exhaustPortY - 1.25, 0.45),             // Diffuser cone start (expanding)
      new THREE.Vector3(3.65, exhaustPortY - 2.15, 0.35),             // Belly center (thickest resonance chamber)
      new THREE.Vector3(3.25, exhaustPortY - 2.95, -0.15),            // Baffle cone start (converging)
      new THREE.Vector3(2.35, exhaustPortY - 3.45, -0.65),            // Stinger nozzle exit
      new THREE.Vector3(1.15, exhaustPortY - 3.75, -1.05),            // Stinger pipe
      new THREE.Vector3(-0.65, exhaustPortY - 3.85, -1.35)            // Silencer canister
    ];

    const pipeCurve = new THREE.CatmullRomCurve3(pipePoints);

    // Custom Swept Geometry along pipeCurve with Variable Radius (Hydroformed cone taper)
    const pipeSteps = 56;
    const pipeRadPts = [];
    for (let i = 0; i <= pipeSteps; i++) {
      const u = i / pipeSteps;
      let r = 0.24; // Header radius
      if (u >= 0.22 && u < 0.48) {
        // Divergent Cone (Expanding diffuser)
        const prog = (u - 0.22) / 0.26;
        r = 0.24 + prog * 0.48; // Expands to 0.72
      } else if (u >= 0.48 && u < 0.62) {
        // Maximum Belly chamber
        r = 0.72;
      } else if (u >= 0.62 && u < 0.78) {
        // Convergent Cone (Reflective baffle)
        const prog = (u - 0.62) / 0.16;
        r = 0.72 - prog * 0.50; // Drops to 0.22
      } else if (u >= 0.78 && u < 0.88) {
        // Stinger tube
        r = 0.20;
      } else {
        // Carbon Silencer Canister
        r = 0.36;
      }
      pipeRadPts.push(r);
    }

    // Build swept variable-radius tube geometry
    const pipeGeo = new THREE.BufferGeometry();
    const posArr = [];
    const normArr = [];
    const indexArr = [];
    const radialSegs = 20;

    for (let i = 0; i <= pipeSteps; i++) {
      const u = i / pipeSteps;
      const centerPt = pipeCurve.getPoint(u);
      const tangent = pipeCurve.getTangent(u);
      const normal = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize();
      if (normal.lengthSq() < 0.1) normal.set(0, 0, 1);
      const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
      const r = pipeRadPts[i];

      for (let j = 0; j <= radialSegs; j++) {
        const theta = (j / radialSegs) * Math.PI * 2;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        const px = centerPt.x + (normal.x * cosT + binormal.x * sinT) * r;
        const py = centerPt.y + (normal.y * cosT + binormal.y * sinT) * r;
        const pz = centerPt.z + (normal.z * cosT + binormal.z * sinT) * r;
        posArr.push(px, py, pz);

        const nx = normal.x * cosT + binormal.x * sinT;
        const ny = normal.y * cosT + binormal.y * sinT;
        const nz = normal.z * cosT + binormal.z * sinT;
        normArr.push(nx, ny, nz);
      }
    }

    for (let i = 0; i < pipeSteps; i++) {
      for (let j = 0; j < radialSegs; j++) {
        const a = i * (radialSegs + 1) + j;
        const b = (i + 1) * (radialSegs + 1) + j;
        const c = (i + 1) * (radialSegs + 1) + (j + 1);
        const d = i * (radialSegs + 1) + (j + 1);
        indexArr.push(a, b, d);
        indexArr.push(b, c, d);
      }
    }

    pipeGeo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    pipeGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normArr, 3));
    pipeGeo.setIndex(indexArr);

    const expansionPipeMesh = registerMesh(
      new THREE.Mesh(pipeGeo),
      realisticMats.tunedExpansionChamber,
      false
    );
    exhaustSystemGroup.add(expansionPipeMesh);

    // Tuned Pipe Internal Reflection Pulse Wave (Glows when reflected wave hits exhaust port!)
    const pulseWaveMat = new THREE.MeshBasicMaterial({
      color: 0xf97316,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const pulseWaveMesh = new THREE.Mesh(pipeGeo, pulseWaveMat);
    exhaustSystemGroup.add(pulseWaveMesh);

    // =========================================================
    // F. SWIRLING FUEL-AIR-OIL MIXTURE & SCHNÜRLE LOOP SCAVENGING PARTICLES
    // =========================================================
    const gasParticlesGroup = new THREE.Group();
    engineRoot.add(gasParticlesGroup);

    const particleCount = 130;
    const particleGeo = new THREE.SphereGeometry(0.055, 8, 8);
    const particles = [];

    for (let i = 0; i < particleCount; i++) {
      const pMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8, // Fresh blue air-fuel-oil 2-stroke mixture
        transparent: true,
        opacity: 0.85
      });
      const pMesh = new THREE.Mesh(particleGeo, pMat);
      gasParticlesGroup.add(pMesh);
      particles.push({
        mesh: pMesh,
        mat: pMat,
        phase: Math.random(),
        radiusFrac: 0.2 + Math.random() * 0.75,
        angleOffset: Math.random() * Math.PI * 2,
        heightFrac: Math.random()
      });
    }

    // =========================================================
    // G. INTERACTIVE CAMERA ORBIT & PAN CONTROLS
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
        4.5,
        Math.min(24, camControl.current.radius + e.deltaY * 0.01)
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

    // Safe Curve Sampler to guarantee t is strictly [0.0001, 0.9999]
    const sampleCurve = (curve, u) => {
      if (!curve) return new THREE.Vector3(0, 0, 0);
      const safeU = Math.max(0.0001, Math.min(0.9999, isNaN(u) ? 0.5 : (((u % 1.0) + 1.0) % 1.0)));
      return curve.getPoint(safeU);
    };

    // =========================================================
    // H. 2-STROKE THERMODYNAMICS & ANIMATION KINEMATICS LOOP
    // =========================================================
    let reqId;
    let lastTime = performance.now();
    let uiTimer = 0;
    let lastCutawayState = null;

    const animate = (now) => {
      reqId = requestAnimationFrame(animate);
      const currentTime = typeof now === 'number' && !isNaN(now) ? now : performance.now();
      const dt = Math.max(0.0001, Math.min(Math.abs(currentTime - lastTime) / 1000, 0.1));
      lastTime = currentTime;

      const params = simParams.current;

      // 1. Shading Modes & Opacity
      realisticMats.cylinderBarrelTrans.opacity = params.blockOpacity;
      realisticMats.cylinderLinerSteel.opacity = Math.min(0.85, params.blockOpacity + 0.06);
      realisticMats.crankcaseTrans.opacity = Math.max(0.12, params.blockOpacity - 0.04);
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

      // 2. 180° Cylinder Cutaway
      if (lastCutawayState !== params.cutawayMode) {
        lastCutawayState = params.cutawayMode;
        cylinderLiner.geometry = params.cutawayMode ? cutLinerGeo : fullLinerGeo;
        cylinderBarrel.geometry = params.cutawayMode ? cutBarrelGeo : fullBarrelGeo;
        crankcaseMesh.geometry = params.cutawayMode ? cutCrankcaseGeo : fullCrankcaseGeo;
        pistonCrown.geometry = params.cutawayMode ? cutawayPistonGeo : fullPistonGeo;
        finRings.forEach((r) => {
          r.mesh.geometry = params.cutawayMode ? r.cutFin : r.fullFin;
        });
      }

      // 3. Exploded View & Component Visibility
      const exp = params.exploded;
      blockGroup.visible = params.showBlock;
      headGroup.visible = params.showHead;
      exhaustSystemGroup.visible = params.showExhaustPipe;
      gasParticlesGroup.visible = params.showGasFlow;

      crankGroup.position.y = -exp * 1.35;
      blockGroup.position.z = -exp * 1.5;
      headGroup.position.y = deckY + exp * 1.55;
      exhaustSystemGroup.position.x = exp * 1.8;
      reedGroup.position.z = -1.35 - exp * 1.25;

      if (params.autoRotateCam && !camControl.current.isDragging) {
        camControl.current.theta += dt * 0.32;
        updateCameraPosition();
      }

      // 4. Advance Crankshaft Angle (0 to 2*PI for 360-degree 2-Stroke Cycle)
      if (params.isPlaying) {
        const omega = (params.rpm * 2 * Math.PI) / 60;
        crankThetaRef.current = (crankThetaRef.current + omega * dt) % (2 * Math.PI);
      }

      const theta = crankThetaRef.current; // 0 to 2*PI
      const deg360 = ((theta * 180) / Math.PI) % 360;

      // 5. Exact Slider-Crank Kinematics
      const pinX = crankRadius * Math.sin(theta);
      const pinY = crankRadius * Math.cos(theta);
      crankGroup.rotation.z = -theta;

      const underSqrt = Math.max(0.001, rodLength * rodLength - pinX * pinX);
      const pistonY = pinY + Math.sqrt(underSqrt);

      pistonAssembly.position.set(0, pistonY - exp * 0.35, 0);

      rodGroup.position.set(pinX, pinY - exp * 0.75, 0);
      const rodAngle = Math.asin(pinX / rodLength);
      rodGroup.rotation.z = rodAngle;

      // 6. 2-Stroke Port Status & Reed Valve Flexing
      const pistonTopY = pistonY + 0.55;
      const isExhaustPortOpen = pistonTopY < exhaustPortY;
      const isTransferPortOpen = pistonTopY < transferPortY;
      // In a 2-stroke, reed valve opens when piston moves UP (180° to 360°), pulling crankcase vacuum!
      const isCrankcaseIntakeActive = deg360 > 185 && deg360 < 355;
      const reedFlex = isCrankcaseIntakeActive ? Math.sin(((deg360 - 185) / 170) * Math.PI) * 0.16 : 0;
      topPetal.rotation.x = -reedFlex;
      bottomPetal.rotation.x = reedFlex;

      // 7. Combustion, Spark, Chamber Temperature & Tuned Pipe Pulse
      let simCylPressure = 1.0;
      let simCrankcasePressure = 1.0;
      let simTemp = 85;
      let simHp = 12;

      // Spark Ignition at Top Dead Center (352° - 360° / 0° - 15°)
      let sparkVal = 0;
      if (deg360 >= 352 || deg360 <= 15) {
        const sparkPhase = deg360 >= 352 ? (deg360 - 352) / 23 : (deg360 + 8) / 23;
        sparkVal = Math.sin(sparkPhase * Math.PI);
      }
      sparkFlashMat.opacity = sparkVal;
      const sparkScale = 0.6 + sparkVal * 1.2;
      sparkFlashMesh.scale.set(sparkScale, sparkScale, sparkScale);

      // Power Stroke Fireball (0° to 110°)
      if (deg360 <= 110) {
        const pwrProg = deg360 / 110;
        const fireIntensity = Math.pow(Math.max(0, 1 - pwrProg), 1.6);
        fireballMat.opacity = fireIntensity * 0.90;
        fireballMat.color.lerpColors(
          new THREE.Color(0xffffff),
          new THREE.Color(0xff4500),
          pwrProg
        );
        combustionLight.intensity = fireIntensity * 7.5;

        // Piston drops -> Crankcase pressure rises (Primary Compression!)
        simCylPressure = 12.0 + fireIntensity * 72.0; // Up to ~84 Bar combustion pressure!
        simCrankcasePressure = 1.1 + pwrProg * 0.55;  // Pre-compressed up to 1.65 Bar
        simTemp = Math.round(750 + fireIntensity * 1250);
        simHp = Math.round(35 + fireIntensity * 28);
      } else if (deg360 <= 180) {
        // Scavenging & Exhaust Port Blowdown (110° to 180°)
        fireballMat.opacity = 0;
        combustionLight.intensity = 0;

        simCylPressure = 2.4 - ((deg360 - 110) / 70) * 1.2;
        simCrankcasePressure = 1.65 - ((deg360 - 110) / 70) * 0.45; // Drops as transfer ports open
        simTemp = 480;
        simHp = 30;
      } else {
        // Compression & Crankcase Intake Stroke (180° to 360°)
        fireballMat.opacity = 0;
        combustionLight.intensity = 0;

        const compProg = (deg360 - 180) / 180;
        simCylPressure = 1.2 + Math.pow(compProg, 2.8) * 16.5; // Compressed to ~18 Bar before spark
        simCrankcasePressure = 0.88; // Crankcase vacuum while drawing fuel through reed valve!
        simTemp = Math.round(180 + compProg * 420);
        simHp = 18;
      }

      // Tuned Expansion Chamber Resonance Pulse Wave
      // Positive reflected pressure wave travels back from the baffle cone to port at ~145° - 195°
      if (deg360 >= 135 && deg360 <= 210) {
        const waveProg = Math.sin(((deg360 - 135) / 75) * Math.PI);
        pulseWaveMat.opacity = waveProg * 0.82;
      } else {
        pulseWaveMat.opacity = 0;
      }

      // 8. 2-Stroke Loop Scavenging & Exhaust Gas Particles
      const flowSpeed = Math.max(0.4, params.rpm / 240);
      particles.forEach((p, idx) => {
        if (params.isPlaying) {
          p.phase = (((p.phase + dt * 1.1 * flowSpeed) % 1.0) + 1.0) % 1.0;
        }
        const t = Math.max(0.0001, Math.min(0.9999, isNaN(p.phase) ? 0.5 : p.phase));

        if (deg360 > 180) {
          // Intake into crankcase through reed valve (Blue-cyan fresh mixture)
          p.mat.color.setHex(0x38bdf8);
          if (idx % 2 === 0) {
            const pt = sampleCurve(carbCurve, t);
            p.mesh.position.set(
              pt.x + Math.sin(t * 12 + idx) * 0.08,
              pt.y + Math.cos(t * 10 + idx) * 0.08,
              pt.z
            );
            p.mat.opacity = 0.85;
          } else {
            // Swirling in lower crankcase around stuffer webs
            const ang = p.angleOffset + t * 6.5;
            const r = p.radiusFrac * 1.1;
            p.mesh.position.set(Math.cos(ang) * r, Math.sin(ang) * r, -0.2 + (idx % 3) * 0.2);
            p.mat.opacity = 0.65;
          }
        } else if (isTransferPortOpen && idx < 50) {
          // Loop Scavenging: Shoots UP transfer channels into cylinder towards head dome!
          p.mat.color.setHex(0x67e8f9);
          const curveToUse = idx % 2 === 0 ? leftTransferCurve : rightTransferCurve;
          const pt = sampleCurve(curveToUse, t);
          p.mesh.position.set(pt.x, pt.y, pt.z);
          p.mat.opacity = 0.95;
        } else if (isExhaustPortOpen && idx >= 50 && idx < 95) {
          // Burnt exhaust gas exiting through the tuned expansion chamber
          p.mat.color.setHex(0xf97316);
          const pt = sampleCurve(pipeCurve, t);
          p.mesh.position.set(
            pt.x + Math.sin(t * 15 + idx) * 0.06,
            pt.y + Math.cos(t * 12 + idx) * 0.06,
            pt.z
          );
          p.mat.opacity = 0.82;
        } else {
          // Swirling gas in upper cylinder volume
          const swirlAng = p.angleOffset + t * 4.5;
          const rad = p.radiusFrac * (pistonRadius * 0.85);
          const y = pistonTopY + 0.12 + p.heightFrac * Math.max(0.15, deckY - pistonTopY);
          p.mesh.position.set(Math.cos(swirlAng) * rad, y, Math.sin(swirlAng) * rad);
          p.mat.color.setHex(deg360 < 110 ? 0xff5500 : 0x94a3b8);
          p.mat.opacity = 0.72;
        }
      });

      // 9. Throttled React Telemetry State Updates
      uiTimer += dt;
      if (uiTimer > 0.06) {
        uiTimer = 0;
        const roundedDeg = Math.round(deg360) % 360;
        setCrankDeg(roundedDeg);
        if (params.isPlaying) {
          setManualDeg(roundedDeg);
        }
        setActiveStrokeIdx(roundedDeg < 180 ? 0 : 1);
        setCylPressureBar(Number(simCylPressure.toFixed(1)));
        setCrankcasePressureBar(Number(simCrankcasePressure.toFixed(2)));
        setCylTempC(simTemp);
        setInstantPowerHp(simHp);
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
  const currentStroke = TWO_STROKE_SPECS.strokes[activeStrokeIdx] || TWO_STROKE_SPECS.strokes[0];

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
          TOP-LEFT: HEADER & 2-STROKE CYCLE MONITOR
      ========================================================= */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2.5 max-w-xs sm:max-w-md pointer-events-none">
        <div className={`${cardClass} rounded-2xl p-4 pointer-events-auto transition-colors duration-300`}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-orange-500/15 border border-orange-500/30">
                <Repeat className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-orange-500 mb-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
                  Schnürle Loop Scavenging • Reed Valve 2T
                </span>
                <h1 className={`text-base sm:text-lg font-extrabold tracking-tight ${headingText}`}>
                  SIMULASI MESIN 2-TAK
                </h1>
              </div>
            </div>

            {/* Camera View Presets */}
            <div className="hidden sm:flex items-center gap-1">
              {[
                { id: 'iso', label: 'ISO' },
                { id: 'front', label: 'Depan' },
                { id: 'side', label: 'Samping' },
                { id: 'ports', label: 'Port Bilas' }
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

          {/* Interactive 2-Stroke Single 360-degree Cycle Selector */}
          <div className={`mt-2 pt-2.5 border-t ${dividerClass}`}>
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider mb-1.5">
              <span className={`font-bold flex items-center gap-1 ${mutedText}`}>
                <Activity className="w-3.5 h-3.5 text-orange-500" /> Siklus 2-Langkah (Klik Tahap)
              </span>
              <span className="font-mono font-bold text-orange-500">
                {crankDeg}° / 360° (1 Putaran = 1 Siklus)
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {TWO_STROKE_SPECS.strokes.map((st, idx) => {
                const isActive = activeStrokeIdx === idx;
                return (
                  <button
                    key={st.id}
                    onClick={() => jumpToStroke(idx)}
                    className={`flex flex-col items-center py-2 px-2 rounded-xl border text-center transition-all cursor-pointer active:scale-95 ${
                      isActive ? st.activeBg : subCardClass
                    }`}
                  >
                    <span className={`text-[9px] font-bold uppercase ${isActive ? 'text-white/90' : mutedText}`}>
                      Langkah {st.index} ({st.range[0]}°–{st.range[1]}°)
                    </span>
                    <span className={`text-xs font-extrabold tracking-tight ${isActive ? 'text-white' : headingText}`}>
                      {st.id === 'power_transfer' ? 'Usaha & Pembilasan' : 'Kompresi & Hisap'}
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
                  {activeStrokeIdx === 0 ? 'Piston ↓ (TMA→TMB)' : 'Piston ↑ (TMB→TMA)'}
                </span>
              </div>
              <p className={`text-[11px] leading-relaxed ${bodyText}`}>
                {currentStroke.desc}
              </p>
            </div>
          </div>

          {/* Live 2-Stroke Telemetry Readouts */}
          <div className={`grid grid-cols-4 gap-1.5 text-xs border-t ${dividerClass} pt-2.5 mt-2.5`}>
            <div className={`${subCardClass} rounded-xl px-2 py-1.5`}>
              <span className={`${mutedText} block text-[9px] uppercase font-bold`}>Putaran</span>
              <span className="font-mono text-sm font-extrabold text-orange-500">{isPlaying ? rpm : 0}</span>
              <span className={`text-[9px] ml-0.5 ${mutedText}`}>RPM</span>
            </div>
            <div className={`${subCardClass} rounded-xl px-2 py-1.5`}>
              <span className={`${mutedText} block text-[9px] uppercase font-bold`}>Tek. Silinder</span>
              <span className={`font-mono text-sm font-extrabold ${headingText}`}>{cylPressureBar}</span>
              <span className={`text-[9px] ml-0.5 ${mutedText}`}>Bar</span>
            </div>
            <div className={`${subCardClass} rounded-xl px-2 py-1.5`}>
              <span className={`${mutedText} block text-[9px] uppercase font-bold`}>Bak Engkol</span>
              <span className="font-mono text-sm font-extrabold text-sky-500">{crankcasePressureBar}</span>
              <span className={`text-[9px] ml-0.5 ${mutedText}`}>Bar</span>
            </div>
            <div className={`${subCardClass} rounded-xl px-2 py-1.5`}>
              <span className={`${mutedText} block text-[9px] uppercase font-bold`}>Daya Puncak</span>
              <span className="font-mono text-sm font-extrabold text-emerald-500">{instantPowerHp}</span>
              <span className={`text-[9px] ml-0.5 ${mutedText}`}>HP</span>
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
                  <Scissors className="w-3.5 h-3.5" /> Belahan Port Bilas & Silinder
                </span>
                <span className="text-[10px] uppercase font-extrabold">
                  {cutawayMode ? 'AKTIF' : 'PENUH'}
                </span>
              </button>

              {[
                { label: 'Blok & Sirip', state: showBlock, setter: setShowBlock },
                { label: 'Head & Busi', state: showHead, setter: setShowHead },
                { label: 'Knalpot Perut 2T', state: showExhaustPipe, setter: setShowExhaustPipe },
                { label: 'Aliran Gas/Oli', state: showGasFlow, setter: setShowGasFlow }
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
                  <Gauge className="w-3.5 h-3.5 text-orange-500" /> Putaran Mesin 2T
                </span>
                <span className="font-mono font-bold text-orange-500">{rpm} RPM</span>
              </div>
              <input
                type="range"
                min="40"
                max="11500"
                step="20"
                value={rpm}
                onChange={(e) => setRpm(Number(e.target.value))}
                className="w-full h-2 bg-gray-300 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
              <div className={`flex justify-between text-[9px] font-medium ${mutedText}`}>
                <button
                  onClick={() => { setRpm(80); setIsPlaying(true); }}
                  className="hover:text-orange-500 underline cursor-pointer"
                >
                  80 (Slow-Mo)
                </button>
                <button
                  onClick={() => { setRpm(1200); setIsPlaying(true); }}
                  className="hover:text-orange-500 underline cursor-pointer"
                >
                  1.2k (Idle)
                </button>
                <button
                  onClick={() => { setRpm(8500); setIsPlaying(true); }}
                  className="hover:text-orange-500 underline cursor-pointer font-bold text-orange-500"
                >
                  8.5k (Powerband)
                </button>
              </div>
            </div>

            {/* 2. Manual Crankshaft Angle Scrubber (0° - 360°) */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className={`${bodyText} font-semibold flex items-center gap-1.5`}>
                  <Compass className="w-3.5 h-3.5 text-orange-500" /> Sudut Kruk As (0°–360°)
                </span>
                <span className="font-mono font-bold text-orange-500">{crankDeg}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="359"
                step="1"
                value={manualDeg}
                onChange={(e) => handleManualAngleChange(Number(e.target.value))}
                className="w-full h-2 bg-gray-300 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
              <div className={`flex justify-between text-[9px] font-medium ${mutedText}`}>
                <span>0° Usaha</span>
                <span>180° TMB Bilas</span>
                <span>360°</span>
              </div>
            </div>

            {/* 3. Exploded Assembly View */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className={`${bodyText} font-semibold flex items-center gap-1.5`}>
                  <Maximize2 className="w-3.5 h-3.5 text-orange-500" /> Urai Bagian (Exploded)
                </span>
                <span className="font-mono font-bold text-orange-500">{Math.round(exploded * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.02"
                value={exploded}
                onChange={(e) => setExploded(Number(e.target.value))}
                className="w-full h-2 bg-gray-300 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
              <div className={`flex justify-between text-[9px] font-medium ${mutedText}`}>
                <span>0% Utuh</span>
                <span>Pemisahan CAD</span>
                <span>100% Terurai</span>
              </div>
            </div>

            {/* 4. Transparansi Silinder & Blok */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className={`${bodyText} font-semibold flex items-center gap-1.5`}>
                  <Sliders className="w-3.5 h-3.5 text-orange-500" /> Transparansi Silinder
                </span>
                <span className={`font-mono font-bold ${headingText}`}>
                  {Math.round(blockOpacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.95"
                step="0.02"
                value={blockOpacity}
                onChange={(e) => setBlockOpacity(Number(e.target.value))}
                className="w-full h-2 bg-gray-300 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
              <div className={`flex justify-between text-[9px] font-medium ${mutedText}`}>
                <span>Transparan</span>
                <span>Ketebalan Kaca</span>
                <span>Solid</span>
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
              setRpm(240);
              setExploded(0);
              setBlockOpacity(0.32);
              setCutawayMode(true);
              setRenderMode('realistic');
              setShowBlock(true);
              setShowHead(true);
              setShowExhaustPipe(true);
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
