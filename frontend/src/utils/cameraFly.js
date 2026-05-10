/**
 * cameraFly — small state machine for animating the perspective camera.
 *
 * Why custom + not GSAP: we need to pause/resume in lockstep with
 * OrbitControls' damping, sync into its internal spherical when done,
 * and respect prefers-reduced-motion. Pulling GSAP for a single 1.5s
 * lerp would be more weight than the whole feature.
 *
 * Usage:
 *   const fly = makeCameraFly()
 *   fly.start({ camera, controls, target: [x,y,z], duration, onLock, onRelease })
 *   useFrame((_, delta) => fly.tick(delta))
 */
import * as THREE from 'three'

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

const REDUCED_MOTION = (() => {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
})()

export function makeCameraFly() {
  const state = {
    active: false,
    progress: 1,
    duration: 1.4,
    startPos: new THREE.Vector3(),
    endPos: new THREE.Vector3(),
    camera: null,
    controls: null,
    onRelease: null,
  }

  function start({ camera, controls, target, duration = 1.4, onLock, onRelease }) {
    if (!camera) return
    state.camera = camera
    state.controls = controls
    state.startPos.copy(camera.position)
    state.endPos.set(target[0], target[1], target[2])
    state.duration = REDUCED_MOTION ? 0.001 : duration
    state.progress = 0
    state.active = true
    state.onRelease = onRelease

    if (controls) controls.enabled = false
    if (typeof onLock === 'function') onLock()
  }

  function tick(delta) {
    if (!state.active || !state.camera) return false
    state.progress = Math.min(1, state.progress + delta / state.duration)
    const t = easeInOutCubic(state.progress)
    state.camera.position.lerpVectors(state.startPos, state.endPos, t)
    state.camera.lookAt(0, 0, 0)

    if (state.progress >= 1) {
      state.active = false
      const ctrl = state.controls
      if (ctrl) {
        // Sync OrbitControls internal spherical so the user can keep
        // dragging seamlessly from the new pose.
        const offset = new THREE.Vector3().subVectors(state.camera.position, ctrl.target)
        ctrl.spherical.setFromVector3(offset)
        ctrl.enabled = true
        ctrl.update()
      }
      if (typeof state.onRelease === 'function') state.onRelease()
      return true // finished this tick
    }
    return false
  }

  function isActive() {
    return state.active
  }

  function cancel() {
    if (!state.active) return
    state.active = false
    if (state.controls) state.controls.enabled = true
    if (typeof state.onRelease === 'function') state.onRelease()
  }

  return { start, tick, isActive, cancel }
}
