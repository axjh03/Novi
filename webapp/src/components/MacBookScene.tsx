'use client';

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Environment, Html, Lightformer, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import styles from './Laptop3D.module.css';

/* ----------------------------------------------------------------------------------------------
   A real MacBook: the Draco-compressed glTF from the pmndrs "floating laptop" example (aluminium
   body, black keys, glass screen), lit by a small studio of light panels so the metal picks up real
   reflections, standing on a contact shadow. The screen is live HTML laid onto the glass with a
   3D transform and blended through the WebGL canvas, so whatever the caller passes as children
   (the app's own screenshots, a desk, a slideshow) is what the laptop shows. The lid opens on
   mount, the body floats a little and leans toward the pointer; with reduced motion it opens
   straight away and stands still.
   ---------------------------------------------------------------------------------------------- */

const MODEL = '/models/macbook.glb';
const DRACO = '/draco/';
/* The screen's live area in model units and the CSS box drawn onto it. 1100px across 8.35 units. */
const SCREEN = { width: 8.35, height: 5.4, px: 1100 };
const CLOSED = 1.575, OPEN = -0.425;

type Nodes = Record<string, THREE.Mesh>;
type Materials = Record<string, THREE.MeshStandardMaterial>;

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

function Model({ children, motion, rest, pointerRoot }: { children: ReactNode; motion: boolean; rest: [number, number]; pointerRoot: RefObject<HTMLElement | null> }) {
  const { nodes, materials } = useGLTF(MODEL, DRACO) as unknown as { nodes: Nodes; materials: Materials };
  const body = useRef<THREE.Group>(null!);
  const lid = useRef<THREE.Group>(null!);
  const start = useRef<number | null>(null);
  const pointer = useRef({ x: 0, y: 0, inside: false });

  // Space grey, a slightly tighter finish on the metal, and a black panel under the live screen.
  useLayoutEffect(() => {
    materials.aluminium.color.set('#9a979e'); materials.aluminium.roughness = 0.32; materials.aluminium.metalness = 1; materials.aluminium.envMapIntensity = 1.2;
    materials['screen.001'].map = null; materials['screen.001'].color.set('#050507'); materials['screen.001'].roughness = 0.18; materials['screen.001'].needsUpdate = true;
    materials.keys.color.set('#121114'); materials.trackpad.color.set('#4a484d'); materials.touchbar.color.set('#0b0b0d');
  }, [materials]);

  // The pointer over the stage, not only over the canvas, so the tilt follows the hand anywhere on it.
  useEffect(() => {
    const el = pointerRoot.current;
    if (!el || !motion || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const move = (event: PointerEvent) => { const box = el.getBoundingClientRect(); pointer.current = { x: (event.clientX - box.left) / box.width * 2 - 1, y: -((event.clientY - box.top) / box.height * 2 - 1), inside: true }; };
    const leave = () => { pointer.current = { x: 0, y: 0, inside: false }; };
    el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave);
    return () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); };
  }, [pointerRoot, motion]);

  useFrame(state => {
    // Real seconds since the model appeared, so the lid opens on the clock, not on the frame count.
    if (start.current === null) start.current = state.clock.elapsedTime;
    const t = state.clock.elapsedTime - start.current;
    // The lid swings open over 1.4s after a short beat; still pages start open.
    const open = motion ? easeOutExpo(Math.max(0, t - 0.25) / 1.4) : 1;
    lid.current.rotation.x = CLOSED + (OPEN - CLOSED) * open;
    const { x, y } = pointer.current;
    const targetX = rest[0] + (motion ? -y * 0.06 + Math.sin(t * 0.5) * 0.015 : 0);
    const targetY = rest[1] + (motion ? x * 0.22 + Math.sin(t * 0.37) * 0.03 : 0);
    body.current.rotation.x = THREE.MathUtils.lerp(body.current.rotation.x, targetX, 0.06);
    body.current.rotation.y = THREE.MathUtils.lerp(body.current.rotation.y, targetY, 0.06);
    body.current.position.y = motion ? Math.sin(t * 0.8) * 0.12 : 0;
  });

  return (
    <group ref={body} rotation={[rest[0], rest[1], 0]}>
      <group rotation={[0, Math.PI, 0]} position={[0, -2.3, 0.6]}>
        <group ref={lid} rotation-x={CLOSED} position={[0, -0.04, 0.41]}>
          <group position={[0, 2.96, -0.13]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh material={materials.aluminium} geometry={nodes.Cube008.geometry} />
            <mesh material={materials['matte.001']} geometry={nodes.Cube008_1.geometry} />
            <mesh material={materials['screen.001']} geometry={nodes.Cube008_2.geometry} />
            <Html transform occlude="blending" rotation-x={-Math.PI / 2} position={[0, 0.06, -0.09]} distanceFactor={400 / (SCREEN.px / SCREEN.width)} zIndexRange={[2, 0]} wrapperClass={styles.htmlWrap}>
              <div className={styles.screen} style={{ width: SCREEN.px, height: Math.round(SCREEN.px * SCREEN.height / SCREEN.width) }}>{children}</div>
            </Html>
          </group>
        </group>
        <mesh material={materials.keys} geometry={nodes.keyboard.geometry} position={[1.79, 0, 3.45]} />
        <group position={[0, -0.1, 3.39]}>
          <mesh material={materials.aluminium} geometry={nodes.Cube002.geometry} />
          <mesh material={materials.trackpad} geometry={nodes.Cube002_1.geometry} />
        </group>
        <mesh material={materials.touchbar} geometry={nodes.touchbar.geometry} position={[0, -0.03, 1.2]} />
      </group>
    </group>
  );
}

