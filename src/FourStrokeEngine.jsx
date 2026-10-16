import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  Play, Pause, RotateCcw, Eye, EyeOff,
  Layers, Box, Grid, Cpu, Flame,
  Sliders, Maximize2, Activity, Gauge, Zap, Info, Compass,
  Wind, Scissors, Sparkles, Thermometer
} from 'lucide-react';

const FOUR_STROKE_SPECS = {
  crankRadius: 0.95,      // r (stroke = 1.90)
  rodLength: 2.85,        // L
  pistonRadius: 1.05,     // Bore radius
  pistonHeight: 1.15,
  valveAngle: 0.36,       // Pent-roof valve inclination (rad)
  compressionRatio: '11.5 : 1',
  displacementCc: '498 cc',
  strokes: [
    {
      id: 'intake',
      index: 1,
      name: 'Langkah Hisap (Intake)',
      range: [0, 180],
      desc: 'Katup Hisap terbuka, piston bergerak turun (TMA → TMB) menghisap campuran udara & bahan bakar ke ruang silinder.',
      badgeColor: 'text-sky-500 bg-sky-500/10 border-sky-500/30',
      activeBg: 'bg-sky-500 text-white border-sky-400 shadow-[0_0_16px_rgba(14,165,233,0.6)]'
    },
    {
      id: 'compression',
      index: 2,
      name: 'Langkah Kompresi (Compression)',
      range: [180, 360],
      desc: 'Kedua katup tertutup rapat, piston bergerak naik (TMB → TMA) memampatkan campuran udara-bahan bakar hingga bertekanan tinggi.',
      badgeColor: 'text-amber-500 bg-amber-500/10 border-amber-500/30',
      activeBg: 'bg-amber-500 text-white border-amber-400 shadow-[0_0_16px_rgba(245,158,11,0.6)]'
    },
    {
      id: 'power',
      index: 3,
      name: 'Langkah Usaha (Power / Combustion)',
      range: [360, 540],
      desc: 'Busi memercikkan api di TMA, ledakan pembakaran mendorong piston turun dengan gaya mekanik penuh (TMA → TMB).',
      badgeColor: 'text-orange-500 bg-orange-500/10 border-orange-500/30',
      activeBg: 'bg-orange-500 text-white border-orange-400 shadow-[0_0_16px_rgba(251,101,20,0.7)]'
    },
    {
      id: 'exhaust',
      index: 4,
      name: 'Langkah Buang (Exhaust)',
      range: [540, 720],
      desc: 'Katup Buang terbuka, piston bergerak naik (TMB → TMA) mendorong gas sisa pembakaran keluar menuju knalpot.',
      badgeColor: 'text-rose-500 bg-rose-500/10 border-rose-500/30',
      activeBg: 'bg-rose-500 text-white border-rose-400 shadow-[0_0_16px_rgba(244,63,94,0.6)]'
    }
  ]
};

