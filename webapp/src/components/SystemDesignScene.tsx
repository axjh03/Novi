'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, Edges, Html, Line, OrbitControls, useCursor } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { Diagram } from './Fragments';
import styles from './Fragments.module.css';

gsap.registerPlugin(ScrollTrigger);

/* ----------------------------------------------------------------------------------------------
   The system-design answer as a small architecture model: the same boxes and arrows the app draws,
   standing on a board the visitor can turn. Hover a box to light its connections, click or pick a
   chip to focus it and read what it does, scroll to tilt the board. Loaded lazily (see
   SystemDesignInteractive) and replaced by the flat SVG when WebGL or motion is unavailable.
   Palette and type come from the product fragments so it reads as the app's own diagram.
   ---------------------------------------------------------------------------------------------- */

const ROSE = '#e4a0b2', WINE = '#8f2946', INK = '#09090b', LINE = '#a89da3', SERVICE = '#2a1a21', STORE = '#171519', STORE_EDGE = '#4a3e45';
const SPACING = { x: 2.3, z: 2.0 };
const BOX: [number, number, number] = [1.7, 0.5, 1.0];
const DRUM = { radius: 0.56, height: 0.56 };

type Node = Diagram['nodes'][number];
type Placed = { node: Node; position: THREE.Vector3 };
type Wire = { from: string; to: string; label?: string; curve: THREE.QuadraticBezierCurve3; points: THREE.Vector3[]; end: THREE.Vector3; tangent: THREE.Vector3; mid: THREE.Vector3 };

/* The grid of the flat diagram, centred on the board. */
function place(diagram: Diagram): Placed[] {
  const cols = Math.max(...diagram.nodes.map(node => node.x)) + 1, rows = Math.max(...diagram.nodes.map(node => node.y)) + 1;
  return diagram.nodes.map(node => ({ node, position: new THREE.Vector3((node.x - (cols - 1) / 2) * SPACING.x, 0, (node.y - (rows - 1) / 2) * SPACING.z) }));
}

/* Where an arrow leaves a shape: the face of the box or the rim of the drum, along the direction. */
function port(from: Placed, direction: THREE.Vector3): THREE.Vector3 {
  const reach = from.node.tone === 'store' ? DRUM.radius : Math.abs(direction.x) >= Math.abs(direction.z) ? BOX[0] / 2 : BOX[2] / 2;
  return from.position.clone().addScaledVector(direction, reach + 0.04);
}

/* Arrows are straight unless they would pass through another box; those arc over it. */
function wires(diagram: Diagram, placed: Placed[]): Wire[] {
  const byId = new Map(placed.map(item => [item.node.id, item]));
  return diagram.edges.map(edge => {
    const a = byId.get(edge.from)!, b = byId.get(edge.to)!;
    const direction = b.position.clone().sub(a.position).normalize();
    const start = port(a, direction), end = port(b, direction.clone().negate());
    const flat = new THREE.Line3(start, end), probe = new THREE.Vector3();
    const blocked = placed.some(item => item !== a && item !== b && flat.closestPointToPoint(item.position, true, probe).distanceTo(item.position) < 0.9);
    const control = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, blocked ? 1.25 : 0.12, 0));
    const curve = new THREE.QuadraticBezierCurve3(start, control, end);
    return { from: edge.from, to: edge.to, label: edge.label, curve, points: curve.getPoints(blocked ? 28 : 10), end, tangent: curve.getTangent(1).normalize(), mid: curve.getPoint(0.5) };
  });
}

const up = new THREE.Vector3(0, 1, 0);
const easeOutBack = (t: number) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

