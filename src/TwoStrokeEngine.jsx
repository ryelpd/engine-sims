import React, { useState, useEffect, useRef } from 'react';
import { Box, Grid3x3, Layers, Orbit, Pause, Play, RotateCcw, Sparkles } from 'lucide-react';
import * as THREE from 'three';

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
      short: 'Usaha dan pembilasan',
      rangeLabel: '0° sampai 180°',
      range: [0, 180],
      desc: 'Busi menyala di titik mati atas. Ledakan mendorong piston turun menghasilkan tenaga, sekaligus memampatkan campuran bahan bakar, udara, dan oli di bak engkol. Lubang buang terbuka, disusul lubang bilas yang menyemburkan campuran baru ke atas.'
    },
    {
      id: 'compression_intake',
      short: 'Kompresi dan hisap',
      rangeLabel: '180° sampai 360°',
      range: [180, 360],
      desc: 'Piston naik dari titik mati bawah ke titik mati atas. Saluran bilas dan buang tertutup, campuran di ruang bakar terkompresi. Kevakuman di bawah piston membuka katup buluh dan menghisap campuran baru ke bak engkol.'
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

  const resetCamera = () => {
    camControl.current.isDragging = false;
    setAutoRotateCam(false);
    camControl.current.theta = 0.58;
    camControl.current.phi = 1.32;
    camControl.current.radius = 12.5;
    camControl.current.target.set(0, 1.95, 0);
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

  const currentStroke = TWO_STROKE_SPECS.strokes[activeStrokeIdx] || TWO_STROKE_SPECS.strokes[0];

  const sheet = {
    panel: 'bg-white text-[#101828]',
    idle: 'bg-[#eef1f4] text-[#101828] hover:bg-[#e2e7ec]',
    chosen: 'bg-[#101828] text-white'
  };
  const hit = 'cursor-pointer text-base leading-snug focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fb6514]';

  return (
    <div className="relative w-full h-full overflow-hidden select-none font-sans">
      {/* Three.js 3D Viewport */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing" />

      {/* =========================================================
          TOP-LEFT: HEADER & 2-STROKE CYCLE MONITOR
      ========================================================= */}
      <div className="absolute top-4 left-4 z-10 max-h-[calc(100%-11rem)] w-[min(28rem,calc(100%-2rem))] overflow-y-auto pointer-events-none max-[720px]:max-h-[50%] max-[720px]:w-[calc(100%-2rem)]">
        <section
          aria-label="Mesin 2-tak"
          className={`pointer-events-auto flex flex-col gap-5 p-5 ${sheet.panel}`}
        >
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="m-0 text-[1.75rem] font-semibold leading-none tracking-[-0.03em]">
              Mesin 2-tak
            </h1>
            <p
              className="m-0 text-[1.75rem] font-semibold leading-none tracking-[-0.03em] tabular-nums"
              aria-label={`Sudut kruk as ${crankDeg} derajat`}
            >
              {crankDeg}°
            </p>
          </div>

          <p className="m-0 text-base leading-relaxed">
            Satu putaran menyelesaikan siklus. Campuran masuk lewat katup buluh dan naik dalam loop Schnürle.
          </p>

          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Tahap siklus">
            {TWO_STROKE_SPECS.strokes.map((st, idx) => {
              const isActive = activeStrokeIdx === idx;
              return (
                <button
                  key={st.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => jumpToStroke(idx)}
                  className={`cursor-pointer px-3 py-3 text-left text-base leading-snug focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fb6514] ${
                    isActive ? 'bg-[#fb6514] text-[#101828]' : sheet.idle
                  }`}
                >
                  <span className="block font-semibold">{st.short}</span>
                  <span className="block">{st.rangeLabel}</span>
                </button>
              );
            })}
          </div>

          <p className="m-0 text-base leading-relaxed">
            {currentStroke.desc}
          </p>

          <p className="m-0 grid grid-cols-2 gap-x-6 gap-y-1 text-base leading-snug">
            <span><span className="font-semibold tabular-nums">{isPlaying ? rpm : 0}</span> rpm</span>
            <span><span className="font-semibold tabular-nums">{cylPressureBar}</span> bar di silinder</span>
            <span><span className="font-semibold tabular-nums">{crankcasePressureBar}</span> bar di bak engkol</span>
            <span><span className="font-semibold tabular-nums">{instantPowerHp}</span> hp</span>
          </p>
        </section>
      </div>

      {/* =========================================================
          TOP-RIGHT: SHADING MODE & COMPONENT VISIBILITY
      ========================================================= */}
      <div className="pointer-events-none absolute top-4 right-4 z-10 w-[min(20rem,calc(100%-2rem))] max-[720px]:top-auto max-[720px]:bottom-44 max-[720px]:left-4 max-[720px]:right-4 max-[720px]:max-h-[28%] max-[720px]:w-auto max-[720px]:overflow-y-auto">
        <section
          aria-label="Engine view"
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
                  className={`flex w-full items-center gap-2 px-3 py-3 text-left ${hit} ${active ? 'bg-[#fb6514] text-[#101828]' : sheet.idle}`}
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
              className={`col-span-2 px-3 py-3 text-left ${hit} ${cutawayMode ? sheet.chosen : sheet.idle}`}
            >
              Cutaway
            </button>
            {[
              { label: 'Block & fins', state: showBlock, setter: setShowBlock },
              { label: 'Head & plug', state: showHead, setter: setShowHead },
              { label: 'Exhaust', state: showExhaustPipe, setter: setShowExhaustPipe },
              { label: 'Gas flow', state: showGasFlow, setter: setShowGasFlow }
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
          BOTTOM: SIMULATOR CONTROLS & MANUAL CRANK ANGLE SCRUBBER
      ========================================================= */}
      <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-10 flex flex-col items-stretch justify-between gap-3 lg:flex-row lg:items-end">
        <section
          aria-label="Simulation controls"
          className={`pointer-events-auto grid flex-1 grid-cols-1 gap-6 p-5 sm:grid-cols-2 xl:grid-cols-4 ${sheet.panel}`}
          style={{ colorScheme: 'light' }}
        >
          <div className="flex flex-col gap-2">
            <p className="m-0 text-base">
              <span className="font-semibold tabular-nums">{rpm}</span> rpm
            </p>
            <SquareRange
              min={40}
              max={11500}
              step={20}
              value={rpm}
              label="RPM"
              onChange={(e) => setRpm(Number(e.target.value))}
            />
            <div className="flex flex-wrap gap-2">
              {[
                { value: 80, label: '80 slow-mo' },
                { value: 1200, label: '1200 idle' },
                { value: 8500, label: '8500 powerband' }
              ].map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  aria-pressed={rpm === preset.value}
                  onClick={() => { setRpm(preset.value); setIsPlaying(true); }}
                  className={`px-2 py-1 ${hit} ${rpm === preset.value ? sheet.chosen : sheet.idle}`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="m-0 text-base">
              <span className="font-semibold tabular-nums">{crankDeg}°</span>
            </p>
            <SquareRange
              min={0}
              max={359}
              step={1}
              value={manualDeg}
              label="Crank angle"
              onChange={(e) => handleManualAngleChange(Number(e.target.value))}
            />
            <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-base">
              <span>0° power</span>
              <span>180° scavenge</span>
              <span>360°</span>
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="m-0 text-base">
              <span className="font-semibold tabular-nums">{Math.round(exploded * 100)}%</span> exploded
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

          <div className="flex flex-col gap-2">
            <p className="m-0 text-base">
              <span className="font-semibold tabular-nums">{Math.round(blockOpacity * 100)}%</span> solid
            </p>
            <SquareRange
              min={0.05}
              max={0.95}
              step={0.02}
              value={blockOpacity}
              label="Cylinder opacity"
              onChange={(e) => setBlockOpacity(Number(e.target.value))}
            />
            <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-base">
              <span>Clear</span>
              <span>Glass</span>
              <span>Solid</span>
            </p>
          </div>
        </section>

        <div className={`pointer-events-auto flex flex-wrap items-center gap-2 p-3 ${sheet.panel}`}>
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className={`inline-flex items-center gap-2 px-4 py-3 ${hit} ${isPlaying ? 'bg-[#fb6514] text-[#101828]' : sheet.chosen}`}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            aria-pressed={autoRotateCam}
            onClick={() => setAutoRotateCam(!autoRotateCam)}
            className={`inline-flex items-center gap-2 px-3 py-3 ${hit} ${autoRotateCam ? sheet.chosen : sheet.idle}`}
          >
            <Orbit className="h-4 w-4" />
            Orbit
          </button>
          <button
            type="button"
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
              resetCamera();
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