export default function FourStrokeEngine({ theme = 'dark' }) {
  const mountRef = useRef(null);

  // Simulation States
  const [rpm, setRpm] = useState(180); // Default educational speed so all 4 strokes are crystal clear
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
  const [cylPressureBar, setCylPressureBar] = useState(1.0);
  const [cylTempC, setCylTempC] = useState(45);

  const simParams = useRef({
    theme,
    rpm: 180,
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
    theta: 0.52,
    phi: 1.32,
    radius: 12.2,
    target: new THREE.Vector3(0, 2.2, 0)
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
      showValvetrain,
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
          ambientLight.intensity = 0.6;
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
    showHead,
    showValvetrain,
    showGasFlow,
    autoRotateCam
  ]);

  const jumpToStroke = (degTarget) => {
    const rad = (degTarget * Math.PI) / 180;
    crankThetaRef.current = rad;
    setManualDeg(degTarget);
    setCrankDeg(degTarget);
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

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Studio Lighting
    const ambientLight = new THREE.AmbientLight(
      isInitialDark ? 0xdbeafe : 0xffffff,
      isInitialDark ? 0.6 : 0.88
    );
    scene.add(ambientLight);
    sceneElements.current.ambientLight = ambientLight;

    const mainDirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    mainDirLight.position.set(10, 16, 14);
    mainDirLight.castShadow = true;
    mainDirLight.shadow.mapSize.width = 2048;
    mainDirLight.shadow.mapSize.height = 2048;
    scene.add(mainDirLight);

    const rimLight1 = new THREE.DirectionalLight(0x38bdf8, isInitialDark ? 1.15 : 0.85);
    rimLight1.position.set(-12, 8, 10);
    scene.add(rimLight1);
    sceneElements.current.rimLight1 = rimLight1;

    const rimLight2 = new THREE.DirectionalLight(0xfb6514, isInitialDark ? 0.9 : 0.75);
    rimLight2.position.set(12, -8, -10);
    scene.add(rimLight2);
    sceneElements.current.rimLight2 = rimLight2;

    // Dynamic Spark & Combustion PointLight inside Cylinder Head
    const r = FOUR_STROKE_SPECS.crankRadius;
    const L = FOUR_STROKE_SPECS.rodLength;
    const tdcWristY = r + L;
    const deckY = tdcWristY + FOUR_STROKE_SPECS.pistonHeight * 0.58;

    const combustionLight = new THREE.PointLight(0xff7700, 0, 5.5);
    combustionLight.position.set(0, deckY + 0.15, 0);
    scene.add(combustionLight);

    const gridHelper = new THREE.GridHelper(
      26,
      26,
      isInitialDark ? 0x344054 : 0x94a3b8,
      isInitialDark ? 0x1d2939 : 0xe2e8f0
    );
    gridHelper.position.y = -2.35;
    scene.add(gridHelper);
    sceneElements.current.gridHelper = gridHelper;

    // Materials Library
    const realisticMats = {
      crank: new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.9, roughness: 0.2 }),
      counterweight: new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.78, roughness: 0.4 }),
      piston: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.88, roughness: 0.16 }),
      pistonCrown: new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.85, roughness: 0.22 }),
      pistonRing: new THREE.MeshStandardMaterial({ color: 0xfb6514, metalness: 0.85, roughness: 0.2 }),
      oilRing: new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 }),
      rod: new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.84, roughness: 0.26 }),
      pin: new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.96, roughness: 0.08 }),
      valveIntake: new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.85, roughness: 0.22 }),
      valveExhaust: new THREE.MeshStandardMaterial({ color: 0xf97316, metalness: 0.85, roughness: 0.22 }),
      valveSpring: new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.9, roughness: 0.18 }),
      camshaft: new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.88, roughness: 0.22 }),
      camLobe: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.94, roughness: 0.12 }),
      sprocket: new THREE.MeshStandardMaterial({ color: 0xfb6514, metalness: 0.75, roughness: 0.28 }),
      timingBelt: new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.3, roughness: 0.75, side: THREE.DoubleSide }),
      flywheel: new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.82, roughness: 0.32 }),
      sparkCeramic: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.15 }),
      sparkMetal: new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 }),
      injectorBody: new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.7, roughness: 0.25 }),
      intakePort: new THREE.MeshPhysicalMaterial({
        color: 0x38bdf8,
        metalness: 0.2,
        roughness: 0.2,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        side: THREE.DoubleSide
      }),
      exhaustPort: new THREE.MeshPhysicalMaterial({
        color: 0xea580c,
        metalness: 0.3,
        roughness: 0.25,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        side: THREE.DoubleSide
      }),
      block: new THREE.MeshPhysicalMaterial({
        color: 0x94a3b8,
        metalness: 0.28,
        roughness: 0.18,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        side: THREE.DoubleSide
      }),
      liner: new THREE.MeshPhysicalMaterial({
        color: 0xe2e8f0,
        metalness: 0.5,
        roughness: 0.12,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        side: THREE.DoubleSide
      }),
      headCasting: new THREE.MeshPhysicalMaterial({
        color: 0x64748b,
        metalness: 0.35,
        roughness: 0.22,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        side: THREE.DoubleSide
      }),
      valveCover: new THREE.MeshStandardMaterial({
        color: 0xe05307,
        metalness: 0.62,
        roughness: 0.28,
        side: THREE.DoubleSide
      }),
      oilPan: new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.75,
        roughness: 0.38,
        side: THREE.DoubleSide
      })
    };

    const rawSolidMat = new THREE.MeshLambertMaterial({ color: 0xd1d5db, side: THREE.DoubleSide });
    const rawBlockMat = new THREE.MeshLambertMaterial({
      color: 0x9ca3af,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    const wireframePrimaryMat = new THREE.MeshBasicMaterial({
      color: 0xfb6514,
      wireframe: true,
      transparent: true,
      opacity: 0.85
    });
    const wireframeBlockMat = new THREE.MeshBasicMaterial({
      color: 0x475569,
      wireframe: true,
      transparent: true,
      opacity: 0.32
    });

    const trackedMeshes = [];
    const registerMesh = (mesh, type = 'crank', addWire = true) => {
      const baseMat = realisticMats[type] || realisticMats.crank;
      mesh.material = baseMat;
      const isTrans = ['block', 'liner', 'headCasting', 'intakePort', 'exhaustPort'].includes(type);
      mesh.castShadow = !isTrans;
      mesh.receiveShadow = true;

      let wireOverlay = null;
      if (addWire) {
        const wireGeo = new THREE.WireframeGeometry(mesh.geometry);
        wireOverlay = new THREE.LineSegments(
          wireGeo,
          new THREE.LineBasicMaterial({
            color: 0x0f172a,
            transparent: true,
            opacity: 0.25
          })
        );
        wireOverlay.visible = false;
        mesh.add(wireOverlay);
      }

      trackedMeshes.push({ mesh, type, baseMat, wireOverlay });
      return mesh;
    };

    const engineRoot = new THREE.Group();
    scene.add(engineRoot);

    // ============================================================================
    // 1. CRANKSHAFT & FLYWHEEL ASSEMBLY
    // ============================================================================
    const crankshaftGroup = new THREE.Group();
    engineRoot.add(crankshaftGroup);

    // Front & Rear Main Journals
    [-0.95, 0.95].forEach((zOff) => {
      const mainJGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.65, 28);
      mainJGeo.rotateX(Math.PI / 2);
      const mainJ = registerMesh(new THREE.Mesh(mainJGeo), 'crank');
      mainJ.position.set(0, 0, zOff);
      crankshaftGroup.add(mainJ);
    });

    // Crankpin (Throw at +Y when crankTheta = 0)
    const crankPinGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.72, 28);
    crankPinGeo.rotateX(Math.PI / 2);
    const crankPinMesh = registerMesh(new THREE.Mesh(crankPinGeo), 'pin');
    crankPinMesh.position.set(0, r, 0);
    crankshaftGroup.add(crankPinMesh);

    // Sculpted Dual Counterweight Webs
    [-0.48, 0.48].forEach((zOff) => {
      const cwShape = new THREE.Shape();
      cwShape.moveTo(-0.42, 0.2);
      cwShape.lineTo(-0.34, r + 0.15);
      cwShape.absarc(0, r, 0.34, Math.PI, 0, true);
      cwShape.lineTo(0.42, 0.2);
      cwShape.bezierCurveTo(0.85, -0.1, 1.15, -0.5, 0.98, -0.95);
      cwShape.absarc(0, -0.85, 0.98, 0, Math.PI, true);
      cwShape.bezierCurveTo(-1.15, -0.5, -0.85, -0.1, -0.42, 0.2);

      const cwGeo = new THREE.ExtrudeGeometry(cwShape, {
        depth: 0.22,
        bevelEnabled: true,
        bevelSegments: 3,
        steps: 1,
        bevelSize: 0.03,
        bevelThickness: 0.03
      });
      cwGeo.translate(0, 0, zOff - 0.11);
      const cwMesh = registerMesh(new THREE.Mesh(cwGeo), 'counterweight');
      crankshaftGroup.add(cwMesh);
    });

    // Rear Heavy Flywheel
    const fwGeo = new THREE.CylinderGeometry(1.65, 1.65, 0.32, 40);
    fwGeo.rotateX(Math.PI / 2);
    const fwMesh = registerMesh(new THREE.Mesh(fwGeo), 'flywheel');
    fwMesh.position.set(0, 0, -1.45);
    crankshaftGroup.add(fwMesh);

    for (let b = 0; b < 8; b++) {
      const ang = (b * Math.PI) / 4;
      const boltGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.38, 12);
      boltGeo.rotateX(Math.PI / 2);
      const bolt = registerMesh(new THREE.Mesh(boltGeo), 'pin');
      bolt.position.set(Math.sin(ang) * 0.65, Math.cos(ang) * 0.65, -1.45);
      crankshaftGroup.add(bolt);
    }

    // Front Timing Drive Gear on Crankshaft
    const crankSprocketGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.24, 24);
    crankSprocketGeo.rotateX(Math.PI / 2);
    const crankSprocket = registerMesh(new THREE.Mesh(crankSprocketGeo), 'sprocket');
    crankSprocket.position.set(0, 0, 1.42);
    crankshaftGroup.add(crankSprocket);

    // ============================================================================
    // 2. PISTON & WRIST PIN ASSEMBLY
    // ============================================================================
    const pistonGroup = new THREE.Group();
    engineRoot.add(pistonGroup);

    const pR = FOUR_STROKE_SPECS.pistonRadius;
    const pH = FOUR_STROKE_SPECS.pistonHeight;

    // Piston Crown & Ring Land
    const crownGeo = new THREE.CylinderGeometry(pR, pR, pH * 0.54, 36);
    crownGeo.translate(0, pH * 0.32, 0);
    const crownMesh = registerMesh(new THREE.Mesh(crownGeo), 'piston');
    pistonGroup.add(crownMesh);

    // Pent-roof squish dome on top of piston
    const domeGeo = new THREE.CylinderGeometry(pR * 0.72, pR * 0.88, 0.12, 32);
    domeGeo.translate(0, pH * 0.62, 0);
    const domeMesh = registerMesh(new THREE.Mesh(domeGeo), 'pistonCrown');
    pistonGroup.add(domeMesh);

    // Piston Skirts (Front & Back thrust faces)
    [0, Math.PI].forEach((skirtAng) => {
      const skirtGeo = new THREE.CylinderGeometry(
        pR * 0.99,
        pR * 0.96,
        pH * 0.65,
        24,
        1,
        false,
        skirtAng - 0.9,
        1.8
      );
      skirtGeo.translate(0, -pH * 0.12, 0);
      const skirtMesh = registerMesh(new THREE.Mesh(skirtGeo), 'piston');
      pistonGroup.add(skirtMesh);
    });

    // Wrist Pin Bosses
    [-0.44, 0.44].forEach((bz) => {
      const bossGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.38, 24);
      bossGeo.rotateX(Math.PI / 2);
      bossGeo.translate(0, 0, bz);
      const bossMesh = registerMesh(new THREE.Mesh(bossGeo), 'piston');
      pistonGroup.add(bossMesh);
    });

    // 3 Piston Rings (Top Compression, Scraper, Oil Ring)
    [
      { y: 0.50, mat: 'pistonRing' },
      { y: 0.38, mat: 'pistonRing' },
      { y: 0.26, mat: 'oilRing' }
    ].forEach((rk) => {
      const ringGeo = new THREE.TorusGeometry(pR + 0.012, 0.024, 12, 36);
      ringGeo.rotateX(Math.PI / 2);
      const ringMesh = registerMesh(new THREE.Mesh(ringGeo), rk.mat, false);
      ringMesh.position.y = rk.y;
      pistonGroup.add(ringMesh);
    });

    // Gudgeon / Wrist Pin
    const wristPinGeo = new THREE.CylinderGeometry(0.22, 0.22, pR * 1.75, 24);
    wristPinGeo.rotateX(Math.PI / 2);
    const wristPinMesh = registerMesh(new THREE.Mesh(wristPinGeo), 'pin');
    pistonGroup.add(wristPinMesh);

    // ============================================================================
    // 3. FORGED H-BEAM CONNECTING ROD
    // ============================================================================
    const rodGroup = new THREE.Group();
    engineRoot.add(rodGroup);

    const bigEndGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.42, 28);
    bigEndGeo.rotateX(Math.PI / 2);
    const bigEndMesh = registerMesh(new THREE.Mesh(bigEndGeo), 'rod');
    rodGroup.add(bigEndMesh);

    const rodShape = new THREE.Shape();
    rodShape.moveTo(-0.34, 0.3);
    rodShape.quadraticCurveTo(-0.16, L * 0.5, -0.22, L - 0.2);
    rodShape.lineTo(0.22, L - 0.2);
    rodShape.quadraticCurveTo(0.16, L * 0.5, 0.34, 0.3);
    rodShape.closePath();

    const rodBeamGeo = new THREE.ExtrudeGeometry(rodShape, {
      depth: 0.16,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.025,
      bevelThickness: 0.025
    });
    rodBeamGeo.translate(0, 0, -0.08);
    const rodBeamMesh = registerMesh(new THREE.Mesh(rodBeamGeo), 'rod');
    rodGroup.add(rodBeamMesh);

    [-0.14, 0.14].forEach((rx) => {
      const ribGeo = new THREE.CylinderGeometry(0.04, 0.055, L - 0.6, 12);
      ribGeo.translate(rx, L * 0.5, 0);
      const ribMesh = registerMesh(new THREE.Mesh(ribGeo), 'rod', false);
      rodGroup.add(ribMesh);
    });

    const smallEndGeo = new THREE.CylinderGeometry(0.31, 0.31, 0.38, 24);
    smallEndGeo.rotateX(Math.PI / 2);
    smallEndGeo.translate(0, L, 0);
    const smallEndMesh = registerMesh(new THREE.Mesh(smallEndGeo), 'rod');
    rodGroup.add(smallEndMesh);

    // ============================================================================
    // 4. CYLINDER LINER, VOLUMETRIC GAS CHAMBER & SPARK / FLAME EFFECTS
    // ============================================================================
    const cylinderMidY = r + L - 0.35;
    const cylinderHeight = 2.75;

    const blockGroup = new THREE.Group();
    engineRoot.add(blockGroup);

    // Back Half of Cylinder Liner (Always visible when block is shown)
    const linerBackGeo = new THREE.CylinderGeometry(pR + 0.04, pR + 0.04, cylinderHeight, 36, 1, true, Math.PI / 2, Math.PI);
    const linerBackMesh = registerMesh(new THREE.Mesh(linerBackGeo), 'liner');
    linerBackMesh.position.set(0, cylinderMidY, 0);
    blockGroup.add(linerBackMesh);

    // Front Half of Cylinder Liner (Hidden in 180° Cutaway Mode)
    const linerFrontGeo = new THREE.CylinderGeometry(pR + 0.04, pR + 0.04, cylinderHeight, 36, 1, true, -Math.PI / 2, Math.PI);
    const linerFrontMesh = registerMesh(new THREE.Mesh(linerFrontGeo), 'liner');
    linerFrontMesh.position.set(0, cylinderMidY, 0);
    blockGroup.add(linerFrontMesh);

    // Finned Aluminum Cylinder Barrel & Crankcase Housing
    const barrelBackGroup = new THREE.Group();
    const barrelFrontGroup = new THREE.Group();
    blockGroup.add(barrelBackGroup, barrelFrontGroup);

    const outerBarrelBackGeo = new THREE.CylinderGeometry(pR + 0.32, pR + 0.32, cylinderHeight, 36, 1, true, Math.PI / 2, Math.PI);
    const outerBarrelBack = registerMesh(new THREE.Mesh(outerBarrelBackGeo), 'block');
    outerBarrelBack.position.set(0, cylinderMidY, 0);
    barrelBackGroup.add(outerBarrelBack);

    const outerBarrelFrontGeo = new THREE.CylinderGeometry(pR + 0.32, pR + 0.32, cylinderHeight, 36, 1, true, -Math.PI / 2, Math.PI);
    const outerBarrelFront = registerMesh(new THREE.Mesh(outerBarrelFrontGeo), 'block');
    outerBarrelFront.position.set(0, cylinderMidY, 0);
    barrelFrontGroup.add(outerBarrelFront);

    // Cooling Fins around Cylinder Block
    for (let f = 0; f < 7; f++) {
      const finY = cylinderMidY - 1.05 + f * 0.35;
      const finBackGeo = new THREE.CylinderGeometry(pR + 0.58, pR + 0.58, 0.07, 36, 1, false, Math.PI / 2, Math.PI);
      const finBack = registerMesh(new THREE.Mesh(finBackGeo), 'block', false);
      finBack.position.set(0, finY, 0);
      barrelBackGroup.add(finBack);

      const finFrontGeo = new THREE.CylinderGeometry(pR + 0.58, pR + 0.58, 0.07, 36, 1, false, -Math.PI / 2, Math.PI);
      const finFront = registerMesh(new THREE.Mesh(finFrontGeo), 'block', false);
      finFront.position.set(0, finY, 0);
      barrelFrontGroup.add(finFront);
    }

    // Lower Crankcase & Oil Sump Pan
    const sumpGeo = new THREE.CylinderGeometry(1.85, 1.45, 2.2, 36, 1, true, Math.PI / 2, Math.PI);
    sumpGeo.rotateZ(Math.PI / 2);
    const sumpMesh = registerMesh(new THREE.Mesh(sumpGeo), 'oilPan');
    sumpMesh.position.set(0, -0.45, 0);
    barrelBackGroup.add(sumpMesh);

    const oilPanBottomGeo = new THREE.BoxGeometry(2.8, 0.45, 2.5);
    const oilPanBottom = registerMesh(new THREE.Mesh(oilPanBottomGeo), 'oilPan');
    oilPanBottom.position.set(0, -2.05, 0);
    blockGroup.add(oilPanBottom);

    // ============================================================================
    // 5. VOLUMETRIC GAS CYLINDER & STREAMLINE PARTICLES (4-STROKE THERMODYNAMICS)
    // ============================================================================
    const gasGroup = new THREE.Group();
    engineRoot.add(gasGroup);

    // Dynamic Cylinder Gas Volume Mesh (Stretches between Piston Crown and Cylinder Head Deck)
    const gasVolumeMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const gasVolumeGeo = new THREE.CylinderGeometry(pR * 0.96, pR * 0.96, 1.0, 32);
    const gasVolumeMesh = new THREE.Mesh(gasVolumeGeo, gasVolumeMat);
    gasGroup.add(gasVolumeMesh);

    // Spark Electric Arc & Combustion Fireball Core at Top Center
    const sparkFlashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const sparkFlashGeo = new THREE.SphereGeometry(0.28, 20, 20);
    const sparkFlashMesh = new THREE.Mesh(sparkFlashGeo, sparkFlashMat);
    sparkFlashMesh.position.set(0, deckY + 0.12, 0);
    gasGroup.add(sparkFlashMesh);

    const fireballMat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const fireballGeo = new THREE.SphereGeometry(pR * 0.92, 28, 20);
    const fireballMesh = new THREE.Mesh(fireballGeo, fireballMat);
    fireballMesh.position.set(0, deckY - 0.1, 0);
    gasGroup.add(fireballMesh);

    // Gas / Fuel-Air / Exhaust Particles inside Manifold & Chamber
    const particleCount = 110;
    const gasParticles = [];
    const pGeo = new THREE.SphereGeometry(0.055, 8, 8);

    for (let i = 0; i < particleCount; i++) {
      const pMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const pMesh = new THREE.Mesh(pGeo, pMat);
      gasGroup.add(pMesh);

      gasParticles.push({
        mesh: pMesh,
        mat: pMat,
        normY: Math.random(),
        rFrac: 0.15 + Math.random() * 0.78,
        theta: Math.random() * Math.PI * 2,
        swirlSpeed: (Math.random() - 0.5) * 4.5,
        streamPhase: Math.random()
      });
    }

    // ============================================================================
    // 6. DOHC CYLINDER HEAD, HELICAL VALVE SPRINGS, CAMSHAFTS & PORTS
    // ============================================================================
    const headRootGroup = new THREE.Group();
    engineRoot.add(headRootGroup);

    const valvetrainGroup = new THREE.Group();
    headRootGroup.add(valvetrainGroup);

    // Helper to build Helical Valve Spring
    const createHelicalSpringGeo = (radius, height, turns = 6, wireRadius = 0.032) => {
      const pts = [];
      const totalPts = turns * 20;
      for (let i = 0; i <= totalPts; i++) {
        const t = i / totalPts;
        const ang = t * turns * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(ang) * radius, t * height, Math.sin(ang) * radius));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      return new THREE.TubeGeometry(curve, totalPts, wireRadius, 8, false);
    };

    const springBaseGeo = createHelicalSpringGeo(0.21, 0.85, 6, 0.032);

    // Create Dual Intake (+X) and Dual Exhaust (-X) Valves + Springs
    const createValveAssembly = (isIntake, zOffset) => {
      const xSide = isIntake ? 0.52 : -0.52;
      const tiltAngle = isIntake ? -FOUR_STROKE_SPECS.valveAngle : FOUR_STROKE_SPECS.valveAngle;

      const mountNode = new THREE.Group();
      mountNode.position.set(xSide, deckY + 0.18, zOffset);
      mountNode.rotation.z = tiltAngle;
      valvetrainGroup.add(mountNode);

      // Moving Valve Stem & Tulip Head Group
      const movingValve = new THREE.Group();
      mountNode.add(movingValve);

      const discGeo = new THREE.CylinderGeometry(0.32, 0.09, 0.1, 24);
      const discMesh = registerMesh(
        new THREE.Mesh(discGeo),
        isIntake ? 'valveIntake' : 'valveExhaust'
      );
      movingValve.add(discMesh);

      const stemGeo = new THREE.CylinderGeometry(0.055, 0.055, 1.15, 16);
      stemGeo.translate(0, 0.58, 0);
      const stemMesh = registerMesh(
        new THREE.Mesh(stemGeo),
        isIntake ? 'valveIntake' : 'valveExhaust'
      );
      movingValve.add(stemMesh);

      // Top Valve Retainer Bucket / Follower
      const bucketGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.18, 20);
      bucketGeo.translate(0, 1.12, 0);
      const bucketMesh = registerMesh(new THREE.Mesh(bucketGeo), 'pin');
      movingValve.add(bucketMesh);

      // Compressing Helical Spring
      const springMesh = registerMesh(new THREE.Mesh(springBaseGeo), 'valveSpring', false);
      springMesh.position.y = 0.22;
      mountNode.add(springMesh);

      return { mountNode, movingValve, springMesh };
    };

    const intakeValves = [
      createValveAssembly(true, -0.36),
      createValveAssembly(true, 0.36)
    ];
    const exhaustValves = [
      createValveAssembly(false, -0.36),
      createValveAssembly(false, 0.36)
    ];

    // Sculpted Camshaft Builder with Egg-Shaped Cam Lobes
    const createCamshaftAssembly = (isIntake) => {
      const camGroup = new THREE.Group();
      const xPos = isIntake ? 0.96 : -0.96;
      const yPos = deckY + 1.48;
      camGroup.position.set(xPos, yPos, 0);
      valvetrainGroup.add(camGroup);

      // Main Camshaft Rod
      const shaftGeo = new THREE.CylinderGeometry(0.14, 0.14, 2.9, 24);
      shaftGeo.rotateX(Math.PI / 2);
      const shaftMesh = registerMesh(new THREE.Mesh(shaftGeo), 'camshaft');
      camGroup.add(shaftMesh);

      // Egg-Shaped Cam Lobes aligned with the 2 valves (z = -0.36, +0.36)
      // Base circle radius = 0.24, nose peak = 0.54 pointing toward -Y when lobe angle = 0
      const lobeShape = new THREE.Shape();
      lobeShape.absarc(0, 0, 0.24, 0, Math.PI, false);
      lobeShape.bezierCurveTo(-0.24, -0.25, -0.14, -0.54, 0, -0.54);
      lobeShape.bezierCurveTo(0.14, -0.54, 0.24, -0.25, 0.24, 0);

      const lobeGeo = new THREE.ExtrudeGeometry(lobeShape, {
        depth: 0.22,
        bevelEnabled: true,
        bevelSegments: 2,
        steps: 1,
        bevelSize: 0.018,
        bevelThickness: 0.018
      });
      lobeGeo.translate(0, 0, -0.11);

      // Orient the cam nose slightly inward toward the inclined valve bucket
      const tiltOffset = isIntake ? 0.36 : -0.36;
      // Intake opens at crank 0..180 (cam 0..90, peak at 45 deg)
      // Exhaust opens at crank 540..720 (cam 270..360, peak at 315 deg)
      const peakCamAngle = isIntake ? Math.PI * 0.25 : Math.PI * 1.75;

      [-0.36, 0.36].forEach((lz) => {
        const lobeHolder = new THREE.Group();
        lobeHolder.position.z = lz;
        lobeHolder.rotation.z = peakCamAngle + tiltOffset;
        const lobeMesh = registerMesh(new THREE.Mesh(lobeGeo), 'camLobe');
        lobeHolder.add(lobeMesh);
        camGroup.add(lobeHolder);
      });

      // Front Cam Timing Sprocket (2x diameter of crank sprocket for 1:2 ratio)
      const camSprocketGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.18, 32);
      camSprocketGeo.rotateX(Math.PI / 2);
      const camSprocket = registerMesh(
        new THREE.Mesh(camSprocketGeo),
        isIntake ? 'sprocket' : 'camshaft'
      );
      camSprocket.position.z = 1.42;
      camGroup.add(camSprocket);

      return camGroup;
    };

    const intakeCamGroup = createCamshaftAssembly(true);
    const exhaustCamGroup = createCamshaftAssembly(false);

    // Timing Belt / Chain Loop connecting Crankshaft to Both Camshafts at z = 1.42
    const beltShape = new THREE.Shape();
    beltShape.moveTo(-0.44, -0.1);
    beltShape.lineTo(-1.48, deckY + 1.48);
    beltShape.absarc(-0.96, deckY + 1.48, 0.65, Math.PI * 0.85, Math.PI * 0.45, true);
    beltShape.lineTo(0.96, deckY + 2.13);
    beltShape.absarc(0.96, deckY + 1.48, 0.65, Math.PI * 0.55, Math.PI * 0.15, true);
    beltShape.lineTo(0.44, -0.1);
    beltShape.absarc(0, 0, 0.45, 0, Math.PI, true);

    const beltHole = new THREE.Path();
    beltHole.moveTo(-0.38, -0.05);
    beltHole.lineTo(-1.40, deckY + 1.48);
    beltHole.absarc(-0.96, deckY + 1.48, 0.57, Math.PI * 0.85, Math.PI * 0.45, true);
    beltHole.lineTo(0.96, deckY + 2.05);
    beltHole.absarc(0.96, deckY + 1.48, 0.57, Math.PI * 0.55, Math.PI * 0.15, true);
    beltHole.lineTo(0.38, -0.05);
    beltHole.absarc(0, 0, 0.38, 0, Math.PI, true);
    beltShape.holes.push(beltHole);

    const beltGeo = new THREE.ExtrudeGeometry(beltShape, {
      depth: 0.22,
      bevelEnabled: false
    });
    beltGeo.translate(0, 0, 1.31);
    const beltMesh = registerMesh(new THREE.Mesh(beltGeo), 'timingBelt', false);
    valvetrainGroup.add(beltMesh);

    // Center Spark Plug Assembly
    const sparkPlugGroup = new THREE.Group();
    sparkPlugGroup.position.set(0, deckY + 0.18, 0);
    headRootGroup.add(sparkPlugGroup);

    const threadGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.28, 16);
    threadGeo.translate(0, 0.1, 0);
    const threadMesh = registerMesh(new THREE.Mesh(threadGeo), 'sparkMetal', false);
    sparkPlugGroup.add(threadMesh);

    const hexGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.22, 6);
    hexGeo.translate(0, 0.35, 0);
    const hexMesh = registerMesh(new THREE.Mesh(hexGeo), 'sparkMetal', false);
    sparkPlugGroup.add(hexMesh);

    const ceramicGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.65, 20);
    ceramicGeo.translate(0, 0.78, 0);
    const ceramicMesh = registerMesh(new THREE.Mesh(ceramicGeo), 'sparkCeramic', false);
    sparkPlugGroup.add(ceramicMesh);

    // Translucent Intake Runner (+X) & Fuel Injector + Exhaust Runner (-X)
    const portsGroup = new THREE.Group();
    headRootGroup.add(portsGroup);

    const intakeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.55, deckY + 0.35, 0),
      new THREE.Vector3(1.45, deckY + 0.65, 0),
      new THREE.Vector3(2.35, deckY + 1.15, 0)
    ]);
    const intakePortGeo = new THREE.TubeGeometry(intakeCurve, 24, 0.42, 20, false);
    const intakePortMesh = registerMesh(new THREE.Mesh(intakePortGeo), 'intakePort');
    portsGroup.add(intakePortMesh);

    // Electronic Fuel Injector mounted on Intake Runner
    const injectorGroup = new THREE.Group();
    injectorGroup.position.set(1.35, deckY + 1.05, 0);
    injectorGroup.rotation.z = 0.55;
    const injGeo = new THREE.CylinderGeometry(0.11, 0.07, 0.65, 16);
    const injMesh = registerMesh(new THREE.Mesh(injGeo), 'injectorBody', false);
    injectorGroup.add(injMesh);
    portsGroup.add(injectorGroup);

    const exhaustCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.55, deckY + 0.35, 0),
      new THREE.Vector3(-1.45, deckY + 0.55, 0),
      new THREE.Vector3(-2.35, deckY + 0.25, 0)
    ]);
    const exhaustPortGeo = new THREE.TubeGeometry(exhaustCurve, 24, 0.42, 20, false);
    const exhaustPortMesh = registerMesh(new THREE.Mesh(exhaustPortGeo), 'exhaustPort');
    portsGroup.add(exhaustPortMesh);

    // Translucent Cylinder Head Casting & Red-Orange DOHC Valve Cover
    const headCastingGroup = new THREE.Group();
    headRootGroup.add(headCastingGroup);

    const headBoxGeo = new THREE.CylinderGeometry(1.55, 1.42, 1.45, 36, 1, true, Math.PI / 2, Math.PI);
    const headBoxMesh = registerMesh(new THREE.Mesh(headBoxGeo), 'headCasting');
    headBoxMesh.position.set(0, deckY + 0.72, 0);
    headCastingGroup.add(headBoxMesh);

    const vcShape = new THREE.Shape();
    vcShape.moveTo(-1.45, deckY + 1.42);
    vcShape.bezierCurveTo(-1.48, deckY + 2.15, -0.4, deckY + 2.18, 0, deckY + 1.88);
    vcShape.bezierCurveTo(0.4, deckY + 2.18, 1.48, deckY + 2.15, 1.45, deckY + 1.42);
    vcShape.closePath();

    const vcGeo = new THREE.ExtrudeGeometry(vcShape, {
      depth: 2.2,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.06,
      bevelThickness: 0.06
    });
    vcGeo.translate(0, 0, -1.1);
    const vcMesh = registerMesh(new THREE.Mesh(vcGeo), 'valveCover');
    headCastingGroup.add(vcMesh);

    let lastTime = performance.now();
    let uiCounter = 0;
    let animationFrameId;

    const updateModesAndVisibility = () => {
      const {
        renderMode,
        blockOpacity,
        cutawayMode,
        showBlock,
        showHead,
        showValvetrain,
        showGasFlow,
        exploded: exp,
        theme: activeTheme
      } = simParams.current;

      realisticMats.block.opacity = blockOpacity;
      realisticMats.liner.opacity = blockOpacity * 0.95;
      realisticMats.headCasting.opacity = blockOpacity;
      rawBlockMat.opacity = blockOpacity;
      wireframeBlockMat.opacity = Math.max(0.18, blockOpacity);

      trackedMeshes.forEach(({ mesh, type, baseMat, wireOverlay }) => {
        const isCasing = ['block', 'liner', 'headCasting', 'intakePort', 'exhaustPort'].includes(type);

        if (renderMode === 'realistic') {
          mesh.material = baseMat;
          if (wireOverlay) wireOverlay.visible = false;
        } else if (renderMode === 'raw') {
          mesh.material = isCasing ? rawBlockMat : rawSolidMat;
          if (wireOverlay) {
            wireOverlay.visible = !isCasing;
            wireOverlay.material.color.setHex(activeTheme === 'dark' ? 0x1e293b : 0x94a3b8);
            wireOverlay.material.opacity = 0.2;
          }
        } else if (renderMode === 'wireframe') {
          mesh.material = isCasing ? wireframeBlockMat : wireframePrimaryMat;
          if (wireOverlay) wireOverlay.visible = false;
        } else if (renderMode === 'shaded_wire') {
          mesh.material = baseMat;
          if (wireOverlay) {
            wireOverlay.visible = true;
            wireOverlay.material.color.setHex(0xfb6514);
            wireOverlay.material.opacity = isCasing ? 0.22 : 0.45;
          }
        }
      });

      blockGroup.visible = showBlock;
      linerFrontMesh.visible = !cutawayMode;
      barrelFrontGroup.visible = !cutawayMode;

      headCastingGroup.visible = showHead;
      vcMesh.visible = showHead && !cutawayMode;
      portsGroup.visible = showHead;
      valvetrainGroup.visible = showValvetrain;
      gasGroup.visible = showGasFlow;

      // Exploded View Offsets
      headRootGroup.position.y = exp * 1.65;
      vcMesh.position.y = exp * 0.75;
      barrelBackGroup.position.z = -exp * 0.85;
      barrelFrontGroup.position.z = exp * 0.85;
      oilPanBottom.position.y = -2.05 - exp * 0.95;
    };

    const animate = (now) => {
      animationFrameId = requestAnimationFrame(animate);
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      const {
        rpm: currentRpm,
        isPlaying: playing,
        manualDeg: mDeg,
        autoRotateCam: autoCam
      } = simParams.current;

      // 1. Advance 720-degree (4 * PI) 4-Stroke Cycle Angle
      if (playing) {
        const omega = (currentRpm * 2 * Math.PI) / 60;
        const speedFactor = currentRpm > 1000 ? 0.18 : 0.35;
        crankThetaRef.current = (crankThetaRef.current + omega * dt * speedFactor) % (4 * Math.PI);
      } else {
        crankThetaRef.current = (mDeg * Math.PI) / 180;
      }

      const theta = crankThetaRef.current; // 0 to 4*PI
      const deg = (theta * 180) / Math.PI; // 0 to 720

      // 2. Exact Slider-Crank Kinematics
      crankshaftGroup.rotation.z = -theta;

      const Px = r * Math.sin(theta);
      const Py = r * Math.cos(theta);

      // Wrist pin height Wy along vertical cylinder axis (X = 0)
      const Wy = r * Math.cos(theta) + Math.sqrt(Math.max(0.01, L * L - r * r * Math.sin(theta) * Math.sin(theta)));

      pistonGroup.position.set(0, Wy, 0);

      rodGroup.position.set(Px, Py, 0);
      const dx = 0 - Px;
      const dy = Wy - Py;
      rodGroup.rotation.z = Math.atan2(-dx, dy);

      // 3. Camshaft Rotation (Exact 1:2 ratio -> 0.5 * theta)
      intakeCamGroup.rotation.z = -theta * 0.5;
      exhaustCamGroup.rotation.z = -theta * 0.5;

      // 4. Valve Lift & Helical Spring Compression
      const maxValveLift = 0.32;
      let intakeLift = 0;
      let exhaustLift = 0;

      // Stroke 1: Intake (0 to PI) -> Intake Valves Open
      if (theta >= 0 && theta < Math.PI) {
        intakeLift = Math.sin(theta) * maxValveLift;
      }
      // Stroke 4: Exhaust (3*PI to 4*PI) -> Exhaust Valves Open
      if (theta >= 3 * Math.PI && theta <= 4 * Math.PI) {
        exhaustLift = Math.sin(theta - 3 * Math.PI) * maxValveLift;
      }

      intakeValves.forEach((v) => {
        v.movingValve.position.y = -intakeLift;
        const compressScale = (0.85 - intakeLift) / 0.85;
        v.springMesh.scale.y = compressScale;
        v.springMesh.position.y = 0.22 - intakeLift;
      });

      exhaustValves.forEach((v) => {
        v.movingValve.position.y = -exhaustLift;
        const compressScale = (0.85 - exhaustLift) / 0.85;
        v.springMesh.scale.y = compressScale;
        v.springMesh.position.y = 0.22 - exhaustLift;
      });

      // 5. Dynamic Chamber Gas Volume & Thermodynamic Otto Cycle Visuals
      const crownTopY = Wy + FOUR_STROKE_SPECS.pistonHeight * 0.56;
      const chamberH = Math.max(0.14, deckY - crownTopY + 0.15);
      gasVolumeMesh.scale.set(1, chamberH, 1);
      gasVolumeMesh.position.set(0, crownTopY + chamberH * 0.5, 0);

      let strokeIdx = 0;
      let pressureBar = 1.0;
      let tempC = 45;
      let sparkIntensity = 0;
      let fireballIntensity = 0;

      if (deg < 180) {
        // 1. INTAKE STROKE (Hisap)
        strokeIdx = 0;
        const norm = deg / 180;
        pressureBar = +(0.85 + 0.15 * Math.cos(norm * Math.PI)).toFixed(1);
        tempC = Math.round(38 + norm * 12);
        gasVolumeMat.color.setHex(0x0ea5e9);
        gasVolumeMat.opacity = 0.18 + Math.sin(norm * Math.PI) * 0.22;
      } else if (deg < 360) {
        // 2. COMPRESSION STROKE (Kompresi)
        strokeIdx = 1;
        const norm = (deg - 180) / 180; // 0 to 1 approaching TDC
        pressureBar = +(1.0 + Math.pow(norm, 2.4) * 17.5).toFixed(1);
        tempC = Math.round(50 + Math.pow(norm, 1.8) * 380);
        // Color transitions from sky-blue to compressed hot amber
        gasVolumeMat.color.setHSL(0.55 - norm * 0.45, 0.95, 0.5);
        gasVolumeMat.opacity = 0.25 + norm * 0.38;
      } else if (deg < 540) {
        // 3. POWER / COMBUSTION STROKE (Usaha)
        strokeIdx = 2;
        const norm = (deg - 360) / 180; // 0 at TDC ignition, 1 at BDC
        if (norm < 0.12) {
          sparkIntensity = 1.0 - norm / 0.12;
        }
        if (norm < 0.72) {
          fireballIntensity = Math.pow(1.0 - norm / 0.72, 1.5);
        }
        pressureBar = +(18.5 + fireballIntensity * 46.0 * (1 - norm * 0.5)).toFixed(1);
        tempC = Math.round(430 + fireballIntensity * 1850);
        gasVolumeMat.color.setHSL(0.04 + (1 - norm) * 0.08, 1.0, 0.48 + fireballIntensity * 0.25);
        gasVolumeMat.opacity = 0.25 + fireballIntensity * 0.55;
      } else {
        // 4. EXHAUST STROKE (Buang)
        strokeIdx = 3;
        const norm = (deg - 540) / 180;
        pressureBar = +(3.2 - norm * 2.0).toFixed(1);
        tempC = Math.round(620 - norm * 280);
        gasVolumeMat.color.setHex(0x94a3b8);
        gasVolumeMat.opacity = 0.28 * (1 - norm * 0.45);
      }

      sparkFlashMat.opacity = sparkIntensity;
      const sparkScale = 0.7 + sparkIntensity * 1.1;
      sparkFlashMesh.scale.set(sparkScale, sparkScale, sparkScale);

      fireballMat.opacity = fireballIntensity * 0.85;
      fireballMesh.position.set(0, crownTopY + chamberH * 0.55, 0);
      fireballMesh.scale.set(1.0, Math.max(0.25, chamberH * 0.65), 1.0);

      combustionLight.intensity = sparkIntensity * 6.0 + fireballIntensity * 4.5;

      // Update Gas & Fuel/Exhaust Streamline Particles
      gasParticles.forEach((p, idx) => {
        if (playing) {
          p.theta += p.swirlSpeed * dt;
          p.streamPhase = (p.streamPhase + dt * 1.8) % 1.0;
        }

        if (strokeIdx === 0 && idx < 40) {
          // Intake manifold fuel-air spray rushing into cylinder
          const t = p.streamPhase;
          const pt = intakeCurve.getPoint(1.0 - t);
          p.mesh.position.set(
            pt.x + Math.cos(p.theta) * 0.16,
            pt.y + Math.sin(p.theta) * 0.16,
            pt.z + Math.sin(p.theta * 2) * 0.16
          );
          p.mat.color.setHex(0x38bdf8);
          p.mat.opacity = 0.85;
        } else if (strokeIdx === 3 && idx < 40) {
          // Exhaust port burnt gas rushing out of cylinder
          const t = p.streamPhase;
          const pt = exhaustCurve.getPoint(t);
          p.mesh.position.set(
            pt.x + Math.cos(p.theta) * 0.18,
            pt.y + Math.sin(p.theta) * 0.18,
            pt.z + Math.cos(p.theta * 2) * 0.18
          );
          p.mat.color.setHex(0xf97316);
          p.mat.opacity = 0.75;
        } else {
          // Swirling turbulent gas particles inside cylinder volume
          const rad = p.rFrac * (pR * 0.88);
          const py = crownTopY + 0.08 + p.normY * Math.max(0.1, chamberH - 0.14);
          p.mesh.position.set(Math.cos(p.theta) * rad, py, Math.sin(p.theta) * rad);

          if (strokeIdx === 0) {
            p.mat.color.setHex(0x38bdf8);
            p.mat.opacity = 0.75;
          } else if (strokeIdx === 1) {
            p.mat.color.setHex(0xfbbf24);
            p.mat.opacity = 0.85;
          } else if (strokeIdx === 2) {
            p.mat.color.setHex(0xff5500);
            p.mat.opacity = 0.95;
          } else {
            p.mat.color.setHex(0x94a3b8);
            p.mat.opacity = 0.6;
          }
        }
      });

      updateModesAndVisibility();

      // Update Orbit Camera
      if (autoCam && !camControl.current.isDragging) {
        camControl.current.theta += dt * 0.35;
      }
      const { theta: cTheta, phi: cPhi, radius: cRad, target } = camControl.current;
      camera.position.x = target.x + cRad * Math.sin(cPhi) * Math.sin(cTheta);
      camera.position.y = target.y + cRad * Math.cos(cPhi);
      camera.position.z = target.z + cRad * Math.sin(cPhi) * Math.cos(cTheta);
      camera.lookAt(target);

      renderer.render(scene, camera);

      uiCounter++;
      if (uiCounter % 3 === 0) {
        const roundedDeg = Math.round(deg) % 720;
        setCrankDeg(roundedDeg);
        if (playing) setManualDeg(roundedDeg);
        setActiveStrokeIdx(strokeIdx);
        setCylPressureBar(pressureBar);
        setCylTempC(tempC);
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(container);
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
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
    camControl.current.radius = Math.max(5.0, Math.min(24, camControl.current.radius + e.deltaY * 0.008));
  };

  const setCameraPreset = (preset) => {
    setAutoRotateCam(false);
    if (preset === 'iso') {
      camControl.current.theta = 0.52;
      camControl.current.phi = 1.32;
      camControl.current.radius = 12.2;
    } else if (preset === 'front') {
      camControl.current.theta = 0;
      camControl.current.phi = Math.PI / 2;
      camControl.current.radius = 11.2;
    } else if (preset === 'side') {
      camControl.current.theta = Math.PI / 2;
      camControl.current.phi = 1.42;
      camControl.current.radius = 12.5;
    } else if (preset === 'valves') {
      camControl.current.theta = 0.28;
      camControl.current.phi = 1.15;
      camControl.current.radius = 8.2;
      camControl.current.target.set(0, 3.8, 0);
      return;
    }
    camControl.current.target.set(0, 2.2, 0);
  };

  const currentStroke = FOUR_STROKE_SPECS.strokes[activeStrokeIdx] || FOUR_STROKE_SPECS.strokes[0];
  const isDark = theme === 'dark';

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
      {/* 3D Canvas Viewport */}
      <div
        ref={mountRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing z-0"
      />

      {/* =========================================================
          TOP-LEFT: HEADER, 4-STROKE CYCLE MONITOR & TELEMETRY
      ========================================================= */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2.5 max-w-xs sm:max-w-md pointer-events-none">
        <div className={`${cardClass} rounded-2xl p-4 pointer-events-auto transition-colors duration-300`}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-orange-500/15 border border-orange-500/30">
                <Flame className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-orange-500 mb-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
                  DOHC 4-Valve • Otto Cycle
                </span>
                <h1 className={`text-base sm:text-lg font-extrabold tracking-tight ${headingText}`}>
                  SIMULASI MESIN 4-TAK
                </h1>
              </div>
            </div>

            {/* Camera View Presets */}
            <div className="hidden sm:flex items-center gap-1">
              {[
                { id: 'iso', label: 'ISO' },
                { id: 'front', label: 'Depan' },
                { id: 'side', label: 'Samping' },
                { id: 'valves', label: 'Katup' }
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

          {/* Interactive 4-Stroke Otto Cycle Step Selector */}
          <div className={`mt-2 pt-2.5 border-t ${dividerClass}`}>
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider mb-1.5">
              <span className={`font-bold flex items-center gap-1 ${mutedText}`}>
                <Activity className="w-3.5 h-3.5 text-orange-500" /> Siklus Kerja Otto (Klik Tahap)
              </span>
              <span className="font-mono font-bold text-orange-500">
                {crankDeg}° / 720°
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {FOUR_STROKE_SPECS.strokes.map((st, idx) => {
                const isActive = activeStrokeIdx === idx;
                return (
                  <button
                    key={st.id}
                    onClick={() => jumpToStroke(st.range[0] + 35)}
                    className={`flex flex-col items-center py-1.5 px-1 rounded-xl border text-center transition-all cursor-pointer active:scale-95 ${
                      isActive ? st.activeBg : subCardClass
                    }`}
                  >
                    <span className={`text-[9px] font-bold uppercase ${isActive ? 'text-white/90' : mutedText}`}>
                      Tahap {st.index}
                    </span>
                    <span className={`text-[11px] font-extrabold tracking-tight ${isActive ? 'text-white' : headingText}`}>
                      {st.id === 'intake'
                        ? 'Hisap'
                        : st.id === 'compression'
                        ? 'Kompresi'
                        : st.id === 'power'
                        ? 'Usaha'
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

          {/* Live Telemetry Readouts */}
          <div className={`grid grid-cols-4 gap-1.5 text-xs border-t ${dividerClass} pt-2.5 mt-2.5`}>
            <div className={`${subCardClass} rounded-xl px-2 py-1.5`}>
              <span className={`${mutedText} block text-[9px] uppercase font-bold`}>Putaran</span>
              <span className="font-mono text-sm font-extrabold text-orange-500">{isPlaying ? rpm : 0}</span>
              <span className={`text-[9px] ml-0.5 ${mutedText}`}>RPM</span>
            </div>
            <div className={`${subCardClass} rounded-xl px-2 py-1.5`}>
              <span className={`${mutedText} block text-[9px] uppercase font-bold`}>Tekanan Sil.</span>
              <span className={`font-mono text-sm font-extrabold ${headingText}`}>{cylPressureBar}</span>
              <span className={`text-[9px] ml-0.5 ${mutedText}`}>Bar</span>
            </div>
            <div className={`${subCardClass} rounded-xl px-2 py-1.5`}>
              <span className={`${mutedText} block text-[9px] uppercase font-bold`}>Suhu Ruang</span>
              <span className="font-mono text-sm font-extrabold text-amber-500">{cylTempC}°C</span>
            </div>
            <div className={`${subCardClass} rounded-xl px-2 py-1.5`}>
              <span className={`${mutedText} block text-[9px] uppercase font-bold`}>Kompresi</span>
              <span className="font-mono text-sm font-extrabold text-emerald-500">{FOUR_STROKE_SPECS.compressionRatio}</span>
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
                  <Scissors className="w-3.5 h-3.5" /> 180° Cylinder Cutaway
                </span>
                <span className="text-[10px] uppercase font-extrabold">
                  {cutawayMode ? 'AKTIF' : 'PENUH'}
                </span>
              </button>

              {[
                { label: 'Blok Silinder', state: showBlock, setter: setShowBlock },
                { label: 'Head & Manifold', state: showHead, setter: setShowHead },
                { label: 'DOHC & Pegas', state: showValvetrain, setter: setShowValvetrain },
                { label: 'Gas & Api Busi', state: showGasFlow, setter: setShowGasFlow }
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
                  <Gauge className="w-3.5 h-3.5 text-orange-500" /> Kecepatan RPM
                </span>
                <span className="font-mono font-bold text-orange-500">{rpm} RPM</span>
              </div>
              <input
                type="range"
                min="30"
                max="6000"
                step="10"
                value={rpm}
                onChange={(e) => setRpm(Number(e.target.value))}
                className="w-full h-2 bg-gray-300 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
              <div className={`flex justify-between text-[9px] font-medium ${mutedText}`}>
                <button
                  onClick={() => { setRpm(60); setIsPlaying(true); }}
                  className="hover:text-orange-500 underline cursor-pointer"
                >
                  60 (Edukasi)
                </button>
                <button
                  onClick={() => { setRpm(180); setIsPlaying(true); }}
                  className="hover:text-orange-500 underline cursor-pointer"
                >
                  180 (Slow)
                </button>
                <button
                  onClick={() => { setRpm(800); setIsPlaying(true); }}
                  className="hover:text-orange-500 underline cursor-pointer"
                >
                  800 (Idle)
                </button>
                <button
                  onClick={() => { setRpm(4500); setIsPlaying(true); }}
                  className="hover:text-orange-500 underline cursor-pointer"
                >
                  4.5k (Sport)
                </button>
              </div>
            </div>

            {/* 2. Manual Crankshaft Angle Scrubber (0° - 720°) */}
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
                onChange={(e) => {
                  setIsPlaying(false);
                  const val = Number(e.target.value);
                  setManualDeg(val);
                  crankThetaRef.current = (val * Math.PI) / 180;
                  setCrankDeg(val);
                  setActiveStrokeIdx(Math.min(3, Math.floor(((val % 720) / 180))));
                }}
                className="w-full h-2 bg-gray-300 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
              <div className={`flex justify-between text-[9px] font-medium ${mutedText}`}>
                <span>0° Hisap</span>
                <span>360° Api</span>
                <span>720°</span>
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

            {/* 4. Transparansi Silinder */}
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
              setRpm(180);
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