function NodeMesh({ item, index, hovered, selected, dimmed, motion, onHover, onSelect }: { item: Placed; index: number; hovered: boolean; selected: boolean; dimmed: boolean; motion: boolean; onHover: (id: string | null) => void; onSelect: (id: string) => void }) {
  const group = useRef<THREE.Group>(null);
  const material = useRef<THREE.MeshStandardMaterial>(null);
  const born = useRef<number | null>(null);
  const store = item.node.tone === 'store';
  useCursor(hovered);
  useFrame((state, delta) => {
    if (!group.current || !material.current) return;
    if (born.current === null) born.current = state.clock.elapsedTime;
    // Rise in once, staggered along the grid; then breathe toward the hover and selection targets.
    const entry = motion ? easeOutBack(THREE.MathUtils.clamp((state.clock.elapsedTime - born.current - index * 0.07) / 0.55, 0, 1)) : 1;
    const target = entry * (hovered || selected ? 1.06 : 1);
    group.current.scale.lerp(new THREE.Vector3(target, target, target), Math.min(1, delta * 10));
    material.current.emissiveIntensity = THREE.MathUtils.lerp(material.current.emissiveIntensity, hovered || selected ? 0.55 : 0.12, Math.min(1, delta * 8));
    material.current.opacity = THREE.MathUtils.lerp(material.current.opacity, dimmed ? 0.45 : 1, Math.min(1, delta * 8));
  });
  const stop = (event: ThreeEvent<PointerEvent | MouseEvent>) => event.stopPropagation();
  return (
    <group ref={group} position={item.position} scale={motion ? 0.001 : 1}
      onPointerOver={event => { stop(event); onHover(item.node.id); }} onPointerOut={event => { stop(event); onHover(null); }}
      onClick={event => { stop(event); onSelect(item.node.id); }}>
      <mesh castShadow>
        {store ? <cylinderGeometry args={[DRUM.radius, DRUM.radius, DRUM.height, 28]} /> : <boxGeometry args={BOX} />}
        <meshStandardMaterial ref={material} color={store ? STORE : SERVICE} emissive={store ? STORE_EDGE : WINE} emissiveIntensity={0.12} roughness={0.6} metalness={0.05} transparent />
        <Edges color={store ? STORE_EDGE : ROSE} threshold={store ? 20 : 15} transparent opacity={store ? 0.9 : 0.7} />
      </mesh>
      <Html position={[0, (store ? DRUM.height : BOX[1]) / 2 + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} transform center distanceFactor={3.2} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <span className={`${styles.lbl} ${store ? styles.lblStore : ''}`}>{item.node.label}</span>
      </Html>
    </group>
  );
}

function Wires({ list, active, motion }: { list: Wire[]; active: (wire: Wire) => boolean; motion: boolean }) {
  const particles = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Object3D(), []);
  const perWire = 2;
  useFrame(state => {
    // Packets travel every arrow; the ones on a lit arrow are the only motion that matters, so the rest run slower.
    if (!particles.current) return;
    list.forEach((wire, index) => {
      const lit = active(wire);
      for (let k = 0; k < perWire; k++) {
        const t = (state.clock.elapsedTime * (lit ? 0.32 : 0.16) + index * 0.37 + k / perWire) % 1;
        matrix.position.copy(wire.curve.getPoint(t));
        const size = lit ? 1.35 : 0.85;
        matrix.scale.set(size, size, size);
        matrix.updateMatrix();
        particles.current!.setMatrixAt(index * perWire + k, matrix.matrix);
      }
    });
    particles.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      {list.map(wire => {
        const lit = active(wire);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(up, wire.tangent);
        const vertical = Math.abs(wire.tangent.x) < Math.abs(wire.tangent.z);
        return (
          <group key={`${wire.from}-${wire.to}`}>
            <Line points={wire.points} color={lit ? ROSE : LINE} lineWidth={lit ? 2 : 1.25} transparent opacity={lit ? 1 : 0.55} />
            <mesh position={wire.end} quaternion={quaternion}>
              <coneGeometry args={[0.07, 0.2, 10]} />
              <meshBasicMaterial color={lit ? ROSE : LINE} transparent opacity={lit ? 1 : 0.7} />
            </mesh>
            {wire.label && (
              <Html position={[wire.mid.x + (vertical ? 0.16 : 0), wire.mid.y + 0.02, wire.mid.z + (vertical ? 0 : -0.22)]} rotation={[-Math.PI / 2, 0, 0]} transform center={!vertical} distanceFactor={3.2} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
                <span className={`${styles.edgeLbl} ${lit ? styles.edgeLblLit : ''}`}>{wire.label}</span>
              </Html>
            )}
          </group>
        );
      })}
      {motion && (
        <instancedMesh ref={particles} args={[undefined, undefined, list.length * perWire]} frustumCulled={false}>
          <sphereGeometry args={[0.045, 10, 10]} />
          <meshBasicMaterial color="#f3c1cf" />
        </instancedMesh>
      )}
    </group>
  );
}

/* Camera, controls, the scroll tilt and the focus move live here, inside the canvas. */
function Rig({ focus, motion, interacted, onInteract, scrollRoot }: { focus: THREE.Vector3 | null; motion: boolean; interacted: boolean; onInteract: () => void; scrollRoot: React.RefObject<HTMLDivElement | null> }) {
  const controls = useRef<any>(null);
  const invalidate = useThree(state => state.invalidate);
  const coarse = useMemo(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches, []);
  useEffect(() => {
    if (!controls.current) return;
    const target = controls.current.target as THREE.Vector3;
    const tween = gsap.to(target, { x: focus?.x ?? 0, y: -0.55, z: focus?.z ?? 0.1, duration: motion ? 0.8 : 0, ease: 'power3.out', onUpdate: () => { controls.current?.update(); invalidate(); } });
    return () => { tween.kill(); };
  }, [focus, motion, invalidate]);
  return (
    <OrbitControls ref={controls} makeDefault enableZoom={false} enablePan={false} enableRotate={!coarse} enableDamping dampingFactor={0.08} rotateSpeed={0.55}
      minPolarAngle={0.5} maxPolarAngle={1.2} minAzimuthAngle={-0.95} maxAzimuthAngle={0.95}
      autoRotate={motion && !interacted} autoRotateSpeed={0.45} target={[0, -0.55, 0.1]} onStart={onInteract} />
  );
}

function Board({ children, motion, scrollRoot }: { children: React.ReactNode; motion: boolean; scrollRoot: React.RefObject<HTMLDivElement | null> }) {
  const group = useRef<THREE.Group>(null);
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => {
    // Scrolling past the section tilts the board a little, scrubbed to the scrollbar; nothing under reduced motion.
    if (!motion || !group.current || !scrollRoot.current) return;
    const context = gsap.context(() => {
      gsap.fromTo(group.current!.rotation, { y: -0.28 }, { y: 0.28, ease: 'none', scrollTrigger: { trigger: scrollRoot.current!, start: 'top bottom', end: 'bottom top', scrub: 0.8, onUpdate: () => invalidate() } });
    });
    return () => context.revert();
  }, [motion, scrollRoot, invalidate]);
  return <group ref={group}>{children}</group>;
}

