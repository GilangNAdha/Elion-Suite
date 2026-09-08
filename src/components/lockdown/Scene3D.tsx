import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useThemeStore } from '../../stores/themeStore'
import { deriveTheme, colorRgb } from '../../tokens/theme'

/**
 * 3D wallpaper engine (R3F). Theme-tinted particle field, animated gradient
 * mesh, or an orbiting shape. All three read primary/accent from the active
 * theme (§8.3). A static fallback is handled by the parent (reduced motion).
 */
export function Scene3D({ kind }: { kind?: string }) {
  const theme = useThemeStore((s) => s.theme)
  const resolved = deriveTheme(theme)
  const primary = hexFromCss(resolved.vars['--primary'])
  const accent = hexFromCss(resolved.vars['--accent'])
  const c3 = hexFromCss(resolved.chart[2])

  return (
    <div className="absolute inset-0" style={{ background: 'var(--bg)' }} aria-hidden>
      <Canvas
        camera={{ position: [0, 0, 10], fov: 55 }}
        dpr={[1, 1.5]}
        gl={{ antialias: false, powerPreference: 'low-power' }}
      >
        <ambientLight intensity={0.6} />
        <pointLight position={[6, 4, 8]} intensity={40} color={accent} />
        <pointLight position={[-6, -3, 4]} intensity={30} color={primary} />
        {kind === 'particles' && <Particles count={900} color={primary} color2={accent} />}
        {kind === 'gradient' && <GradientMesh color={primary} color2={accent} />}
        {kind === 'orbit' && (
          <>
            <Particles count={350} color={c3} color2={accent} />
            <OrbitShape color={accent} wire={primary} />
          </>
        )}
        <CameraDrift />
      </Canvas>
    </div>
  )
}

function CameraDrift() {
  useFrame(({ camera }, t) => {
    camera.position.x = Math.sin(t * 0.05) * 1.2
    camera.position.y = Math.cos(t * 0.04) * 0.8
    camera.lookAt(0, 0, 0)
  })
  return null
}

function Particles({ count, color, color2 }: { count: number; color: string; color2: string }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)
    const a = new THREE.Color(color)
    const b = new THREE.Color(color2)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 26
      pos[i * 3 + 1] = (Math.random() - 0.5) * 16
      pos[i * 3 + 2] = (Math.random() - 0.5) * 18
      const c = a.clone().lerp(b, Math.random())
      col[i * 3] = c.r
      col[i * 3 + 1] = c.g
      col[i * 3 + 2] = c.b
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return g
  }, [count, color, color2])
  const ref = useRef<THREE.Points>(null)
  useFrame((_, t) => {
    if (ref.current) ref.current.rotation.y = t * 0.02
  })
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial
        size={0.07}
        vertexColors
        transparent
        opacity={0.85}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  )
}

function GradientMesh({ color, color2 }: { color: string; color2: string }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        uniforms: {
          uTime: { value: 0 },
          uA: { value: new THREE.Color(color) },
          uB: { value: new THREE.Color(color2) }
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            vec3 p = position;
            p.z += sin(uv.x * 6.2831 + 1.5) * cos(uv.y * 6.2831 + 0.8) * 0.6;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform vec3 uA;
          uniform vec3 uB;
          varying vec2 vUv;
          void main() {
            float w = 0.5 + 0.5 * sin(vUv.x * 4.0 + uTime * 0.4) * sin(vUv.y * 3.0 - uTime * 0.3);
            vec3 c = mix(uA, uB, w);
            float a = 0.35 + 0.25 * w;
            gl_FragColor = vec4(c, a);
          }
        `
      }),
    [color, color2]
  )
  useFrame((_, t) => {
    mat.uniforms.uTime.value = t
  })
  return <mesh material={mat}>{<planeGeometry args={[26, 15, 32, 20]} />}</mesh>
}

function OrbitShape({ color, wire }: { color: string; wire: string }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    ref.current.rotation.x = clock.elapsedTime * 0.25
    ref.current.rotation.y = clock.elapsedTime * 0.35
  })
  return (
    <group>
      <mesh ref={ref}>
        <icosahedronGeometry args={[2.6, 0]} />
        <meshStandardMaterial color={color} wireframe transparent opacity={0.9} />
      </mesh>
      <mesh scale={1.6}>
        <icosahedronGeometry args={[2.6, 0]} />
        <meshBasicMaterial color={wire} wireframe transparent opacity={0.25} />
      </mesh>
    </group>
  )
}

function hexFromCss(css: string): string {
  return `#${colorRgb(css)
    .map((channel) => Math.round(channel).toString(16).padStart(2, '0'))
    .join('')}`
}
