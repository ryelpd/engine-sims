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

// ============================================================================
// INLINE-5 2.5L 20V TURBO ENGINE SPECIFICATIONS (FIRING ORDER 1-2-4-5-3)
// ============================================================================
// 5 cylinders in a single vertical bank, firing every 144° of crankshaft rotation (720° / 5 = 144°):
//   Cyl 1: 0°    (0 rad)
//   Cyl 2: 144°  (4π/5 rad)
//   Cyl 4: 288°  (8π/5 rad)
//   Cyl 5: 432°  (12π/5 rad)
//   Cyl 3: 576°  (16π/5 rad)
const INLINE5_SPECS = {
  crankRadius: 0.78,         // Stroke = 1.56 (92.8 mm long-stroke 2.5L geometry)
  rodLength: 2.48,           // Forged H-beam rod
  pistonRadius: 0.66,        // Bore = 82.5 mm
  pistonHeight: 0.84,
  boreSpacing: 1.56,         // Z spacing between cylinders 1..5
  displacementL: '2.5',
  compressionRatio: '10.0 : 1',
  maxBoostBar: 1.55,         // 1.55 bar relative turbo boost (2.55 bar absolute)
  firingOrder: [1, 2, 4, 5, 3],
  // Firing angles in radians within the 720° (4π) 4-stroke cycle for Cylinders [1, 2, 3, 4, 5]
  firingAngles: [
    0,                       // Cyl 1: 0°
    (4 * Math.PI) / 5,       // Cyl 2: 144°
    (16 * Math.PI) / 5,      // Cyl 3: 576°
    (8 * Math.PI) / 5,       // Cyl 4: 288°
    (12 * Math.PI) / 5       // Cyl 5: 432°
  ]
};