export default function SystemDesignScene({ diagram, title, motion, active, scrollRoot }: { diagram: Diagram; title: string; motion: boolean; active: boolean; scrollRoot: React.RefObject<HTMLDivElement | null> }) {
  const placed = useMemo(() => place(diagram), [diagram]);
  const list = useMemo(() => wires(diagram, placed), [diagram, placed]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [interacted, setInteracted] = useState(false);
  const spotlight = hovered ?? selected;
  const lit = (wire: Wire) => spotlight !== null && (wire.from === spotlight || wire.to === spotlight);
  const neighbours = useMemo(() => new Set(list.filter(lit).flatMap(wire => [wire.from, wire.to])), [list, spotlight]);
  const focus = selected ? placed.find(item => item.node.id === selected)?.position ?? null : null;
  const note = placed.find(item => item.node.id === spotlight)?.node.note;
  const cols = Math.max(...diagram.nodes.map(node => node.x)) + 1;
  return (
    <>
      <div className={styles.sceneCanvas} aria-hidden="true">
        <Canvas dpr={[1, 1.5]} frameloop={active && motion ? 'always' : 'demand'} camera={{ position: [0, 5.4, 7.6], fov: 30, near: 0.5, far: 40 }} gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }} shadows={false}
          style={{ touchAction: 'pan-y' }} onPointerMissed={() => setSelected(null)}>
          <ambientLight intensity={0.85} />
          <directionalLight position={[4, 7, 5]} intensity={1.1} />
          <pointLight position={[-4, 3, -2]} intensity={10} color={ROSE} distance={14} />
          <Board motion={motion} scrollRoot={scrollRoot}>
            <gridHelper args={[cols * SPACING.x + 2.4, (cols + 1) * 2, '#1f1b21', '#17141a']} position={[0, -0.27, 0]} />
            <Wires list={list} active={lit} motion={motion} />
            {placed.map((item, index) => <NodeMesh key={item.node.id} item={item} index={index} motion={motion} hovered={hovered === item.node.id} selected={selected === item.node.id} dimmed={spotlight !== null && spotlight !== item.node.id && !neighbours.has(item.node.id)} onHover={setHovered} onSelect={id => setSelected(current => current === id ? null : id)} />)}
            <ContactShadows position={[0, -0.26, 0]} opacity={0.55} scale={14} blur={2.2} far={1.6} resolution={256} frames={motion ? 120 : 1} color="#000" />
          </Board>
          <Rig focus={focus} motion={motion} interacted={interacted} onInteract={() => setInteracted(true)} scrollRoot={scrollRoot} />
        </Canvas>
        <span className={styles.sceneHint}>{motion ? 'Drag to turn · hover a box' : 'Pick a box below'}</span>
      </div>
      <div className={styles.sceneBar} role="group" aria-label={`Parts of ${title}`}>
        {placed.map(item => <button key={item.node.id} type="button" className={styles.chip} aria-pressed={selected === item.node.id} onClick={() => setSelected(current => current === item.node.id ? null : item.node.id)} onMouseEnter={() => setHovered(item.node.id)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(item.node.id)} onBlur={() => setHovered(null)}>{item.node.label}</button>)}
      </div>
      <p className={styles.sceneNote} aria-live="polite" style={{ '--tone': note ? 1 : 0 } as CSSProperties}>{note ?? 'Each box is one part of the design. Pick one to see what it does and which arrows it owns.'}</p>
    </>
  );
}
