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

// Helper to build a 3D Tapered Conical Bevel Gear Geometry
// Generated in the X-Y plane, extruded along Z from -faceWidth/2 to +faceWidth/2,
// with the front face (+Z) tapered by taperFactor toward the bevel cone apex!
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

  // Apply conical bevel taper + optional spiral-bevel twist along Z
  const pos = geo.attributes.position;
  for (let k = 0; k < pos.count; k++) {
    const vx = pos.getX(k);
    const vy = pos.getY(k);
    const vz = pos.getZ(k);
    // u goes from 0 at back face (-faceWidth/2) to 1 at front face (+faceWidth/2)
    const u = Math.max(0, Math.min(1, (vz + faceWidth * 0.5) / faceWidth));
    const r = Math.sqrt(vx * vx + vy * vy);

    // Keep inner bore radius constant while tapering outer teeth along the pitch cone
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

  // Mechanical State & Driving Scenarios
  const [isPlaying, setIsPlaying] = useState(true);
  const [driveshaftRpm, setDriveshaftRpm] = useState(1800);
  const [diffType, setDiffType] = useState('open'); // 'open' | 'lsd'
  const [drivingScenario, setDrivingScenario] = useState('straight'); // 'straight' | 'turn_left' | 'turn_right' | 'slip_right'
  const [steeringBias, setSteeringBias] = useState(0); // -1.0 (Full Left Turn / Left Slow) to +1.0 (Full Right Turn / Right Slow)
  const [lsdLockPct, setLsdLockPct] = useState(65); // Clutch-pack locking percentage in LSD mode

  // Visual / Viewport Controls
  const [renderMode, setRenderMode] = useState('realistic');
  const [casingOpacity, setCasingOpacity] = useState(0.22);
  const [cutawayMode, setCutawayMode] = useState(true);
  const [exploded, setExploded] = useState(0);
  const [autoRotateCam, setAutoRotateCam] = useState(false);

  // Component Visibility Toggles
  const [showCasing, setShowCasing] = useState(true);
  const [showCarrierCage, setShowCarrierCage] = useState(true);
  const [showLsdClutches, setShowLsdClutches] = useState(true);
  const [showWheelHubs, setShowWheelHubs] = useState(true);
  const [showTorqueFlow, setShowTorqueFlow] = useState(true);

  // Live Telemetry Readouts
  const [telemetry, setTelemetry] = useState({
    carrierRpm: 521,
    leftWheelRpm: 521,
    rightWheelRpm: 521,
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
    showLsdClutches,
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
      showLsdClutches,
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
    showLsdClutches,
    showWheelHubs,
    showTorqueFlow,
    theme
  ]);

  const handleSelectScenario = (scenarioId) => {
    setDrivingScenario(scenarioId);
    if (scenarioId === 'straight') {
      setSteeringBias(0);
    } else if (scenarioId === 'turn_left') {
      setSteeringBias(-0.42);
    } else if (scenarioId === 'turn_right') {
      setSteeringBias(0.42);
    } else if (scenarioId === 'slip_right') {
      setSteeringBias(-1.0); // Right wheel loses traction and spins fast unless LSD locks!
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
    scene.fog = new THREE.FogExp2(isDarkTheme ? 0x0b101b : 0xf1f5f9, 0.015);

    const camera = new THREE.PerspectiveCamera(
      40,
      container.clientWidth / container.clientHeight,
      0.1,
      150
    );
    camera.position.set(4.2, 4.2, 7.8);

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
    controls.target.set(0, 0, -0.2);
    controls.minDistance = 4.0;
    controls.maxDistance = 24.0;

    cameraPresetRef.current = (viewType) => {
      if (viewType === 'iso') {
        camera.position.set(4.2, 4.2, 7.8);
        controls.target.set(0, 0, -0.2);
      } else if (viewType === 'front') {
        camera.position.set(0, 0.6, 8.8);
        controls.target.set(0, 0, 0);
      } else if (viewType === 'top') {
        camera.position.set(0.01, 9.6, -0.2);
        controls.target.set(0, 0, -0.2);
      } else if (viewType === 'pinion') {
        camera.position.set(-4.8, 2.2, -5.8);
        controls.target.set(0, 0, -0.4);
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
    gridHelper.position.y = -2.45;
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
        emissiveIntensity: 0.22
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
        opacity: 0.22,
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
      opacity: 0.22,
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

    // Soft-Glow Particle Texture for Active Torque Path
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
    // Meshes with Crown Ring Gear (x = -1.12) at z = -1.52
    const pinionGroup = new THREE.Group();
    pinionGroup.position.set(-0.92, 0, -1.62);
    diffRoot.add(pinionGroup);

    // Tapered Conical Drive Pinion Head (11 Teeth, facing +Z towards the Crown Gear center)
    const pinionHeadGeo = createBevelGearGeo({
      pitchRadius: 0.52,
      teethCount: 11,
      faceWidth: 0.48,
      boreRadius: 0.16,
      taperFactor: 0.64,
      spiralTwist: 0.22
    });
    pinionGroup.add(registerMesh(new THREE.Mesh(pinionHeadGeo), 'pinionGear'));

    // Input Pinion Shaft & Driveshaft Companion Flange extending toward -Z
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
    // Rotates around X-axis!
    const carrierGroup = new THREE.Group();
    diffRoot.add(carrierGroup);

    // A. Large Crown Ring Gear (38 Teeth, pitchRadius = 1.66) at x = -1.12
    // Its bevel teeth face +X (toward x = 0) so createBevelGearGeo (+Z taper) is rotated +PI/2 around Y!
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

    // Solid Crown Gear Backing Web & 10 Perimeter Ring Bolts
    const crownWebGeo = new THREE.CylinderGeometry(1.56, 1.56, 0.14, 36);
    crownWebGeo.rotateZ(Math.PI / 2);
    const crownWebMesh = registerMesh(new THREE.Mesh(crownWebGeo), 'carrierCast');
    crownWebMesh.position.x = -1.34;
    carrierGroup.add(crownWebMesh);

    // B. Open-Window Differential Carrier Cage (Toggled by showCarrierCage)
    const carrierCageSubGroup = new THREE.Group();
    carrierGroup.add(carrierCageSubGroup);

    // Left & Right Carrier Bearing Hubs at x = -1.18 and x = +1.18
    const hubRingGeo = new THREE.CylinderGeometry(0.98, 0.98, 0.18, 32);
    hubRingGeo.rotateZ(Math.PI / 2);
    const leftCarrierFace = registerMesh(new THREE.Mesh(hubRingGeo), 'carrierCast');
    leftCarrierFace.position.x = -1.02;
    const rightCarrierFace = registerMesh(new THREE.Mesh(hubRingGeo), 'carrierCast');
    rightCarrierFace.position.x = 1.02;
    carrierCageSubGroup.add(leftCarrierFace, rightCarrierFace);

    // 2 Heavy Structural Carrier Bridges (at Z = -0.86 and Z = +0.86) leaving Y-windows open to view Spider Gears!
    const bridgeGeo = new THREE.BoxGeometry(2.04, 0.36, 0.24);
    [-0.86, 0.86].forEach((bz) => {
      const bMesh = registerMesh(new THREE.Mesh(bridgeGeo), 'carrierCast');
      bMesh.position.set(0, 0, bz);
      carrierCageSubGroup.add(bMesh);
    });

    // C. Central Spider Cross-Pin Shaft (Along Carrier Local Y-Axis!)
    const crossPinGeo = new THREE.CylinderGeometry(0.14, 0.14, 1.96, 20);
    const crossPinMesh = registerMesh(new THREE.Mesh(crossPinGeo), 'axleSteel');
    carrierGroup.add(crossPinMesh);

    // D. Top & Bottom Spider Pinion Bevel Gears (10 Teeth, at y = +0.62 and y = -0.62)
    // They rotate around their local Y-axis when Left and Right wheels turn at different speeds!
    const spiderBevelGeo = createBevelGearGeo({
      pitchRadius: 0.46,
      teethCount: SPIDER_TEETH,
      faceWidth: 0.26,
      boreRadius: 0.15,
      taperFactor: 0.64,
      spiralTwist: 0
    });

    // Top Spider Gear (at y = +0.62, tapered face pointing -Y toward center)
    const topSpiderGroup = new THREE.Group();
    topSpiderGroup.position.set(0, 0.62, 0);
    carrierGroup.add(topSpiderGroup);

    const topSpiderGeo = spiderBevelGeo.clone();
    topSpiderGeo.rotateX(Math.PI / 2); // +Z taper now points toward -Y (center!)
    topSpiderGroup.add(registerMesh(new THREE.Mesh(topSpiderGeo), 'spiderGear'));

    // Bottom Spider Gear (at y = -0.62, tapered face pointing +Y toward center)
    const botSpiderGroup = new THREE.Group();
    botSpiderGroup.position.set(0, -0.62, 0);
    carrierGroup.add(botSpiderGroup);

    const botSpiderGeo = spiderBevelGeo.clone();
    botSpiderGeo.rotateX(-Math.PI / 2); // +Z taper now points toward +Y (center!)
    botSpiderGroup.add(registerMesh(new THREE.Mesh(botSpiderGeo), 'spiderGear'));

    // E. Multi-Plate LSD Friction Clutch Packs & Pressure Rings (Inside Carrier Cage at x = ±0.82)
    const lsdClutchGroup = new THREE.Group();
    carrierGroup.add(lsdClutchGroup);

    const clutchPlateGeo = new THREE.CylinderGeometry(0.76, 0.76, 0.032, 28);
    clutchPlateGeo.rotateZ(Math.PI / 2);
    [-1, 1].forEach((sideSign) => {
      for (let p = 0; p < 4; p++) {
        const cPlate = registerMesh(
          new THREE.Mesh(clutchPlateGeo),
          p % 2 === 0 ? 'lsdClutchFriction' : 'axleSteel',
          false
        );
        cPlate.position.x = sideSign * (0.74 + p * 0.048);
        lsdClutchGroup.add(cPlate);
      }
    });

    // ------------------------------------------------------------------------
    // 5. LEFT & RIGHT SIDE BEVEL GEARS, HALF-SHAFT AXLES & WHEEL BRAKE HUBS
    // ------------------------------------------------------------------------
    const sideBevelGeo = createBevelGearGeo({
      pitchRadius: 0.64,
      teethCount: SIDE_TEETH,
      faceWidth: 0.28,
      boreRadius: 0.22,
      taperFactor: 0.66,
      spiralTwist: 0
    });

    // Helper to build a ventilated brake disc + 5-spoke hub at the outer end of each axle
    const buildWheelBrakeHub = (sideSign) => {
      const hubGrp = new THREE.Group();
      const xHub = sideSign * 3.55;

      // Ventilated Cross-Drilled Brake Disc Rotor
      const rotorGeo = new THREE.CylinderGeometry(1.38, 1.38, 0.16, 36);
      rotorGeo.rotateZ(Math.PI / 2);
      const rotorMesh = registerMesh(new THREE.Mesh(rotorGeo), 'brakeRotor');
      rotorMesh.position.x = xHub;
      hubGrp.add(rotorMesh);

      // 5 Radial Alloy Hub Spokes so wheel RPM is crystal-clear visually
      const spokeGeo = new THREE.BoxGeometry(0.10, 1.18, 0.18);
      for (let s = 0; s < 5; s++) {
        const sa = (s / 5) * Math.PI * 2;
        const spoke = registerMesh(new THREE.Mesh(spokeGeo), 'carrierCast', false);
        spoke.position.set(
          xHub + sideSign * 0.12,
          Math.cos(sa) * 0.62,
          Math.sin(sa) * 0.62
        );
        spoke.rotation.x = -sa;
        hubGrp.add(spoke);
      }

      // Outer Rim Ring
      const rimRingGeo = new THREE.TorusGeometry(1.28, 0.09, 14, 36);
      rimRingGeo.rotateY(Math.PI / 2);
      const rimRingMesh = registerMesh(new THREE.Mesh(rimRingGeo), 'axleSteel', false);
      rimRingMesh.position.x = xHub + sideSign * 0.14;
      hubGrp.add(rimRingMesh);

      return hubGrp;
    };

    // A. LEFT AXLE & LEFT SIDE BEVEL GEAR (x < 0, rotates around X-axis at leftWheelOmega)
    const leftAxleGroup = new THREE.Group();
    diffRoot.add(leftAxleGroup);

    const leftSideGeo = sideBevelGeo.clone();
    leftSideGeo.rotateY(Math.PI / 2); // +Z taper points toward +X (center!)
    const leftSideMesh = registerMesh(new THREE.Mesh(leftSideGeo), 'leftSideGear');
    leftSideMesh.position.x = -0.58;
    leftAxleGroup.add(leftSideMesh);

    const halfShaftGeo = new THREE.CylinderGeometry(0.21, 0.21, 3.15, 24);
    halfShaftGeo.rotateZ(Math.PI / 2);
    const leftShaftMesh = registerMesh(new THREE.Mesh(halfShaftGeo), 'leftSideGear');
    leftShaftMesh.position.x = -2.15;
    leftAxleGroup.add(leftShaftMesh);

    const leftWheelHubGroup = buildWheelBrakeHub(-1);
    leftAxleGroup.add(leftWheelHubGroup);

    // B. RIGHT AXLE & RIGHT SIDE BEVEL GEAR (x > 0, rotates around X-axis at rightWheelOmega)
    const rightAxleGroup = new THREE.Group();
    diffRoot.add(rightAxleGroup);

    const rightSideGeo = sideBevelGeo.clone();
    rightSideGeo.rotateY(-Math.PI / 2); // +Z taper points toward -X (center!)
    const rightSideMesh = registerMesh(new THREE.Mesh(rightSideGeo), 'rightSideGear');
    rightSideMesh.position.x = 0.58;
    rightAxleGroup.add(rightSideMesh);

    const rightShaftMesh = registerMesh(new THREE.Mesh(halfShaftGeo), 'rightSideGear');
    rightShaftMesh.position.x = 2.15;
    rightAxleGroup.add(rightShaftMesh);

    const rightWheelHubGroup = buildWheelBrakeHub(1);
    rightAxleGroup.add(rightWheelHubGroup);

    // Stationary Red 4-Piston Brake Calipers on Left & Right Hubs
    const calipersGroup = new THREE.Group();
    diffRoot.add(calipersGroup);
    const caliperGeo = new THREE.BoxGeometry(0.38, 0.68, 0.42);
    [-3.55, 3.55].forEach((cx) => {
      const calMesh = registerMesh(new THREE.Mesh(caliperGeo), 'brakeCaliperRed');
      calMesh.position.set(cx, 0.96, 0.86);
      calMesh.rotation.x = -0.65;
      calipersGroup.add(calMesh);
    });

    // ------------------------------------------------------------------------
    // 6. SCULPTED CAST-ALUMINUM DIFFERENTIAL "PUMPKIN" HOUSING & AXLE TUBES
    // ------------------------------------------------------------------------
    const casingGroup = new THREE.Group();
    diffRoot.add(casingGroup);

    // Bulbous Center Differential Housing (Split into Rear/Bottom Half + Front/Top Cutaway Cover)
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

    // Front Pinion Nose Snout Housing
    const snoutGeo = new THREE.CylinderGeometry(0.56, 0.88, 1.65, 28, 1, true);
    snoutGeo.rotateX(Math.PI / 2);
    const snoutMesh = registerMesh(new THREE.Mesh(snoutGeo), 'casing');
    snoutMesh.position.set(-0.92, 0, -2.25);
    casingGroup.add(snoutMesh);

    // Left & Right Cast Axle Tubes
    const axleTubeGeo = new THREE.CylinderGeometry(0.42, 0.54, 1.85, 24, 1, true);
    axleTubeGeo.rotateZ(Math.PI / 2);
    const leftTubeMesh = registerMesh(new THREE.Mesh(axleTubeGeo), 'casing');
    leftTubeMesh.position.set(-2.35, 0, 0);
    const rightTubeMesh = registerMesh(new THREE.Mesh(axleTubeGeo.clone().rotateZ(Math.PI)), 'casing');
    rightTubeMesh.position.set(2.35, 0, 0);
    casingGroup.add(leftTubeMesh, rightTubeMesh);

    // ------------------------------------------------------------------------
    // 7. ACTIVE TORQUE FLOW PARTICLES (PINION -> CROWN -> LEFT & RIGHT AXLES)
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
    // 8. MATERIAL MODES, VISIBILITY & REAL-TIME DIFFERENTIAL KINEMATICS LOOP
    // ------------------------------------------------------------------------
    const updateMaterialModes = () => {
      const {
        renderMode: rMode,
        casingOpacity: cOp,
        cutawayMode: cut,
        showCasing: sCase,
        showCarrierCage: sCarrier,
        showLsdClutches: sLsd,
        showWheelHubs: sWheels,
        showTorqueFlow: sFlow,
        diffType: dType,
        exploded: exp,
        theme: activeTheme
      } = simParams.current;

      realisticMats.casing.opacity = cOp;
      rawCasingMat.opacity = cOp;
      wireframeCasingMat.opacity = Math.max(0.14, cOp);

      // Highlight LSD Clutch Packs brightly when LSD mode is active
      realisticMats.lsdClutchFriction.emissiveIntensity = dType === 'lsd' ? 0.55 : 0.08;

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
      lsdClutchGroup.visible = sLsd;
      leftWheelHubGroup.visible = sWheels;
      rightWheelHubGroup.visible = sWheels;
      calipersGroup.visible = sWheels;
      torqueFlowGroup.visible = sFlow;

      // Exploded View Offsets
      pinionGroup.position.z = -1.62 - exp * 1.15;
      leftAxleGroup.position.x = -exp * 1.15;
      rightAxleGroup.position.x = exp * 1.15;
      topSpiderGroup.position.y = 0.62 + exp * 0.45;
      botSpiderGroup.position.y = -0.62 - exp * 0.45;
      frontHousingMesh.position.y = exp * 1.35;
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
        isPlaying: playing,
        driveshaftRpm: inRpm,
        diffType: dType,
        steeringBias: rawBias,
        lsdLockPct: lockPct,
        autoRotateCam: autoCam
      } = simParams.current;

      // 1. Input Driveshaft & Carrier Cage Angular Velocities
      const visualSpeedScale = 0.085;
      const pinionOmega = playing ? ((inRpm * 2 * Math.PI) / 60) * visualSpeedScale : 0;
      const carrierOmega = pinionOmega / FINAL_DRIVE_RATIO;

      // 2. Compute Effective Speed Difference Factor (deltaFrac) between Left & Right Wheels:
      //    In Open Diff mode: full steering/slip bias applies (-1.0 means Left stops, Right = 2x!).
      //    In Clutch-Pack LSD mode: the multi-plate clutch resists speed differences by lockPct%!
      const lsdDamping = dType === 'lsd' ? 1 - (lockPct / 100) * 0.82 : 1.0;
      const effectiveBias = rawBias * lsdDamping;

      // Fundamental Epicyclic Differential Law:
      //   leftOmega  = carrierOmega * (1 + effectiveBias)
      //   rightOmega = carrierOmega * (1 - effectiveBias)
      //   -> Average (leftOmega + rightOmega) / 2 === carrierOmega ALWAYS!
      //   When effectiveBias < 0 (Turn Left or Right Wheel Slip):
      //     Left wheel slows down, Right wheel speeds up!
      const leftOmega = carrierOmega * (1 + effectiveBias);
      const rightOmega = carrierOmega * (1 - effectiveBias);
      const diffOmega = rightOmega - carrierOmega; // Relative speed of Right Side Gear inside Carrier

      // 3. Rotate Pinion, Carrier Cage, Left Axle, Right Axle & Spider Bevel Gears!
      pinionGroup.rotation.z -= pinionOmega * dt;
      carrierGroup.rotation.x += carrierOmega * dt;
      leftAxleGroup.rotation.x += leftOmega * dt;
      rightAxleGroup.rotation.x += rightOmega * dt;

      // Spider Bevel Gears spin around their local Y-axis ONLY when leftOmega !== rightOmega!
      const spiderLocalOmega = diffOmega * (SIDE_TEETH / SPIDER_TEETH);
      topSpiderGroup.rotation.y += spiderLocalOmega * dt;
      botSpiderGroup.rotation.y -= spiderLocalOmega * dt;

      // Pulse the internal spider glow light when differential action is occurring
      const diffActivity = Math.min(1, Math.abs(effectiveBias) * 1.5);
      spiderGlowLight.intensity = 1.1 + diffActivity * 2.4;

      // 4. Animate Left & Right Torque Flow Particles proportional to each wheel's speed & torque
      flowParticles.forEach((fp) => {
        const sideSpeed = fp.isRightSide ? Math.abs(rightOmega) : Math.abs(leftOmega);
        if (playing) {
          fp.u = (fp.u + dt * (0.22 + sideSpeed * 0.35)) % 1.0;
        }
        const safeU = Math.max(0.001, Math.min(0.999, fp.u));
        const curve = fp.isRightSide ? rightTorqueCurve : leftTorqueCurve;
        const pt = curve.getPoint(safeU);
        fp.sprite.position.copy(pt);
        fp.mat.opacity = sideSpeed > 0.02 ? 0.78 * Math.sin(safeU * Math.PI) : 0.12;
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
        const spRpm = Math.round(Math.abs(rRpm - cRpm) * (SIDE_TEETH / SPIDER_TEETH));

        // Torque split calculation (Total carrier torque = 1080 Nm):
        const totalCarrierTorque = 1080;
        let lTorque = 540;
        let rTorque = 540;
        if (Math.abs(rawBias) >= 0.95 && dType === 'open') {
          // Open diff on ice: nearly 0 usable torque to the gripping wheel!
          lTorque = 45;
          rTorque = 45;
        } else if (dType === 'lsd' && Math.abs(rawBias) > 0.05) {
          const lockFrac = lockPct / 100;
          const fasterIsRight = effectiveBias < 0;
          lTorque = Math.round(totalCarrierTorque * (fasterIsRight ? 0.5 + lockFrac * 0.35 : 0.5 - lockFrac * 0.35));
          rTorque = totalCarrierTorque - lTorque;
        }

        setTelemetry({
          carrierRpm: cRpm,
          leftWheelRpm: lRpm,
          rightWheelRpm: rRpm,
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
          TOP-LEFT: DIFFERENTIAL TELEMETRY, OPEN vs LSD & SCENARIOS
      ========================================================= */}
      <div className="pointer-events-none absolute top-4 left-4 z-10 max-h-[calc(100%-11rem)] w-[min(28rem,calc(100%-2rem))] overflow-y-auto max-[720px]:max-h-[50%] max-[720px]:w-[calc(100%-2rem)]">
        <section
          aria-label="Open & Limited-Slip Differential"
          className={`pointer-events-auto flex flex-col gap-5 p-5 ${sheet.panel}`}
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

          <p className="m-0 text-base leading-relaxed">
            Gardan hipoid (11T → 38T) dengan roda gigi planet *spider bevel* yang memungkinkan roda kiri dan kanan berputar pada kecepatan berbeda saat menikung, dilengkapi kopling *Limited-Slip Differential (LSD)*.
          </p>

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
              { id: 'straight', label: 'Jalan Lurus (1:1)' },
              { id: 'turn_left', label: 'Belok Kiri (R > L)' },
              { id: 'turn_right', label: 'Belok Kanan (L > R)' },
              { id: 'slip_right', label: 'Roda Kanan Selip Es!' }
            ].map((sc) => {
              const active = drivingScenario === sc.id;
              return (
                <button
                  key={sc.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleSelectScenario(sc.id)}
                  className={`px-2.5 py-2 text-center text-base font-semibold ${hit} ${
                    active ? sheet.chosen : sheet.idle
                  }`}
                >
                  {sc.label}
                </button>
              );
            })}
          </div>

          {/* 2x2 Telemetry Readouts */}
          <div className="grid grid-cols-2 gap-2">
            {[
              {
                label: 'Roda kiri (Hijau)',
                value: isPlaying ? telemetry.leftWheelRpm : 0,
                unit: `rpm · ${isPlaying ? telemetry.leftTorqueNm : 0} Nm`
              },
              {
                label: 'Roda kanan (Cyan)',
                value: isPlaying ? telemetry.rightWheelRpm : 0,
                unit: `rpm · ${isPlaying ? telemetry.rightTorqueNm : 0} Nm`
              },
              {
                label: 'Crown carrier cage',
                value: isPlaying ? telemetry.carrierRpm : 0,
                unit: 'rpm rata-rata'
              },
              {
                label: 'Putaran spider gear',
                value: isPlaying ? telemetry.spiderSelfRpm : 0,
                unit: telemetry.spiderSelfRpm === 0 ? 'rpm (Terkunci)' : 'rpm (Aktif!)'
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
              { label: 'Rem & hub roda', state: showWheelHubs, setter: setShowWheelHubs },
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
                { value: 400, label: '400 crawl' },
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

          {/* Column 2: Steering / Wheel Speed Bias OR LSD Locking Preload */}
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
                className={`px-2 py-1 ${hit} ${sheet.idle}`}
              >
                Belok Kiri
              </button>
              <button
                type="button"
                onClick={() => handleSelectScenario('straight')}
                className={`px-2 py-1 ${hit} ${
                  steeringBias === 0 ? sheet.chosen : sheet.idle
                }`}
              >
                Lurus
              </button>
              <button
                type="button"
                onClick={() => handleSelectScenario('turn_right')}
                className={`px-2 py-1 ${hit} ${sheet.idle}`}
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
              setCasingOpacity(0.22);
              setCutawayMode(true);
              setRenderMode('realistic');
              setShowCasing(true);
              setShowCarrierCage(true);
              setShowLsdClutches(true);
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
