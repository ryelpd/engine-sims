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
      short: 'Intake',
      rangeLabel: '0°–180°',
      range: [0, 180],
      desc: 'The intake valve opens and the piston moves from TDC to BDC, drawing in boosted air with swirl. No fuel enters on this stroke.'
    },
    {
      id: 'compression',
      short: 'Compression',
      rangeLabel: '180°–360°',
      range: [180, 360],
      desc: 'Both valves stay closed. The piston rises and compresses the air into the omega bowl to about 48 bar and 720°C, past the auto-ignition point of diesel.'
    },
    {
      id: 'power',
      short: 'Injection',
      rangeLabel: '360°–540°',
      range: [360, 540],
      desc: 'The common-rail injector sprays diesel through six holes into the hot air. The fuel auto-ignites without a spark plug.'
    },
    {
      id: 'exhaust',
      short: 'Exhaust',
      rangeLabel: '540°–720°',
      range: [540, 720],
      desc: 'The exhaust valve opens and the piston rises, pushing spent gas toward the exhaust manifold and the turbocharger turbine.'
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

  const resetCamera = () => {
    camControl.current.isDragging = false;
    setAutoRotateCam(false);
    camControl.current.theta = 0.54;
    camControl.current.phi = 1.30;
    camControl.current.radius = 12.8;
    camControl.current.target.set(0, 2.35, 0);
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
    // G. VOLUMETRIC AIR, ADIABATIC HEAT & FUEL INJECTION SPRITE SYSTEM
    // =========================================================
    const gasParticlesGroup = new THREE.Group();
    engineRoot.add(gasParticlesGroup);

    const createSoftGlowTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
      grad.addColorStop(0.18, 'rgba(255, 255, 255, 0.88)');
      grad.addColorStop(0.48, 'rgba(255, 255, 255, 0.32)');
      grad.addColorStop(0.78, 'rgba(255, 255, 255, 0.08)');
      grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      return tex;
    };

    const glowTexture = createSoftGlowTexture();

    const particleCount = 145;
    const particles = [];

    for (let i = 0; i < particleCount; i++) {
      const isHaze = i % 5 === 0;
      const baseScale = isHaze ? (0.50 + Math.random() * 0.28) : (0.22 + Math.random() * 0.14);
      const baseOpacity = isHaze ? 0.36 : 0.68;

      const pMat = new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0x38bdf8,
        transparent: true,
        opacity: baseOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const sprite = new THREE.Sprite(pMat);
      sprite.scale.set(baseScale, baseScale, 1);
      gasParticlesGroup.add(sprite);

      particles.push({
        sprite,
        mat: pMat,
        phase: Math.random(),
        radiusFrac: 0.15 + Math.random() * 0.75,
        angleOffset: Math.random() * Math.PI * 2,
        heightFrac: Math.random(),
        baseScale,
        baseOpacity,
        isHaze
      });
    }

    // High-Pressure Common-Rail Fuel Spray Droplets into the Omega Toroidal Bowl
    const fuelSprayDroplets = [];
    for (let i = 0; i < 24; i++) {
      const dropMat = new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const dropSprite = new THREE.Sprite(dropMat);
      gasParticlesGroup.add(dropSprite);
      fuelSprayDroplets.push({
        sprite: dropSprite,
        mat: dropMat,
        coneAngle: (i % 6) * ((Math.PI * 2) / 6),
        seed: Math.random() * Math.PI * 2,
        spd: 1.2 + Math.random() * 1.6
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
    // Safe Curve Sampler to guarantee t is within [0.0001, 0.9999] and never negative or NaN
    const sampleCurve = (curve, u) => {
      if (!curve) return new THREE.Vector3(0, 0, 0);
      const safeU = Math.max(0.0001, Math.min(0.9999, isNaN(u) ? 0.5 : (((u % 1.0) + 1.0) % 1.0)));
      return curve.getPoint(safeU);
    };

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

      // 8. Update Swirling Air, Fuel Droplets & Exhaust Gas Sprites
      const flowSpeed = Math.max(0.35, params.rpm / 160);
      particles.forEach((p, idx) => {
        if (params.isPlaying) {
          p.phase = (((p.phase + dt * 0.9 * flowSpeed) % 1.0) + 1.0) % 1.0;
        }
        const t = Math.max(0.0001, Math.min(0.9999, isNaN(p.phase) ? 0.5 : p.phase));

        if (deg720 < 180) {
          // Stroke 1: Pure Air Intake from Left Manifold + High-Swirl Vortex into Cylinder
          p.mat.color.setHex(0x38bdf8); // Pure boosted air (Cyan-Blue)
          if (idx % 2 === 0) {
            const pt = sampleCurve(intakeCurve, t);
            p.sprite.position.set(
              pt.x,
              pt.y + Math.sin(t * 10 + idx) * 0.08,
              pt.z + Math.cos(t * 8 + idx) * 0.08
            );
            p.mat.opacity = p.baseOpacity * Math.sin(t * Math.PI);
          } else {
            const swirlAngle = p.angleOffset + deg720 * 0.055 + t * 5.0;
            const r = p.radiusFrac * (pistonRadius * 0.82);
            const y = deckY - 0.15 - t * (deckY - pistonTopY - 0.15);
            p.sprite.position.set(Math.cos(swirlAngle) * r, y, Math.sin(swirlAngle) * r);
            p.mat.opacity = p.baseOpacity * 0.88;
          }
          p.sprite.scale.set(p.baseScale, p.baseScale, 1);
        } else if (deg720 < 360) {
          // Stroke 2: Adiabatic Compression into the Piston's Omega (ω) Toroidal Bowl
          const compProg = (deg720 - 180) / 180;
          p.mat.color.lerpColors(
            new THREE.Color(0x38bdf8),
            new THREE.Color(0xfbbf24),
            compProg
          );
          const swirlAngle = p.angleOffset + compProg * 9.0; // Intense swirl inside Omega bowl
          const maxR = THREE.MathUtils.lerp(pistonRadius * 0.82, 0.54, compProg);
          const r = p.radiusFrac * maxR;
          const bowlBottomY = pistonY + 0.22;
          const y = bowlBottomY + p.heightFrac * Math.max(0.18, deckY - bowlBottomY - 0.08);
          p.sprite.position.set(Math.cos(swirlAngle) * r, y, Math.sin(swirlAngle) * r);
          p.mat.opacity = (p.baseOpacity * 0.9) + compProg * 0.35;
          const s = p.baseScale * (1.0 - compProg * 0.25);
          p.sprite.scale.set(s, s, 1);
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
          p.sprite.position.set(Math.cos(swirlAngle) * r, y, Math.sin(swirlAngle) * r);
          p.mat.opacity = Math.max(0.15, (p.baseOpacity * 1.25) - pwrProg * 0.55);
          const s = p.baseScale * (1.35 - pwrProg * 0.4);
          p.sprite.scale.set(s, s, 1);
        } else {
          // Stroke 4: Diesel Exhaust Expulsion out Right Runner
          p.mat.color.setHex(0x94a3b8);
          if (idx % 2 === 0) {
            const pt = sampleCurve(exhaustCurve, t);
            p.sprite.position.set(
              pt.x,
              pt.y + Math.sin(t * 10 + idx) * 0.08,
              pt.z + Math.cos(t * 8 + idx) * 0.08
            );
            p.mat.opacity = p.baseOpacity * 0.85 * Math.sin(t * Math.PI);
          } else {
            const swirlAngle = p.angleOffset + t * 3.0;
            const r = p.radiusFrac * (pistonRadius * 0.78);
            const y = pistonTopY + 0.12 + t * Math.max(0.15, deckY - pistonTopY - 0.15);
            p.sprite.position.set(Math.cos(swirlAngle) * r, y, Math.sin(swirlAngle) * r);
            p.mat.opacity = p.baseOpacity * 0.72;
          }
          const s = p.baseScale * (1.0 + t * 0.4);
          p.sprite.scale.set(s, s, 1);
        }
      });

      // Update High-Pressure Common-Rail Fuel Injection Spray Droplets into Omega Bowl
      const injectActive = (deg720 >= 350 && deg720 <= 410)
        ? Math.sin(((deg720 - 350) / 60) * Math.PI)
        : 0;

      fuelSprayDroplets.forEach((fd) => {
        if (injectActive > 0.05) {
          const prog = ((now * 0.0035 * fd.spd + fd.seed) % 1.0);
          const sprayDist = prog * 0.75;
          const downwardSlope = -0.52;
          const sx = Math.cos(fd.coneAngle) * sprayDist;
          const sz = Math.sin(fd.coneAngle) * sprayDist;
          const sy = deckY + 0.12 + sprayDist * downwardSlope;

          fd.sprite.position.set(sx, sy, sz);
          const s = (0.12 + (1 - prog) * 0.16) * injectActive;
          fd.sprite.scale.set(s, s, 1);
          fd.mat.opacity = injectActive * (1 - prog) * 0.92;
          fd.mat.color.setHex(prog < 0.25 ? 0xffffff : 0xfde047);
        } else {
          fd.mat.opacity = 0;
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
      glowTexture.dispose();
      renderer.dispose();
    };
  }, []);

  const currentStroke = DIESEL_SPECS.strokes[activeStrokeIdx] || DIESEL_SPECS.strokes[0];
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
          TOP-LEFT: HEADER & 4-STROKE DIESEL CYCLE MONITOR
      ========================================================= */}
      <div className="pointer-events-none absolute top-4 left-4 z-10 max-h-[calc(100%-11rem)] w-[min(28rem,calc(100%-2rem))] overflow-y-auto max-[720px]:max-h-[50%] max-[720px]:w-[calc(100%-2rem)]">
        <section
          aria-label="Diesel"
          className={`pointer-events-auto flex flex-col gap-5 p-5 ${sheet.panel}`}
        >
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="m-0 text-[1.75rem] font-semibold leading-none tracking-[-0.03em]">
              Diesel
            </h1>
            <p
              className="m-0 text-[1.75rem] font-semibold leading-none tracking-[-0.03em] tabular-nums"
              aria-label={`Crank angle ${crankDeg} degrees`}
            >
              {crankDeg}°
            </p>
          </div>

          <p className="m-0 text-base leading-relaxed">
            Two revolutions complete the cycle. Diesel is injected into hot compressed air and auto-ignites.
          </p>

          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Cycle">
            {DIESEL_SPECS.strokes.map((st, idx) => {
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

          <p className="m-0 min-h-36 text-base leading-relaxed">
            {currentStroke.desc}
          </p>

          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Engine speed', value: isPlaying ? rpm : 0, unit: 'rpm' },
              { label: 'Cylinder pressure', value: cylPressureBar, unit: 'bar' },
              { label: 'Air temperature', value: cylTempC, unit: '°C' },
              { label: 'Torque', value: instantTorqueNm, unit: 'Nm' }
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
            <button
              type="button"
              aria-pressed={glowPlugActive}
              onClick={() => setGlowPlugActive(!glowPlugActive)}
              className={`col-span-2 px-3 py-3 text-left ${hit} ${glowPlugActive ? sheet.chosen : sheet.idle}`}
            >
              Glow plug
            </button>
            {[
              { label: 'Block', state: showBlock, setter: setShowBlock },
              { label: 'Head & injector', state: showHead, setter: setShowHead },
              { label: 'Valves & cam', state: showValvetrain, setter: setShowValvetrain },
              { label: 'Fuel spray', state: showGasFlow, setter: setShowGasFlow }
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

      <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-10 flex flex-col items-stretch justify-between gap-3 lg:flex-row lg:items-end">
        <section
          aria-label="Simulation controls"
          className={`pointer-events-auto grid flex-1 grid-cols-1 gap-6 p-5 sm:grid-cols-2 xl:grid-cols-5 ${sheet.panel}`}
          style={{ colorScheme: 'light' }}
        >
          <div className="flex flex-col gap-2">
            <p className="m-0 text-base">
              <span className="font-semibold tabular-nums">{rpm}</span> rpm
            </p>
            <SquareRange
              min={30}
              max={3200}
              step={10}
              value={rpm}
              label="RPM"
              onChange={(e) => setRpm(Number(e.target.value))}
            />
            <div className="flex flex-wrap gap-2">
              {[
                { value: 60, label: '60 slow-mo' },
                { value: 750, label: '750 idle' },
                { value: 2400, label: '2400 peak' }
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
              <span className="font-semibold tabular-nums">{railPressureBar}</span> bar rail
            </p>
            <SquareRange
              min={1200}
              max={2500}
              step={50}
              value={railPressureBar}
              label="Rail pressure"
              onChange={(e) => setRailPressureBar(Number(e.target.value))}
            />
            <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-base">
              <span>1200 bar</span>
              <span>6-hole piezo</span>
              <span>2500 bar</span>
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="m-0 text-base">
              <span className="font-semibold tabular-nums">{crankDeg}°</span>
            </p>
            <SquareRange
              min={0}
              max={719}
              step={1}
              value={manualDeg}
              label="Crank angle"
              onChange={(e) => handleManualAngleChange(Number(e.target.value))}
            />
            <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-base">
              <span>0° intake</span>
              <span>360° injection</span>
              <span>720°</span>
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="m-0 text-base">
              <span className="font-semibold tabular-nums">{Math.round(exploded * 100)}%</span> exploded
            </p>
            <SquareRange
              min={0}
              max={1}
              step={0.01}
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
              min={0.08}
              max={0.9}
              step={0.01}
              value={blockOpacity}
              label="Block opacity"
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