export default function Inline5Engine({ theme = 'dark' }) {
  const mountRef = useRef(null);

  const [rpm, setRpm] = useState(900);
  const [isPlaying, setIsPlaying] = useState(true);
  const [manualDeg, setManualDeg] = useState(0);
  const [renderMode, setRenderMode] = useState('realistic');
  const [exploded, setExploded] = useState(0);
  const [blockOpacity, setBlockOpacity] = useState(0.28);
  const [cutawayMode, setCutawayMode] = useState(true);
  const [showBlock, setShowBlock] = useState(true);
  const [showHeadAndValves, setShowHeadAndValves] = useState(true);
  const [showTurboSystem, setShowTurboSystem] = useState(true);
  const [showGasFlow, setShowGasFlow] = useState(true);
  const [autoRotateCam, setAutoRotateCam] = useState(false);

  // Live Telemetry States
  const [activeCylinderInfo, setActiveCylinderInfo] = useState(1);
  const [crankDeg, setCrankDeg] = useState(0);
  const [boostBar, setBoostBar] = useState(0.18);
  const [turboRpm, setTurboRpm] = useState(24000);

  const crankThetaRef = useRef(0);

  const simParams = useRef({
    theme,
    rpm: 900,
    isPlaying: true,
    manualDeg: 0,
    renderMode: 'realistic',
    exploded: 0,
    blockOpacity: 0.28,
    cutawayMode: true,
    showBlock: true,
    showHeadAndValves: true,
    showTurboSystem: true,
    showGasFlow: true,
    autoRotateCam: false
  });

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
    theta: -0.68,
    phi: 1.18,
    radius: 13.2,
    target: new THREE.Vector3(0, 1.45, 0)
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
      showHeadAndValves: showHeadAndValves,
      showTurboSystem,
      showGasFlow,
      autoRotateCam
    };

    const { scene, gridHelper, ambientLight, rimLight1, rimLight2 } = sceneElements.current;
    if (scene) {
      if (theme === 'light') {
        scene.background.setHex(0xf8fafc);
        if (ambientLight) {
          ambientLight.color.setHex(0xffffff);
          ambientLight.intensity = 0.88;
        }
        if (gridHelper) {
          gridHelper.material.color.setHex(0x94a3b8);
        }
        if (rimLight1) rimLight1.intensity = 0.85;
        if (rimLight2) rimLight2.intensity = 0.75;
      } else {
        scene.background.setHex(0x101828);
        if (ambientLight) {
          ambientLight.color.setHex(0xdbeafe);
          ambientLight.intensity = 0.62;
        }
        if (gridHelper) {
          gridHelper.material.color.setHex(0x344054);
        }
        if (rimLight1) rimLight1.intensity = 1.15;
        if (rimLight2) rimLight2.intensity = 0.9;
      }
    }
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
    showHeadAndValves,
    showTurboSystem,
    showGasFlow,
    autoRotateCam
  ]);

  const handleManualAngleChange = (val) => {
    const deg = ((val % 720) + 720) % 720;
    setManualDeg(deg);
    setCrankDeg(Math.round(deg));
    setIsPlaying(false);
    crankThetaRef.current = (deg * Math.PI) / 180;
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const isInitialDark = simParams.current.theme === 'dark';
    scene.background = new THREE.Color(isInitialDark ? 0x101828 : 0xf8fafc);
    sceneElements.current.scene = scene;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 120);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // ------------------------------------------------------------------------
    // 1. STUDIO LIGHTING & FLOOR GRID
    // ------------------------------------------------------------------------
    const ambientLight = new THREE.AmbientLight(
      isInitialDark ? 0xdbeafe : 0xffffff,
      isInitialDark ? 0.62 : 0.88
    );
    scene.add(ambientLight);
    sceneElements.current.ambientLight = ambientLight;

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 2.25);
    keyLight.position.set(10, 14, 12);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    scene.add(keyLight);

    const rimLight1 = new THREE.DirectionalLight(0x38bdf8, isInitialDark ? 1.15 : 0.85);
    rimLight1.position.set(12, 5, -9);
    scene.add(rimLight1);
    sceneElements.current.rimLight1 = rimLight1;

    const rimLight2 = new THREE.DirectionalLight(0xf97316, isInitialDark ? 0.9 : 0.75);
    rimLight2.position.set(-12, 4, 9);
    scene.add(rimLight2);
    sceneElements.current.rimLight2 = rimLight2;

    // Glowing point light inside the Turbocharger Turbine Housing
    const turboHeatLight = new THREE.PointLight(0xff4500, 0, 6.5, 1.5);
    turboHeatLight.position.set(-2.35, 1.85, -0.5);
    scene.add(turboHeatLight);

    const gridHelper = new THREE.GridHelper(32, 32, isInitialDark ? 0x334155 : 0x94a3b8, isInitialDark ? 0x1e293b : 0xcbd5e1);
    gridHelper.position.y = -2.35;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.42;
    scene.add(gridHelper);
    sceneElements.current.gridHelper = gridHelper;

    // ------------------------------------------------------------------------
    // 2. PBR MATERIALS & WIREFRAME SHADING REGISTRY
    // ------------------------------------------------------------------------
    const realisticMats = {
      crank: new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.88, roughness: 0.22 }),
      counterweight: new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.78, roughness: 0.32 }),
      pin: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.12 }),
      rod: new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.82, roughness: 0.26 }),
      piston: new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.85, roughness: 0.2 }),
      pistonRing: new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.96, roughness: 0.1 }),
      oilRing: new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.88, roughness: 0.2 }),
      valveIntake: new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.78, roughness: 0.22 }),
      valveExhaust: new THREE.MeshStandardMaterial({ color: 0xf97316, metalness: 0.78, roughness: 0.22 }),
      camshaft: new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.86, roughness: 0.2 }),
      valveCoverRed: new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.48, roughness: 0.28 }),
      coilPackRed: new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.35, roughness: 0.35 }),
      carbonTrim: new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.45, roughness: 0.3 }),
      flywheel: new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.82, roughness: 0.28 }),
      intakeAlum: new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.78, roughness: 0.24 }),
      chargePipeBlue: new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.55, roughness: 0.3 }),
      exhaustHeader: new THREE.MeshStandardMaterial({
        color: 0x9a3412,
        metalness: 0.75,
        roughness: 0.32,
        emissive: 0x7c2d12,
        emissiveIntensity: 0.15
      }),
      turboTurbineSnail: new THREE.MeshStandardMaterial({
        color: 0x7c2d12,
        metalness: 0.68,
        roughness: 0.38,
        emissive: 0xff4500,
        emissiveIntensity: 0.22
      }),
      turboCompressorSnail: new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.9,
        roughness: 0.16
      }),
      turbineWheelGold: new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        metalness: 0.88,
        roughness: 0.18
      }),
      block: new THREE.MeshPhysicalMaterial({
        color: 0x94a3b8,
        metalness: 0.3,
        roughness: 0.25,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        side: THREE.DoubleSide
      }),
      liner: new THREE.MeshPhysicalMaterial({
        color: 0x64748b,
        metalness: 0.55,
        roughness: 0.25,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        side: THREE.DoubleSide
      }),
      headCast: new THREE.MeshPhysicalMaterial({
        color: 0x94a3b8,
        metalness: 0.35,
        roughness: 0.25,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    };

    const rawSolidMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.15, roughness: 0.55 });
    const rawBlockMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.1,
      roughness: 0.6,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const wireframePrimaryMat = new THREE.MeshBasicMaterial({ color: 0xfb6514, wireframe: true });
    const wireframeBlockMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.25
    });

    const trackedMeshes = [];
    const registerMesh = (mesh, type, includeWire = true) => {
      const baseMat = realisticMats[type] || realisticMats.crank;
      mesh.material = baseMat;
      const isTranslucent = type === 'block' || type === 'liner' || type === 'headCast';
      mesh.castShadow = !isTranslucent;
      mesh.receiveShadow = true;

      let wireOverlay = null;
      if (includeWire) {
        const wireGeo = new THREE.WireframeGeometry(mesh.geometry);
        const wireMat = new THREE.LineBasicMaterial({
          color: 0xfb6514,
          transparent: true,
          opacity: isTranslucent ? 0.18 : 0.35
        });
        wireOverlay = new THREE.LineSegments(wireGeo, wireMat);
        wireOverlay.visible = false;
        mesh.add(wireOverlay);
      }

      trackedMeshes.push({ mesh, type, baseMat, wireOverlay });
      return mesh;
    };

    // Soft-Glow Volumetric Particle Texture Generator
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

    const engineRoot = new THREE.Group();
    scene.add(engineRoot);

    const {
      crankRadius: r,
      rodLength: L,
      pistonRadius: pR,
      pistonHeight: pH,
      boreSpacing,
      firingAngles
    } = INLINE5_SPECS;

    const deckY = r + L + pH * 0.5 + 0.12; // ~3.80
    const zStart = -2 * boreSpacing;       // Cylinders at z = -3.12, -1.56, 0, +1.56, +3.12

    // ------------------------------------------------------------------------
    // 3. 5-THROW 144° STAR CRANKSHAFT, COUNTERWEIGHTS & FLYWHEEL
    // ------------------------------------------------------------------------
    const crankshaftGroup = new THREE.Group();
    engineRoot.add(crankshaftGroup);

    // Central Main Bearing Journals (6 journals flanking the 5 throws)
    for (let j = 0; j < 6; j++) {
      const zJ = zStart - boreSpacing * 0.5 + j * boreSpacing;
      const journalGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.44, 24);
      journalGeo.rotateX(Math.PI / 2);
      const journalMesh = registerMesh(new THREE.Mesh(journalGeo), 'crank');
      journalMesh.position.set(0, 0, zJ);
      crankshaftGroup.add(journalMesh);
    }

    // Sculpted Counterweight Shape
    const cwShape = new THREE.Shape();
    cwShape.moveTo(-0.34, -0.15);
    cwShape.lineTo(-0.26, r + 0.22);
    cwShape.absarc(0, r, 0.26, Math.PI, 0, true);
    cwShape.lineTo(0.34, -0.15);
    cwShape.bezierCurveTo(0.76, -0.35, 0.92, -0.82, 0.55, -1.08);
    cwShape.quadraticCurveTo(0, -1.22, -0.55, -1.08);
    cwShape.bezierCurveTo(-0.92, -0.82, -0.76, -0.35, -0.34, -0.15);

    const cwExtrudeGeo = new THREE.ExtrudeGeometry(cwShape, {
      depth: 0.16,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.02,
      bevelThickness: 0.02
    });
    cwExtrudeGeo.translate(0, 0, -0.08);

    // 5 Crankpins arranged in the exact 144° Inline-5 Star Pattern
    for (let i = 0; i < 5; i++) {
      const zCyl = zStart + i * boreSpacing;
      const pinPhase = firingAngles[i]; // TDC occurs when crankTheta = firingAngles[i]

      const throwHolder = new THREE.Group();
      throwHolder.position.z = zCyl;
      throwHolder.rotation.z = pinPhase;
      crankshaftGroup.add(throwHolder);

      const pinGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.58, 24);
      pinGeo.rotateX(Math.PI / 2);
      const pinMesh = registerMesh(new THREE.Mesh(pinGeo), 'pin');
      pinMesh.position.set(0, r, 0);
      throwHolder.add(pinMesh);

      [-0.36, 0.36].forEach((webZ) => {
        const webMesh = registerMesh(new THREE.Mesh(cwExtrudeGeo), 'counterweight');
        webMesh.position.z = webZ;
        throwHolder.add(webMesh);
      });
    }

    // Rear Dual-Mass Flywheel (z = zStart - 1.18)
    const flywheelGeo = new THREE.CylinderGeometry(1.55, 1.55, 0.28, 40);
    flywheelGeo.rotateX(Math.PI / 2);
    const flywheelMesh = registerMesh(new THREE.Mesh(flywheelGeo), 'flywheel');
    flywheelMesh.position.set(0, 0, zStart - 1.18);
    crankshaftGroup.add(flywheelMesh);

    // Front Harmonic Damper Pulley (z = -zStart + 1.08)
    const damperGeo = new THREE.CylinderGeometry(0.68, 0.68, 0.32, 32);
    damperGeo.rotateX(Math.PI / 2);
    const damperMesh = registerMesh(new THREE.Mesh(damperGeo), 'flywheel');
    damperMesh.position.set(0, 0, -zStart + 1.08);
    crankshaftGroup.add(damperMesh);

    // ------------------------------------------------------------------------
    // 4. 5 PISTONS, H-BEAM RODS, 20 DOHC VALVES & VOLUMETRIC COMBUSTION
    // ------------------------------------------------------------------------
    const cylindersData = [];
    const headAndValvesGroup = new THREE.Group();
    engineRoot.add(headAndValvesGroup);

    const blockGroup = new THREE.Group();
    engineRoot.add(blockGroup);

    const gasGroup = new THREE.Group();
    engineRoot.add(gasGroup);

    // Reusable Piston, Rod, Valve & Liner Geometries
    const crownGeo = new THREE.CylinderGeometry(pR, pR, pH * 0.56, 32);
    crownGeo.translate(0, pH * 0.22, 0);
    const skirtGeo = new THREE.CylinderGeometry(pR * 0.96, pR * 0.94, pH * 0.44, 28);
    skirtGeo.translate(0, -pH * 0.22, 0);
    const wristPinGeo = new THREE.CylinderGeometry(0.18, 0.18, pR * 1.65, 20);
    wristPinGeo.rotateX(Math.PI / 2);

    const topRingGeo = new THREE.TorusGeometry(pR + 0.01, 0.018, 10, 32);
    topRingGeo.rotateX(Math.PI / 2);

    // Forged H-Beam Connecting Rod Geometry
    const bigEndGeo = new THREE.CylinderGeometry(0.39, 0.39, 0.38, 24);
    bigEndGeo.rotateX(Math.PI / 2);
    const smallEndGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.32, 20);
    smallEndGeo.rotateX(Math.PI / 2);
    smallEndGeo.translate(0, L, 0);

    const rodBeamShape = new THREE.Shape();
    rodBeamShape.moveTo(-0.26, 0.22);
    rodBeamShape.quadraticCurveTo(-0.14, L * 0.5, -0.18, L - 0.15);
    rodBeamShape.lineTo(0.18, L - 0.15);
    rodBeamShape.quadraticCurveTo(0.14, L * 0.5, 0.26, 0.22);
    rodBeamShape.closePath();
    const rodBeamGeo = new THREE.ExtrudeGeometry(rodBeamShape, {
      depth: 0.16,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.018,
      bevelThickness: 0.018
    });
    rodBeamGeo.translate(0, 0, -0.08);

    const linerHeight = 2.45;
    const fullLinerGeo = new THREE.CylinderGeometry(pR + 0.05, pR + 0.05, linerHeight, 32, 1, true);
    const cutLinerGeo = new THREE.CylinderGeometry(pR + 0.05, pR + 0.05, linerHeight, 32, 1, true, Math.PI * 0.85, Math.PI * 1.3);

    // Siamese Cast-Aluminum Water Jacket Barrels (Full & Cutaway so block stays organic in Cutaway mode)
    const jacketHeight = linerHeight + 0.12;
    const fullJacketGeo = new THREE.CylinderGeometry(pR + 0.34, pR + 0.31, jacketHeight, 32, 1, false);
    const cutJacketGeo = new THREE.CylinderGeometry(pR + 0.34, pR + 0.31, jacketHeight, 32, 1, false, Math.PI * 0.72, Math.PI * 1.48);
    const fullJacketRibGeo = new THREE.TorusGeometry(pR + 0.36, 0.042, 10, 32);
    fullJacketRibGeo.rotateX(Math.PI / 2);
    const cutJacketRibGeo = new THREE.TorusGeometry(pR + 0.36, 0.042, 10, 32, Math.PI * 1.48);
    cutJacketRibGeo.rotateX(Math.PI / 2);
    cutJacketRibGeo.rotateY(Math.PI * 0.22);

    // Helical Valve Spring Geometry (5-turn coil around each of the 20 valve stems)
    const springPts = [];
    const springTurns = 5;
    const springSamples = 50;
    for (let s = 0; s <= springSamples; s++) {
      const t = s / springSamples;
      const ang = t * springTurns * Math.PI * 2;
      const sr = 0.105;
      springPts.push(new THREE.Vector3(Math.cos(ang) * sr, 0.14 + t * 0.44, Math.sin(ang) * sr));
    }
    const valveSpringCurve = new THREE.CatmullRomCurve3(springPts);
    const valveSpringGeo = new THREE.TubeGeometry(valveSpringCurve, 44, 0.021, 8, false);
    const valveRetainerGeo = new THREE.CylinderGeometry(0.125, 0.09, 0.06, 16);
    valveRetainerGeo.translate(0, 0.60, 0);

    // Sculpted Red-Top TFSI Pencil Ignition Coil Pack Geometries
    const coilShape = new THREE.Shape();
    coilShape.moveTo(-0.18, -0.16);
    coilShape.lineTo(0.18, -0.16);
    coilShape.quadraticCurveTo(0.24, -0.16, 0.24, -0.08);
    coilShape.lineTo(0.26, 0.14);
    coilShape.quadraticCurveTo(0.26, 0.22, 0.16, 0.22);
    coilShape.lineTo(-0.16, 0.22);
    coilShape.quadraticCurveTo(-0.26, 0.22, -0.24, 0.10);
    coilShape.lineTo(-0.22, -0.10);
    coilShape.quadraticCurveTo(-0.22, -0.16, -0.18, -0.16);
    const coilTopGeo = new THREE.ExtrudeGeometry(coilShape, {
      depth: 0.14,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.028,
      bevelThickness: 0.028
    });
    coilTopGeo.rotateX(Math.PI / 2);
    coilTopGeo.translate(0, 0.07, 0);

    const coilBootGeo = new THREE.CylinderGeometry(0.125, 0.105, 0.56, 18);
    const coilFlangeGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.05, 6);
    const coilPlugSocketGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.22, 12);
    coilPlugSocketGeo.rotateZ(Math.PI / 2 - 0.18);

    for (let i = 0; i < 5; i++) {
      const zPos = zStart + i * boreSpacing;
      const cylNumber = i + 1;

      // A. Piston Assembly
      const pistonGroup = new THREE.Group();
      engineRoot.add(pistonGroup);

      pistonGroup.add(registerMesh(new THREE.Mesh(crownGeo), 'piston'));
      pistonGroup.add(registerMesh(new THREE.Mesh(skirtGeo), 'piston'));
      pistonGroup.add(registerMesh(new THREE.Mesh(wristPinGeo), 'pin'));

      [0.38, 0.29, 0.20].forEach((ry, rIdx) => {
        const ring = registerMesh(new THREE.Mesh(topRingGeo), rIdx === 2 ? 'oilRing' : 'pistonRing', false);
        ring.position.y = ry;
        pistonGroup.add(ring);
      });

      // B. Connecting Rod Assembly
      const rodGroup = new THREE.Group();
      engineRoot.add(rodGroup);
      rodGroup.add(registerMesh(new THREE.Mesh(bigEndGeo), 'rod'));
      rodGroup.add(registerMesh(new THREE.Mesh(rodBeamGeo), 'rod'));
      rodGroup.add(registerMesh(new THREE.Mesh(smallEndGeo), 'rod'));

      // C. Cylinder Liner & Sculpted Siamese Cast Water Jacket Barrel
      const linerMesh = registerMesh(new THREE.Mesh(fullLinerGeo), 'liner');
      linerMesh.position.set(0, r + L - 0.32, zPos);
      blockGroup.add(linerMesh);

      const jacketMesh = registerMesh(new THREE.Mesh(fullJacketGeo), 'block');
      jacketMesh.position.set(0, r + L - 0.30, zPos);
      blockGroup.add(jacketMesh);

      const jacketRibMeshes = [];
      [-0.75, -0.25, 0.25, 0.75].forEach((ribOffY) => {
        const ribMesh = registerMesh(new THREE.Mesh(fullJacketRibGeo), 'block', false);
        ribMesh.position.set(0, r + L - 0.30 + ribOffY, zPos);
        blockGroup.add(ribMesh);
        jacketRibMeshes.push(ribMesh);
      });

      // D. 4 Valves per Cylinder (2 Intake on +X, 2 Exhaust on -X) with Helical Springs & Retainers
      const intakeValves = [];
      const exhaustValves = [];
      [-0.24, 0.24].forEach((vz) => {
        // Intake Valve (+X)
        const ivGroup = new THREE.Group();
        ivGroup.position.set(0.32, deckY + 0.38, zPos + vz);
        ivGroup.rotation.z = -0.26;
        const ivStem = registerMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.78, 12)), 'valveIntake', false);
        ivStem.position.y = 0.36;
        const ivDisc = registerMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.07, 0.07, 20)), 'valveIntake');
        const ivRetainer = registerMesh(new THREE.Mesh(valveRetainerGeo), 'pin', false);
        ivGroup.add(ivStem, ivDisc, ivRetainer);
        headAndValvesGroup.add(ivGroup);
        intakeValves.push(ivGroup);

        // Static Helical Valve Spring seated on the head deck for Intake
        const ivSpring = registerMesh(new THREE.Mesh(valveSpringGeo), 'crank', false);
        ivSpring.position.set(0.32, deckY + 0.38, zPos + vz);
        ivSpring.rotation.z = -0.26;
        headAndValvesGroup.add(ivSpring);

        // Exhaust Valve (-X)
        const evGroup = new THREE.Group();
        evGroup.position.set(-0.32, deckY + 0.38, zPos + vz);
        evGroup.rotation.z = 0.26;
        const evStem = registerMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.78, 12)), 'valveExhaust', false);
        evStem.position.y = 0.36;
        const evDisc = registerMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.07, 0.07, 20)), 'valveExhaust');
        const evRetainer = registerMesh(new THREE.Mesh(valveRetainerGeo), 'pin', false);
        evGroup.add(evStem, evDisc, evRetainer);
        headAndValvesGroup.add(evGroup);
        exhaustValves.push(evGroup);

        // Static Helical Valve Spring seated on the head deck for Exhaust
        const evSpring = registerMesh(new THREE.Mesh(valveSpringGeo), 'crank', false);
        evSpring.position.set(-0.32, deckY + 0.38, zPos + vz);
        evSpring.rotation.z = 0.26;
        headAndValvesGroup.add(evSpring);
      });

      // Central Spark Plug & Sculpted Red-Top TFSI Pencil Ignition Coil Pack
      const plugGeo = new THREE.CylinderGeometry(0.068, 0.068, 0.72, 14);
      const plugMesh = registerMesh(new THREE.Mesh(plugGeo), 'pin', false);
      plugMesh.position.set(0, deckY + 0.48, zPos);
      headAndValvesGroup.add(plugMesh);

      const coilBootMesh = registerMesh(new THREE.Mesh(coilBootGeo), 'flywheel', false);
      coilBootMesh.position.set(0, deckY + 1.02, zPos);
      headAndValvesGroup.add(coilBootMesh);

      const coilFlangeMesh = registerMesh(new THREE.Mesh(coilFlangeGeo), 'intakeAlum', false);
      coilFlangeMesh.position.set(0, deckY + 1.28, zPos);
      headAndValvesGroup.add(coilFlangeMesh);

      const coilTopMesh = registerMesh(new THREE.Mesh(coilTopGeo), 'coilPackRed');
      coilTopMesh.position.set(0, deckY + 1.38, zPos);
      headAndValvesGroup.add(coilTopMesh);

      const coilSocketMesh = registerMesh(new THREE.Mesh(coilPlugSocketGeo), 'flywheel', false);
      coilSocketMesh.position.set(0.26, deckY + 1.36, zPos + 0.04);
      headAndValvesGroup.add(coilSocketMesh);

      // E. Volumetric Soft-Glow Chamber Sprites & Ignition Embers for this Cylinder
      const chamberParticles = [];
      for (let p = 0; p < 18; p++) {
        const isHaze = p % 4 === 0;
        const baseScale = isHaze ? (0.58 + Math.random() * 0.28) : (0.24 + Math.random() * 0.14);
        const pMat = new THREE.SpriteMaterial({
          map: glowTexture,
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        const pSprite = new THREE.Sprite(pMat);
        gasGroup.add(pSprite);
        chamberParticles.push({
          sprite: pSprite,
          mat: pMat,
          isHaze,
          baseScale,
          rFrac: 0.15 + Math.random() * 0.75,
          angle: Math.random() * Math.PI * 2,
          yFrac: Math.random(),
          swirlSpd: (Math.random() - 0.5) * 4.5
        });
      }

      // Core Flash & Spark Embers
      const coreMat = new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const coreSprite = new THREE.Sprite(coreMat);
      coreSprite.position.set(0, deckY - 0.08, zPos);
      gasGroup.add(coreSprite);

      const embers = [];
      for (let em = 0; em < 10; em++) {
        const emMat = new THREE.SpriteMaterial({
          map: glowTexture,
          color: 0xfde047,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        const emSprite = new THREE.Sprite(emMat);
        gasGroup.add(emSprite);
        embers.push({
          sprite: emSprite,
          mat: emMat,
          seed: Math.random() * Math.PI * 2,
          spd: 1.1 + Math.random() * 1.5
        });
      }

      cylindersData.push({
        cylNumber,
        zPos,
        firingAngle: firingAngles[i],
        pistonGroup,
        rodGroup,
        linerMesh,
        fullLinerGeo,
        cutLinerGeo,
        jacketMesh,
        fullJacketGeo,
        cutJacketGeo,
        jacketRibMeshes,
        fullJacketRibGeo,
        cutJacketRibGeo,
        intakeValves,
        exhaustValves,
        chamberParticles,
        coreSprite,
        coreMat,
        embers
      });
    }

    // Continuous TFSI Ignition Wiring Harness Conduit Rail connecting all 5 Coils
    const harnessLen = boreSpacing * 4 + 0.65;
    const harnessRailGeo = new THREE.CylinderGeometry(0.055, 0.055, harnessLen, 14);
    harnessRailGeo.rotateX(Math.PI / 2);
    const harnessRailMesh = registerMesh(new THREE.Mesh(harnessRailGeo), 'flywheel', false);
    harnessRailMesh.position.set(0.38, deckY + 1.34, 0);
    headAndValvesGroup.add(harnessRailMesh);

    // ------------------------------------------------------------------------
    // 5. DUAL OVERHEAD CAMSHAFTS (DOHC), VVT PHASERS & SCULPTED 20V CYLINDER HEAD
    // ------------------------------------------------------------------------
    const intakeCamGroup = new THREE.Group();
    intakeCamGroup.position.set(0.52, deckY + 1.05, 0);
    headAndValvesGroup.add(intakeCamGroup);

    const exhaustCamGroup = new THREE.Group();
    exhaustCamGroup.position.set(-0.52, deckY + 1.05, 0);
    headAndValvesGroup.add(exhaustCamGroup);

    const camShaftLen = boreSpacing * 4 + 1.65;
    const camRodGeo = new THREE.CylinderGeometry(0.11, 0.11, camShaftLen, 20);
    camRodGeo.rotateX(Math.PI / 2);
    intakeCamGroup.add(registerMesh(new THREE.Mesh(camRodGeo), 'camshaft'));
    exhaustCamGroup.add(registerMesh(new THREE.Mesh(camRodGeo), 'camshaft'));

    const lobeShape = new THREE.Shape();
    lobeShape.absarc(0, 0, 0.18, 0, Math.PI, false);
    lobeShape.quadraticCurveTo(-0.18, -0.38, 0, -0.40);
    lobeShape.quadraticCurveTo(0.18, -0.38, 0.18, 0);
    const lobeGeo = new THREE.ExtrudeGeometry(lobeShape, { depth: 0.14, bevelEnabled: false });
    lobeGeo.translate(0, 0, -0.07);

    for (let i = 0; i < 5; i++) {
      const zPos = zStart + i * boreSpacing;
      const fireAng = firingAngles[i];
      [-0.24, 0.24].forEach((vz) => {
        const iLobe = registerMesh(new THREE.Mesh(lobeGeo), 'pin', false);
        iLobe.position.z = zPos + vz;
        iLobe.rotation.z = -(fireAng / 2 + Math.PI * 1.25);
        intakeCamGroup.add(iLobe);

        const eLobe = registerMesh(new THREE.Mesh(lobeGeo), 'pin', false);
        eLobe.position.z = zPos + vz;
        eLobe.rotation.z = -(fireAng / 2 + Math.PI * 0.75);
        exhaustCamGroup.add(eLobe);
      });
    }

    // Front Variable Valve Timing (VVT) Camshaft Phaser Gears & Timing Chain Loop
    const vvtZ = camShaftLen * 0.5 + 0.08;
    const vvtOuterGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.14, 28);
    vvtOuterGeo.rotateX(Math.PI / 2);
    const vvtCoreGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.18, 20);
    vvtCoreGeo.rotateX(Math.PI / 2);

    [intakeCamGroup, exhaustCamGroup].forEach((cGrp) => {
      const gearRing = registerMesh(new THREE.Mesh(vvtOuterGeo), 'counterweight');
      gearRing.position.z = vvtZ;
      const phaserHub = registerMesh(new THREE.Mesh(vvtCoreGeo), 'turbineWheelGold');
      phaserHub.position.z = vvtZ + 0.02;
      cGrp.add(gearRing, phaserHub);
    });

    // Timing Chain Loop connecting Crankshaft Nose to Dual VVT Cam Sprockets
    const timingChainCurve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(0.52, deckY + 1.38, vvtZ),
        new THREE.Vector3(-0.52, deckY + 1.38, vvtZ),
        new THREE.Vector3(-0.82, deckY + 0.95, vvtZ),
        new THREE.Vector3(-0.42, 0.25, vvtZ),
        new THREE.Vector3(0.0, -0.36, vvtZ),
        new THREE.Vector3(0.42, 0.25, vvtZ),
        new THREE.Vector3(0.82, deckY + 0.95, vvtZ)
      ],
      true
    );
    const timingChainGeo = new THREE.TubeGeometry(timingChainCurve, 64, 0.048, 8, true);
    headAndValvesGroup.add(registerMesh(new THREE.Mesh(timingChainGeo), 'flywheel', false));

    // 6 Machined Aluminum Camshaft Bearing Bridges (Cam Towers) arching over both camshafts
    const camTowerShape = new THREE.Shape();
    camTowerShape.moveTo(-0.86, 0.36);
    camTowerShape.lineTo(-0.82, 0.88);
    camTowerShape.quadraticCurveTo(-0.52, 1.12, -0.22, 0.88);
    camTowerShape.lineTo(-0.18, 0.62);
    camTowerShape.lineTo(0.18, 0.62);
    camTowerShape.lineTo(0.22, 0.88);
    camTowerShape.quadraticCurveTo(0.52, 1.12, 0.82, 0.88);
    camTowerShape.lineTo(0.86, 0.36);
    camTowerShape.lineTo(0.70, 0.36);
    camTowerShape.absarc(0.52, 0.65, 0.15, 0, Math.PI, false);
    camTowerShape.lineTo(0.34, 0.36);
    camTowerShape.lineTo(-0.34, 0.36);
    camTowerShape.absarc(-0.52, 0.65, 0.15, 0, Math.PI, false);
    camTowerShape.lineTo(-0.70, 0.36);
    camTowerShape.closePath();

    const camTowerGeo = new THREE.ExtrudeGeometry(camTowerShape, {
      depth: 0.22,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.018,
      bevelThickness: 0.018
    });
    camTowerGeo.translate(0, deckY + 0.40, -0.11);

    for (let j = 0; j < 6; j++) {
      const zTower = zStart - boreSpacing * 0.5 + j * boreSpacing;
      const towerMesh = registerMesh(new THREE.Mesh(camTowerGeo), 'intakeAlum');
      towerMesh.position.z = zTower;
      headAndValvesGroup.add(towerMesh);
    }

    // Sculpted Pent-Roof 20V DOHC Cylinder Head Casting (Organic Multi-Contoured Profile instead of a flat box)
    const headProfile = new THREE.Shape();
    headProfile.moveTo(-0.98, 0.0);
    // Lower deck flange & exhaust side cooling scallop (-X)
    headProfile.lineTo(-1.06, 0.14);
    headProfile.lineTo(-0.94, 0.24);
    // Angled Exhaust Manifold Mounting Flange (-X)
    headProfile.lineTo(-1.02, 0.56);
    headProfile.lineTo(-0.88, 0.88);
    headProfile.quadraticCurveTo(-0.76, 1.02, -0.62, 0.98);
    // Recessed cam valley floor with spark plug boss gallery
    headProfile.lineTo(-0.26, 0.68);
    headProfile.lineTo(0.26, 0.68);
    // Intake cam gallery & Angled Intake Manifold Mounting Flange (+X)
    headProfile.lineTo(0.62, 0.98);
    headProfile.quadraticCurveTo(0.76, 1.02, 0.88, 0.88);
    headProfile.lineTo(1.02, 0.56);
    headProfile.lineTo(0.94, 0.24);
    headProfile.lineTo(1.06, 0.14);
    headProfile.lineTo(0.98, 0.0);
    // Pent-roof combustion chamber ceiling arch
    headProfile.lineTo(0.66, 0.0);
    headProfile.quadraticCurveTo(0.0, 0.22, -0.66, 0.0);
    headProfile.closePath();

    const headCastGeo = new THREE.ExtrudeGeometry(headProfile, {
      depth: camShaftLen - 0.08,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.045,
      bevelThickness: 0.045
    });
    headCastGeo.translate(0, deckY, -(camShaftLen - 0.08) / 2);
    const headCastMesh = registerMesh(new THREE.Mesh(headCastGeo), 'headCast');
    headAndValvesGroup.add(headCastMesh);

    // 10 Sculpted Cast Intake (+X) & Exhaust (-X) Port Bosses + 3 Side Cooling Fins along the Head
    const portBossGeo = new THREE.CylinderGeometry(0.22, 0.25, 0.34, 18);
    portBossGeo.rotateZ(Math.PI / 2);
    for (let i = 0; i < 5; i++) {
      const zCyl = zStart + i * boreSpacing;
      const inBoss = registerMesh(new THREE.Mesh(portBossGeo), 'headCast', false);
      inBoss.position.set(0.92, deckY + 0.42, zCyl);
      inBoss.rotation.z = -0.18;
      headAndValvesGroup.add(inBoss);

      const exBoss = registerMesh(new THREE.Mesh(portBossGeo), 'headCast', false);
      exBoss.position.set(-0.92, deckY + 0.42, zCyl);
      exBoss.rotation.z = 0.18;
      headAndValvesGroup.add(exBoss);
    }

    // Sculpted Twin-Hump Red-Anodized Valve Cover (with recessed central TFSI coil valley & cutaway front half)
    const valveCoverGroup = new THREE.Group();
    headAndValvesGroup.add(valveCoverGroup);

    const vcShape = new THREE.Shape();
    vcShape.moveTo(-0.92, 0.0);
    vcShape.lineTo(-0.88, 0.34);
    vcShape.quadraticCurveTo(-0.82, 0.52, -0.54, 0.54);
    vcShape.quadraticCurveTo(-0.28, 0.52, -0.24, 0.26);
    vcShape.lineTo(0.24, 0.26);
    vcShape.quadraticCurveTo(0.28, 0.52, 0.54, 0.54);
    vcShape.quadraticCurveTo(0.82, 0.52, 0.88, 0.34);
    vcShape.lineTo(0.92, 0.0);
    vcShape.lineTo(0.78, 0.0);
    vcShape.lineTo(0.74, 0.30);
    vcShape.quadraticCurveTo(0.54, 0.40, 0.32, 0.16);
    vcShape.lineTo(-0.32, 0.16);
    vcShape.quadraticCurveTo(-0.54, 0.40, -0.74, 0.30);
    vcShape.lineTo(-0.78, 0.0);
    vcShape.closePath();

    const vcTotalLen = camShaftLen - 0.12;
    const vcRearGeo = new THREE.ExtrudeGeometry(vcShape, {
      depth: vcTotalLen * 0.46,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.035,
      bevelThickness: 0.035
    });
    vcRearGeo.translate(0, deckY + 0.88, -vcTotalLen * 0.5);
    const valveCoverRearMesh = registerMesh(new THREE.Mesh(vcRearGeo), 'valveCoverRed');
    valveCoverGroup.add(valveCoverRearMesh);

    const vcFrontGeo = new THREE.ExtrudeGeometry(vcShape, {
      depth: vcTotalLen * 0.54,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.035,
      bevelThickness: 0.035
    });
    vcFrontGeo.translate(0, deckY + 0.88, -vcTotalLen * 0.04);
    const valveCoverFrontMesh = registerMesh(new THREE.Mesh(vcFrontGeo), 'valveCoverRed');
    valveCoverGroup.add(valveCoverFrontMesh);

    // Oil Filler Neck & Cast Cap on the Valve Cover
    const fillerNeckGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.22, 20);
    const fillerNeckMesh = registerMesh(new THREE.Mesh(fillerNeckGeo), 'intakeAlum', false);
    fillerNeckMesh.position.set(-0.54, deckY + 1.48, zStart + 0.35);
    valveCoverGroup.add(fillerNeckMesh);

    const fillerCapGeo = new THREE.CylinderGeometry(0.20, 0.19, 0.08, 12);
    const fillerCapMesh = registerMesh(new THREE.Mesh(fillerCapGeo), 'flywheel', false);
    fillerCapMesh.position.set(-0.54, deckY + 1.61, zStart + 0.35);
    valveCoverGroup.add(fillerCapMesh);

    // ------------------------------------------------------------------------
    // 6. MULTI-PART SCULPTED INLINE-5 ENGINE BLOCK, BEDPLATE, BULKHEADS & OIL SUMP
    // ------------------------------------------------------------------------
    const blockLen = camShaftLen + 0.18;

    // A. Sculpted Top Deck Plate & Lower Block Deck Flange with 12 Head Studs
    const deckFlangeShape = new THREE.Shape();
    deckFlangeShape.moveTo(-1.06, -0.14);
    deckFlangeShape.lineTo(1.06, -0.14);
    deckFlangeShape.lineTo(1.02, 0.02);
    deckFlangeShape.lineTo(-1.02, 0.02);
    deckFlangeShape.closePath();
    const deckFlangeGeo = new THREE.ExtrudeGeometry(deckFlangeShape, {
      depth: blockLen,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.025,
      bevelThickness: 0.025
    });
    deckFlangeGeo.translate(0, deckY, -blockLen / 2);
    blockGroup.add(registerMesh(new THREE.Mesh(deckFlangeGeo), 'block'));

    // 12 Cylinder Head Stud Bolts & Washers flanking the 5 Cylinders
    const studBoltGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.16, 6);
    for (let j = 0; j < 6; j++) {
      const zStud = zStart - boreSpacing * 0.5 + j * boreSpacing;
      [-0.86, 0.86].forEach((xStud) => {
        const stud = registerMesh(new THREE.Mesh(studBoltGeo), 'pin', false);
        stud.position.set(xStud, deckY + 0.06, zStud);
        blockGroup.add(stud);
      });
    }

    // B. 6 Internal Main Bearing Bulkhead Webs & Bolted Bearing Caps (Supports the 6 Crankshaft Journals)
    const bulkheadShape = new THREE.Shape();
    bulkheadShape.moveTo(-1.12, -1.10);
    bulkheadShape.lineTo(-0.98, 1.18);
    bulkheadShape.lineTo(0.98, 1.18);
    bulkheadShape.lineTo(1.12, -1.10);
    bulkheadShape.lineTo(0.56, -1.10);
    bulkheadShape.absarc(0, 0, 0.36, 0, Math.PI * 2, true);
    bulkheadShape.lineTo(-0.56, -1.10);
    bulkheadShape.closePath();

    const bulkheadGeo = new THREE.ExtrudeGeometry(bulkheadShape, {
      depth: 0.24,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.02,
      bevelThickness: 0.02
    });
    bulkheadGeo.translate(0, 0, -0.12);

    for (let j = 0; j < 6; j++) {
      const zWeb = zStart - boreSpacing * 0.5 + j * boreSpacing;
      const webMesh = registerMesh(new THREE.Mesh(bulkheadGeo), 'block');
      webMesh.position.z = zWeb;
      blockGroup.add(webMesh);
    }

    // C. Deep-Skirt Crankcase Bedplate (Split into Back/Left Structural Cradle + Front/Right Cutaway Wall)
    const backSkirtProfile = new THREE.Shape();
    backSkirtProfile.moveTo(0.15, -1.22);
    backSkirtProfile.lineTo(-1.05, -1.22);
    backSkirtProfile.quadraticCurveTo(-1.26, -0.85, -1.22, -0.15);
    backSkirtProfile.lineTo(-1.02, 1.25);
    backSkirtProfile.lineTo(-0.84, 1.25);
    backSkirtProfile.lineTo(-0.98, -0.15);
    backSkirtProfile.quadraticCurveTo(-1.02, -0.78, -0.78, -1.02);
    backSkirtProfile.lineTo(0.15, -1.02);
    backSkirtProfile.closePath();

    const backSkirtGeo = new THREE.ExtrudeGeometry(backSkirtProfile, {
      depth: blockLen,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.04,
      bevelThickness: 0.04
    });
    backSkirtGeo.translate(0, 0, -blockLen / 2);
    const blockBackSkirtMesh = registerMesh(new THREE.Mesh(backSkirtGeo), 'block');
    blockGroup.add(blockBackSkirtMesh);

    // External Cast Stiffening Ribs & Engine Mount Boss on the Left (-X) Block Wall
    const sideRibGeo = new THREE.BoxGeometry(0.12, 0.09, blockLen - 0.25);
    [-0.55, 0.05, 0.65].forEach((ry) => {
      const sRib = registerMesh(new THREE.Mesh(sideRibGeo), 'block', false);
      sRib.position.set(-1.16, ry, 0);
      blockGroup.add(sRib);
    });

    // Front/Right (+X) Crankcase Cutaway Wall (Hidden in Cutaway Mode so crank & rods are visible)
    const frontSkirtProfile = new THREE.Shape();
    frontSkirtProfile.moveTo(0.15, -1.22);
    frontSkirtProfile.lineTo(1.05, -1.22);
    frontSkirtProfile.quadraticCurveTo(1.26, -0.85, 1.22, -0.15);
    frontSkirtProfile.lineTo(1.02, 1.25);
    frontSkirtProfile.lineTo(0.84, 1.25);
    frontSkirtProfile.lineTo(0.98, -0.15);
    frontSkirtProfile.quadraticCurveTo(1.02, -0.78, 0.78, -1.02);
    frontSkirtProfile.lineTo(0.15, -1.02);
    frontSkirtProfile.closePath();

    const frontSkirtGeo = new THREE.ExtrudeGeometry(frontSkirtProfile, {
      depth: blockLen,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.04,
      bevelThickness: 0.04
    });
    frontSkirtGeo.translate(0, 0, -blockLen / 2);
    const blockFrontSkirtMesh = registerMesh(new THREE.Mesh(frontSkirtGeo), 'block');
    blockGroup.add(blockFrontSkirtMesh);

    // D. Finned Cast-Aluminum Wet Oil Sump (Oil Pan) at bottom of Crankcase
    const oilSumpGroup = new THREE.Group();
    blockGroup.add(oilSumpGroup);

    const sumpShape = new THREE.Shape();
    sumpShape.moveTo(-1.08, -1.22);
    sumpShape.lineTo(1.08, -1.22);
    sumpShape.lineTo(0.96, -1.68);
    sumpShape.quadraticCurveTo(0.82, -1.92, 0.42, -1.92);
    sumpShape.lineTo(-0.42, -1.92);
    sumpShape.quadraticCurveTo(-0.82, -1.92, -0.96, -1.68);
    sumpShape.closePath();

    const sumpGeo = new THREE.ExtrudeGeometry(sumpShape, {
      depth: blockLen - 0.16,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.045,
      bevelThickness: 0.045
    });
    sumpGeo.translate(0, 0, -(blockLen - 0.16) / 2);
    oilSumpGroup.add(registerMesh(new THREE.Mesh(sumpGeo), 'block'));

    // Longitudinal Cooling Fins under the Cast Aluminum Oil Sump
    const sumpFinGeo = new THREE.BoxGeometry(0.045, 0.08, blockLen - 0.35);
    for (let f = -3; f <= 3; f++) {
      const finMesh = registerMesh(new THREE.Mesh(sumpFinGeo), 'intakeAlum', false);
      finMesh.position.set(f * 0.22, -1.97, 0);
      oilSumpGroup.add(finMesh);
    }

    // E. Rear Transmission Bellhousing Flange framing the Dual-Mass Flywheel
    const bellPoints = [
      new THREE.Vector2(0.42, 0.0),
      new THREE.Vector2(1.18, 0.04),
      new THREE.Vector2(1.68, 0.22),
      new THREE.Vector2(1.76, 0.44),
      new THREE.Vector2(1.64, 0.44),
      new THREE.Vector2(1.56, 0.24),
      new THREE.Vector2(1.06, 0.10),
      new THREE.Vector2(0.42, 0.08)
    ];
    const bellGeo = new THREE.LatheGeometry(bellPoints, 36);
    bellGeo.rotateX(Math.PI / 2);
    const bellMesh = registerMesh(new THREE.Mesh(bellGeo), 'block');
    bellMesh.position.set(0, 0, zStart - 0.88);
    blockGroup.add(bellMesh);

    // ------------------------------------------------------------------------
    // 7. 5-INTO-1 TUBULAR EXHAUST MANIFOLD, LARGE TURBOCHARGER & BOOST PLENUM
    // ------------------------------------------------------------------------
    const turboSystemGroup = new THREE.Group();
    engineRoot.add(turboSystemGroup);

    // Turbocharger Position on the Left (-X) Exhaust Side
    const turboPos = new THREE.Vector3(-2.35, 1.95, -0.45);

    // 5-into-1 Exhaust Header Runners from each cylinder (-X port) into the Turbo Turbine Volute
    const exhaustRunnerCurves = [];
    for (let i = 0; i < 5; i++) {
      const zCyl = zStart + i * boreSpacing;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.82, deckY + 0.35, zCyl),
        new THREE.Vector3(-1.68, deckY + 0.05 - Math.abs(i - 2) * 0.12, zCyl * 0.72),
        new THREE.Vector3(turboPos.x + 0.12, turboPos.y + 0.42, turboPos.z)
      ]);
      exhaustRunnerCurves.push(curve);
      const headerGeo = new THREE.TubeGeometry(curve, 24, 0.16, 14, false);
      const headerMesh = registerMesh(new THREE.Mesh(headerGeo), 'exhaustHeader');
      turboSystemGroup.add(headerMesh);
    }

    // Turbocharger Assembly (Turbine Volute + CHRA Bearing Housing + Compressor Volute + Spinning Wheels)
    const turboUnit = new THREE.Group();
    turboUnit.position.copy(turboPos);
    turboSystemGroup.add(turboUnit);

    // Hot Turbine Snail (Volute at Z = -0.36)
    const turbineTorusGeo = new THREE.TorusGeometry(0.56, 0.26, 20, 36);
    const turbineSnailMesh = registerMesh(new THREE.Mesh(turbineTorusGeo), 'turboTurbineSnail');
    turbineSnailMesh.position.z = -0.36;
    turboUnit.add(turbineSnailMesh);

    // Downpipe exiting rear of turbine housing
    const downpipeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(turboPos.x, turboPos.y, turboPos.z - 0.55),
      new THREE.Vector3(turboPos.x - 0.35, turboPos.y - 0.65, turboPos.z - 1.55),
      new THREE.Vector3(turboPos.x - 0.45, turboPos.y - 1.55, turboPos.z - 2.85)
    ]);
    const downpipeGeo = new THREE.TubeGeometry(downpipeCurve, 22, 0.26, 16, false);
    turboSystemGroup.add(registerMesh(new THREE.Mesh(downpipeGeo), 'exhaustHeader'));

    // Center Bearing Cartridge (CHRA)
    const chraGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.72, 24);
    chraGeo.rotateX(Math.PI / 2);
    turboUnit.add(registerMesh(new THREE.Mesh(chraGeo), 'crank'));

    // Cold Polished Aluminum Compressor Snail (Volute at Z = +0.38)
    const compTorusGeo = new THREE.TorusGeometry(0.62, 0.28, 22, 36);
    const compSnailMesh = registerMesh(new THREE.Mesh(compTorusGeo), 'turboCompressorSnail');
    compSnailMesh.position.z = 0.38;
    turboUnit.add(compSnailMesh);

    // Compressor Inlet Funnel Ring
    const funnelGeo = new THREE.CylinderGeometry(0.46, 0.36, 0.28, 28, 1, true);
    funnelGeo.rotateX(Math.PI / 2);
    const funnelMesh = registerMesh(new THREE.Mesh(funnelGeo), 'pin');
    funnelMesh.position.z = 0.58;
    turboUnit.add(funnelMesh);

    // Spinning Turbo Shaft + Compressor Inducer Wheel + Turbine Wheel
    const turboRotorGroup = new THREE.Group();
    turboUnit.add(turboRotorGroup);

    const turboShaftGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.32, 16);
    turboShaftGeo.rotateX(Math.PI / 2);
    turboRotorGroup.add(registerMesh(new THREE.Mesh(turboShaftGeo), 'pin', false));

    const bladeGeo = new THREE.BoxGeometry(0.03, 0.38, 0.18);
    for (let b = 0; b < 10; b++) {
      const ang = (b / 10) * Math.PI * 2;
      // Compressor blade (front +Z)
      const cBlade = registerMesh(new THREE.Mesh(bladeGeo), 'valveIntake', false);
      cBlade.position.set(Math.cos(ang) * 0.16, Math.sin(ang) * 0.16, 0.48);
      cBlade.rotation.z = ang + 0.35;
      turboRotorGroup.add(cBlade);

      // Turbine blade (rear -Z)
      const tBlade = registerMesh(new THREE.Mesh(bladeGeo), 'turbineWheelGold', false);
      tBlade.position.set(Math.cos(ang) * 0.15, Math.sin(ang) * 0.15, -0.46);
      tBlade.rotation.z = ang - 0.35;
      turboRotorGroup.add(tBlade);
    }

    // Boosted Charge Pipe arcing over the front of the engine to the +X Intake Plenum
    const chargePipeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(turboPos.x, turboPos.y + 0.62, turboPos.z + 0.38),
      new THREE.Vector3(turboPos.x + 0.35, deckY + 1.55, zStart + boreSpacing * 4 + 0.95),
      new THREE.Vector3(1.65, deckY + 1.35, zStart + boreSpacing * 4 + 0.95),
      new THREE.Vector3(1.85, deckY + 0.55, zStart + boreSpacing * 3.35)
    ]);
    const chargePipeGeo = new THREE.TubeGeometry(chargePipeCurve, 32, 0.22, 18, false);
    turboSystemGroup.add(registerMesh(new THREE.Mesh(chargePipeGeo), 'chargePipeBlue'));

    // Tapered Cast-Aluminum Surge-Tank Intake Plenum (+X side) & 5 Individual Cast Intake Runners
    const plenumLen = camShaftLen - 0.25;
    const plenumLathePts = [
      new THREE.Vector2(0.0, -plenumLen * 0.5),
      new THREE.Vector2(0.24, -plenumLen * 0.48),
      new THREE.Vector2(0.32, -plenumLen * 0.20),
      new THREE.Vector2(0.42, plenumLen * 0.15),
      new THREE.Vector2(0.46, plenumLen * 0.44),
      new THREE.Vector2(0.26, plenumLen * 0.50)
    ];
    const plenumGeo = new THREE.LatheGeometry(plenumLathePts, 28);
    plenumGeo.rotateX(Math.PI / 2);
    const plenumMesh = registerMesh(new THREE.Mesh(plenumGeo), 'intakeAlum');
    plenumMesh.position.set(1.85, deckY + 0.48, 0);
    turboSystemGroup.add(plenumMesh);

    const intakeRunnerCurves = [];
    for (let i = 0; i < 5; i++) {
      const zCyl = zStart + i * boreSpacing;
      const iCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(1.85, deckY + 0.48, zCyl),
        new THREE.Vector3(1.38, deckY + 0.58, zCyl),
        new THREE.Vector3(0.88, deckY + 0.42, zCyl)
      ]);
      intakeRunnerCurves.push(iCurve);
      const iRunGeo = new THREE.TubeGeometry(iCurve, 16, 0.17, 14, false);
      turboSystemGroup.add(registerMesh(new THREE.Mesh(iRunGeo), 'intakeAlum'));
    }

    // ------------------------------------------------------------------------
    // 8. TURBOCHARGER BOOST & EXHAUST STREAM PARTICLES
    // ------------------------------------------------------------------------
    const sampleCurve = (curve, rawU) => {
      const u = Number.isFinite(rawU) ? Math.max(0.0001, Math.min(0.9999, rawU)) : 0.5;
      return curve.getPoint(u);
    };

    const turboStreamParticles = [];
    for (let i = 0; i < 65; i++) {
      const isBoostStream = i < 35;
      const pMat = new THREE.SpriteMaterial({
        map: glowTexture,
        color: isBoostStream ? 0x38bdf8 : 0xf97316,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const sprite = new THREE.Sprite(pMat);
      const scale = isBoostStream ? 0.32 : 0.36;
      sprite.scale.set(scale, scale, 1);
      gasGroup.add(sprite);

      turboStreamParticles.push({
        sprite,
        mat: pMat,
        isBoostStream,
        cylIdx: i % 5,
        phase: Math.random(),
        baseScale: scale
      });
    }

    // ------------------------------------------------------------------------
    // 9. MATERIAL MODES, VISIBILITY & ANIMATION LOOP
    // ------------------------------------------------------------------------
    const updateMaterialModes = () => {
      const {
        renderMode: rMode,
        blockOpacity: bOp,
        cutawayMode: cut,
        showBlock: sBlock,
        showHeadAndValves: sHead,
        showTurboSystem: sTurbo,
        showGasFlow: sGas,
        exploded: exp,
        theme: activeTheme
      } = simParams.current;

      realisticMats.block.opacity = bOp;
      realisticMats.liner.opacity = bOp * 0.85;
      realisticMats.headCast.opacity = bOp;
      rawBlockMat.opacity = bOp;
      wireframeBlockMat.opacity = Math.max(0.15, bOp);

      trackedMeshes.forEach(({ mesh, type, baseMat, wireOverlay }) => {
        const isTranslucent = type === 'block' || type === 'liner' || type === 'headCast';

        if (rMode === 'realistic') {
          mesh.material = baseMat;
          if (wireOverlay) wireOverlay.visible = false;
        } else if (rMode === 'raw') {
          mesh.material = isTranslucent ? rawBlockMat : rawSolidMat;
          if (wireOverlay) {
            wireOverlay.visible = !isTranslucent;
            wireOverlay.material.color.setHex(activeTheme === 'dark' ? 0x1f2937 : 0x94a3b8);
            wireOverlay.material.opacity = 0.2;
          }
        } else if (rMode === 'wireframe') {
          mesh.material = isTranslucent ? wireframeBlockMat : wireframePrimaryMat;
          if (wireOverlay) wireOverlay.visible = false;
        } else if (rMode === 'shaded_wire') {
          mesh.material = baseMat;
          if (wireOverlay) {
            wireOverlay.visible = true;
            wireOverlay.material.color.setHex(0xfb6514);
            wireOverlay.material.opacity = isTranslucent ? 0.2 : 0.42;
          }
        }
      });

      blockGroup.visible = sBlock;
      blockFrontSkirtMesh.visible = sBlock && (!cut || exp > 0.08);
      headAndValvesGroup.visible = sHead;
      valveCoverGroup.visible = sHead;
      valveCoverFrontMesh.visible = sHead && (!cut || exp > 0.08);
      turboSystemGroup.visible = sTurbo;
      gasGroup.visible = sGas;

      // Exploded View Separation
      headAndValvesGroup.position.y = exp * 1.45;
      valveCoverGroup.position.y = exp * 0.65;
      oilSumpGroup.position.y = -exp * 0.75;
      blockFrontSkirtMesh.position.x = exp * 0.85;
      turboSystemGroup.position.x = -exp * 1.25;
      crankshaftGroup.position.y = -exp * 0.85;

      cylindersData.forEach((cyl) => {
        cyl.linerMesh.geometry = cut ? cyl.cutLinerGeo : cyl.fullLinerGeo;
        cyl.jacketMesh.geometry = cut ? cyl.cutJacketGeo : cyl.fullJacketGeo;
        cyl.jacketRibMeshes.forEach((rib) => {
          rib.geometry = cut ? cyl.cutJacketRibGeo : cyl.fullJacketRibGeo;
        });
      });
    };

    let lastTime = performance.now();
    let uiCounter = 0;
    let animationFrameId;

    const animate = (now) => {
      animationFrameId = requestAnimationFrame(animate);
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Number.isFinite(rawDt) && rawDt > 0 ? Math.min(rawDt, 0.05) : 0.016;

      const {
        rpm: currentRpm,
        isPlaying: playing,
        showGasFlow: gasOn,
        autoRotateCam: autoCam
      } = simParams.current;

      if (playing) {
        const omega = (currentRpm * 2 * Math.PI) / 60;
        const visualSpeedFactor = currentRpm > 1200 ? 0.16 : 0.24;
        crankThetaRef.current = (crankThetaRef.current + omega * dt * visualSpeedFactor) % (4 * Math.PI);
      }

      const crankTheta = crankThetaRef.current;

      // Rotate Crankshaft & Half-Speed DOHC Camshafts
      crankshaftGroup.rotation.z = -crankTheta;
      intakeCamGroup.rotation.z = crankTheta * 0.5;
      exhaustCamGroup.rotation.z = crankTheta * 0.5;

      // Spin the Turbocharger Rotor at high speed proportional to RPM
      const normRpm = Math.max(0, Math.min(1, (currentRpm - 600) / 6600));
      const currentBoost = +(0.12 + Math.pow(normRpm, 1.35) * INLINE5_SPECS.maxBoostBar).toFixed(2);
      const currentTurboRpm = Math.round(18000 + normRpm * 145000);

      if (playing) {
        turboRotorGroup.rotation.z -= dt * (14.0 + normRpm * 42.0);
      }

      // Glow the Turbo Turbine Housing with exhaust heat at high boost
      realisticMats.turboTurbineSnail.emissiveIntensity = 0.15 + normRpm * 0.85;
      realisticMats.exhaustHeader.emissiveIntensity = 0.08 + normRpm * 0.55;
      turboHeatLight.intensity = playing ? 1.2 + normRpm * 4.8 : 0.4;

      let currentFiringCyl = 1;
      let highestCombustionIntensity = -1;

      // Update each of the 5 Cylinders (1-2-4-5-3 Firing Sequence)
      cylindersData.forEach((cyl) => {
        // Phase within the 720° (4π) 4-stroke cycle relative to this cylinder's TDC Power
        const phase = ((crankTheta - cyl.firingAngle) % (4 * Math.PI) + 4 * Math.PI) % (4 * Math.PI);

        // Slider-Crank Kinematics along vertical Y axis
        const sinA = Math.sin(phase);
        const cosA = Math.cos(phase);
        const pinX = r * sinA;
        const pinY = r * cosA;
        const wristY = r * cosA + Math.sqrt(Math.max(0.01, L * L - r * r * sinA * sinA));

        cyl.pistonGroup.position.set(0, wristY, cyl.zPos);
        cyl.rodGroup.position.set(pinX, pinY, cyl.zPos);
        cyl.rodGroup.rotation.z = Math.atan2(pinX, wristY - pinY);

        // 4-Stroke Valve Lift:
        //   0 .. π: Power (Usaha)
        //   π .. 2π: Exhaust (Buang) -> Exhaust valves open
        //   2π .. 3π: Intake (Hisap) -> Intake valves open
        //   3π .. 4π: Compression (Kompresi)
        const maxLift = 0.22;
        const exhLift = (phase >= Math.PI && phase < 2 * Math.PI) ? Math.sin(phase - Math.PI) * maxLift : 0;
        const intLift = (phase >= 2 * Math.PI && phase < 3 * Math.PI) ? Math.sin(phase - 2 * Math.PI) * maxLift : 0;

        cyl.exhaustValves.forEach((ev) => {
          ev.position.y = deckY + 0.38 - exhLift;
        });
        cyl.intakeValves.forEach((iv) => {
          iv.position.y = deckY + 0.38 - intLift;
        });

        // Combustion Flame & Volumetric Chamber Gas Sprites
        let flameIntensity = 0;
        if (phase < 0.72 * Math.PI) {
          const norm = 1 - phase / (0.72 * Math.PI);
          flameIntensity = Math.pow(norm, 1.45);
          if (flameIntensity > highestCombustionIntensity) {
            highestCombustionIntensity = flameIntensity;
            currentFiringCyl = cyl.cylNumber;
          }
        }

        const crownTopY = wristY + pH * 0.5;
        const chamberH = Math.max(0.16, deckY - crownTopY);

        // Core Ignition Flash Sprite
        const coreStrength = phase < 0.35 * Math.PI ? Math.pow(1 - phase / (0.35 * Math.PI), 2.0) : 0;
        cyl.coreMat.opacity = gasOn ? coreStrength * 0.95 : 0;
        const coreS = 0.45 + coreStrength * 0.55;
        cyl.coreSprite.scale.set(coreS, coreS, 1);
        cyl.coreSprite.position.set(0, deckY - 0.1, cyl.zPos);

        // Volumetric Chamber Particles for this Cylinder
        cyl.chamberParticles.forEach((cp) => {
          if (playing) {
            cp.angle += cp.swirlSpd * dt;
          }
          const rad = cp.rFrac * (pR * 0.85);
          const py = crownTopY + 0.06 + cp.yFrac * (chamberH - 0.08);
          cp.sprite.position.set(Math.cos(cp.angle) * rad, py, cyl.zPos + Math.sin(cp.angle) * rad);

          if (phase < Math.PI) {
            // Power Stroke: White-hot -> Neon Orange -> Crimson
            const pNorm = phase / Math.PI;
            cp.mat.color.setHSL(0.03 + (1 - pNorm) * 0.09, 1.0, 0.52 + flameIntensity * 0.32);
            cp.mat.opacity = (cp.isHaze ? 0.5 : 0.88) * Math.max(0.25, flameIntensity);
            const s = cp.baseScale * (1.25 + flameIntensity * 0.35);
            cp.sprite.scale.set(s, s, 1);
          } else if (phase < 2 * Math.PI) {
            // Exhaust Stroke: Smoky Amber-Slate
            cp.mat.color.setHex(0x94a3b8);
            cp.mat.opacity = cp.isHaze ? 0.25 : 0.45;
            cp.sprite.scale.set(cp.baseScale, cp.baseScale, 1);
          } else if (phase < 3 * Math.PI) {
            // Intake Stroke: Boosted Cyan Charge Mist
            cp.mat.color.setHex(0x38bdf8);
            cp.mat.opacity = cp.isHaze ? 0.38 : 0.68;
            cp.sprite.scale.set(cp.baseScale, cp.baseScale, 1);
          } else {
            // Compression Stroke: Pressurizing Cyan -> Golden Amber
            const cNorm = (phase - 3 * Math.PI) / Math.PI;
            cp.mat.color.lerpColors(new THREE.Color(0x38bdf8), new THREE.Color(0xfbbf24), cNorm);
            cp.mat.opacity = (cp.isHaze ? 0.42 : 0.75) * (0.8 + cNorm * 0.3);
            const s = cp.baseScale * (1.0 - cNorm * 0.22);
            cp.sprite.scale.set(s, s, 1);
          }
        });

        // Spark Embers Spraying during Ignition
        const emberActive = (gasOn && flameIntensity > 0.15) ? flameIntensity : 0;
        cyl.embers.forEach((em) => {
          if (emberActive > 0.05) {
            const prog = ((now * 0.0035 * em.spd + em.seed) % 1.0);
            const sprayAng = (em.seed - 0.5) * 1.5;
            const dist = prog * 0.62;
            const ex = Math.sin(sprayAng) * dist;
            const ey = deckY + 0.05 - Math.cos(sprayAng) * dist;
            const ez = cyl.zPos + Math.sin(em.seed * 3) * 0.24 * prog;

            em.sprite.position.set(ex, ey, ez);
            const es = (0.10 + (1 - prog) * 0.14) * emberActive;
            em.sprite.scale.set(es, es, 1);
            em.mat.opacity = emberActive * (1 - prog) * 0.92;
            em.mat.color.setHex(prog < 0.25 ? 0xffffff : 0xfde047);
          } else {
            em.mat.opacity = 0;
          }
        });
      });

      // Animate Turbocharger Charge Pipe & Exhaust Header Stream Particles
      const streamSpd = 0.65 + normRpm * 1.85;
      turboStreamParticles.forEach((tp, idx) => {
        if (playing) {
          tp.phase = (tp.phase + dt * streamSpd) % 1.0;
        }
        const u = Math.max(0.0001, Math.min(0.9999, tp.phase));

        if (tp.isBoostStream) {
          // Alternate between main charge pipe and the 5 intake runners
          const curve = idx % 2 === 0 ? chargePipeCurve : intakeRunnerCurves[tp.cylIdx];
          const pt = sampleCurve(curve, u);
          tp.sprite.position.copy(pt);
          tp.mat.opacity = 0.55 * Math.sin(u * Math.PI);
        } else {
          // Alternate between the 5 exhaust header runners and turbo downpipe
          const curve = idx % 3 === 0 ? downpipeCurve : exhaustRunnerCurves[tp.cylIdx];
          const pt = sampleCurve(curve, u);
          tp.sprite.position.copy(pt);
          tp.mat.opacity = 0.62 * Math.sin(u * Math.PI);
        }
      });

      updateMaterialModes();

      if (autoCam && !camControl.current.isDragging) {
        camControl.current.theta += dt * 0.32;
      }
      const { theta, phi, radius, target } = camControl.current;
      camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
      camera.position.y = target.y + radius * Math.cos(phi);
      camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);
      camera.lookAt(target);

      renderer.render(scene, camera);

      uiCounter++;
      if (uiCounter % 4 === 0) {
        const roundedDeg = Math.round((crankTheta * 180) / Math.PI) % 720;
        setActiveCylinderInfo(currentFiringCyl);
        setCrankDeg(roundedDeg);
        if (playing) {
          setManualDeg(roundedDeg);
        }
        setBoostBar(currentBoost);
        setTurboRpm(currentTurboRpm);
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      glowTexture.dispose();
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  const handlePointerDown = (e) => {
    camControl.current.isDragging = true;
    camControl.current.isPanning = e.button === 2 || e.shiftKey;
    camControl.current.prevX = e.clientX;
    camControl.current.prevY = e.clientY;
    if (e.currentTarget.setPointerCapture) {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e) => {
    if (!camControl.current.isDragging) return;
    const dx = e.clientX - camControl.current.prevX;
    const dy = e.clientY - camControl.current.prevY;
    camControl.current.prevX = e.clientX;
    camControl.current.prevY = e.clientY;

    if (camControl.current.isPanning) {
      camControl.current.target.y += dy * 0.015;
    } else {
      camControl.current.theta -= dx * 0.007;
      camControl.current.phi = Math.max(0.15, Math.min(Math.PI - 0.15, camControl.current.phi - dy * 0.007));
    }
  };

  const handlePointerUp = (e) => {
    camControl.current.isDragging = false;
    if (e.currentTarget.releasePointerCapture && e.hasPointerCapture && e.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleWheel = (e) => {
    camControl.current.radius = Math.max(5.2, Math.min(26, camControl.current.radius + e.deltaY * 0.008));
  };

  const resetCamera = () => {
    setAutoRotateCam(false);
    camControl.current.theta = -0.68;
    camControl.current.phi = 1.18;
    camControl.current.radius = 13.2;
    camControl.current.target.set(0, 1.45, 0);
  };

  // Authentic 2.5L TFSI (400 HP @ 5850-7000 RPM, 500 Nm @ 1950-5850 RPM)
  const hp = Math.round((rpm / 7000) * 400 * (0.85 + 0.15 * Math.sin((rpm / 7000) * Math.PI)));
  const torque = Math.round(320 + 180 * Math.min(1, Math.max(0.1, (rpm - 600) / 1600)));

  const sheet = {
    panel: 'bg-white text-[#101828]',
    idle: 'bg-[#eef1f4] text-[#101828] hover:bg-[#e2e7ec]',
    chosen: 'bg-[#101828] text-white'
  };
  const hit = 'cursor-pointer text-base leading-snug focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fb6514]';

  return (
    <div className="relative w-full h-full overflow-hidden select-none font-sans">
      <div
        ref={mountRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
        className="absolute inset-0 z-0 h-full w-full cursor-grab active:cursor-grabbing"
      />

      {/* =========================================================
          TOP-LEFT: INLINE-5 2.5L TURBO TELEMETRY & 1-2-4-5-3 FIRING MONITOR
      ========================================================= */}
      <div className="pointer-events-none absolute top-4 left-4 z-10 max-h-[calc(100%-11rem)] w-[min(28rem,calc(100%-2rem))] overflow-y-auto max-[720px]:max-h-[50%] max-[720px]:w-[calc(100%-2rem)]">
        <section aria-label="Inline-5 2.5L Turbo" className={`pointer-events-auto flex flex-col gap-5 p-5 ${sheet.panel}`}>
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="m-0 text-[1.75rem] font-semibold leading-none tracking-[-0.03em]">
              Inline-5 2.5T
            </h1>
            <p
              className="m-0 text-[1.75rem] font-semibold leading-none tracking-[-0.03em] tabular-nums"
              aria-label={`Sudut kruk as ${crankDeg} derajat`}
            >
              {crankDeg}°
            </p>
          </div>

          <p className="m-0 text-base leading-relaxed">
            5 silinder segaris 2.480 cc DOHC 20-katup dengan turbocharger. Pengapian berselang 144° dengan urutan khas 1-2-4-5-3.
          </p>

          <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Firing order 1-2-4-5-3">
            {INLINE5_SPECS.firingOrder.map((cylNum) => {
              const isFiring = activeCylinderInfo === cylNum;
              return (
                <button
                  key={cylNum}
                  type="button"
                  onClick={() => {
                    const targetRad = INLINE5_SPECS.firingAngles[cylNum - 1] + 0.15;
                    handleManualAngleChange(Math.round((targetRad * 180) / Math.PI));
                  }}
                  className={`py-2.5 text-center text-base font-semibold tabular-nums ${hit} ${
                    isFiring ? 'bg-[#fb6514] text-[#101828]' : 'bg-[#eef1f4] text-[#101828] hover:bg-[#e2e7ec]'
                  }`}
                >
                  #{cylNum}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Putaran mesin', value: isPlaying ? rpm : 0, unit: 'rpm' },
              { label: 'Tekanan Turbo', value: isPlaying ? `+${boostBar}` : '0.00', unit: 'bar' },
              { label: 'Tenaga & Torsi', value: isPlaying ? `${hp} hp` : '0 hp', unit: `/ ${isPlaying ? torque : 0} Nm` },
              { label: 'Putaran Turbin', value: isPlaying ? `${(turboRpm / 1000).toFixed(0)}k` : '0', unit: 'rpm' }
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
              { label: 'Block & liners', state: showBlock, setter: setShowBlock },
              { label: '20V DOHC head', state: showHeadAndValves, setter: setShowHeadAndValves },
              { label: 'Turbo & manifold', state: showTurboSystem, setter: setShowTurboSystem },
              { label: 'Gas & combustion', state: showGasFlow, setter: setShowGasFlow }
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
          <div className="flex flex-col gap-2">
            <p className="m-0 text-base">
              <span className="font-semibold tabular-nums">{rpm}</span> rpm
            </p>
            <SquareRange
              min={60}
              max={7200}
              step={20}
              value={rpm}
              label="RPM"
              onChange={(e) => setRpm(Number(e.target.value))}
            />
            <div className="flex flex-wrap gap-2">
              {[
                { value: 120, label: '120 slow-mo' },
                { value: 900, label: '900 idle' },
                { value: 3800, label: '3800 boost' },
                { value: 7000, label: '7000 redline' }
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
              <span className="font-semibold tabular-nums">{crankDeg}°</span> (144° interval)
            </p>
            <SquareRange
              min={0}
              max={719}
              step={1}
              value={manualDeg}
              label="Crank angle"
              onChange={(e) => handleManualAngleChange(Number(e.target.value))}
            />
            <p className="m-0 flex flex-wrap gap-x-2.5 gap-y-1 text-base">
              <span>0° #1</span>
              <span>144° #2</span>
              <span>288° #4</span>
              <span>432° #5</span>
              <span>576° #3</span>
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
              setRpm(900);
              setExploded(0);
              setBlockOpacity(0.28);
              setCutawayMode(true);
              setRenderMode('realistic');
              setShowBlock(true);
              setShowHeadAndValves(true);
              setShowTurboSystem(true);
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