/* A small studio: one broad soft panel above, a cool strip from the left, a warm strip from the right,
   and a faint floor bounce. Rendered once into the environment map that the metal reflects. */
function Studio() {
  return (
    <Environment resolution={256} frames={1}>
      <color attach="background" args={['#2b2328']} />
      <Lightformer intensity={3} rotation-x={Math.PI / 2} position={[0, 6, 0]} scale={[12, 8, 1]} />
      <Lightformer intensity={1.6} rotation-y={Math.PI / 2} position={[-8, 1, 0]} scale={[8, 3, 1]} color="#dfe7ff" />
      <Lightformer intensity={1.2} rotation-y={-Math.PI / 2} position={[8, 1, -2]} scale={[8, 3, 1]} color="#ffe3ea" />
      <Lightformer intensity={0.5} rotation-x={-Math.PI / 2} position={[0, -6, 0]} scale={[10, 10, 1]} color="#8f2946" />
    </Environment>
  );
}

export default function MacBookScene({ children, motion, rest = [0.1, 0.17], pointerRoot }: { children: ReactNode; motion: boolean; rest?: [number, number]; pointerRoot: RefObject<HTMLElement | null> }) {
  const dpr = useMemo<[number, number]>(() => [1, 1.75], []);
  return (
    <Canvas dpr={dpr} frameloop={motion ? 'always' : 'demand'} camera={{ position: [0, 2.6, -22], fov: 28, near: 1, far: 60 }} gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }} eventSource={pointerRoot as RefObject<HTMLElement>} eventPrefix="client" style={{ background: 'transparent' }}>
      <ambientLight intensity={0.25} />
      <spotLight position={[6, 12, -10]} angle={0.5} penumbra={0.9} intensity={160} color="#fff4f6" />
      <Suspense fallback={null}>
        <Model motion={motion} rest={rest} pointerRoot={pointerRoot}>{children}</Model>
        <Studio />
      </Suspense>
      <ContactShadows position={[0, -2.5, 0]} opacity={0.5} scale={22} blur={2.4} far={3} resolution={512} frames={1} color="#1a0810" />
    </Canvas>
  );
}

useGLTF.preload(MODEL, DRACO);
