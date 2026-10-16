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
// OPEN & LIMITED-SLIP DIFFERENTIAL (GARDAN MOBIL / LSD) SPECIFICATION
// ============================================================================
// Final Drive Hypoid Pair:
//   Drive Pinion: Z_pinion = 11 teeth (rotates around Z-axis)
//   Crown Ring Gear: Z_ring = 38 teeth (rotates around X-axis)
//   Final Drive Ratio = 38 / 11 = 3.455 : 1
// Internal Epicyclic Bevel Gearset inside Carrier Cage:
//   2 Side Bevel Gears (Left & Right Axles): Z_side = 14 teeth
//   2 Spider Pinion Bevel Gears (on Y-axis Cross-Pin): Z_spider = 10 teeth
//   Fundamental Differential Law:
//     (RPM_Left + RPM_Right) / 2 = RPM_Carrier
const FINAL_DRIVE_RATIO = 38 / 11; // 3.4545
const SIDE_TEETH = 14;
const SPIDER_TEETH = 10;

const SCENARIO_INFO = {
  straight: {
    title: 'Jalan Lurus (Roda Kiri = Roda Kanan)',
    openDesc:
      'Kedua ban mendapat traksi aspal yang sama. Roda Kiri (100%) dan Roda Kanan (100%) berputar dengan kecepatan identik. Roda gigi Spider (oranye) DIAM pada porosnya dan hanya ikut mengorbit bersama rumah gardan.',
    lsdDesc:
      'Pada jalan lurus, kopling LSD menjaga kedua poros roda kiri dan kanan terkunci sinkron pada kecepatan 100% tanpa selisih putaran.'
  },
  turn_left: {
    title: 'Belok Kiri Tajam (Roda Kanan Luar > Roda Kiri Dalam)',
    openDesc:
      'Saat mobil belok kiri, roda kiri (sisi dalam tikungan) menempuh lintasan pendek sehingga melambat (35%), sedangkan roda kanan (sisi luar) berputar cepat (165%). Perhatikan roda gigi Spider oranye di tengah sekarang BERPUTAR aktif pada porosnya!',
    lsdDesc:
      'Saat menikung dengan Clutch-Pack LSD, kampas kopling menahan sebagian selisih putaran agar traksi tetap terjaga di kedua roda sembari tetap mengizinkan roda kanan luar berputar lebih cepat.'
  },
  turn_right: {
    title: 'Belok Kanan Tajam (Roda Kiri Luar > Roda Kanan Dalam)',
    openDesc:
      'Saat mobil belok kanan, roda kiri (sisi luar tikungan) berputar jauh lebih cepat (165%) dibandingkan roda kanan di sisi dalam (35%). Roda gigi Spider oranye berputar ke arah sebaliknya untuk menyalurkan selisih kecepatan.',
    lsdDesc:
      'Saat belok kanan dengan LSD aktif, kopling gesek membatasi selip berlebih sambil membiarkan roda kiri luar menempuh busur tikungan yang lebih panjang.'
  },
  slip_right: {
    title: 'Roda Kanan Selip di Atas Es! (Uji Open Diff vs LSD)',
    openDesc:
      'KELEMAHAN OPEN DIFF: Roda kanan menginjak es licin (traksi 0%). Seluruh putaran bocor ke roda kanan yang berputar liar 200% (2x lipat!), sedangkan Roda Kiri di aspal kering BERHENTI TOTAL (0 RPM) sehingga mobil tidak bisa maju!',
    lsdDesc:
      'SOLUSI CLUTCH-PACK LSD: Begitu roda kanan selip di es, paket kopling LSD langsung MENGUNCI side gear ke rumah gardan! Roda kiri di aspal kering tetap berputar kuat (85% RPM, 890 Nm) menarik mobil keluar dari es!'
  }
};

