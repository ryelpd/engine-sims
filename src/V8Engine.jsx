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

const ENGINE_SPECS = {
  crankRadius: 0.75,
  rodLength: 2.35,
  pistonRadius: 0.68,
  pistonHeight: 0.85,
  boreSpacing: 1.75,
  bankOffset: 0.35,
  vAngle: Math.PI / 4,
  firingOrder: [1, 8, 4, 3, 6, 5, 7, 2],
  journalAngles: [0, Math.PI / 2, (3 * Math.PI) / 2, Math.PI],
  firingAngles: [
    0,
    (7 * Math.PI) / 2,
    (3 * Math.PI) / 2,
    Math.PI,
    (5 * Math.PI) / 2,
    2 * Math.PI,
    3 * Math.PI,
    Math.PI / 2
  ]
};

export default function V8Engine({ theme = 'dark' }) {
  const mountRef = useRef(null);
  
  const [rpm, setRpm] = useState(800);
  const [isPlaying, setIsPlaying] = useState(true);
  const [renderMode, setRenderMode] = useState('realistic');
  const [exploded, setExploded] = useState(0);
  const [blockOpacity, setBlockOpacity] = useState(0.28);
  const [showBlock, setShowBlock] = useState(true);
  const [showHeads, setShowHeads] = useState(true);
  const [showValves, setShowValves] = useState(true);
  const [showCombustion, setShowCombustion] = useState(true);
  const [autoRotateCam, setAutoRotateCam] = useState(false);
  const [activeCylinderInfo, setActiveCylinderInfo] = useState(1);
  const [crankDeg, setCrankDeg] = useState(0);

  const simParams = useRef({
    theme,
    rpm: 800,
    isPlaying: true,
    renderMode: 'realistic',
    exploded: 0,
    blockOpacity: 0.28,
    showBlock: true,
    showHeads: true,
    showValves: true,
    showCombustion: true,
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
    theta: 0.65,
    phi: 1.15,
    radius: 13.5,
    target: new THREE.Vector3(0, 1.2, 0)
  });

  useEffect(() => {
    simParams.current = {
      theme,
      rpm,
      isPlaying,
      renderMode,
      exploded,
      blockOpacity,
      showBlock,
      showHeads,
      showValves,
      showCombustion,
      autoRotateCam
    };

    const { scene, gridHelper, ambientLight, rimLight1, rimLight2 } = sceneElements.current;
    if (scene) {
      if (theme === 'light') {
        scene.background.setHex(0xf8fafc);
        if (ambientLight) {
          ambientLight.color.setHex(0xffffff);
          ambientLight.intensity = 0.85;
        }
        if (gridHelper) {
          gridHelper.material.color.setHex(0x94a3b8);
        }
        if (rimLight1) rimLight1.intensity = 0.8;
        if (rimLight2) rimLight2.intensity = 0.7;
      } else {
        scene.background.setHex(0x101828);
        if (ambientLight) {
          ambientLight.color.setHex(0xdbeafe);
          ambientLight.intensity = 0.55;
        }
        if (gridHelper) {
          gridHelper.material.color.setHex(0x344054);
        }
        if (rimLight1) rimLight1.intensity = 1.1;
        if (rimLight2) rimLight2.intensity = 0.85;
      }
    }
  }, [theme, rpm, isPlaying, renderMode, exploded, blockOpacity, showBlock, showHeads, showValves, showCombustion, autoRotateCam]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const isInitialDark = simParams.current.theme === 'dark';
    scene.background = new THREE.Color(isInitialDark ? 0x101828 : 0xf8fafc);
    sceneElements.current.scene = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(
      isInitialDark ? 0xdbeafe : 0xffffff, 
      isInitialDark ? 0.55 : 0.85
    );
    scene.add(ambientLight);
    sceneElements.current.ambientLight = ambientLight;

    const mainDirLight = new THREE.DirectionalLight(0xffffff, 1.8);
    mainDirLight.position.set(10, 18, 12);
    mainDirLight.castShadow = true;
    mainDirLight.shadow.mapSize.width = 2048;
    mainDirLight.shadow.mapSize.height = 2048;
    scene.add(mainDirLight);

    const rimLight1 = new THREE.DirectionalLight(0x38bdf8, isInitialDark ? 1.1 : 0.8);
    rimLight1.position.set(-14, 6, -10);
    scene.add(rimLight1);
    sceneElements.current.rimLight1 = rimLight1;

    const rimLight2 = new THREE.DirectionalLight(0xfb6514, isInitialDark ? 0.85 : 0.7);
    rimLight2.position.set(12, -10, 8);
    scene.add(rimLight2);
    sceneElements.current.rimLight2 = rimLight2;

    const gridHelper = new THREE.GridHelper(
      28, 
      28, 
      isInitialDark ? 0x344054 : 0x94a3b8, 
      isInitialDark ? 0x1d2939 : 0xe2e8f0
    );
    gridHelper.position.y = -2.6;
    scene.add(gridHelper);
    sceneElements.current.gridHelper = gridHelper;

    const realisticMats = {
      crank: new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.88, roughness: 0.22 }),
      counterweight: new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.75, roughness: 0.45 }),
      piston: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85, roughness: 0.18 }),
      pistonRing: new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 }),
      rod: new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.3 }),
      pin: new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.95, roughness: 0.1 }),
      valveIntake: new THREE.MeshStandardMaterial({ color: 0x60a5fa, metalness: 0.8, roughness: 0.25 }),
      valveExhaust: new THREE.MeshStandardMaterial({ color: 0xf87171, metalness: 0.8, roughness: 0.25 }),
      camshaft: new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.85, roughness: 0.25 }),
      flywheel: new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.35 }),
      pulleyAccent: new THREE.MeshStandardMaterial({ color: 0xfb6514, metalness: 0.7, roughness: 0.3 }),
      block: new THREE.MeshPhysicalMaterial({
        color: 0x94a3b8,
        metalness: 0.2,
        roughness: 0.15,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        side: THREE.DoubleSide
      }),
      liner: new THREE.MeshPhysicalMaterial({
        color: 0xcbd5e1,
        metalness: 0.4,
        roughness: 0.2,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide
      }),
      head: new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.65,
        roughness: 0.35,
        transparent: true,
        opacity: 0.88
      }),
      valveCover: new THREE.MeshStandardMaterial({
        color: 0xe05307,
        metalness: 0.6,
        roughness: 0.3
      }),
      oilPan: new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.75,
        roughness: 0.4
      }),
      exhaust: new THREE.MeshStandardMaterial({
        color: 0xa84110,
        metalness: 0.82,
        roughness: 0.32
      }),
      intake: new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        metalness: 0.88,
        roughness: 0.2
      })
    };

    const rawSolidMat = new THREE.MeshLambertMaterial({ color: 0xd1d5db, flatShading: false });
    const rawBlockMat = new THREE.MeshLambertMaterial({
      color: 0x9ca3af,
      transparent: true,
      opacity: 0.28,
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
      opacity: 0.35
    });

    const trackedMeshes = [];
    const registerMesh = (mesh, type = 'solid', customRealisticMat = null) => {
      const baseMat = customRealisticMat || realisticMats[type] || realisticMats.crank;
      mesh.material = baseMat;
      mesh.castShadow = type !== 'block' && type !== 'liner';
      mesh.receiveShadow = true;

      const wireGeo = new THREE.WireframeGeometry(mesh.geometry);
      const wireOverlay = new THREE.LineSegments(
        wireGeo,
        new THREE.LineBasicMaterial({
          color: 0x0f172a,
          transparent: true,
          opacity: 0.28
        })
      );
      wireOverlay.visible = false;
      mesh.add(wireOverlay);

      trackedMeshes.push({ mesh, type, baseMat, wireOverlay });
      return mesh;
    };

    const engineRoot = new THREE.Group();
    scene.add(engineRoot);

    const crankshaftGroup = new THREE.Group();
    engineRoot.add(crankshaftGroup);

    const zStart = -2.625;
    const r = ENGINE_SPECS.crankRadius;
    const L = ENGINE_SPECS.rodLength;

    for (let i = 0; i < 5; i++) {
      const zPos = zStart - 0.875 + i * ENGINE_SPECS.boreSpacing;
      const mainJournalGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.45, 24);
      mainJournalGeo.rotateX(Math.PI / 2);
      const mainJournal = registerMesh(new THREE.Mesh(mainJournalGeo), 'crank');
      mainJournal.position.set(0, 0, zPos);
      crankshaftGroup.add(mainJournal);
    }

    for (let i = 0; i < 4; i++) {
      const zCenter = zStart + i * ENGINE_SPECS.boreSpacing;
      const pinAngle = ENGINE_SPECS.journalAngles[i];
      const pinX = r * Math.sin(pinAngle);
      const pinY = r * Math.cos(pinAngle);

      const pinGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.95, 24);
      pinGeo.rotateX(Math.PI / 2);
      const pinMesh = registerMesh(new THREE.Mesh(pinGeo), 'pin');
      pinMesh.position.set(pinX, pinY, zCenter);
      crankshaftGroup.add(pinMesh);

      [-0.56, 0.56].forEach((zOff) => {
        const webGroup = new THREE.Group();
        webGroup.position.set(0, 0, zCenter + zOff);
        webGroup.rotation.z = -pinAngle;

        const cwShape = new THREE.Shape();
        cwShape.moveTo(-0.34, 0.15);
        cwShape.lineTo(-0.26, r + 0.15);
        cwShape.absarc(0, r, 0.26, Math.PI, 0, true);
        cwShape.lineTo(0.34, 0.15);
        cwShape.bezierCurveTo(0.62, -0.05, 0.82, -0.35, 0.72, -0.68);
        cwShape.absarc(0, -0.68, 0.72, 0, Math.PI, true);
        cwShape.bezierCurveTo(-0.82, -0.35, -0.62, -0.05, -0.34, 0.15);

        const cwGeo = new THREE.ExtrudeGeometry(cwShape, {
          depth: 0.15,
          bevelEnabled: true,
          bevelSegments: 3,
          steps: 1,
          bevelSize: 0.025,
          bevelThickness: 0.025
        });
        cwGeo.translate(0, 0, -0.075);
        const cwMesh = registerMesh(new THREE.Mesh(cwGeo), 'counterweight');
        webGroup.add(cwMesh);

        crankshaftGroup.add(webGroup);
      });
    }

    const flywheelGeo = new THREE.CylinderGeometry(1.45, 1.45, 0.28, 36);
    flywheelGeo.rotateX(Math.PI / 2);
    const flywheel = registerMesh(new THREE.Mesh(flywheelGeo), 'flywheel');
    flywheel.position.set(0, 0, -4.15);
    crankshaftGroup.add(flywheel);

    for (let b = 0; b < 8; b++) {
      const bAngle = (b * Math.PI) / 4;
      const boltGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.34, 12);
      boltGeo.rotateX(Math.PI / 2);
      const bolt = registerMesh(new THREE.Mesh(boltGeo), 'pin');
      bolt.position.set(Math.sin(bAngle) * 0.55, Math.cos(bAngle) * 0.55, -4.15);
      crankshaftGroup.add(bolt);
    }

    const pulleyGeo = new THREE.CylinderGeometry(0.68, 0.68, 0.38, 28);
    pulleyGeo.rotateX(Math.PI / 2);
    const pulley = registerMesh(new THREE.Mesh(pulleyGeo), 'flywheel');
    pulley.position.set(0, 0, 3.95);
    crankshaftGroup.add(pulley);

    const pulleyRingGeo = new THREE.TorusGeometry(0.52, 0.06, 12, 28);
    const pulleyRing = registerMesh(new THREE.Mesh(pulleyRingGeo), 'pulleyAccent');
    pulleyRing.position.set(0, 0, 4.15);
    crankshaftGroup.add(pulleyRing);

    const cylindersData = [];
    for (let i = 0; i < 4; i++) {
      const zCenter = zStart + i * ENGINE_SPECS.boreSpacing;
      const banks = [
        { side: 'L', cylNumber: i * 2 + 1, bankAngle: ENGINE_SPECS.vAngle, zOffset: -ENGINE_SPECS.bankOffset / 2 },
        { side: 'R', cylNumber: i * 2 + 2, bankAngle: -ENGINE_SPECS.vAngle, zOffset: ENGINE_SPECS.bankOffset / 2 }
      ];

      banks.forEach((bankInfo) => {
        const zPos = zCenter + bankInfo.zOffset;
        const bAngle = bankInfo.bankAngle;
        const axisDir = new THREE.Vector2(-Math.sin(bAngle), Math.cos(bAngle));

        const pistonGroup = new THREE.Group();
        pistonGroup.rotation.z = bAngle;
        engineRoot.add(pistonGroup);

        const crownGeo = new THREE.CylinderGeometry(
          ENGINE_SPECS.pistonRadius,
          ENGINE_SPECS.pistonRadius,
          ENGINE_SPECS.pistonHeight * 0.52,
          32
        );
        crownGeo.translate(0, ENGINE_SPECS.pistonHeight * 0.34, 0);
        const crownMesh = registerMesh(new THREE.Mesh(crownGeo), 'piston');
        pistonGroup.add(crownMesh);

        const underCrownGeo = new THREE.CylinderGeometry(
          ENGINE_SPECS.pistonRadius * 0.88,
          ENGINE_SPECS.pistonRadius * 0.72,
          0.32,
          28
        );
        underCrownGeo.translate(0, 0.08, 0);
        const underCrownMesh = registerMesh(new THREE.Mesh(underCrownGeo), 'piston');
        pistonGroup.add(underCrownMesh);

        const dishGeo = new THREE.CylinderGeometry(
          ENGINE_SPECS.pistonRadius * 0.76,
          ENGINE_SPECS.pistonRadius * 0.68,
          0.06,
          24
        );
        dishGeo.translate(0, ENGINE_SPECS.pistonHeight * 0.58, 0);
        const dishMesh = registerMesh(new THREE.Mesh(dishGeo), 'counterweight');
        pistonGroup.add(dishMesh);

        [0, Math.PI].forEach((skirtAngle) => {
          const skirtGeo = new THREE.CylinderGeometry(
            ENGINE_SPECS.pistonRadius * 0.98,
            ENGINE_SPECS.pistonRadius * 0.95,
            ENGINE_SPECS.pistonHeight * 0.62,
            20, 1, false, skirtAngle - 0.85, 1.7
          );
          skirtGeo.translate(0, -ENGINE_SPECS.pistonHeight * 0.12, 0);
          const skirtMesh = registerMesh(new THREE.Mesh(skirtGeo), 'piston');
          pistonGroup.add(skirtMesh);
        });

        [-0.32, 0.32].forEach((bossZ) => {
          const pinBossGeo = new THREE.CylinderGeometry(0.27, 0.27, 0.28, 20);
          pinBossGeo.rotateX(Math.PI / 2);
          pinBossGeo.translate(0, 0, bossZ);
          const pinBossMesh = registerMesh(new THREE.Mesh(pinBossGeo), 'piston');
          pistonGroup.add(pinBossMesh);
        });

        [0.44, 0.34, 0.24].forEach((rY) => {
          const ringGeo = new THREE.TorusGeometry(ENGINE_SPECS.pistonRadius + 0.008, 0.018, 10, 32);
          ringGeo.rotateX(Math.PI / 2);
          const ringMesh = registerMesh(new THREE.Mesh(ringGeo), 'pistonRing');
          ringMesh.position.y = rY;
          pistonGroup.add(ringMesh);
        });

        const wristGeo = new THREE.CylinderGeometry(0.15, 0.15, ENGINE_SPECS.pistonRadius * 1.75, 20);
        wristGeo.rotateX(Math.PI / 2);
        const wristMesh = registerMesh(new THREE.Mesh(wristGeo), 'pin');
        wristMesh.position.set(0, 0, 0);
        pistonGroup.add(wristMesh);

        const rodGroup = new THREE.Group();
        engineRoot.add(rodGroup);

        const bigEndGeo = new THREE.CylinderGeometry(0.39, 0.39, 0.3, 24);
        bigEndGeo.rotateX(Math.PI / 2);
        const bigEndMesh = registerMesh(new THREE.Mesh(bigEndGeo), 'rod');
        rodGroup.add(bigEndMesh);

        const rodWebShape = new THREE.Shape();
        rodWebShape.moveTo(-0.26, 0.24);
        rodWebShape.quadraticCurveTo(-0.12, L * 0.5, -0.17, L - 0.16);
        rodWebShape.lineTo(0.17, L - 0.16);
        rodWebShape.quadraticCurveTo(0.12, L * 0.5, 0.26, 0.24);
        rodWebShape.closePath();

        const rodWebGeo = new THREE.ExtrudeGeometry(rodWebShape, {
          depth: 0.1,
          bevelEnabled: true,
          bevelSegments: 2,
          steps: 1,
          bevelSize: 0.02,
          bevelThickness: 0.02
        });
        rodWebGeo.translate(0, 0, -0.05);
        const rodWebMesh = registerMesh(new THREE.Mesh(rodWebGeo), 'rod');
        rodGroup.add(rodWebMesh);

        [-0.1, 0.1].forEach((ribX) => {
          const ribGeo = new THREE.CylinderGeometry(0.032, 0.045, L - 0.52, 12);
          ribGeo.translate(ribX, L / 2, 0);
          const ribMesh = registerMesh(new THREE.Mesh(ribGeo), 'rod');
          rodGroup.add(ribMesh);
        });

        const smallEndGeo = new THREE.CylinderGeometry(0.23, 0.23, 0.28, 20);
        smallEndGeo.rotateX(Math.PI / 2);
        smallEndGeo.translate(0, L, 0);
        const smallEndMesh = registerMesh(new THREE.Mesh(smallEndGeo), 'rod');
        rodGroup.add(smallEndMesh);

        const maxStrokeDist = r + L + ENGINE_SPECS.pistonHeight / 2;
        const headGroup = new THREE.Group();
        headGroup.rotation.z = bAngle;
        engineRoot.add(headGroup);

        const linerHeight = 2.35;
        const linerGeo = new THREE.CylinderGeometry(
          ENGINE_SPECS.pistonRadius + 0.05,
          ENGINE_SPECS.pistonRadius + 0.05,
          linerHeight, 28, 1, true
        );
        const linerMesh = registerMesh(new THREE.Mesh(linerGeo), 'liner');
        linerMesh.position.set(0, r + L - 0.35, zPos);
        headGroup.add(linerMesh);

        const flameMat = new THREE.MeshBasicMaterial({
          color: 0xfb6514,
          transparent: true,
          opacity: 0.0,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        const flameGeo = new THREE.CylinderGeometry(
          ENGINE_SPECS.pistonRadius * 0.94,
          ENGINE_SPECS.pistonRadius * 0.94,
          0.35, 24
        );
        const flameMesh = new THREE.Mesh(flameGeo, flameMat);
        flameMesh.position.set(0, maxStrokeDist + 0.18, zPos);
        headGroup.add(flameMesh);

        const createValveUnit = (xOffset, isIntake) => {
          const vGroup = new THREE.Group();
          vGroup.position.set(xOffset, maxStrokeDist + 0.45, zPos);
          vGroup.rotation.z = isIntake ? 0.22 : -0.22;

          const stemGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.75, 12);
          stemGeo.translate(0, 0.35, 0);
          const stemMesh = registerMesh(new THREE.Mesh(stemGeo), isIntake ? 'valveIntake' : 'valveExhaust');
          vGroup.add(stemMesh);

          const discGeo = new THREE.CylinderGeometry(0.24, 0.08, 0.08, 20);
          const discMesh = registerMesh(new THREE.Mesh(discGeo), isIntake ? 'valveIntake' : 'valveExhaust');
          vGroup.add(discMesh);

          headGroup.add(vGroup);
          return vGroup;
        };

        const intakeValve = createValveUnit(0.26, true);
        const exhaustValve = createValveUnit(-0.26, false);

        const sparkPlugGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.55, 12);
        const sparkPlugMesh = registerMesh(new THREE.Mesh(sparkPlugGeo), 'pin');
        sparkPlugMesh.position.set(0, maxStrokeDist + 0.72, zPos);
        headGroup.add(sparkPlugMesh);

        cylindersData.push({
          cylNumber: bankInfo.cylNumber,
          side: bankInfo.side,
          journalIndex: i,
          bankAngle: bAngle,
          axisDir,
          zPos,
          pistonGroup,
          rodGroup,
          headGroup,
          linerMesh,
          flameMesh,
          flameMat,
          intakeValve,
          exhaustValve,
          firingAngle: ENGINE_SPECS.firingAngles[bankInfo.cylNumber - 1]
        });
      });
    }

    const blockEnvelopeGroup = new THREE.Group();
    engineRoot.add(blockEnvelopeGroup);

    const blockShape = new THREE.Shape();
    blockShape.moveTo(-1.35, -0.95);
    blockShape.bezierCurveTo(-1.75, -0.35, -1.7, 0.35, -1.25, 0.85);
    blockShape.lineTo(-3.45, 3.05);
    blockShape.lineTo(-2.1, 4.4);
    blockShape.lineTo(-0.55, 2.85);
    blockShape.quadraticCurveTo(0, 2.45, 0.55, 2.85);
    blockShape.lineTo(2.1, 4.4);
    blockShape.lineTo(3.45, 3.05);
    blockShape.lineTo(1.25, 0.85);
    blockShape.bezierCurveTo(1.7, 0.35, 1.75, -0.35, 1.35, -0.95);
    blockShape.closePath();

    const crankTunnelPath = new THREE.Path();
    crankTunnelPath.absarc(0, 0, 0.88, 0, Math.PI * 2, true);
    blockShape.holes.push(crankTunnelPath);

    const castBlockGeo = new THREE.ExtrudeGeometry(blockShape, {
      depth: 7.4,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.14,
      bevelThickness: 0.14
    });
    castBlockGeo.translate(0, 0, -3.7);
    const crankcaseMesh = registerMesh(new THREE.Mesh(castBlockGeo), 'block');
    blockEnvelopeGroup.add(crankcaseMesh);

    const bellShape = new THREE.Shape();
    bellShape.absarc(0, 0.1, 1.85, -0.35, Math.PI + 0.35, false);
    bellShape.lineTo(-1.45, -1.05);
    bellShape.lineTo(1.45, -1.05);
    bellShape.closePath();
    const bellGeo = new THREE.ExtrudeGeometry(bellShape, {
      depth: 0.35,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.06,
      bevelThickness: 0.06
    });
    bellGeo.translate(0, 0, -4.1);
    const bellMesh = registerMesh(new THREE.Mesh(bellGeo), 'block');
    blockEnvelopeGroup.add(bellMesh);

    const sumpShape = new THREE.Shape();
    sumpShape.moveTo(-1.35, -0.95);
    sumpShape.lineTo(1.35, -0.95);
    sumpShape.bezierCurveTo(1.3, -1.55, 0.95, -1.85, 0.55, -1.85);
    sumpShape.lineTo(-0.55, -1.85);
    sumpShape.bezierCurveTo(-0.95, -1.85, -1.3, -1.55, -1.35, -0.95);

    const sumpGeo = new THREE.ExtrudeGeometry(sumpShape, {
      depth: 7.2,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.1,
      bevelThickness: 0.1
    });
    sumpGeo.translate(0, 0, -3.6);
    const sumpMesh = registerMesh(new THREE.Mesh(sumpGeo), 'oilPan');
    blockEnvelopeGroup.add(sumpMesh);

    const intakeGroup = new THREE.Group();
    engineRoot.add(intakeGroup);

    [-0.42, 0.42].forEach((xPlenum) => {
      const plenumGeo = new THREE.CylinderGeometry(0.34, 0.38, 6.4, 24);
      plenumGeo.rotateX(Math.PI / 2);
      const plenumMesh = registerMesh(new THREE.Mesh(plenumGeo), 'intake');
      plenumMesh.position.set(xPlenum, 3.35, 0);
      intakeGroup.add(plenumMesh);
    });

    for (let i = 0; i < 4; i++) {
      [-1, 1].forEach((dir) => {
        const zRunner = zStart + i * ENGINE_SPECS.boreSpacing + (dir * ENGINE_SPECS.bankOffset) / 2;
        const runnerCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(dir * -0.35, 3.45, zRunner),
          new THREE.Vector3(dir * 0.25, 3.85, zRunner),
          new THREE.Vector3(dir * 1.15, 3.35, zRunner)
        ]);
        const runnerGeo = new THREE.TubeGeometry(runnerCurve, 16, 0.15, 14, false);
        const runnerMesh = registerMesh(new THREE.Mesh(runnerGeo), 'intake');
        intakeGroup.add(runnerMesh);
      });
    }

    const bankCovers = [];
    [-ENGINE_SPECS.vAngle, ENGINE_SPECS.vAngle].forEach((bAngle, bankIdx) => {
      const isRightBank = bankIdx === 1;
      const bankSign = isRightBank ? 1 : -1;

      const bankBoxGroup = new THREE.Group();
      bankBoxGroup.rotation.z = bAngle;
      engineRoot.add(bankBoxGroup);

      const jacketMesh = new THREE.Group();
      for (let c = 0; c < 4; c++) {
        const zCyl = zStart + c * ENGINE_SPECS.boreSpacing + (bankSign * ENGINE_SPECS.bankOffset) / 2;
        const barrelGeo = new THREE.CylinderGeometry(
          ENGINE_SPECS.pistonRadius + 0.22,
          ENGINE_SPECS.pistonRadius + 0.22,
          2.35, 28
        );
        const barrelMesh = registerMesh(new THREE.Mesh(barrelGeo), 'block');
        barrelMesh.position.set(0, r + L - 0.35, zCyl);
        jacketMesh.add(barrelMesh);
      }
      bankBoxGroup.add(jacketMesh);

      const coverGroup = new THREE.Group();

      const headShape = new THREE.Shape();
      headShape.moveTo(-0.98, 3.72);
      headShape.lineTo(0.98, 3.72);
      headShape.lineTo(1.12, 4.18);
      headShape.quadraticCurveTo(1.05, 4.45, 0.82, 4.48);
      headShape.lineTo(-0.82, 4.48);
      headShape.quadraticCurveTo(-1.05, 4.45, -1.12, 4.18);
      headShape.closePath();

      const headExtrudeGeo = new THREE.ExtrudeGeometry(headShape, {
        depth: 7.2,
        bevelEnabled: true,
        bevelSegments: 3,
        steps: 1,
        bevelSize: 0.08,
        bevelThickness: 0.08
      });
      headExtrudeGeo.translate(0, 0, -3.6);
      const headBlockMesh = registerMesh(new THREE.Mesh(headExtrudeGeo), 'head');
      coverGroup.add(headBlockMesh);

      const vcShape = new THREE.Shape();
      vcShape.moveTo(-0.85, 4.48);
      vcShape.bezierCurveTo(-0.88, 4.92, -0.25, 4.95, 0, 4.74);
      vcShape.bezierCurveTo(0.25, 4.95, 0.88, 4.92, 0.85, 4.48);
      vcShape.closePath();

      const vcGeo = new THREE.ExtrudeGeometry(vcShape, {
        depth: 6.9,
        bevelEnabled: true,
        bevelSegments: 4,
        steps: 1,
        bevelSize: 0.09,
        bevelThickness: 0.09
      });
      vcGeo.translate(0, 0, -3.45);
      const vcMesh = registerMesh(new THREE.Mesh(vcGeo), 'valveCover');
      coverGroup.add(vcMesh);

      [-0.44, 0.44].forEach((camX, camIdx) => {
        const camShaftGeo = new THREE.CylinderGeometry(0.09, 0.09, 7.6, 20);
        camShaftGeo.rotateX(Math.PI / 2);
        const camShaftMesh = registerMesh(new THREE.Mesh(camShaftGeo), 'camshaft');
        camShaftMesh.position.set(camX, 4.32, 0);
        coverGroup.add(camShaftMesh);

        const sprocketGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.14, 24);
        sprocketGeo.rotateX(Math.PI / 2);
        const sprocketMesh = registerMesh(
          new THREE.Mesh(sprocketGeo),
          camIdx === 0 ? 'pulleyAccent' : 'camshaft'
        );
        sprocketMesh.position.set(camX, 4.32, 3.92);
        coverGroup.add(sprocketMesh);
      });

      const collectorZ = -1.8;
      for (let c = 0; c < 4; c++) {
        const zCyl = zStart + c * ENGINE_SPECS.boreSpacing + (bankSign * ENGINE_SPECS.bankOffset) / 2;
        const outX = -bankSign * 0.95;
        const bendX = -bankSign * 1.65;

        const headerCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(outX, 4.05, zCyl),
          new THREE.Vector3(bendX, 3.95, zCyl),
          new THREE.Vector3(bendX * 0.95, 2.85, zCyl * 0.65 + collectorZ * 0.35),
          new THREE.Vector3(-bankSign * 1.25, 1.95, collectorZ)
        ]);
        const pipeGeo = new THREE.TubeGeometry(headerCurve, 20, 0.14, 14, false);
        const pipeMesh = registerMesh(new THREE.Mesh(pipeGeo), 'exhaust');
        coverGroup.add(pipeMesh);
      }

      const collectorGeo = new THREE.CylinderGeometry(0.24, 0.28, 2.2, 20);
      collectorGeo.rotateX(Math.PI / 2);
      const collectorMesh = registerMesh(new THREE.Mesh(collectorGeo), 'exhaust');
      collectorMesh.position.set(-bankSign * 1.25, 1.85, -2.7);
      coverGroup.add(collectorMesh);

      bankBoxGroup.add(coverGroup);
      bankCovers.push({ bankBoxGroup, jacketMesh, coverGroup, bAngle });
    });

    let crankTheta = 0;
    let lastTime = performance.now();
    let uiUpdateCounter = 0;
    let animationFrameId;

    const updateMaterialModes = () => {
      const { renderMode, blockOpacity, showBlock, showHeads, showValves, theme: activeTheme } = simParams.current;

      realisticMats.block.opacity = blockOpacity;
      realisticMats.liner.opacity = blockOpacity * 0.85;
      rawBlockMat.opacity = blockOpacity;
      wireframeBlockMat.opacity = Math.max(0.15, blockOpacity);

      trackedMeshes.forEach(({ mesh, type, baseMat, wireOverlay }) => {
        const isBlockOrLiner = type === 'block' || type === 'liner';

        if (renderMode === 'realistic') {
          mesh.material = baseMat;
          wireOverlay.visible = false;
        } else if (renderMode === 'raw') {
          mesh.material = isBlockOrLiner ? rawBlockMat : rawSolidMat;
          wireOverlay.visible = !isBlockOrLiner;
          wireOverlay.material.color.setHex(activeTheme === 'dark' ? 0x1f2937 : 0x94a3b8);
          wireOverlay.material.opacity = 0.2;
        } else if (renderMode === 'wireframe') {
          mesh.material = isBlockOrLiner ? wireframeBlockMat : wireframePrimaryMat;
          wireOverlay.visible = false;
        } else if (renderMode === 'shaded_wire') {
          mesh.material = baseMat;
          wireOverlay.visible = true;
          wireOverlay.material.color.setHex(0xfb6514);
          wireOverlay.material.opacity = isBlockOrLiner ? 0.22 : 0.45;
        }
      });

      blockEnvelopeGroup.visible = showBlock;
      intakeGroup.visible = showHeads;
      intakeGroup.position.y = simParams.current.exploded * 1.85;

      bankCovers.forEach(({ jacketMesh, coverGroup }) => {
        jacketMesh.visible = showBlock;
        coverGroup.visible = showHeads;

        const expDist = simParams.current.exploded * 1.65;
        jacketMesh.position.y = expDist * 0.35;
        coverGroup.position.y = expDist * 1.15;
      });

      cylindersData.forEach((cyl) => {
        cyl.linerMesh.visible = showBlock;
        cyl.intakeValve.visible = showValves;
        cyl.exhaustValve.visible = showValves;
        cyl.headGroup.position.set(
          -Math.sin(cyl.bankAngle) * simParams.current.exploded * 0.9,
          Math.cos(cyl.bankAngle) * simParams.current.exploded * 0.9,
          0
        );
      });
    };

    const animate = (now) => {
      animationFrameId = requestAnimationFrame(animate);
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      const { rpm: currentRpm, isPlaying: playing, showCombustion: combustionOn, autoRotateCam: autoCam } = simParams.current;

      if (playing) {
        const omega = (currentRpm * 2 * Math.PI) / 60;
        const visualSpeedFactor = currentRpm > 1200 ? 0.18 : 0.25;
        crankTheta = (crankTheta + omega * dt * visualSpeedFactor) % (4 * Math.PI);
      }

      crankshaftGroup.rotation.z = -crankTheta;

      let currentFiringCyl = 1;
      let highestCombustionIntensity = -1;

      cylindersData.forEach((cyl) => {
        const pinAngle = crankTheta + ENGINE_SPECS.journalAngles[cyl.journalIndex];
        const Px = r * Math.sin(pinAngle);
        const Py = r * Math.cos(pinAngle);

        const alpha = pinAngle + cyl.bankAngle;
        const sinAlpha = Math.sin(alpha);
        const cosAlpha = Math.cos(alpha);

        const s = r * cosAlpha + Math.sqrt(Math.max(0.01, L * L - r * r * sinAlpha * sinAlpha));
        const Wx = s * cyl.axisDir.x;
        const Wy = s * cyl.axisDir.y;

        cyl.pistonGroup.position.set(Wx, Wy, cyl.zPos);
        cyl.rodGroup.position.set(Px, Py, cyl.zPos);
        const dx = Wx - Px;
        const dy = Wy - Py;
        cyl.rodGroup.rotation.z = Math.atan2(-dx, dy);

        const phase = (crankTheta - cyl.firingAngle + 4 * Math.PI) % (4 * Math.PI);

        let flameOpacity = 0;
        if (phase < 0.65 * Math.PI) {
          const norm = 1 - phase / (0.65 * Math.PI);
          flameOpacity = Math.pow(norm, 1.6) * 0.92;
          cyl.flameMat.color.setHSL(0.05 + norm * 0.08, 1.0, 0.5 + norm * 0.3);
          if (flameOpacity > highestCombustionIntensity) {
            highestCombustionIntensity = flameOpacity;
            currentFiringCyl = cyl.cylNumber;
          }
        }
        cyl.flameMat.opacity = combustionOn ? flameOpacity : 0;

        const maxValveLift = 0.22;
        if (phase >= Math.PI && phase < 2 * Math.PI) {
          const lift = Math.sin(phase - Math.PI) * maxValveLift;
          cyl.exhaustValve.position.y = r + L + ENGINE_SPECS.pistonHeight / 2 + 0.45 - lift;
        } else {
          cyl.exhaustValve.position.y = r + L + ENGINE_SPECS.pistonHeight / 2 + 0.45;
        }

        if (phase >= 2 * Math.PI && phase < 3 * Math.PI) {
          const lift = Math.sin(phase - 2 * Math.PI) * maxValveLift;
          cyl.intakeValve.position.y = r + L + ENGINE_SPECS.pistonHeight / 2 + 0.45 - lift;
        } else {
          cyl.intakeValve.position.y = r + L + ENGINE_SPECS.pistonHeight / 2 + 0.45;
        }
      });

      updateMaterialModes();

      if (autoCam && !camControl.current.isDragging) {
        camControl.current.theta += dt * 0.35;
      }
      const { theta, phi, radius, target } = camControl.current;
      camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
      camera.position.y = target.y + radius * Math.cos(phi);
      camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);
      camera.lookAt(target);

      renderer.render(scene, camera);

      uiUpdateCounter++;
      if (uiUpdateCounter % 4 === 0) {
        setActiveCylinderInfo(currentFiringCyl);
        setCrankDeg(Math.round((crankTheta * 180) / Math.PI));
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
    camControl.current.radius = Math.max(5.5, Math.min(26, camControl.current.radius + e.deltaY * 0.008));
  };

  const resetCamera = () => {
    setAutoRotateCam(false);
    camControl.current.theta = 0.65;
    camControl.current.phi = 1.15;
    camControl.current.radius = 13.5;
  };

  const hp = Math.round((rpm / 7000) * 620 * (1 - 0.15 * Math.pow((rpm - 5800) / 5800, 2)));
  const torque = Math.round(540 + 140 * Math.sin((rpm / 7000) * Math.PI));

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

      <div className="pointer-events-none absolute top-4 left-4 z-10 max-h-[calc(100%-11rem)] w-[min(28rem,calc(100%-2rem))] overflow-y-auto max-[720px]:max-h-[50%] max-[720px]:w-[calc(100%-2rem)]">
        <section aria-label="V8" className={`pointer-events-auto flex flex-col gap-5 p-5 ${sheet.panel}`}>
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="m-0 text-[1.75rem] font-semibold leading-none tracking-[-0.03em]">V8</h1>
            <p
              className="m-0 text-[1.75rem] font-semibold leading-none tracking-[-0.03em] tabular-nums"
              aria-label={`Crank angle ${crankDeg} degrees`}
            >
              {crankDeg}°
            </p>
          </div>

          <p className="m-0 min-h-36 text-base leading-relaxed">
            Cross-plane crank, 90° bank. One cycle is 720°. The firing order is 1-8-4-3-6-5-7-2.
          </p>

          <div className="grid grid-cols-8 gap-1" role="group" aria-label="Firing order">
            {ENGINE_SPECS.firingOrder.map((cylNum) => {
              const isFiring = activeCylinderInfo === cylNum && isPlaying;
              return (
                <div
                  key={cylNum}
                  className={`py-2 text-center text-base font-semibold tabular-nums ${
                    isFiring ? 'bg-[#fb6514] text-[#101828]' : 'bg-[#eef1f4] text-[#101828]'
                  }`}
                >
                  {cylNum}
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Engine speed', value: isPlaying ? rpm : 0, unit: 'rpm' },
              { label: 'Power', value: isPlaying ? hp : 0, unit: 'hp' },
              { label: 'Torque', value: isPlaying ? torque : 0, unit: 'Nm' },
              { label: 'Displacement', value: '5.0', unit: 'L' }
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
            {[
              { label: 'Block', state: showBlock, setter: setShowBlock },
              { label: 'DOHC heads', state: showHeads, setter: setShowHeads },
              { label: 'Valvetrain', state: showValves, setter: setShowValves },
              { label: 'Combustion', state: showCombustion, setter: setShowCombustion }
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
          className={`pointer-events-auto grid flex-1 grid-cols-1 gap-6 p-5 sm:grid-cols-2 xl:grid-cols-4 ${sheet.panel}`}
          style={{ colorScheme: 'light' }}
        >
          <div className="flex flex-col gap-2">
            <p className="m-0 text-base">
              <span className="font-semibold tabular-nums">{rpm}</span> rpm
            </p>
            <SquareRange
              min={60}
              max={7000}
              step={20}
              value={rpm}
              label="RPM"
              onChange={(e) => setRpm(Number(e.target.value))}
            />
            <div className="flex flex-wrap gap-2">
              {[
                { value: 120, label: '120 slow-mo' },
                { value: 800, label: '800 idle' },
                { value: 3500, label: '3500 cruise' },
                { value: 6800, label: '6800 redline' }
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
              max={719}
              step={1}
              value={crankDeg}
              label="Crank angle"
              onChange={(e) => setCrankDeg(Number(e.target.value))}
            />
            <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-base">
              <span>0° cyl 1</span>
              <span>360° cyl 6</span>
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
              setRpm(800);
              setExploded(0);
              setBlockOpacity(0.28);
              setRenderMode('realistic');
              setShowBlock(true);
              setShowHeads(true);
              setShowValves(true);
              setShowCombustion(true);
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
