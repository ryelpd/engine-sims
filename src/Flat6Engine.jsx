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
// PORSCHE 911 GT3 4.0L FLAT-6 BOXER ENGINE SPECIFICATIONS (FIRING: 1-6-2-4-3-5)
// ============================================================================
// True 180° Horizontally Opposed Boxer (6 independent crankpins):
//   Left Bank (-X):  Cyl 1 (front), Cyl 2 (mid), Cyl 3 (rear)
//   Right Bank (+X): Cyl 4 (front), Cyl 5 (mid), Cyl 6 (rear)
// Opposed Boxer Pairs (180° crankpin offset -> both pistons move OUT to TDC & IN to BDC together!):
//   Pair A: Cyl 1 (0° TDC Power)   <-> Cyl 4 (360° TDC Power)
//   Pair B: Cyl 2 (240° TDC Power) <-> Cyl 5 (600° TDC Power)
//   Pair C: Cyl 3 (480° TDC Power) <-> Cyl 6 (120° TDC Power)
const FLAT6_SPECS = {
  crankRadius: 0.68,         // Oversquare high-revving 81.5 mm stroke (9,000 RPM GT3 geometry)
  rodLength: 2.18,           // Titanium forged connecting rod
  pistonRadius: 0.74,        // 102.0 mm big-bore cylinder
  pistonHeight: 0.72,        // Short-skirt lightweight forged slipper piston
  pairSpacingZ: 1.85,        // Z spacing between the 3 opposed pairs (Front, Mid, Rear)
  bankOffsetZ: 0.24,         // Slight Z offset between opposed connecting rods on their separate crankpins
  displacementL: '4.0',
  compressionRatio: '13.3 : 1',
  maxRpm: 9000,
  firingOrder: [1, 6, 2, 4, 3, 5],
  cylinders: [
    // Left Bank (-X, bankSign = -1)
    { cylNumber: 1, bank: 'L', bankSign: -1, pairIdx: 0, pairLabel: '#1 ↔ #4', firingAngle: 0 },
    { cylNumber: 2, bank: 'L', bankSign: -1, pairIdx: 1, pairLabel: '#2 ↔ #5', firingAngle: (4 * Math.PI) / 3 },
    { cylNumber: 3, bank: 'L', bankSign: -1, pairIdx: 2, pairLabel: '#3 ↔ #6', firingAngle: (8 * Math.PI) / 3 },
    // Right Bank (+X, bankSign = +1)
    { cylNumber: 4, bank: 'R', bankSign: +1, pairIdx: 0, pairLabel: '#1 ↔ #4', firingAngle: 2 * Math.PI },
    { cylNumber: 5, bank: 'R', bankSign: +1, pairIdx: 1, pairLabel: '#2 ↔ #5', firingAngle: (10 * Math.PI) / 3 },
    { cylNumber: 6, bank: 'R', bankSign: +1, pairIdx: 2, pairLabel: '#3 ↔ #6', firingAngle: (2 * Math.PI) / 3 }
  ]
};