// Helper to build a 3D Tapered Conical Bevel Gear Geometry
function createBevelGearGeo({
  pitchRadius,
  teethCount,
  faceWidth = 0.28,
  boreRadius = 0.22,
  taperFactor = 0.72,
  spiralTwist = 0.0
}) {
  const shape = new THREE.Shape();
  const addendum = Math.min(0.085, (pitchRadius * Math.PI) / (teethCount * 2.1));
  const dedendum = addendum * 1.15;
  const outerR = pitchRadius + addendum;
  const rootR = Math.max(boreRadius + 0.06, pitchRadius - dedendum);

  const step = (Math.PI * 2) / teethCount;
  for (let i = 0; i < teethCount; i++) {
    const a0 = i * step;
    const a1 = a0 + step * 0.16;
    const a2 = a0 + step * 0.31;
    const a3 = a0 + step * 0.55;
    const a4 = a0 + step * 0.70;

    const x0 = Math.cos(a0) * rootR;
    const y0 = Math.sin(a0) * rootR;
    if (i === 0) shape.moveTo(x0, y0);
    else shape.lineTo(x0, y0);

    shape.lineTo(Math.cos(a1) * rootR, Math.sin(a1) * rootR);
    shape.lineTo(Math.cos(a2) * outerR, Math.sin(a2) * outerR);
    shape.lineTo(Math.cos(a3) * outerR, Math.sin(a3) * outerR);
    shape.lineTo(Math.cos(a4) * rootR, Math.sin(a4) * rootR);
  }
  shape.closePath();

  const borePath = new THREE.Path();
  borePath.absarc(0, 0, boreRadius, 0, Math.PI * 2, true);
  shape.holes.push(borePath);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: faceWidth,
    steps: 3,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.01,
    bevelThickness: 0.01
  });
  geo.translate(0, 0, -faceWidth * 0.5);

  const pos = geo.attributes.position;
  for (let k = 0; k < pos.count; k++) {
    const vx = pos.getX(k);
    const vy = pos.getY(k);
    const vz = pos.getZ(k);
    const u = Math.max(0, Math.min(1, (vz + faceWidth * 0.5) / faceWidth));
    const r = Math.sqrt(vx * vx + vy * vy);

    if (r > boreRadius + 0.03) {
      const scale = 1 - u * (1 - taperFactor);
      const twist = u * spiralTwist;
      const cosT = Math.cos(twist);
      const sinT = Math.sin(twist);
      const sx = vx * scale;
      const sy = vy * scale;
      pos.setX(k, sx * cosT - sy * sinT);
      pos.setY(k, sx * sinT + sy * cosT);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

export default function DifferentialSim({ theme = 'dark' }) {
  const mountRef = useRef(null);

  // Default to Open Differential so cornering & ice-slip differences are 100% dramatic right away!
  const [isPlaying, setIsPlaying] = useState(true);
  const [driveshaftRpm, setDriveshaftRpm] = useState(1800);
  const [diffType, setDiffType] = useState('open'); // 'open' | 'lsd'
  const [drivingScenario, setDrivingScenario] = useState('straight'); // 'straight' | 'turn_left' | 'turn_right' | 'slip_right'
  const [steeringBias, setSteeringBias] = useState(0); // -1.0 (Right Wheel 200%, Left 0%) to +1.0 (Left Wheel 200%, Right 0%)
  const [lsdLockPct, setLsdLockPct] = useState(75);

  // Visual / Viewport Controls
  const [renderMode, setRenderMode] = useState('realistic');
  const [casingOpacity, setCasingOpacity] = useState(0.20);
  const [cutawayMode, setCutawayMode] = useState(true);
  const [exploded, setExploded] = useState(0);
  const [autoRotateCam, setAutoRotateCam] = useState(false);

  // Component Visibility Toggles
  const [showCasing, setShowCasing] = useState(true);
  const [showCarrierCage, setShowCarrierCage] = useState(true);
  const [showWheelHubs, setShowWheelHubs] = useState(true);
  const [showTorqueFlow, setShowTorqueFlow] = useState(true);

  // Live Telemetry Readouts
  const [telemetry, setTelemetry] = useState({
    carrierRpm: 521,
    leftWheelRpm: 521,
    rightWheelRpm: 521,
    leftPct: 100,
    rightPct: 100,
    spiderSelfRpm: 0,
    leftTorqueNm: 540,
    rightTorqueNm: 540
  });

  const simParams = useRef({
    isPlaying,
    driveshaftRpm,
    diffType,
    drivingScenario,
    steeringBias,
    lsdLockPct,
    renderMode,
    casingOpacity,
    cutawayMode,
    exploded,
    autoRotateCam,
    showCasing,
    showCarrierCage,
    showWheelHubs,
    showTorqueFlow,
    theme
  });

  useEffect(() => {
    simParams.current = {
      isPlaying,
      driveshaftRpm,
      diffType,
      drivingScenario,
      steeringBias,
      lsdLockPct,
      renderMode,
      casingOpacity,
      cutawayMode,
      exploded,
      autoRotateCam,
      showCasing,
      showCarrierCage,
      showWheelHubs,
      showTorqueFlow,
      theme
    };
  }, [
    isPlaying,
    driveshaftRpm,
    diffType,
    drivingScenario,
    steeringBias,
    lsdLockPct,
    renderMode,
    casingOpacity,
    cutawayMode,
    exploded,
    autoRotateCam,
    showCasing,
    showCarrierCage,
    showWheelHubs,
    showTorqueFlow,
    theme
  ]);

  const handleSelectScenario = (scenarioId) => {
    setDrivingScenario(scenarioId);
    if (scenarioId === 'straight') {
      setSteeringBias(0);
    } else if (scenarioId === 'turn_left') {
      // Strong 65% bias: Left Inner Wheel = 35% speed, Right Outer Wheel = 165% speed (nearly 5:1 ratio!)
      setSteeringBias(-0.65);
    } else if (scenarioId === 'turn_right') {
      // Strong 65% bias: Left Outer Wheel = 165% speed, Right Inner Wheel = 35% speed!
      setSteeringBias(0.65);
    } else if (scenarioId === 'slip_right') {
      // 100% slip bias: In Open Diff, Left Wheel = 0 RPM (DEAD STOP), Right Wheel = 200% RPM!
      setSteeringBias(-1.0);
    }
  };

  const cameraPresetRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // ------------------------------------------------------------------------
    // 1. THREE.JS SCENE, CAMERA, RENDERER & STUDIO LIGHTING
    // ------------------------------------------------------------------------
    const scene = new THREE.Scene();
    const isDarkTheme = simParams.current.theme === 'dark';
    scene.background = new THREE.Color(isDarkTheme ? 0x0b101b : 0xf1f5f9);
    scene.fog = new THREE.FogExp2(isDarkTheme ? 0x0b101b : 0xf1f5f9, 0.014);

    const camera = new THREE.PerspectiveCamera(
      40,
      container.clientWidth / container.clientHeight,
      0.1,
      150
    );
    camera.position.set(0.0, 4.8, 9.8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.24;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(0, -0.1, 0);
    controls.minDistance = 4.0;
    controls.maxDistance = 24.0;

    cameraPresetRef.current = (viewType) => {
      if (viewType === 'iso') {
        camera.position.set(0.0, 4.8, 9.8);
        controls.target.set(0, -0.1, 0);
      } else if (viewType === 'front') {
        camera.position.set(0, 0.8, 9.5);
        controls.target.set(0, 0, 0);
      } else if (viewType === 'top') {
        camera.position.set(0.01, 10.5, 0.01);
        controls.target.set(0, 0, 0);
      } else if (viewType === 'pinion') {
        camera.position.set(-4.8, 2.5, -6.2);
        controls.target.set(0, 0, -0.2);
      }
      controls.update();
    };

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.78);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff8ed, 2.35);
    keyLight.position.set(8, 13, 10);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 1.15);
    fillLight.position.set(-9, 3, -6);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xf97316, 1.25);
    rimLight.position.set(0, -6, 9);
    scene.add(rimLight);

    const spiderGlowLight = new THREE.PointLight(0xf97316, 1.8, 5.5);
    spiderGlowLight.position.set(0, 0, 0);
    scene.add(spiderGlowLight);

    const gridHelper = new THREE.GridHelper(
      26,
      26,
      isDarkTheme ? 0x1e293b : 0xcbd5e1,
      isDarkTheme ? 0x131c2e : 0xe2e8f0
    );
    gridHelper.position.y = -2.15;
    scene.add(gridHelper);

    // ------------------------------------------------------------------------
    // 2. PBR MATERIALS & RENDER MODE TRACKING
    // ------------------------------------------------------------------------
    const realisticMats = {
      pinionGear: new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        metalness: 0.90,
        roughness: 0.18
      }),
      crownGear: new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.92,
        roughness: 0.18
      }),
      spiderGear: new THREE.MeshStandardMaterial({
        color: 0xf97316,
        metalness: 0.86,
        roughness: 0.20,
        emissive: 0xea580c,
        emissiveIntensity: 0.35
      }),
      leftSideGear: new THREE.MeshStandardMaterial({
        color: 0x10b981,
        metalness: 0.88,
        roughness: 0.18
      }),
      rightSideGear: new THREE.MeshStandardMaterial({
        color: 0x06b6d4,
        metalness: 0.88,
        roughness: 0.18
      }),
      carrierCast: new THREE.MeshStandardMaterial({
        color: 0x475569,
        metalness: 0.84,
        roughness: 0.28
      }),
      lsdClutchFriction: new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        metalness: 0.88,
        roughness: 0.20,
        emissive: 0xd97706,
        emissiveIntensity: 0.25
      }),
      axleSteel: new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.92,
        roughness: 0.16
      }),
      brakeRotor: new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        metalness: 0.90,
        roughness: 0.22
      }),
      tireRubber: new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.15,
        roughness: 0.78
      }),
      wheelMarkerOrange: new THREE.MeshStandardMaterial({
        color: 0xf97316,
        metalness: 0.5,
        roughness: 0.25,
        emissive: 0xf97316,
        emissiveIntensity: 0.45
      }),
      brakeCaliperRed: new THREE.MeshStandardMaterial({
        color: 0xef4444,
        metalness: 0.65,
        roughness: 0.28
      }),
      casing: new THREE.MeshPhysicalMaterial({
        color: 0x94a3b8,
        metalness: 0.32,
        roughness: 0.24,
        transparent: true,
        opacity: 0.20,
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
      opacity: 0.20,
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
      const baseMat = realisticMats[type] || realisticMats.axleSteel;
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

    const diffRoot = new THREE.Group();
    scene.add(diffRoot);

    // ------------------------------------------------------------------------
    // 3. INPUT DRIVESHAFT & HYPOID DRIVE PINION GEAR (AXIS ALONG Z)
    // ------------------------------------------------------------------------
    const pinionGroup = new THREE.Group();
    pinionGroup.position.set(-0.92, 0, -1.62);
    diffRoot.add(pinionGroup);

    const pinionHeadGeo = createBevelGearGeo({
      pitchRadius: 0.52,
      teethCount: 11,
      faceWidth: 0.48,
      boreRadius: 0.16,
      taperFactor: 0.64,
      spiralTwist: 0.22
    });
    pinionGroup.add(registerMesh(new THREE.Mesh(pinionHeadGeo), 'pinionGear'));

    const pinionShaftGeo = new THREE.CylinderGeometry(0.22, 0.22, 2.25, 24);
    pinionShaftGeo.rotateX(Math.PI / 2);
    const pinionShaftMesh = registerMesh(new THREE.Mesh(pinionShaftGeo), 'pinionGear');
    pinionShaftMesh.position.z = -1.25;
    pinionGroup.add(pinionShaftMesh);

    const inputFlangeGeo = new THREE.CylinderGeometry(0.56, 0.34, 0.22, 6);
    inputFlangeGeo.rotateX(Math.PI / 2);
    const inputFlangeMesh = registerMesh(new THREE.Mesh(inputFlangeGeo), 'carrierCast');
    inputFlangeMesh.position.z = -2.35;
    pinionGroup.add(inputFlangeMesh);

    // ------------------------------------------------------------------------
    // 4. ROTATING DIFFERENTIAL CARRIER CAGE, CROWN RING GEAR & SPIDER GEARS
    // ------------------------------------------------------------------------
    const carrierGroup = new THREE.Group();
    diffRoot.add(carrierGroup);

    const crownGearGeo = createBevelGearGeo({
      pitchRadius: 1.66,
      teethCount: 38,
      faceWidth: 0.38,
      boreRadius: 0.96,
      taperFactor: 0.80,
      spiralTwist: -0.16
    });
    crownGearGeo.rotateY(Math.PI / 2);
    const crownGearMesh = registerMesh(new THREE.Mesh(crownGearGeo), 'crownGear');
    crownGearMesh.position.x = -1.12;
    carrierGroup.add(crownGearMesh);

    const crownWebGeo = new THREE.CylinderGeometry(1.56, 1.56, 0.14, 36);
    crownWebGeo.rotateZ(Math.PI / 2);
    const crownWebMesh = registerMesh(new THREE.Mesh(crownWebGeo), 'carrierCast');
    crownWebMesh.position.x = -1.34;
    carrierGroup.add(crownWebMesh);

    const carrierCageSubGroup = new THREE.Group();
    carrierGroup.add(carrierCageSubGroup);

    const hubRingGeo = new THREE.CylinderGeometry(0.98, 0.98, 0.18, 32);
    hubRingGeo.rotateZ(Math.PI / 2);
    const leftCarrierFace = registerMesh(new THREE.Mesh(hubRingGeo), 'carrierCast');
    leftCarrierFace.position.x = -1.02;
    const rightCarrierFace = registerMesh(new THREE.Mesh(hubRingGeo), 'carrierCast');
    rightCarrierFace.position.x = 1.02;
    carrierCageSubGroup.add(leftCarrierFace, rightCarrierFace);

    const bridgeGeo = new THREE.BoxGeometry(2.04, 0.36, 0.24);
    [-0.86, 0.86].forEach((bz) => {
      const bMesh = registerMesh(new THREE.Mesh(bridgeGeo), 'carrierCast');
      bMesh.position.set(0, 0, bz);
      carrierCageSubGroup.add(bMesh);
    });

    // Central Spider Cross-Pin Shaft (Along Carrier Local Y-Axis)
    const crossPinGeo = new THREE.CylinderGeometry(0.14, 0.14, 1.96, 20);
    const crossPinMesh = registerMesh(new THREE.Mesh(crossPinGeo), 'axleSteel');
    carrierGroup.add(crossPinMesh);

    // Top & Bottom Spider Pinion Bevel Gears (10 Teeth) + High-Contrast Marker Bars
    const spiderBevelGeo = createBevelGearGeo({
      pitchRadius: 0.46,
      teethCount: SPIDER_TEETH,
      faceWidth: 0.26,
      boreRadius: 0.15,
      taperFactor: 0.64,
      spiralTwist: 0
    });

    const topSpiderGroup = new THREE.Group();
    topSpiderGroup.position.set(0, 0.62, 0);
    carrierGroup.add(topSpiderGroup);

    const topSpiderGeo = spiderBevelGeo.clone();
    topSpiderGeo.rotateX(Math.PI / 2);
    topSpiderGroup.add(registerMesh(new THREE.Mesh(topSpiderGeo), 'spiderGear'));

    const botSpiderGroup = new THREE.Group();
    botSpiderGroup.position.set(0, -0.62, 0);
    carrierGroup.add(botSpiderGroup);

    const botSpiderGeo = spiderBevelGeo.clone();
    botSpiderGeo.rotateX(-Math.PI / 2);
    botSpiderGroup.add(registerMesh(new THREE.Mesh(botSpiderGeo), 'spiderGear'));

    // Multi-Plate LSD Friction Clutch Packs (Left & Right) that physically clamp inward when LSD is active!
    const leftLsdClutchGroup = new THREE.Group();
    const rightLsdClutchGroup = new THREE.Group();
    carrierGroup.add(leftLsdClutchGroup, rightLsdClutchGroup);

    const clutchPlateGeo = new THREE.CylinderGeometry(0.78, 0.78, 0.036, 28);
    clutchPlateGeo.rotateZ(Math.PI / 2);
    for (let p = 0; p < 4; p++) {
      const lPlate = registerMesh(
        new THREE.Mesh(clutchPlateGeo),
        p % 2 === 0 ? 'lsdClutchFriction' : 'axleSteel',
        false
      );
      lPlate.position.x = -(0.72 + p * 0.05);
      leftLsdClutchGroup.add(lPlate);

      const rPlate = registerMesh(
        new THREE.Mesh(clutchPlateGeo),
        p % 2 === 0 ? 'lsdClutchFriction' : 'axleSteel',
        false
      );
      rPlate.position.x = 0.72 + p * 0.05;
      rightLsdClutchGroup.add(rPlate);
    }

    // ------------------------------------------------------------------------
    // 5. LEFT & RIGHT AXLES, TIRES WITH TREAD BLOCKS & STEERING KNUCKLES
    // ------------------------------------------------------------------------
    const sideBevelGeo = createBevelGearGeo({
      pitchRadius: 0.64,
      teethCount: SIDE_TEETH,
      faceWidth: 0.28,
      boreRadius: 0.22,
      taperFactor: 0.66,
      spiralTwist: 0
    });

    // Build a complete Wheel + Treaded Tire + High-Contrast Orange Racing Marker Spoke
    // Wrapped inside a Knuckle Pivot Group so the wheels physically steer Left/Right when turning!
    const buildWheelAndTireAssembly = (sideSign, matKey) => {
      const knucklePivot = new THREE.Group();
      knucklePivot.position.set(sideSign * 3.65, 0, 0);

      const wheelSpinGroup = new THREE.Group();
      knucklePivot.add(wheelSpinGroup);

      // 1. Ventilated Brake Disc Rotor
      const rotorGeo = new THREE.CylinderGeometry(1.08, 1.08, 0.14, 32);
      rotorGeo.rotateZ(Math.PI / 2);
      const rotorMesh = registerMesh(new THREE.Mesh(rotorGeo), 'brakeRotor');
      wheelSpinGroup.add(rotorMesh);

      // 2. Sculpted 3D Rubber Tire Torus + 16 High-Contrast Tread Blocks around circumference
      const tireTorusGeo = new THREE.TorusGeometry(1.42, 0.36, 18, 36);
      tireTorusGeo.rotateY(Math.PI / 2);
      const tireMesh = registerMesh(new THREE.Mesh(tireTorusGeo), 'tireRubber');
      tireMesh.position.x = sideSign * 0.16;
      wheelSpinGroup.add(tireMesh);

      const treadBlockGeo = new THREE.BoxGeometry(0.48, 0.14, 0.20);
      for (let t = 0; t < 16; t++) {
        const ta = (t / 16) * Math.PI * 2;
        const isMarkerTread = t === 0 || t === 8;
        const tread = registerMesh(
          new THREE.Mesh(treadBlockGeo),
          isMarkerTread ? 'wheelMarkerOrange' : 'carrierCast',
          false
        );
        tread.position.set(
          sideSign * 0.16,
          Math.cos(ta) * 1.74,
          Math.sin(ta) * 1.74
        );
        tread.rotation.x = -ta;
        wheelSpinGroup.add(tread);
      }

      // 3. 5-Spoke Alloy Rim with 1 Bright Orange Racing Indicator Spoke so RPM is unmistakable!
      const spokeGeo = new THREE.BoxGeometry(0.12, 1.24, 0.20);
      for (let s = 0; s < 5; s++) {
        const sa = (s / 5) * Math.PI * 2;
        const spoke = registerMesh(
          new THREE.Mesh(spokeGeo),
          s === 0 ? 'wheelMarkerOrange' : matKey,
          false
        );
        spoke.position.set(
          sideSign * 0.28,
          Math.cos(sa) * 0.62,
          Math.sin(sa) * 0.62
        );
        spoke.rotation.x = -sa;
        wheelSpinGroup.add(spoke);
      }

      // Stationary Red 4-Piston Brake Caliper attached to the steering knuckle
      const caliperGeo = new THREE.BoxGeometry(0.36, 0.62, 0.38);
      const calMesh = registerMesh(new THREE.Mesh(caliperGeo), 'brakeCaliperRed');
      calMesh.position.set(0, 0.85, 0.72);
      calMesh.rotation.x = -0.65;
      knucklePivot.add(calMesh);

      return { knucklePivot, wheelSpinGroup };
    };

    // A. LEFT AXLE & LEFT WHEEL
    const leftSideGearGroup = new THREE.Group();
    diffRoot.add(leftSideGearGroup);

    const leftSideGeo = sideBevelGeo.clone();
    leftSideGeo.rotateY(Math.PI / 2);
    const leftSideMesh = registerMesh(new THREE.Mesh(leftSideGeo), 'leftSideGear');
    leftSideMesh.position.x = -0.58;
    leftSideGearGroup.add(leftSideMesh);

    const halfShaftGeo = new THREE.CylinderGeometry(0.21, 0.21, 2.95, 24);
    halfShaftGeo.rotateZ(Math.PI / 2);
    const leftShaftMesh = registerMesh(new THREE.Mesh(halfShaftGeo), 'leftSideGear');
    leftShaftMesh.position.x = -2.08;
    leftSideGearGroup.add(leftShaftMesh);

    const leftWheelAssy = buildWheelAndTireAssembly(-1, 'leftSideGear');
    diffRoot.add(leftWheelAssy.knucklePivot);

    // B. RIGHT AXLE & RIGHT WHEEL
    const rightSideGearGroup = new THREE.Group();
    diffRoot.add(rightSideGearGroup);

    const rightSideGeo = sideBevelGeo.clone();
    rightSideGeo.rotateY(-Math.PI / 2);
    const rightSideMesh = registerMesh(new THREE.Mesh(rightSideGeo), 'rightSideGear');
    rightSideMesh.position.x = 0.58;
    rightSideGearGroup.add(rightSideMesh);

    const rightShaftMesh = registerMesh(new THREE.Mesh(halfShaftGeo), 'rightSideGear');
    rightShaftMesh.position.x = 2.08;
    rightSideGearGroup.add(rightShaftMesh);

    const rightWheelAssy = buildWheelAndTireAssembly(1, 'rightSideGear');
    diffRoot.add(rightWheelAssy.knucklePivot);

    // ------------------------------------------------------------------------
    // 6. 3D ICE PATCH & ASPHALT GRIP PAD UNDER THE WHEELS (FOR SLIP SCENARIO!)
    // ------------------------------------------------------------------------
    const icePatchGeo = new THREE.BoxGeometry(2.2, 0.08, 3.6);
    const icePatchMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.35,
      roughness: 0.05,
      metalness: 0.1,
      transparent: true,
      opacity: 0.72
    });
    const rightIcePatchMesh = new THREE.Mesh(icePatchGeo, icePatchMat);
    rightIcePatchMesh.position.set(3.8, -1.82, 0);
    rightIcePatchMesh.visible = false;
    diffRoot.add(rightIcePatchMesh);

    const asphaltPadGeo = new THREE.BoxGeometry(2.2, 0.08, 3.6);
    const asphaltPadMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.92,
      metalness: 0.05
    });
    const leftAsphaltPadMesh = new THREE.Mesh(asphaltPadGeo, asphaltPadMat);
    leftAsphaltPadMesh.position.set(-3.8, -1.82, 0);
    leftAsphaltPadMesh.visible = false;
    diffRoot.add(leftAsphaltPadMesh);

    // Ice Slip Spray Particles behind the Right Tire when slipping on ice!
    const iceSprayParticles = [];
    for (let ip = 0; ip < 24; ip++) {
      const ipMat = new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0x7dd3fc,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const ipSprite = new THREE.Sprite(ipMat);
      diffRoot.add(ipSprite);
      iceSprayParticles.push({
        sprite: ipSprite,
        mat: ipMat,
        phase: ip / 24,
        spreadX: (Math.random() - 0.5) * 0.45
      });
    }

    // ------------------------------------------------------------------------
    // 7. SCULPTED CAST-ALUMINUM DIFFERENTIAL "PUMPKIN" HOUSING & AXLE TUBES
    // ------------------------------------------------------------------------
    const casingGroup = new THREE.Group();
    diffRoot.add(casingGroup);

    const rearHousingGeo = new THREE.SphereGeometry(
      1.98,
      36,
      24,
      0,
      Math.PI * 2,
      Math.PI * 0.42,
      Math.PI * 0.58
    );
    rearHousingGeo.rotateX(-Math.PI * 0.35);
    const rearHousingMesh = registerMesh(new THREE.Mesh(rearHousingGeo), 'casing');
    rearHousingMesh.position.set(-0.22, 0, 0);
    casingGroup.add(rearHousingMesh);

    const frontCutawayHousingGeo = new THREE.SphereGeometry(
      1.98,
      36,
      24,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.42
    );
    frontCutawayHousingGeo.rotateX(-Math.PI * 0.35);
    const frontHousingMesh = registerMesh(new THREE.Mesh(frontCutawayHousingGeo), 'casing');
    frontHousingMesh.position.set(-0.22, 0, 0);
    casingGroup.add(frontHousingMesh);

    const snoutGeo = new THREE.CylinderGeometry(0.56, 0.88, 1.65, 28, 1, true);
    snoutGeo.rotateX(Math.PI / 2);
    const snoutMesh = registerMesh(new THREE.Mesh(snoutGeo), 'casing');
    snoutMesh.position.set(-0.92, 0, -2.25);
    casingGroup.add(snoutMesh);

    const axleTubeGeo = new THREE.CylinderGeometry(0.42, 0.54, 1.85, 24, 1, true);
    axleTubeGeo.rotateZ(Math.PI / 2);
    const leftTubeMesh = registerMesh(new THREE.Mesh(axleTubeGeo), 'casing');
    leftTubeMesh.position.set(-2.35, 0, 0);
    const rightTubeMesh = registerMesh(new THREE.Mesh(axleTubeGeo.clone().rotateZ(Math.PI)), 'casing');
    rightTubeMesh.position.set(2.35, 0, 0);
    casingGroup.add(leftTubeMesh, rightTubeMesh);

    // ------------------------------------------------------------------------
    // 8. ACTIVE TORQUE FLOW PARTICLES (PINION -> CROWN -> LEFT & RIGHT AXLES)
    // ------------------------------------------------------------------------
    const torqueFlowGroup = new THREE.Group();
    diffRoot.add(torqueFlowGroup);

    const leftTorqueCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.92, 0, -3.65),
      new THREE.Vector3(-0.92, 0, -1.62),
      new THREE.Vector3(-1.12, 0.55, -0.55),
      new THREE.Vector3(-0.58, 0.35, 0),
      new THREE.Vector3(-3.55, 0, 0)
    ]);

    const rightTorqueCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.92, 0, -3.65),
      new THREE.Vector3(-0.92, 0, -1.62),
      new THREE.Vector3(-1.12, -0.55, -0.55),
      new THREE.Vector3(0, 0.58, 0),
      new THREE.Vector3(0.58, 0.35, 0),
      new THREE.Vector3(3.55, 0, 0)
    ]);

    const flowParticles = [];
    for (let i = 0; i < 52; i++) {
      const isRightSide = i >= 26;
      const pMat = new THREE.SpriteMaterial({
        map: glowTexture,
        color: isRightSide ? 0x06b6d4 : 0x10b981,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const sprite = new THREE.Sprite(pMat);
      sprite.scale.set(0.36, 0.36, 1);
      torqueFlowGroup.add(sprite);
      flowParticles.push({
        sprite,
        mat: pMat,
        isRightSide,
        u: (i % 26) / 26
      });
    }

    // ------------------------------------------------------------------------
    // 9. MATERIAL MODES, VISIBILITY & REAL-TIME DIFFERENTIAL KINEMATICS LOOP
    // ------------------------------------------------------------------------
    const updateMaterialModes = () => {
      const {
        renderMode: rMode,
        casingOpacity: cOp,
        cutawayMode: cut,
        showCasing: sCase,
        showCarrierCage: sCarrier,
        showWheelHubs: sWheels,
        showTorqueFlow: sFlow,
        diffType: dType,
        drivingScenario: scenario,
        exploded: exp,
        theme: activeTheme
      } = simParams.current;

      realisticMats.casing.opacity = cOp;
      rawCasingMat.opacity = cOp;
      wireframeCasingMat.opacity = Math.max(0.14, cOp);

      realisticMats.lsdClutchFriction.emissiveIntensity = dType === 'lsd' ? 0.75 : 0.05;

      // Physically clamp the LSD clutch packs inward toward the side gears when LSD mode is active!
      const lsdClampShift = dType === 'lsd' ? 0.08 : -0.04;
      leftLsdClutchGroup.position.x = lsdClampShift;
      rightLsdClutchGroup.position.x = -lsdClampShift;

      // Show the 3D Ice Patch under the Right Wheel and Asphalt Pad under the Left Wheel during Slip test!
      const isSlipTest = scenario === 'slip_right';
      rightIcePatchMesh.visible = isSlipTest;
      leftAsphaltPadMesh.visible = isSlipTest;

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
      frontHousingMesh.visible = sCase && (!cut || exp > 0.08);
      carrierCageSubGroup.visible = sCarrier;
      leftLsdClutchGroup.visible = sCarrier;
      rightLsdClutchGroup.visible = sCarrier;
      leftWheelAssy.knucklePivot.visible = sWheels;
      rightWheelAssy.knucklePivot.visible = sWheels;
      torqueFlowGroup.visible = sFlow;

      // Exploded View Offsets
      pinionGroup.position.z = -1.62 - exp * 1.15;
      leftSideGearGroup.position.x = -exp * 0.95;
      rightSideGearGroup.position.x = exp * 0.95;
      leftWheelAssy.knucklePivot.position.x = -3.65 - exp * 1.15;
      rightWheelAssy.knucklePivot.position.x = 3.65 + exp * 1.15;
      topSpiderGroup.position.y = 0.62 + exp * 0.45;
      botSpiderGroup.position.y = -0.62 - exp * 0.45;
      frontHousingMesh.position.y = exp * 1.35;
    };

    let lastTime = performance.now();
    let currentSteerAngle = 0;
    let uiCounter = 0;
    let animationFrameId;

    const animate = (now) => {
      animationFrameId = requestAnimationFrame(animate);
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Number.isFinite(rawDt) && rawDt > 0 ? Math.min(rawDt, 0.05) : 0.016;

      const {
        isPlaying: playing,
        driveshaftRpm: inRpm,
        diffType: dType,
        drivingScenario: scenario,
        steeringBias: rawBias,
        lsdLockPct: lockPct,
        autoRotateCam: autoCam
      } = simParams.current;

      // 1. Input Driveshaft & Carrier Cage Angular Velocities
      const visualSpeedScale = 0.095;
      const pinionOmega = playing ? ((inRpm * 2 * Math.PI) / 60) * visualSpeedScale : 0;
      const carrierOmega = pinionOmega / FINAL_DRIVE_RATIO;

      // 2. Physical Wheel Steering Angle for Turn Left / Turn Right (So user sees the tires turn!)
      let targetSteerYaw = 0;
      if (scenario === 'turn_left' || (rawBias < -0.05 && scenario !== 'slip_right')) {
        targetSteerYaw = 0.34; // Turn wheels Left
      } else if (scenario === 'turn_right' || rawBias > 0.05) {
        targetSteerYaw = -0.34; // Turn wheels Right
      }
      currentSteerAngle += (targetSteerYaw - currentSteerAngle) * Math.min(1, dt * 10);
      leftWheelAssy.knucklePivot.rotation.y = currentSteerAngle;
      rightWheelAssy.knucklePivot.rotation.y = currentSteerAngle;

      // 3. Compute Effective Speed Difference Factor (effectiveBias) between Left & Right Wheels:
      //    - In Open Diff: 100% of rawBias applies (so on Ice Slip, Left = 0 RPM, Right = 200% RPM!).
      //    - In Clutch-Pack LSD:
      //      During Ice Slip, the LSD clutch pack locks 85% of the slip so Left Wheel gets 85% speed!
      //      During normal Cornering, LSD allows partial differentiation while reducing inner wheel spin.
      const lsdDamping =
        dType === 'lsd'
          ? scenario === 'slip_right'
            ? 0.15 // LSD locks up 85% on ice!
            : 1 - (lockPct / 100) * 0.45
          : 1.0;
      const effectiveBias = rawBias * lsdDamping;

      const leftOmega = carrierOmega * (1 + effectiveBias);
      const rightOmega = carrierOmega * (1 - effectiveBias);
      const diffOmega = rightOmega - carrierOmega;

      // 4. Rotate Pinion, Carrier Cage, Left Axle/Wheel, Right Axle/Wheel & Spider Gears!
      pinionGroup.rotation.z -= pinionOmega * dt;
      carrierGroup.rotation.x += carrierOmega * dt;

      leftSideGearGroup.rotation.x += leftOmega * dt;
      leftWheelAssy.wheelSpinGroup.rotation.x += leftOmega * dt;

      rightSideGearGroup.rotation.x += rightOmega * dt;
      rightWheelAssy.wheelSpinGroup.rotation.x += rightOmega * dt;

      // Spider Bevel Gears spin around their local Y-axis ONLY when leftOmega !== rightOmega!
      const spiderLocalOmega = diffOmega * (SIDE_TEETH / SPIDER_TEETH);
      topSpiderGroup.rotation.y += spiderLocalOmega * dt;
      botSpiderGroup.rotation.y -= spiderLocalOmega * dt;

      // 5. Animate Ice Slip Spray Particles when Right Wheel is slipping on ice
      const isIceSlip = scenario === 'slip_right' && playing;
      iceSprayParticles.forEach((ip) => {
        if (isIceSlip) {
          const slipSpeed = dType === 'open' ? 2.4 : 1.1;
          ip.phase = (ip.phase + dt * slipSpeed) % 1.0;
          const p = ip.phase;
          ip.sprite.position.set(
            3.8 + ip.spreadX,
            -1.72 + p * 1.15,
            -0.65 - p * 1.95
          );
          const s = 0.25 + p * 0.55;
          ip.sprite.scale.set(s, s, 1);
          ip.mat.opacity = (1 - p) * (dType === 'open' ? 0.85 : 0.45);
        } else {
          ip.mat.opacity = 0;
        }
      });

      // Pulse the internal spider glow light when differential action is occurring
      const diffActivity = Math.min(1, Math.abs(effectiveBias) * 1.5);
      spiderGlowLight.intensity = 1.1 + diffActivity * 2.8;

      // 6. Animate Left & Right Torque Flow Particles proportional to each wheel's speed & torque
      flowParticles.forEach((fp) => {
        const sideSpeed = fp.isRightSide ? Math.abs(rightOmega) : Math.abs(leftOmega);
        if (playing && sideSpeed > 0.01) {
          fp.u = (fp.u + dt * (0.18 + sideSpeed * 0.42)) % 1.0;
        }
        const safeU = Math.max(0.001, Math.min(0.999, fp.u));
        const curve = fp.isRightSide ? rightTorqueCurve : leftTorqueCurve;
        const pt = curve.getPoint(safeU);
        fp.sprite.position.copy(pt);
        fp.mat.opacity = sideSpeed > 0.01 ? 0.82 * Math.sin(safeU * Math.PI) : 0.08;
      });

      updateMaterialModes();

      controls.autoRotate = autoCam;
      controls.autoRotateSpeed = 1.1;
      controls.update();
      renderer.render(scene, camera);

      // Update React Telemetry HUD every ~6 frames
      uiCounter++;
      if (uiCounter % 6 === 0) {
        const cRpm = Math.round(inRpm / FINAL_DRIVE_RATIO);
        const lRpm = Math.round(cRpm * (1 + effectiveBias));
        const rRpm = Math.round(cRpm * (1 - effectiveBias));
        const lPct = Math.round((1 + effectiveBias) * 100);
        const rPct = Math.round((1 - effectiveBias) * 100);
        const spRpm = Math.round(Math.abs(rRpm - cRpm) * (SIDE_TEETH / SPIDER_TEETH));

        const totalCarrierTorque = 1080;
        let lTorque = 540;
        let rTorque = 540;
        if (scenario === 'slip_right' && dType === 'open') {
          // Open diff on ice: 0 Nm usable traction on the left wheel!
          lTorque = 0;
          rTorque = 40;
        } else if (scenario === 'slip_right' && dType === 'lsd') {
          // Clutch-Pack LSD locks and sends 890 Nm to the gripping Left Wheel!
          lTorque = 890;
          rTorque = 190;
        } else if (dType === 'lsd' && Math.abs(effectiveBias) > 0.05) {
          lTorque = effectiveBias < 0 ? 680 : 400;
          rTorque = totalCarrierTorque - lTorque;
        }

        setTelemetry({
          carrierRpm: cRpm,
          leftWheelRpm: lRpm,
          rightWheelRpm: rRpm,
          leftPct: lPct,
          rightPct: rPct,
          spiderSelfRpm: spRpm,
          leftTorqueNm: lTorque,
          rightTorqueNm: rTorque
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
      glowTexture.dispose();
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  const currentScenarioInfo = SCENARIO_INFO[drivingScenario] || SCENARIO_INFO.straight;

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
          TOP-CENTER FLOATING 3D WHEEL SPEED COMPARISON PILLS
      ========================================================= */}
      <div className="pointer-events-none absolute top-4 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-2 xl:flex">
        <div className="bg-white px-4 py-2 text-[#101828] shadow-sm">
          <span className="block text-xs uppercase tracking-wider text-[#475467]">
            Ban Kiri (Aspal)
          </span>
          <span className="font-mono text-lg font-bold tabular-nums text-[#10b981]">
            {isPlaying ? telemetry.leftWheelRpm : 0} RPM ({isPlaying ? telemetry.leftPct : 0}%)
          </span>
        </div>
        <div className="bg-[#101828] px-4 py-2 text-white shadow-sm">
          <span className="block text-xs uppercase tracking-wider text-slate-300">
            Spider Gear Tengah
          </span>
          <span className="font-mono text-lg font-bold tabular-nums text-[#fb6514]">
            {isPlaying && telemetry.spiderSelfRpm > 0
              ? `BERPUTAR ${telemetry.spiderSelfRpm} RPM`
              : 'DIAM (TERKUNCI)'}
          </span>
        </div>
        <div className="bg-white px-4 py-2 text-[#101828] shadow-sm">
          <span className="block text-xs uppercase tracking-wider text-[#475467]">
            {drivingScenario === 'slip_right' ? 'Ban Kanan (Di Atas Es!)' : 'Ban Kanan'}
          </span>
          <span className="font-mono text-lg font-bold tabular-nums text-[#06b6d4]">
            {isPlaying ? telemetry.rightWheelRpm : 0} RPM ({isPlaying ? telemetry.rightPct : 0}%)
          </span>
        </div>
      </div>

      {/* =========================================================
          TOP-LEFT: DIFFERENTIAL TELEMETRY, OPEN vs LSD & SCENARIOS
      ========================================================= */}
      <div className="pointer-events-none absolute top-4 left-4 z-10 max-h-[calc(100%-11rem)] w-[min(28rem,calc(100%-2rem))] overflow-y-auto max-[720px]:max-h-[50%] max-[720px]:w-[calc(100%-2rem)]">
        <section
          aria-label="Open & Limited-Slip Differential"
          className={`pointer-events-auto flex flex-col gap-4 p-5 ${sheet.panel}`}
          style={{ colorScheme: 'light' }}
        >
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="m-0 text-[1.75rem] font-semibold leading-none tracking-[-0.03em]">
              Differential & LSD
            </h1>
            <p
              className="m-0 text-[1.75rem] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[#fb6514]"
              aria-label="Rasio Final Drive 3.45 banding 1"
            >
              3.45 : 1
            </p>
          </div>

          {/* Toggle: Open Differential vs Clutch-Pack LSD */}
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Tipe Gardan">
            {[
              { id: 'open', label: 'Open Differential' },
              { id: 'lsd', label: 'Clutch-Pack LSD' }
            ].map((t) => {
              const active = diffType === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setDiffType(t.id)}
                  className={`py-2.5 text-center text-base font-semibold ${hit} ${
                    active ? 'bg-[#fb6514] text-[#101828]' : sheet.idle
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Driving Scenario Selector Buttons */}
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Skenario Jalan">
            {[
              { id: 'straight', label: 'Jalan Lurus (100:100)' },
              { id: 'turn_left', label: 'Belok Kiri (35:165)' },
              { id: 'turn_right', label: 'Belok Kanan (165:35)' },
              { id: 'slip_right', label: 'Roda Kanan Selip Es!' }
            ].map((sc) => {
              const active = drivingScenario === sc.id;
              return (
                <button
                  key={sc.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleSelectScenario(sc.id)}
                  className={`px-2.5 py-2.5 text-center text-base font-semibold ${hit} ${
                    active ? sheet.chosen : sheet.idle
                  }`}
                >
                  {sc.label}
                </button>
              );
            })}
          </div>

          {/* Dynamic Scenario Explanation Box */}
          <div className="border-l-4 border-[#fb6514] bg-[#eef1f4] p-3">
            <p className="m-0 text-sm font-bold text-[#101828]">{currentScenarioInfo.title}</p>
            <p className="m-0 mt-1 text-sm leading-relaxed text-[#101828]">
              {diffType === 'open' ? currentScenarioInfo.openDesc : currentScenarioInfo.lsdDesc}
            </p>
          </div>

          {/* 2x2 Telemetry Readouts */}
          <div className="grid grid-cols-2 gap-2">
            {[
              {
                label: 'Roda kiri (Hijau)',
                value: isPlaying ? `${telemetry.leftWheelRpm} rpm` : '0 rpm',
                unit: `(${isPlaying ? telemetry.leftPct : 0}%) · ${isPlaying ? telemetry.leftTorqueNm : 0} Nm`
              },
              {
                label: 'Roda kanan (Cyan)',
                value: isPlaying ? `${telemetry.rightWheelRpm} rpm` : '0 rpm',
                unit: `(${isPlaying ? telemetry.rightPct : 0}%) · ${isPlaying ? telemetry.rightTorqueNm : 0} Nm`
              },
              {
                label: 'Crown carrier cage',
                value: isPlaying ? telemetry.carrierRpm : 0,
                unit: 'rpm rata-rata'
              },
              {
                label: 'Putaran spider gear',
                value: isPlaying ? telemetry.spiderSelfRpm : 0,
                unit: telemetry.spiderSelfRpm === 0 ? 'rpm (Diam)' : 'rpm (Aktif!)'
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
          aria-label="Differential view"
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
              { label: 'Rumah gardan', state: showCasing, setter: setShowCasing },
              { label: 'Carrier & LSD pack', state: showCarrierCage, setter: setShowCarrierCage },
              { label: 'Ban & rem roda', state: showWheelHubs, setter: setShowWheelHubs },
              { label: 'Aliran torsi', state: showTorqueFlow, setter: setShowTorqueFlow }
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
          {/* Column 1: Driveshaft Input RPM */}
          <div className="flex flex-col gap-2">
            <p className="m-0 text-base">
              <span className="font-semibold tabular-nums">{driveshaftRpm}</span> rpm kopel
            </p>
            <SquareRange
              min={300}
              max={4500}
              step={50}
              value={driveshaftRpm}
              label="Driveshaft RPM"
              onChange={(e) => setDriveshaftRpm(Number(e.target.value))}
            />
            <div className="flex flex-wrap gap-2">
              {[
                { value: 600, label: '600 slow' },
                { value: 1800, label: '1800 cruise' },
                { value: 3600, label: '3600 sprint' }
              ].map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  aria-pressed={driveshaftRpm === preset.value}
                  onClick={() => {
                    setDriveshaftRpm(preset.value);
                    setIsPlaying(true);
                  }}
                  className={`px-2 py-1 ${hit} ${
                    driveshaftRpm === preset.value ? sheet.chosen : sheet.idle
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Column 2: Steering / Wheel Speed Bias */}
          <div className="flex flex-col gap-2">
            <p className="m-0 text-base">
              <span className="font-semibold tabular-nums">
                {steeringBias === 0
                  ? '0% Lurus'
                  : steeringBias < 0
                  ? `Kanan +${Math.round(Math.abs(steeringBias) * 100)}%`
                  : `Kiri +${Math.round(steeringBias * 100)}%`}
              </span>{' '}
              bias putaran
            </p>
            <SquareRange
              min={-1.0}
              max={1.0}
              step={0.02}
              value={steeringBias}
              label="Steering & Traction Bias"
              onChange={(e) => {
                const v = Number(e.target.value);
                setSteeringBias(v);
                if (Math.abs(v) < 0.03) setDrivingScenario('straight');
                else if (v <= -0.9) setDrivingScenario('slip_right');
                else if (v < 0) setDrivingScenario('turn_left');
                else setDrivingScenario('turn_right');
              }}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => handleSelectScenario('turn_left')}
                className={`px-2 py-1 ${hit} ${
                  drivingScenario === 'turn_left' ? sheet.chosen : sheet.idle
                }`}
              >
                Belok Kiri
              </button>
              <button
                type="button"
                onClick={() => handleSelectScenario('straight')}
                className={`px-2 py-1 ${hit} ${
                  drivingScenario === 'straight' ? sheet.chosen : sheet.idle
                }`}
              >
                Lurus
              </button>
              <button
                type="button"
                onClick={() => handleSelectScenario('turn_right')}
                className={`px-2 py-1 ${hit} ${
                  drivingScenario === 'turn_right' ? sheet.chosen : sheet.idle
                }`}
              >
                Belok Kanan
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
              setDriveshaftRpm(1800);
              setDiffType('open');
              setDrivingScenario('straight');
              setSteeringBias(0);
              setExploded(0);
              setCasingOpacity(0.20);
              setCutawayMode(true);
              setRenderMode('realistic');
              setShowCasing(true);
              setShowCarrierCage(true);
              setShowWheelHubs(true);
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
