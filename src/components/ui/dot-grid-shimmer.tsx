"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Animated dot-grid placeholder: a grid of small dots whose opacity is
 * driven by a drifting fractal noise field, producing soft cloud-like
 * blobs that travel across the surface (image-generation loading style).
 *
 * Renders on a canvas sized to its container; pauses when off-screen and
 * renders a single static frame under prefers-reduced-motion.
 */

// -- 3D value noise (x, y, t) -------------------------------------------

function hash(x: number, y: number, z: number): number {
  let h =
    Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x9e3779b9)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

function valueNoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const xf = smooth(x - xi)
  const yf = smooth(y - yi)
  const zf = smooth(z - zi)

  let n = 0
  for (let dz = 0; dz <= 1; dz++) {
    const wz = dz ? zf : 1 - zf
    for (let dy = 0; dy <= 1; dy++) {
      const wy = dy ? yf : 1 - yf
      for (let dx = 0; dx <= 1; dx++) {
        const wx = dx ? xf : 1 - xf
        n += hash(xi + dx, yi + dy, zi + dz) * wx * wy * wz
      }
    }
  }
  return n
}

function fbm(x: number, y: number, z: number): number {
  return (
    valueNoise(x, y, z) * 0.65 + valueNoise(x * 2.3, y * 2.3, z * 1.7) * 0.35
  )
}

// -----------------------------------------------------------------------

interface DotGridShimmerProps extends React.ComponentProps<"div"> {
  /** Distance between dot centers, px. */
  spacing?: number
  /** Dot radius, px. */
  dotRadius?: number
  /** Noise blob scale — higher = smaller, busier blobs. */
  frequency?: number
  /** Animation speed multiplier. */
  speed?: number
  /** How much dots grow toward a blob's core (0 = uniform size). */
  sizeBoost?: number
}

function DotGridShimmer({
  className,
  spacing = 24,
  dotRadius = 1.5,
  frequency = 3,
  speed = 1,
  sizeBoost = 1.5,
  ...props
}: DotGridShimmerProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches

    let raf = 0
    let visible = true
    let width = 0
    let height = 0

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      width = rect.width
      height = rect.height
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const draw = (now: number) => {
      const t = (now / 1000) * speed
      ctx.clearRect(0, 0, width, height)
      const color = getComputedStyle(canvas).color

      const cols = Math.ceil(width / spacing)
      const rows = Math.ceil(height / spacing)
      const diag = Math.max(width, height) / spacing

      ctx.fillStyle = color
      for (let row = 0; row <= rows; row++) {
        for (let col = 0; col <= cols; col++) {
          // Drift the sample point so blobs travel, while the field
          // itself also evolves over time (third noise dimension).
          const nx = (col / diag) * frequency + t * 0.06
          const ny = (row / diag) * frequency - t * 0.04
          const n = fbm(nx, ny, t * 0.12)

          // Soft threshold: most dots invisible, blobs fade in/out.
          const a = smooth(Math.min(Math.max((n - 0.5) / 0.22, 0), 1))
          if (a <= 0.02) continue

          // Dots grow toward the blob's core (a peaks at the barycenter).
          const r = dotRadius * (1 + sizeBoost * a)
          ctx.globalAlpha = a
          ctx.beginPath()
          ctx.arc(col * spacing, row * spacing, r, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
    }

    const loop = (now: number) => {
      draw(now)
      raf = requestAnimationFrame(loop)
    }

    resize()
    if (reducedMotion) {
      draw(4000)
    } else {
      raf = requestAnimationFrame(loop)
    }

    const ro = new ResizeObserver(() => {
      resize()
      if (reducedMotion) draw(4000)
    })
    ro.observe(canvas)

    const io = new IntersectionObserver(([entry]) => {
      const nowVisible = entry?.isIntersecting ?? true
      if (nowVisible === visible) return
      visible = nowVisible
      cancelAnimationFrame(raf)
      if (visible && !reducedMotion) raf = requestAnimationFrame(loop)
    })
    io.observe(canvas)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
    }
  }, [spacing, dotRadius, frequency, speed, sizeBoost])

  return (
    <div
      data-slot="dot-grid-shimmer"
      className={cn("text-muted-foreground/60 relative", className)}
      {...props}
    >
      <canvas ref={canvasRef} className="size-full" aria-hidden="true" />
    </div>
  )
}

export { DotGridShimmer }
