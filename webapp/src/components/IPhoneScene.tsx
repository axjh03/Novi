'use client';

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, useGLTF, useTexture } from '@react-three/drei';
import * as THREE from 'three';

/* ----------------------------------------------------------------------------------------------
   A real iPhone 15 Pro Max ("Apple iPhone 15 Pro Max Black" by polyman, CC BY 4.0, via Sketchfab):
   titanium band, glass back, camera block, all from the model's own textures. The companion's
   screenshot, with an iOS status bar and the Dynamic Island composed into it, is the display's
   own texture, lit from inside so it glows under the glass. The phone rises on mount, hovers, and
   turns toward the pointer; with reduced motion it stands still.
   ---------------------------------------------------------------------------------------------- */

const MODEL = '/models/iphone-15-pro.glb';
const DRACO = '/draco/';
const SCALE = 60; // model units are centimetres at 0.01; at 60 the phone stands about 9.6 units tall
const SCREEN_MESH = 'xXDHkMplTIDAXLN';

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

function Model({ src, motion, pointerRoot }: { src: string; motion: boolean; pointerRoot: RefObject<HTMLElement | null> }) {
  const { scene } = useGLTF(MODEL, DRACO);
  const texture = useTexture(src);
  const body = useRef<THREE.Group>(null!);
  const start = useRef<number | null>(null);
  const pointer = useRef({ x: 0, y: 0 });

  // The display mesh shows the screenshot as its own light; everything else keeps the model's materials.
  useLayoutEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace; texture.flipY = false; texture.anisotropy = 8; texture.needsUpdate = true;
    scene.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.name === SCREEN_MESH) mesh.material = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#fff', emissiveMap: texture, emissiveIntensity: 1, roughness: 1, metalness: 0 });
      else { const material = mesh.material as THREE.MeshStandardMaterial; if (material && 'envMapIntensity' in material) material.envMapIntensity = 1.1; }
    });
  }, [scene, texture]);

  useEffect(() => {
    const el = pointerRoot.current;
    if (!el || !motion || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const move = (event: PointerEvent) => { const box = el.getBoundingClientRect(); pointer.current = { x: (event.clientX - box.left) / box.width * 2 - 1, y: -((event.clientY - box.top) / box.height * 2 - 1) }; };
    const leave = () => { pointer.current = { x: 0, y: 0 }; };
    el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave);
    return () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); };
  }, [pointerRoot, motion]);

  useFrame(state => {
    if (start.current === null) start.current = state.clock.elapsedTime;
    const t = state.clock.elapsedTime - start.current;
    const rise = motion ? easeOutExpo(t / 1.3) : 1;
    const { x, y } = pointer.current;
    const targetY = -0.42 + (motion ? x * 0.35 + Math.sin(t * 0.4) * 0.06 : 0) + (1 - rise) * -0.6;
    const targetX = motion ? -y * 0.12 + Math.sin(t * 0.55) * 0.02 : 0;
    body.current.rotation.y = THREE.MathUtils.lerp(body.current.rotation.y, targetY, 0.07);
    body.current.rotation.x = THREE.MathUtils.lerp(body.current.rotation.x, targetX, 0.07);
    body.current.position.y = (1 - rise) * -1.6 + (motion ? Math.sin(t * 0.9) * 0.1 : 0);
  });

  return (
    <group ref={body} rotation={[0, -0.42, 0]}>
      {/* the model's screen faces -z; turned to face the camera on +z */}
      <group rotation={[0, Math.PI, 0]} scale={SCALE}>
        <primitive object={scene} />
      </group>
    </group>
  );
}

function Studio() {
  return (
    <Environment resolution={256} frames={1}>
      <color attach="background" args={['#2b2328']} />
      <Lightformer intensity={2.5} rotation-x={Math.PI / 2} position={[0, 6, 0]} scale={[10, 10, 1]} />
      <Lightformer intensity={2} rotation-y={Math.PI / 2} position={[-6, 0, 0]} scale={[2, 10, 1]} color="#e6ecff" />
      <Lightformer intensity={1.4} rotation-y={-Math.PI / 2} position={[6, 0, 0]} scale={[2, 10, 1]} color="#ffe3ea" />
      <Lightformer intensity={0.6} rotation-x={-Math.PI / 2} position={[0, -6, 0]} scale={[10, 10, 1]} color="#8f2946" />
    </Environment>
  );
}

export default function IPhoneScene({ src, motion, pointerRoot }: { src: string; motion: boolean; pointerRoot: RefObject<HTMLElement | null> }) {
  const dpr = useMemo<[number, number]>(() => [1, 1.75], []);
  return (
    <Canvas dpr={dpr} frameloop={motion ? 'always' : 'demand'} camera={{ position: [0, 0.4, 21], fov: 30, near: 1, far: 60 }} gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }} eventSource={pointerRoot as RefObject<HTMLElement>} eventPrefix="client" style={{ background: 'transparent' }}>
      <ambientLight intensity={0.3} />
      <spotLight position={[-6, 10, 10]} angle={0.5} penumbra={0.9} intensity={140} color="#fff4f6" />
      <Suspense fallback={null}>
        <Model src={src} motion={motion} pointerRoot={pointerRoot} />
        <Studio />
      </Suspense>
      <ContactShadows position={[0, -5.2, 0]} opacity={0.45} scale={16} blur={2.2} far={2.5} resolution={512} frames={1} color="#1a0810" />
    </Canvas>
  );
}

useGLTF.preload(MODEL, DRACO);