export default function Flat6Engine({ theme = 'dark' }) {
  const mountRef = useRef(null);

  const [rpm, setRpm] = useState(1000);
  const [isPlaying, setIsPlaying] = useState(true);
  const [manualDeg, setManualDeg] = useState(0);
  const [renderMode, setRenderMode] = useState('realistic');
  const [exploded, setExploded] = useState(0);
  const [blockOpacity, setBlockOpacity] = useState(0.28);
  const [cutawayMode, setCutawayMode] = useState(true);
  const [showBlock, setShowBlock] = useState(true);
  const [showHeadAndValves, setShowHeadAndValves] = useState(true);
  const [showIntakeAndFan, setShowIntakeAndFan] = useState(true);
  const [showGasAndExhaust, setShowGasAndExhaust] = useState(true);
  const [autoRotateCam, setAutoRotateCam] = useState(false);

  // Live Telemetry States
  const [activeCylinderInfo, setActiveCylinderInfo] = useState(1);
  const [activePairInfo, setActivePairInfo] = useState('#1 ↔ #4');
  const [crankDeg, setCrankDeg] = useState(0);
  const [varioCamLiftMm, setVarioCamLiftMm] = useState(9.2);

  const crankThetaRef = useRef(0);

  const simParams = useRef({
    theme,
    rpm: 1000,
    isPlaying: true,
    manualDeg: 0,
    renderMode: 'realistic',
    exploded: 0,
    blockOpacity: 0.28,
    cutawayMode: true,
    showBlock: true,
    showHeadAndValves: true,
    showIntakeAndFan: true,
    showGasAndExhaust: true,
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
    theta: 0.58,
    phi: 1.02,
    radius: 13.8,
    target: new THREE.Vector3(0, 0.35, 0)
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
      showHeadAndValves,
      showIntakeAndFan,
      showGasAndExhaust,
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
    showIntakeAndFan,
    showGasAndExhaust,
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
    renderer.toneMappingExposure = 1.16;

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

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 2.3);
    keyLight.position.set(11, 15, 11);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    scene.add(keyLight);

    const rimLight1 = new THREE.DirectionalLight(0x38bdf8, isInitialDark ? 1.15 : 0.85);
    rimLight1.position.set(14, 6, -10);
    scene.add(rimLight1);
    sceneElements.current.rimLight1 = rimLight1;

    const rimLight2 = new THREE.DirectionalLight(0xf97316, isInitialDark ? 0.95 : 0.75);
    rimLight2.position.set(-14, 5, 10);
    scene.add(rimLight2);
    sceneElements.current.rimLight2 = rimLight2;

    // Glowing point light under the rear GT3 titanium exhaust collector
    const exhaustHeatLight = new THREE.PointLight(0xff4500, 0, 7.5, 1.5);
    exhaustHeatLight.position.set(0, -1.5, -3.2);
    scene.add(exhaustHeatLight);

    const gridHelper = new THREE.GridHelper(34, 34, isInitialDark ? 0x334155 : 0x94a3b8, isInitialDark ? 0x1e293b : 0xcbd5e1);
    gridHelper.position.y = -2.45;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.42;
    scene.add(gridHelper);
    sceneElements.current.gridHelper = gridHelper;

    // ------------------------------------------------------------------------
    // 2. PBR MATERIALS & WIREFRAME SHADING REGISTRY
    // ------------------------------------------------------------------------
    const realisticMats = {
      crank: new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.88, roughness: 0.2 }),
      counterweight: new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.3 }),
      pin: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.12 }),
      titaniumRod: new THREE.MeshStandardMaterial({ color: 0xa8a29e, metalness: 0.85, roughness: 0.24 }),
      piston: new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.86, roughness: 0.18 }),
      pistonRing: new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.96, roughness: 0.1 }),
      oilRing: new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.88, roughness: 0.2 }),
      valveIntake: new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.78, roughness: 0.22 }),
      valveExhaust: new THREE.MeshStandardMaterial({ color: 0xf97316, metalness: 0.78, roughness: 0.22 }),
      camshaft: new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.86, roughness: 0.2 }),
      gt3RedCover: new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.46, roughness: 0.28 }),
      coilPackRed: new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.38, roughness: 0.34 }),
      carbonPlenum: new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.42, roughness: 0.26 }),
      flywheel: new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.82, roughness: 0.28 }),
      intakeAlum: new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.78, roughness: 0.24 }),
      resonanceBlue: new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.58, roughness: 0.28 }),
      fanBronze: new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.72, roughness: 0.28 }),
      exhaustHeader: new THREE.MeshStandardMaterial({
        color: 0x9a3412,
        metalness: 0.78,
        roughness: 0.3,
        emissive: 0x7c2d12,
        emissiveIntensity: 0.15
      }),
      titaniumTailpipe: new THREE.MeshStandardMaterial({
        color: 0x78716c,
        metalness: 0.88,
        roughness: 0.22,
        emissive: 0xff4500,
        emissiveIntensity: 0.18
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
      pairSpacingZ,
      bankOffsetZ,
      cylinders: cylSpecs
    } = FLAT6_SPECS;

    // Horizontal Outer Deck distance along X from Crankshaft Center (0, 0, z):
    // Outer TDC wristPinX = ±(r + L) = ±2.86
    // Outer piston crown face at TDC = ±(r + L + pH * 0.5) = ±3.22
    const deckX = r + L + pH * 0.5 + 0.14; // 3.36
    const pairZPositions = [pairSpacingZ, 0, -pairSpacingZ]; // Front (+1.85), Mid (0), Rear (-1.85)

    // ------------------------------------------------------------------------
    // 3. 6-THROW 180° BOXER CRANKSHAFT, KNIFE-EDGE COUNTERWEIGHTS & FLYWHEEL
    // ------------------------------------------------------------------------
    const crankshaftGroup = new THREE.Group();
    engineRoot.add(crankshaftGroup);

    // Central Main Bearing Journals along Z
    const mainJournalZ = [
      pairSpacingZ + 0.82,
      pairSpacingZ,
      pairSpacingZ * 0.5,
      0,
      -pairSpacingZ * 0.5,
      -pairSpacingZ,
      -pairSpacingZ - 0.82
    ];
    mainJournalZ.forEach((zj) => {
      const jGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.28, 24);
      jGeo.rotateX(Math.PI / 2);
      const jMesh = registerMesh(new THREE.Mesh(jGeo), 'crank');
      jMesh.position.set(0, 0, zj);
      crankshaftGroup.add(jMesh);
    });

    // Sculpted GT3 Knife-Edged Counterweight Shape (oriented so pin is at +X when angle = 0)
    const cwShape = new THREE.Shape();
    cwShape.moveTo(-0.32, -0.15);
    cwShape.lineTo(-0.24, r + 0.2);
    cwShape.absarc(0, r, 0.24, Math.PI, 0, true);
    cwShape.lineTo(0.32, -0.15);
    cwShape.bezierCurveTo(0.68, -0.32, 0.82, -0.75, 0.48, -0.98);
    cwShape.quadraticCurveTo(0, -1.12, -0.48, -0.98);
    cwShape.bezierCurveTo(-0.82, -0.75, -0.68, -0.32, -0.32, -0.15);

    const cwExtrudeGeo = new THREE.ExtrudeGeometry(cwShape, {
      depth: 0.12,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.018,
      bevelThickness: 0.018
    });
    cwExtrudeGeo.translate(0, 0, -0.06);

    // Build all 6 dedicated Boxer Crankpins (3 Opposed Pairs)
    cylSpecs.forEach((spec) => {
      const zPair = pairZPositions[spec.pairIdx];
      // Left bank (-X) cylinder sits at zPair + bankOffsetZ; Right bank (+X) sits at zPair - bankOffsetZ
      const zCyl = zPair + (spec.bankSign < 0 ? bankOffsetZ : -bankOffsetZ);

      // When crankTheta === spec.firingAngle, this cylinder is at its Outer TDC (x = bankSign * r, y = 0).
      // Since crankshaftGroup.rotation.z = -crankTheta, local angle α in crankshaftGroup satisfies:
      // worldAngle = α - crankTheta.
      // At crankTheta = firingAngle, we want pin at (-r, 0) for Left Bank (worldAngle = π)
      // or (+r, 0) for Right Bank (worldAngle = 0).
      // Because cwExtrudeGeo has its pin at (0, +r) (local +Y = π/2), rotating throwHolder by:
      //   localRotZ = spec.firingAngle + (spec.bankSign < 0 ? Math.PI / 2 : -Math.PI / 2)
      // places the pin at (-r, 0) for Left Bank and (+r, 0) for Right Bank when crankTheta = firingAngle!
      // Notice that for any opposed pair (e.g. #1 at 0° Left and #4 at 360° Right):
      //   #1 localRotZ = 0 + π/2 = +π/2
      //   #4 localRotZ = 2π - π/2 = -π/2
      // They are 180° (π rad) apart on the crankshaft!
      const localRotZ = spec.firingAngle + (spec.bankSign < 0 ? Math.PI / 2 : -Math.PI / 2);

      const throwHolder = new THREE.Group();
      throwHolder.position.z = zCyl;
      throwHolder.rotation.z = localRotZ;
      crankshaftGroup.add(throwHolder);

      const pinGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.36, 24);
      pinGeo.rotateX(Math.PI / 2);
      const pinMesh = registerMesh(new THREE.Mesh(pinGeo), 'pin');
      pinMesh.position.set(0, r, 0);
      throwHolder.add(pinMesh);

      [-0.21, 0.21].forEach((webZ) => {
        const webMesh = registerMesh(new THREE.Mesh(cwExtrudeGeo), 'counterweight');
        webMesh.position.z = webZ;
        throwHolder.add(webMesh);
      });
    });

    // Rear Lightweight Single-Mass GT3 RS Flywheel & Clutch Ring Gear (z = -pairSpacingZ - 1.25)
    const flywheelGeo = new THREE.CylinderGeometry(1.42, 1.42, 0.22, 40);
    flywheelGeo.rotateX(Math.PI / 2);
    const flywheelMesh = registerMesh(new THREE.Mesh(flywheelGeo), 'flywheel');
    flywheelMesh.position.set(0, 0, -pairSpacingZ - 1.25);
    crankshaftGroup.add(flywheelMesh);

    // Front Crank Pulley & Belt Sheave (z = pairSpacingZ + 1.18)
    const frontPulleyGeo = new THREE.CylinderGeometry(0.56, 0.56, 0.26, 32);
    frontPulleyGeo.rotateX(Math.PI / 2);
    const frontPulleyMesh = registerMesh(new THREE.Mesh(frontPulleyGeo), 'flywheel');
    frontPulleyMesh.position.set(0, 0, pairSpacingZ + 1.18);
    crankshaftGroup.add(frontPulleyMesh);

    // ------------------------------------------------------------------------
    // 4. 6 HORIZONTALLY OPPOSED PISTONS, TITANIUM RODS, LINERS & 24V HEADS
    // ------------------------------------------------------------------------
    const cylindersData = [];
    const blockLeftGroup = new THREE.Group();
    const blockRightGroup = new THREE.Group();
    engineRoot.add(blockLeftGroup, blockRightGroup);

    const headLeftGroup = new THREE.Group();
    const headRightGroup = new THREE.Group();
    engineRoot.add(headLeftGroup, headRightGroup);

    const intakeAndFanGroup = new THREE.Group();
    engineRoot.add(intakeAndFanGroup);

    const exhaustGroup = new THREE.Group();
    engineRoot.add(exhaustGroup);

    const gasGroup = new THREE.Group();
    engineRoot.add(gasGroup);

    // Reusable Forged Boxer Piston Geometries (oriented along local +Y, then rotated to ±X)
    const crownGeo = new THREE.CylinderGeometry(pR, pR, pH * 0.55, 32);
    crownGeo.translate(0, pH * 0.22, 0);
    const skirtGeo = new THREE.CylinderGeometry(pR * 0.96, pR * 0.94, pH * 0.45, 28);
    skirtGeo.translate(0, -pH * 0.22, 0);
    const wristPinGeo = new THREE.CylinderGeometry(0.17, 0.17, pR * 1.62, 20);
    wristPinGeo.rotateX(Math.PI / 2);

    const topRingGeo = new THREE.TorusGeometry(pR + 0.01, 0.016, 10, 32);
    topRingGeo.rotateX(Math.PI / 2);

    // Titanium Forged H-Beam Connecting Rod Geometry (extends from (0,0,0) big end to (0, L, 0) small end)
    const bigEndGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.32, 24);
    bigEndGeo.rotateX(Math.PI / 2);
    const smallEndGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.28, 20);
    smallEndGeo.rotateX(Math.PI / 2);
    smallEndGeo.translate(0, L, 0);

    const rodBeamShape = new THREE.Shape();
    rodBeamShape.moveTo(-0.23, 0.18);
    rodBeamShape.quadraticCurveTo(-0.13, L * 0.5, -0.16, L - 0.14);
    rodBeamShape.lineTo(0.16, L - 0.14);
    rodBeamShape.quadraticCurveTo(0.13, L * 0.5, 0.23, 0.18);
    rodBeamShape.closePath();
    const rodBeamGeo = new THREE.ExtrudeGeometry(rodBeamShape, {
      depth: 0.14,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.016,
      bevelThickness: 0.016
    });
    rodBeamGeo.translate(0, 0, -0.07);

    // Horizontal Cylinder Liner & Finned Boxer Water/Air-Cooled Barrel Geometries (oriented along X!)
    const linerLen = 2.15;
    const fullLinerGeo = new THREE.CylinderGeometry(pR + 0.045, pR + 0.045, linerLen, 32, 1, true);
    fullLinerGeo.rotateZ(Math.PI / 2);
    // Cutaway opens the top (+Y) of the horizontal cylinder liner so we look down inside!
    const cutLinerGeo = new THREE.CylinderGeometry(pR + 0.045, pR + 0.045, linerLen, 32, 1, true, Math.PI * 0.45, Math.PI * 1.15);
    cutLinerGeo.rotateZ(Math.PI / 2);

    const jacketLen = linerLen + 0.08;
    const fullJacketGeo = new THREE.CylinderGeometry(pR + 0.28, pR + 0.26, jacketLen, 32, 1, false);
    fullJacketGeo.rotateZ(Math.PI / 2);
    const cutJacketGeo = new THREE.CylinderGeometry(pR + 0.28, pR + 0.26, jacketLen, 32, 1, false, Math.PI * 0.4, Math.PI * 1.25);
    cutJacketGeo.rotateZ(Math.PI / 2);

    // Iconic Porsche Boxer Cooling Fins around each horizontal cylinder barrel
    const fullFinGeo = new THREE.TorusGeometry(pR + 0.34, 0.032, 8, 32);
    fullFinGeo.rotateY(Math.PI / 2);
    const cutFinGeo = new THREE.TorusGeometry(pR + 0.34, 0.032, 8, 32, Math.PI * 1.25);
    cutFinGeo.rotateY(Math.PI / 2);
    cutFinGeo.rotateX(Math.PI * 0.38);

    // Helical Valve Spring Geometry (oriented along local +Y, then tilted into the horizontal head)
    const springPts = [];
    const springTurns = 5;
    const springSamples = 45;
    for (let s = 0; s <= springSamples; s++) {
      const t = s / springSamples;
      const ang = t * springTurns * Math.PI * 2;
      const sr = 0.095;
      springPts.push(new THREE.Vector3(Math.cos(ang) * sr, 0.12 + t * 0.42, Math.sin(ang) * sr));
    }
    const valveSpringCurve = new THREE.CatmullRomCurve3(springPts);
    const valveSpringGeo = new THREE.TubeGeometry(valveSpringCurve, 40, 0.019, 8, false);
    const valveRetainerGeo = new THREE.CylinderGeometry(0.115, 0.085, 0.055, 16);
    valveRetainerGeo.translate(0, 0.56, 0);

    // Build all 6 Horizontally Opposed Cylinders
    cylSpecs.forEach((spec) => {
      const zPair = pairZPositions[spec.pairIdx];
      const zPos = zPair + (spec.bankSign < 0 ? bankOffsetZ : -bankOffsetZ);
      const bSign = spec.bankSign; // -1 for Left Bank (Cyl 1,2,3), +1 for Right Bank (Cyl 4,5,6)
      const targetBlockGroup = bSign < 0 ? blockLeftGroup : blockRightGroup;
      const targetHeadGroup = bSign < 0 ? headLeftGroup : headRightGroup;

      // A. Horizontal Piston Assembly
      const pistonGroup = new THREE.Group();
      // Rotate local +Y crown outward to -X (bSign = -1 -> rotZ = +π/2) or +X (bSign = +1 -> rotZ = -π/2)
      pistonGroup.rotation.z = bSign < 0 ? Math.PI / 2 : -Math.PI / 2;
      engineRoot.add(pistonGroup);

      pistonGroup.add(registerMesh(new THREE.Mesh(crownGeo), 'piston'));
      pistonGroup.add(registerMesh(new THREE.Mesh(skirtGeo), 'piston'));
      pistonGroup.add(registerMesh(new THREE.Mesh(wristPinGeo), 'pin'));

      [0.34, 0.25, 0.16].forEach((ry, rIdx) => {
        const ring = registerMesh(new THREE.Mesh(topRingGeo), rIdx === 2 ? 'oilRing' : 'pistonRing', false);
        ring.position.y = ry;
        pistonGroup.add(ring);
      });

      // B. Titanium Connecting Rod Assembly
      const rodGroup = new THREE.Group();
      engineRoot.add(rodGroup);
      rodGroup.add(registerMesh(new THREE.Mesh(bigEndGeo), 'titaniumRod'));
      rodGroup.add(registerMesh(new THREE.Mesh(rodBeamGeo), 'titaniumRod'));
      rodGroup.add(registerMesh(new THREE.Mesh(smallEndGeo), 'titaniumRod'));

      // C. Horizontal Cylinder Liner, Barrel & Cooling Fins
      const barrelCenterX = bSign * (r + L - 0.55);
      const linerMesh = registerMesh(new THREE.Mesh(fullLinerGeo), 'liner');
      linerMesh.position.set(barrelCenterX, 0, zPos);
      targetBlockGroup.add(linerMesh);

      const jacketMesh = registerMesh(new THREE.Mesh(fullJacketGeo), 'block');
      jacketMesh.position.set(barrelCenterX, 0, zPos);
      targetBlockGroup.add(jacketMesh);

      const finMeshes = [];
      [-0.72, -0.36, 0, 0.36, 0.72].forEach((fx) => {
        const finMesh = registerMesh(new THREE.Mesh(fullFinGeo), 'block', false);
        finMesh.position.set(barrelCenterX + fx, 0, zPos);
        targetBlockGroup.add(finMesh);
        finMeshes.push(finMesh);
      });

      // D. 4 Horizontal DOHC Valves per Cylinder (2 Upper Intake +Y, 2 Lower Exhaust -Y)
      const intakeValves = [];
      const exhaustValves = [];
      const headSeatX = bSign * (deckX + 0.32);

      [-0.24, 0.24].forEach((vz) => {
        // Upper Intake Valve (+Y side of horizontal cylinder head)
        const ivGroup = new THREE.Group();
        ivGroup.position.set(headSeatX, 0.30, zPos + vz);
        // Valve stem points outward along bSign * X and slightly upward (+Y)
        ivGroup.rotation.z = (bSign < 0 ? Math.PI / 2 : -Math.PI / 2) - bSign * 0.25;
        const ivStem = registerMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.72, 12)), 'valveIntake', false);
        ivStem.position.y = 0.34;
        const ivDisc = registerMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.065, 0.065, 20)), 'valveIntake');
        const ivRetainer = registerMesh(new THREE.Mesh(valveRetainerGeo), 'pin', false);
        ivGroup.add(ivStem, ivDisc, ivRetainer);
        targetHeadGroup.add(ivGroup);
        intakeValves.push(ivGroup);

        const ivSpring = registerMesh(new THREE.Mesh(valveSpringGeo), 'crank', false);
        ivSpring.position.copy(ivGroup.position);
        ivSpring.rotation.copy(ivGroup.rotation);
        targetHeadGroup.add(ivSpring);

        // Lower Exhaust Valve (-Y side of horizontal cylinder head)
        const evGroup = new THREE.Group();
        evGroup.position.set(headSeatX, -0.30, zPos + vz);
        evGroup.rotation.z = (bSign < 0 ? Math.PI / 2 : -Math.PI / 2) + bSign * 0.25;
        const evStem = registerMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.72, 12)), 'valveExhaust', false);
        evStem.position.y = 0.34;
        const evDisc = registerMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.065, 0.065, 20)), 'valveExhaust');
        const evRetainer = registerMesh(new THREE.Mesh(valveRetainerGeo), 'pin', false);
        evGroup.add(evStem, evDisc, evRetainer);
        targetHeadGroup.add(evGroup);
        exhaustValves.push(evGroup);

        const evSpring = registerMesh(new THREE.Mesh(valveSpringGeo), 'crank', false);
        evSpring.position.copy(evGroup.position);
        evSpring.rotation.copy(evGroup.rotation);
        targetHeadGroup.add(evSpring);
      });

      // Horizontal Center Spark Plug & Red Porsche Pencil Ignition Coil Pack
      const plugGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.68, 14);
      plugGeo.rotateZ(Math.PI / 2);
      const plugMesh = registerMesh(new THREE.Mesh(plugGeo), 'pin', false);
      plugMesh.position.set(bSign * (deckX + 0.45), 0, zPos);
      targetHeadGroup.add(plugMesh);

      const coilGeo = new THREE.CylinderGeometry(0.12, 0.10, 0.58, 16);
      coilGeo.rotateZ(Math.PI / 2);
      const coilMesh = registerMesh(new THREE.Mesh(coilGeo), 'coilPackRed');
      coilMesh.position.set(bSign * (deckX + 0.98), 0, zPos);
      targetHeadGroup.add(coilMesh);

      // E. Volumetric Soft-Glow Horizontal Chamber Sprites & Ignition Embers
      const chamberParticles = [];
      for (let p = 0; p < 18; p++) {
        const isHaze = p % 4 === 0;
        const baseScale = isHaze ? (0.56 + Math.random() * 0.26) : (0.22 + Math.random() * 0.14);
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
          xFrac: Math.random(),
          swirlSpd: (Math.random() - 0.5) * 4.5
        });
      }

      const coreMat = new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const coreSprite = new THREE.Sprite(coreMat);
      coreSprite.position.set(bSign * (deckX - 0.12), 0, zPos);
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
        ...spec,
        zPos,
        headSeatX,
        pistonGroup,
        rodGroup,
        linerMesh,
        fullLinerGeo,
        cutLinerGeo,
        jacketMesh,
        fullJacketGeo,
        cutJacketGeo,
        finMeshes,
        fullFinGeo,
        cutFinGeo,
        intakeValves,
        exhaustValves,
        chamberParticles,
        coreSprite,
        coreMat,
        embers
      });
    });

    // ------------------------------------------------------------------------
    // 5. SPLIT-CASE MEZGER CAST-ALUMINUM CRANKCASE & DRY-SUMP OIL PAN
    // ------------------------------------------------------------------------
    const caseLengthZ = pairSpacingZ * 2 + 1.85;
    [-1, 1].forEach((bSign) => {
      const targetBlock = bSign < 0 ? blockLeftGroup : blockRightGroup;

      // Sculpted Split Crankcase Half
      const caseHalfShape = new THREE.Shape();
      caseHalfShape.moveTo(0, -1.15);
      caseHalfShape.lineTo(bSign * 1.35, -1.05);
      caseHalfShape.lineTo(bSign * 1.55, -0.68);
      caseHalfShape.lineTo(bSign * 1.55, 0.68);
      caseHalfShape.lineTo(bSign * 1.25, 1.08);
      caseHalfShape.lineTo(0, 1.18);
      caseHalfShape.closePath();

      const caseHalfGeo = new THREE.ExtrudeGeometry(caseHalfShape, {
        depth: caseLengthZ,
        bevelEnabled: true,
        bevelSegments: 2,
        steps: 1,
        bevelSize: 0.04,
        bevelThickness: 0.04
      });
      caseHalfGeo.translate(0, 0, -caseLengthZ * 0.5);
      const caseHalfMesh = registerMesh(new THREE.Mesh(caseHalfGeo), 'block');
      targetBlock.add(caseHalfMesh);

      // Outer Cylinder Bank Deck Plate (where the 3 cylinder barrels meet the cylinder head)
      const deckPlateGeo = new THREE.BoxGeometry(0.18, 1.92, caseLengthZ - 0.15);
      const deckPlateMesh = registerMesh(new THREE.Mesh(deckPlateGeo), 'block');
      deckPlateMesh.position.set(bSign * (deckX - 0.06), 0, 0);
      targetBlock.add(deckPlateMesh);

      // Main Bearing Web Bulkheads inside each crankcase half
      [-pairSpacingZ - 0.75, -pairSpacingZ * 0.5, 0, pairSpacingZ * 0.5, pairSpacingZ + 0.75].forEach((wz) => {
        const webGeo = new THREE.BoxGeometry(1.42, 1.95, 0.12);
        const webMesh = registerMesh(new THREE.Mesh(webGeo), 'block', false);
        webMesh.position.set(bSign * 0.72, 0, wz);
        targetBlock.add(webMesh);
      });

      // Ultra-Flat Porsche Dry-Sump Scavenging Baseplate (-Y)
      const sumpHalfGeo = new THREE.BoxGeometry(1.38, 0.22, caseLengthZ - 0.2);
      const sumpHalfMesh = registerMesh(new THREE.Mesh(sumpHalfGeo), 'flywheel');
      sumpHalfMesh.position.set(bSign * 0.69, -1.26, 0);
      targetBlock.add(sumpHalfMesh);
    });

    // ------------------------------------------------------------------------
    // 6. QUAD-CAM (4 OVERHEAD CAMSHAFTS), VVT GEARS & GT3 RED VALVE COVERS
    // ------------------------------------------------------------------------
    const quadCams = [];
    const camLen = caseLengthZ - 0.25;

    [-1, 1].forEach((bSign) => {
      const targetHead = bSign < 0 ? headLeftGroup : headRightGroup;

      // Translucent Cast-Aluminum Cylinder Head Housing on each bank
      const headBoxGeo = new THREE.BoxGeometry(0.86, 1.96, camLen);
      const headBoxMesh = registerMesh(new THREE.Mesh(headBoxGeo), 'headCast');
      headBoxMesh.position.set(bSign * (deckX + 0.44), 0, 0);
      targetHead.add(headBoxMesh);

      // 5 Cam Bearing Bridges per Bank
      for (let b = 0; b < 4; b++) {
        const bz = -pairSpacingZ * 0.9 + b * (pairSpacingZ * 0.6);
        const bridgeGeo = new THREE.BoxGeometry(0.45, 1.65, 0.14);
        const bridgeMesh = registerMesh(new THREE.Mesh(bridgeGeo), 'intakeAlum', false);
        bridgeMesh.position.set(bSign * (deckX + 0.74), 0, bz);
        targetHead.add(bridgeMesh);
      }

      // Upper Intake Camshaft (+Y = +0.52) & Lower Exhaust Camshaft (-Y = -0.52)
      [
        { yOff: 0.52, isIntake: true },
        { yOff: -0.52, isIntake: false }
      ].forEach(({ yOff, isIntake }) => {
        const camGroup = new THREE.Group();
        camGroup.position.set(bSign * (deckX + 0.84), yOff, 0);
        targetHead.add(camGroup);

        const shaftGeo = new THREE.CylinderGeometry(0.10, 0.10, camLen, 20);
        shaftGeo.rotateX(Math.PI / 2);
        camGroup.add(registerMesh(new THREE.Mesh(shaftGeo), 'camshaft'));

        // VarioCam Plus Helical Timing Sprocket at the front (+Z) of each camshaft
        const vvtGearGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.14, 24);
        vvtGearGeo.rotateX(Math.PI / 2);
        const vvtGearMesh = registerMesh(new THREE.Mesh(vvtGearGeo), 'fanBronze');
        vvtGearMesh.position.z = camLen * 0.5 + 0.08;
        camGroup.add(vvtGearMesh);

        // Cam Lobes for the 3 cylinders on this bank
        cylSpecs
          .filter((cs) => cs.bankSign === bSign)
          .forEach((cs) => {
            const zCyl = pairZPositions[cs.pairIdx] + (bSign < 0 ? bankOffsetZ : -bankOffsetZ);
            // Cam lobe angle so lobe presses inward toward the valve stem at Exhaust (1.5π) or Intake (2.5π)
            const targetPhase = isIntake ? 2.5 * Math.PI : 1.5 * Math.PI;
            const lobeRot = (cs.firingAngle + targetPhase) * 0.5 + (bSign < 0 ? Math.PI / 2 : -Math.PI / 2);

            [-0.24, 0.24].forEach((vz) => {
              const lobeGeo = new THREE.CylinderGeometry(0.11, 0.14, 0.14, 16);
              lobeGeo.rotateX(Math.PI / 2);
              lobeGeo.translate(0, 0.06, 0);
              const lobeMesh = registerMesh(new THREE.Mesh(lobeGeo), 'pin', false);
              lobeMesh.position.z = zCyl + vz;
              lobeMesh.rotation.z = lobeRot;
              camGroup.add(lobeMesh);
            });
          });

        quadCams.push(camGroup);
      });

      // Iconic Porsche 911 GT3 Red Upper & Lower Cam Cover Strips (with central spark plug window)
      [0.62, -0.62].forEach((cy) => {
        const coverStripGeo = new THREE.BoxGeometry(0.24, 0.52, camLen - 0.08);
        const coverStripMesh = registerMesh(new THREE.Mesh(coverStripGeo), 'gt3RedCover');
        coverStripMesh.position.set(bSign * (deckX + 1.08), cy, 0);
        targetHead.add(coverStripMesh);
      });
    });

    // ------------------------------------------------------------------------
    // 7. PORSCHE 911 GT3 DUAL RESONANCE INTAKE PLENUM, 6 ITBs & AXIAL FAN (+Y)
    // ------------------------------------------------------------------------
    // Left & Right Carbon-Black Resonance Plenums sitting above the engine
    [-1, 1].forEach((bSign) => {
      const plenumGeo = new THREE.CylinderGeometry(0.46, 0.46, caseLengthZ - 0.55, 24);
      plenumGeo.rotateX(Math.PI / 2);
      const plenumMesh = registerMesh(new THREE.Mesh(plenumGeo), 'carbonPlenum');
      plenumMesh.position.set(bSign * 1.45, 1.95, 0);
      intakeAndFanGroup.add(plenumMesh);

      // End Caps on Plenums
      [-1, 1].forEach((endSign) => {
        const capGeo = new THREE.SphereGeometry(0.46, 20, 14);
        capGeo.scale(1, 0.85, 0.55);
        const capMesh = registerMesh(new THREE.Mesh(capGeo), 'carbonPlenum');
        capMesh.position.set(bSign * 1.45, 1.95, endSign * (caseLengthZ * 0.5 - 0.28));
        intakeAndFanGroup.add(capMesh);
      });
    });

    // Dual Resonance Crossover Tubes connecting Left & Right Plenums + Central GT3 Throttle Body
    [-0.95, 0.95].forEach((cz) => {
      const crossGeo = new THREE.CylinderGeometry(0.28, 0.28, 2.9, 20);
      crossGeo.rotateZ(Math.PI / 2);
      const crossMesh = registerMesh(new THREE.Mesh(crossGeo), 'resonanceBlue');
      crossMesh.position.set(0, 2.08, cz);
      intakeAndFanGroup.add(crossMesh);
    });

    // Central GT3 Intake Distributor & Twin-Flap Throttle Body
    const centerBoxGeo = new THREE.BoxGeometry(1.35, 0.42, 1.25);
    const centerBoxMesh = registerMesh(new THREE.Mesh(centerBoxGeo), 'carbonPlenum');
    centerBoxMesh.position.set(0, 2.25, -0.95);
    intakeAndFanGroup.add(centerBoxMesh);

    const throttleBodyGeo = new THREE.CylinderGeometry(0.38, 0.34, 0.65, 24);
    throttleBodyGeo.rotateX(Math.PI / 2);
    const throttleBodyMesh = registerMesh(new THREE.Mesh(throttleBodyGeo), 'intakeAlum');
    throttleBodyMesh.position.set(0, 2.28, -1.85);
    intakeAndFanGroup.add(throttleBodyMesh);

    // 6 Curved Individual Throttle Body (ITB) Intake Runners from Plenums to Upper Cylinder Heads
    const intakeRunnerCurves = [];
    cylSpecs.forEach((spec) => {
      const bSign = spec.bankSign;
      const zPos = pairZPositions[spec.pairIdx] + (bSign < 0 ? bankOffsetZ : -bankOffsetZ);
      const rCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 2.22, -1.65),
        new THREE.Vector3(bSign * 1.45, 1.95, zPos * 0.65),
        new THREE.Vector3(bSign * 1.85, 1.65, zPos),
        new THREE.Vector3(bSign * 2.55, 1.15, zPos),
        new THREE.Vector3(bSign * (deckX + 0.35), 0.52, zPos)
      ]);
      intakeRunnerCurves.push(rCurve);

      // Visible curved runner segment from plenum down to cylinder head port
      const visibleRunnerCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(bSign * 1.45, 1.92, zPos),
        new THREE.Vector3(bSign * 2.15, 1.55, zPos),
        new THREE.Vector3(bSign * 2.75, 1.02, zPos),
        new THREE.Vector3(bSign * (deckX + 0.35), 0.52, zPos)
      ]);
      const runnerGeo = new THREE.TubeGeometry(visibleRunnerCurve, 24, 0.18, 14, false);
      intakeAndFanGroup.add(registerMesh(new THREE.Mesh(runnerGeo), 'intakeAlum'));

      // Individual Throttle Body (ITB) Gold/Bronze Actuator Collar on each runner
      const itbCollarGeo = new THREE.CylinderGeometry(0.23, 0.23, 0.18, 16);
      itbCollarGeo.rotateZ(bSign * 0.68);
      const itbCollarMesh = registerMesh(new THREE.Mesh(itbCollarGeo), 'fanBronze');
      itbCollarMesh.position.set(bSign * 2.45, 1.28, zPos);
      intakeAndFanGroup.add(itbCollarMesh);
    });

    // Iconic Porsche 11-Blade Axial Cooling Fan & Shroud at the Front (+Z) of the Flat-6
    const fanShroudZ = pairSpacingZ + 1.05;
    const shroudRingGeo = new THREE.TorusGeometry(0.92, 0.11, 14, 36);
    const shroudRingMesh = registerMesh(new THREE.Mesh(shroudRingGeo), 'carbonPlenum');
    shroudRingMesh.position.set(0, 1.22, fanShroudZ);
    intakeAndFanGroup.add(shroudRingMesh);

    const coolingFanGroup = new THREE.Group();
    coolingFanGroup.position.set(0, 1.22, fanShroudZ + 0.04);
    intakeAndFanGroup.add(coolingFanGroup);

    const fanHubGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.22, 24);
    fanHubGeo.rotateX(Math.PI / 2);
    coolingFanGroup.add(registerMesh(new THREE.Mesh(fanHubGeo), 'fanBronze'));

    const numFanBlades = 11;
    const fanBladeGeo = new THREE.BoxGeometry(0.16, 0.58, 0.035);
    fanBladeGeo.translate(0, 0.52, 0);
    for (let fb = 0; fb < numFanBlades; fb++) {
      const bladePivot = new THREE.Group();
      bladePivot.rotation.z = (fb * Math.PI * 2) / numFanBlades;
      const bladeMesh = registerMesh(new THREE.Mesh(fanBladeGeo), 'fanBronze');
      bladeMesh.rotation.y = 0.48;
      bladePivot.add(bladeMesh);
      coolingFanGroup.add(bladePivot);
    }

    // ------------------------------------------------------------------------
    // 8. EQUAL-LENGTH 6-INTO-2 GT3 EXHAUST HEADERS & TWIN CENTER TAILPIPES (-Y)
    // ------------------------------------------------------------------------
    const exhaustRunnerCurves = [];
    cylSpecs.forEach((spec) => {
      const bSign = spec.bankSign;
      const zPos = pairZPositions[spec.pairIdx] + (bSign < 0 ? bankOffsetZ : -bankOffsetZ);
      const collectorX = bSign * 1.15;
      const collectorZ = -pairSpacingZ - 0.95;

      const exCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(bSign * (deckX + 0.35), -0.52, zPos),
        new THREE.Vector3(bSign * (deckX + 0.15), -1.28, zPos),
        new THREE.Vector3(bSign * 2.05, -1.62, (zPos + collectorZ) * 0.5),
        new THREE.Vector3(collectorX, -1.48, collectorZ),
        new THREE.Vector3(bSign * 0.28, -1.25, collectorZ - 0.95)
      ]);
      exhaustRunnerCurves.push(exCurve);

      const exTubeGeo = new THREE.TubeGeometry(exCurve, 32, 0.145, 12, false);
      exhaustGroup.add(registerMesh(new THREE.Mesh(exTubeGeo), 'exhaustHeader'));
    });

    // Rear Titanium GT3 Muffler Canister & Twin Center-Exit Tailpipes
    const mufflerGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.85, 24);
    mufflerGeo.rotateZ(Math.PI / 2);
    const mufflerMesh = registerMesh(new THREE.Mesh(mufflerGeo), 'titaniumTailpipe');
    mufflerMesh.position.set(0, -1.25, -pairSpacingZ - 1.55);
    exhaustGroup.add(mufflerMesh);

    [-0.26, 0.26].forEach((tx) => {
      const tipGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.62, 24, 1, true);
      tipGeo.rotateX(Math.PI / 2);
      const tipMesh = registerMesh(new THREE.Mesh(tipGeo), 'titaniumTailpipe');
      tipMesh.position.set(tx, -1.25, -pairSpacingZ - 2.08);
      exhaustGroup.add(tipMesh);
    });

    // ------------------------------------------------------------------------
    // 9. VOLUMETRIC AIRFLOW & EXHAUST STREAM PARTICLES
    // ------------------------------------------------------------------------
    const streamParticles = [];
    for (let sp = 0; sp < 84; sp++) {
      const isIntakeStream = sp < 42;
      const sMat = new THREE.SpriteMaterial({
        map: glowTexture,
        color: isIntakeStream ? 0x38bdf8 : 0xf97316,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const sSprite = new THREE.Sprite(sMat);
      const scale = isIntakeStream ? 0.34 : 0.38;
      sSprite.scale.set(scale, scale, 1);
      gasGroup.add(sSprite);

      streamParticles.push({
        sprite: sSprite,
        mat: sMat,
        isIntakeStream,
        phase: Math.random(),
        cylIdx: sp % 6
      });
    }

    const sampleCurve = (curve, u) => {
      const t = Math.max(0.0001, Math.min(0.9999, Number.isFinite(u) ? u : 0.5));
      return curve.getPoint(t);
    };

    // ------------------------------------------------------------------------
    // 10. MATERIAL & VISIBILITY SYNCHRONIZATION
    // ------------------------------------------------------------------------
    let lastCutaway = simParams.current.cutawayMode;

    const updateMaterialModes = () => {
      const {
        renderMode: mode,
        blockOpacity: opacity,
        cutawayMode: cutaway,
        exploded: exp,
        showBlock: blockOn,
        showHeadAndValves: headOn,
        showIntakeAndFan: intakeOn,
        showGasAndExhaust: gasExOn
      } = simParams.current;

      // Exploded View Offsets along X (Left/Right Boxer Banks) and Y (Top Intake / Bottom Exhaust)
      const expDist = exp * 2.2;
      blockLeftGroup.position.x = -expDist * 0.42;
      blockRightGroup.position.x = expDist * 0.42;
      headLeftGroup.position.x = -expDist * 1.05;
      headRightGroup.position.x = expDist * 1.05;
      intakeAndFanGroup.position.y = expDist * 0.85;
      exhaustGroup.position.y = -expDist * 0.65;

      blockLeftGroup.visible = blockOn;
      blockRightGroup.visible = blockOn;
      headLeftGroup.visible = headOn;
      headRightGroup.visible = headOn;
      intakeAndFanGroup.visible = intakeOn;
      exhaustGroup.visible = gasExOn;
      gasGroup.visible = gasExOn;

      if (cutaway !== lastCutaway) {
        cylindersData.forEach((cyl) => {
          cyl.linerMesh.geometry = cutaway ? cyl.cutLinerGeo : cyl.fullLinerGeo;
          cyl.jacketMesh.geometry = cutaway ? cyl.cutJacketGeo : cyl.fullJacketGeo;
          cyl.finMeshes.forEach((fm) => {
            fm.geometry = cutaway ? cyl.cutFinGeo : cyl.fullFinGeo;
          });
        });
        lastCutaway = cutaway;
      }

      realisticMats.block.opacity = cutaway ? opacity : Math.min(0.92, opacity + 0.35);
      realisticMats.liner.opacity = cutaway ? Math.max(0.14, opacity * 0.85) : Math.min(0.88, opacity + 0.25);
      realisticMats.headCast.opacity = cutaway ? opacity * 0.88 : Math.min(0.92, opacity + 0.35);
      rawBlockMat.opacity = realisticMats.block.opacity;

      trackedMeshes.forEach(({ mesh, type, baseMat, wireOverlay }) => {
        const isTranslucent = type === 'block' || type === 'liner' || type === 'headCast';
        if (mode === 'realistic') {
          mesh.material = baseMat;
          if (wireOverlay) wireOverlay.visible = false;
        } else if (mode === 'raw') {
          mesh.material = isTranslucent ? rawBlockMat : rawSolidMat;
          if (wireOverlay) wireOverlay.visible = false;
        } else if (mode === 'wireframe') {
          mesh.material = isTranslucent ? wireframeBlockMat : wireframePrimaryMat;
          if (wireOverlay) wireOverlay.visible = false;
        } else if (mode === 'shaded_wire') {
          mesh.material = baseMat;
          if (wireOverlay) wireOverlay.visible = true;
        }
      });
    };

    // ------------------------------------------------------------------------
    // 11. ANIMATION LOOP (TRUE 180° BOXER KINEMATICS & 1-6-2-4-3-5 FIRING)
    // ------------------------------------------------------------------------
    let animationFrameId;
    let lastTime = performance.now();
    let uiCounter = 0;

    const animate = (now) => {
      animationFrameId = requestAnimationFrame(animate);
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const {
        rpm: currentRpm,
        isPlaying: playing,
        exploded: exp,
        showGasAndExhaust: gasExOn,
        autoRotateCam: autoCam
      } = simParams.current;

      if (playing) {
        const omega = (currentRpm * 2 * Math.PI) / 60;
        const visualSpeedFactor = currentRpm > 1400 ? 0.14 : 0.22;
        crankThetaRef.current = (crankThetaRef.current + omega * dt * visualSpeedFactor) % (4 * Math.PI);
      }

      const crankTheta = crankThetaRef.current;

      // Rotate Boxer Crankshaft & 4 Half-Speed DOHC Camshafts
      crankshaftGroup.rotation.z = -crankTheta;
      quadCams.forEach((cam) => {
        cam.rotation.z = -crankTheta * 0.5;
      });

      // Spin the Porsche 11-Blade Axial Cooling Fan
      const normRpm = Math.max(0, Math.min(1, (currentRpm - 600) / 8400));
      if (playing) {
        coolingFanGroup.rotation.z -= dt * (8.5 + normRpm * 26.0);
      }

      // VarioCam Plus High-Lift Cam Profile switch above 4,800 RPM
      const varioLift = currentRpm >= 4800 ? 11.8 : 9.2;

      // Glow the Titanium GT3 Exhaust Headers & Tailpipes at high RPM
      realisticMats.exhaustHeader.emissiveIntensity = 0.1 + normRpm * 0.65;
      realisticMats.titaniumTailpipe.emissiveIntensity = 0.15 + normRpm * 0.85;
      exhaustHeatLight.intensity = playing ? 1.0 + normRpm * 4.5 : 0.35;

      let currentFiringCyl = 1;
      let currentFiringPair = '#1 ↔ #4';
      let highestCombustionIntensity = -1;

      const expBankShift = exp * 2.2 * 0.42;
      const expHeadShift = exp * 2.2 * 1.05;

      // Update each of the 6 Horizontally Opposed Boxer Cylinders
      cylindersData.forEach((cyl) => {
        const bSign = cyl.bankSign; // -1 for Left Bank (1,2,3), +1 for Right Bank (4,5,6)
        // Phase within the 720° (4π) 4-stroke cycle relative to this cylinder's TDC Power
        const phase = ((crankTheta - cyl.firingAngle) % (4 * Math.PI) + 4 * Math.PI) % (4 * Math.PI);

        // True Horizontal Boxer Slider-Crank Kinematics along ±X:
        // At phase = 0 (TDC Power) or phase = 2π (TDC Overlap), cos(phase) = +1:
        //   Left Bank (bSign = -1) pin is at (-r, 0) and piston is at Outer Left TDC (-r - L).
        //   Right Bank (bSign = +1) pin is at (+r, 0) and piston is at Outer Right TDC (+r + L).
        // Notice that because #1 (0°) and #4 (360° = 2π) differ by 2π, cos(phase) is IDENTICAL for both!
        // Therefore, opposed Boxer pairs #1 & #4, #2 & #5, #3 & #6 ALWAYS move OUTWARD to TDC and INWARD to BDC simultaneously!
        const cosA = Math.cos(phase);
        const sinA = Math.sin(phase);

        const pinX = bSign * r * cosA;
        const pinY = -bSign * r * sinA;
        const outerDist = r * cosA + Math.sqrt(Math.max(0.01, L * L - r * r * sinA * sinA));
        const wristX = bSign * (outerDist + expBankShift);

        cyl.pistonGroup.position.set(wristX, 0, cyl.zPos);
        cyl.rodGroup.position.set(pinX, pinY, cyl.zPos);

        // Orient connecting rod from (pinX, pinY) to (wristX, 0)
        // Since rod geometry is built along local +Y:
        //   world vector (dx, dy) = (wristX - pinX, 0 - pinY)
        //   rotation.z = Math.atan2(-dx, dy)
        const dx = wristX - pinX;
        const dy = -pinY;
        cyl.rodGroup.rotation.z = Math.atan2(-dx, dy);

        // 4-Stroke Horizontal Valve Lift (valves push INWARD toward crankshaft center when open):
        //   0 .. π: Power (Usaha)
        //   π .. 2π: Exhaust (Buang) -> Lower Exhaust valves open inward
        //   2π .. 3π: Intake (Hisap) -> Upper Intake valves open inward
        //   3π .. 4π: Compression (Kompresi)
        const maxLift = currentRpm >= 4800 ? 0.25 : 0.19;
        const exhLift = (phase >= Math.PI && phase < 2 * Math.PI) ? Math.sin(phase - Math.PI) * maxLift : 0;
        const intLift = (phase >= 2 * Math.PI && phase < 3 * Math.PI) ? Math.sin(phase - 2 * Math.PI) * maxLift : 0;

        cyl.exhaustValves.forEach((ev) => {
          ev.position.x = cyl.headSeatX - bSign * exhLift;
          ev.position.y = -0.30 + exhLift * 0.22;
        });
        cyl.intakeValves.forEach((iv) => {
          iv.position.x = cyl.headSeatX - bSign * intLift;
          iv.position.y = 0.30 - intLift * 0.22;
        });

        // Combustion Flame & Volumetric Horizontal Chamber Sprites
        let flameIntensity = 0;
        if (phase < 0.72 * Math.PI) {
          const norm = 1 - phase / (0.72 * Math.PI);
          flameIntensity = Math.pow(norm, 1.45);
          if (flameIntensity > highestCombustionIntensity) {
            highestCombustionIntensity = flameIntensity;
            currentFiringCyl = cyl.cylNumber;
            currentFiringPair = cyl.pairLabel;
          }
        }

        const crownOuterX = outerDist + pH * 0.5 + expBankShift;
        const headInnerX = deckX + expHeadShift;
        const chamberSpan = Math.max(0.16, headInnerX - crownOuterX);

        // Core Ignition Flash Sprite near Spark Plug
        const coreStrength = phase < 0.35 * Math.PI ? Math.pow(1 - phase / (0.35 * Math.PI), 2.0) : 0;
        cyl.coreMat.opacity = gasExOn ? coreStrength * 0.95 : 0;
        const coreS = 0.46 + coreStrength * 0.56;
        cyl.coreSprite.scale.set(coreS, coreS, 1);
        cyl.coreSprite.position.set(bSign * (headInnerX - 0.1), 0, cyl.zPos);

        // Volumetric Chamber Particles inside each Horizontal Cylinder
        cyl.chamberParticles.forEach((cp) => {
          if (playing) {
            cp.angle += cp.swirlSpd * dt;
          }
          const rad = cp.rFrac * (pR * 0.84);
          const px = bSign * (crownOuterX + 0.05 + cp.xFrac * (chamberSpan - 0.08));
          const py = Math.cos(cp.angle) * rad;
          const pz = cyl.zPos + Math.sin(cp.angle) * rad;
          cp.sprite.position.set(px, py, pz);

          if (phase < Math.PI) {
            // Power Stroke: Blazing White -> Porsche GT3 Orange -> Crimson
            const pNorm = phase / Math.PI;
            cp.mat.color.setHSL(0.03 + (1 - pNorm) * 0.09, 1.0, 0.52 + flameIntensity * 0.34);
            cp.mat.opacity = (cp.isHaze ? 0.52 : 0.9) * Math.max(0.25, flameIntensity);
            const s = cp.baseScale * (1.25 + flameIntensity * 0.38);
            cp.sprite.scale.set(s, s, 1);
          } else if (phase < 2 * Math.PI) {
            // Exhaust Stroke: Smoky Slate-Amber
            cp.mat.color.setHex(0x94a3b8);
            cp.mat.opacity = cp.isHaze ? 0.25 : 0.45;
            cp.sprite.scale.set(cp.baseScale, cp.baseScale, 1);
          } else if (phase < 3 * Math.PI) {
            // Intake Stroke: High-Velocity Cyan Air-Fuel Mist
            cp.mat.color.setHex(0x38bdf8);
            cp.mat.opacity = cp.isHaze ? 0.38 : 0.68;
            cp.sprite.scale.set(cp.baseScale, cp.baseScale, 1);
          } else {
            // Compression Stroke: Cyan -> Golden Amber (13.3:1 High Compression)
            const cNorm = (phase - 3 * Math.PI) / Math.PI;
            cp.mat.color.lerpColors(new THREE.Color(0x38bdf8), new THREE.Color(0xfbbf24), cNorm);
            cp.mat.opacity = (cp.isHaze ? 0.42 : 0.76) * (0.8 + cNorm * 0.3);
            const s = cp.baseScale * (1.0 - cNorm * 0.22);
            cp.sprite.scale.set(s, s, 1);
          }
        });

        // Spark Embers Spraying Horizontally Inward during Ignition
        const emberActive = (gasExOn && flameIntensity > 0.15) ? flameIntensity : 0;
        cyl.embers.forEach((em) => {
          if (emberActive > 0.05) {
            const prog = ((now * 0.0035 * em.spd + em.seed) % 1.0);
            const sprayAng = (em.seed - 0.5) * 1.4;
            const dist = prog * 0.58;
            const ex = bSign * (headInnerX - Math.cos(sprayAng) * dist);
            const ey = Math.sin(sprayAng) * dist;
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

      // Animate Top ITB Intake & Bottom Equal-Length Exhaust Stream Particles
      const streamSpd = 0.65 + normRpm * 2.1;
      streamParticles.forEach((sp) => {
        if (playing) {
          sp.phase = (sp.phase + dt * streamSpd) % 1.0;
        }
        const u = Math.max(0.0001, Math.min(0.9999, sp.phase));
        const curve = sp.isIntakeStream ? intakeRunnerCurves[sp.cylIdx] : exhaustRunnerCurves[sp.cylIdx];
        const pt = sampleCurve(curve, u);
        sp.sprite.position.copy(pt);
        sp.sprite.position.y += sp.isIntakeStream ? exp * 2.2 * 0.85 : -exp * 2.2 * 0.65;
        sp.mat.opacity = 0.58 * Math.sin(u * Math.PI);
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
        setActivePairInfo(currentFiringPair);
        setCrankDeg(roundedDeg);
        if (playing) {
          setManualDeg(roundedDeg);
        }
        setVarioCamLiftMm(varioLift);
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
    camControl.current.radius = Math.max(5.5, Math.min(28, camControl.current.radius + e.deltaY * 0.008));
  };

  const resetCamera = () => {
    setAutoRotateCam(false);
    camControl.current.theta = 0.58;
    camControl.current.phi = 1.02;
    camControl.current.radius = 13.8;
    camControl.current.target.set(0, 0.35, 0);
  };

  // Authentic Porsche 911 GT3 4.0L Naturally Aspirated (510 HP @ 8400 RPM, 470 Nm @ 6100 RPM)
  const hp = Math.round((rpm / 8400) * 510 * (0.82 + 0.18 * Math.sin(Math.min(1, rpm / 9000) * Math.PI)));
  const torque = Math.round(310 + 160 * Math.sin(Math.min(1, (rpm - 400) / 7200) * (Math.PI * 0.78)));

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
          TOP-LEFT: PORSCHE 911 GT3 FLAT-6 BOXER TELEMETRY & FIRING MONITOR
      ========================================================= */}
      <div className="pointer-events-none absolute top-4 left-4 z-10 max-h-[calc(100%-11rem)] w-[min(28.5rem,calc(100%-2rem))] overflow-y-auto max-[720px]:max-h-[50%] max-[720px]:w-[calc(100%-2rem)]">
        <section aria-label="Flat-6 4.0L Boxer" className={`pointer-events-auto flex flex-col gap-5 p-5 ${sheet.panel}`}>
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="m-0 text-[1.75rem] font-semibold leading-none tracking-[-0.03em]">
              Flat-6 4.0L Boxer
            </h1>
            <p
              className="m-0 text-[1.75rem] font-semibold leading-none tracking-[-0.03em] tabular-nums"
              aria-label={`Sudut kruk as ${crankDeg} derajat`}
            >
              {crankDeg}°
            </p>
          </div>

          <p className="m-0 text-base leading-relaxed">
            Mesin 6 silinder tidur 180° (Boxer sejati Porsche 911 GT3 3.996 cc DOHC 24-katup) dengan 6 jurnal crankpin independen. Setiap pasangan piston berhadapan (#1↔#4, #2↔#5, #3↔#6) bergerak keluar ke TMA dan masuk ke TMB secara serentak sehingga getaran primer & sekunder saling meniadakan.
          </p>

          <div className="grid grid-cols-6 gap-1.5" role="group" aria-label="Firing order 1-6-2-4-3-5">
            {FLAT6_SPECS.firingOrder.map((cylNum) => {
              const isFiring = activeCylinderInfo === cylNum;
              const spec = FLAT6_SPECS.cylinders.find((c) => c.cylNumber === cylNum);
              return (
                <button
                  key={cylNum}
                  type="button"
                  onClick={() => {
                    const targetRad = spec.firingAngle + 0.12;
                    handleManualAngleChange(Math.round((targetRad * 180) / Math.PI));
                  }}
                  className={`py-2 text-center text-base font-semibold tabular-nums ${hit} ${
                    isFiring ? 'bg-[#fb6514] text-[#101828]' : 'bg-[#eef1f4] text-[#101828] hover:bg-[#e2e7ec]'
                  }`}
                >
                  <span className="block text-xs font-normal opacity-75">{spec.bank} Bank</span>
                  #{cylNum}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Putaran mesin', value: isPlaying ? rpm : 0, unit: 'rpm' },
              { label: 'Tenaga & Torsi', value: isPlaying ? `${hp} hp` : '0 hp', unit: `/ ${isPlaying ? torque : 0} Nm` },
              { label: 'Pasangan Boxer TMA', value: activePairInfo, unit: '180° lawan' },
              { label: 'VarioCam Plus', value: `${varioCamLiftMm.toFixed(1)}`, unit: 'mm lift' }
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
              { label: 'Crankcase & liners', state: showBlock, setter: setShowBlock },
              { label: '24V Quad-Cam heads', state: showHeadAndValves, setter: setShowHeadAndValves },
              { label: 'GT3 Intake & Fan', state: showIntakeAndFan, setter: setShowIntakeAndFan },
              { label: 'Gas & GT3 Exhaust', state: showGasAndExhaust, setter: setShowGasAndExhaust }
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
              max={9000}
              step={20}
              value={rpm}
              label="RPM"
              onChange={(e) => setRpm(Number(e.target.value))}
            />
            <div className="flex flex-wrap gap-2">
              {[
                { value: 120, label: '120 slow-mo' },
                { value: 1000, label: '1000 idle' },
                { value: 5200, label: '5200 VarioCam' },
                { value: 9000, label: '9000 GT3 redline' }
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
              <span className="font-semibold tabular-nums">{crankDeg}°</span> (120° interval)
            </p>
            <SquareRange
              min={0}
              max={719}
              step={1}
              value={manualDeg}
              label="Crank angle"
              onChange={(e) => handleManualAngleChange(Number(e.target.value))}
            />
            <p className="m-0 flex flex-wrap gap-x-2 gap-y-1 text-sm">
              <span>0° #1</span>
              <span>120° #6</span>
              <span>240° #2</span>
              <span>360° #4</span>
              <span>480° #3</span>
              <span>600° #5</span>
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
              <span>Split-Case</span>
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
              setRpm(1000);
              setExploded(0);
              setBlockOpacity(0.28);
              setCutawayMode(true);
              setRenderMode('realistic');
              setShowBlock(true);
              setShowHeadAndValves(true);
              setShowIntakeAndFan(true);
              setShowGasAndExhaust(true);
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
