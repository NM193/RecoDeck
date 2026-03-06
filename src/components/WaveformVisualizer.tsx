import { useEffect, useRef, useState, useCallback } from 'react'
import { getTrackWaveform } from '../lib/waveformCache'
import type { WaveformData } from '../lib/waveform'

interface WaveformVisualizerProps {
  trackId: number
  position: number // current position in ms
  duration: number // track duration in ms
  onSeek: (posMs: number) => void
  onSeeking?: (posMs: number) => void
}

function formatTime(ms: number) {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function WaveformVisualizer({
  trackId,
  position,
  duration,
  onSeek,
  onSeeking,
}: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const isDraggingRef = useRef(false)
  const dragPositionRef = useRef(0)
  const positionRef = useRef(position)
  positionRef.current = position
  const durationRef = useRef(duration)
  durationRef.current = duration

  // Hover state as refs so the render loop reads them without triggering re-renders
  const hoveringRef = useRef(false)
  const hoverRatioRef = useRef(0)
  const [hoverState, setHoverState] = useState<{ hovering: boolean; ratio: number }>({ hovering: false, ratio: 0 })

  const [waveform, setWaveform] = useState<WaveformData | null>(null)

  useEffect(() => {
    let cancelled = false
    setWaveform(null)

    getTrackWaveform(trackId).then((data) => {
      if (!cancelled && data) {
        setWaveform(data)
      }
    })

    return () => {
      cancelled = true
    }
  }, [trackId])

  const waveformRef = useRef<WaveformData | null>(null)
  waveformRef.current = waveform

  // Canvas render loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const draw = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        rafRef.current = requestAnimationFrame(draw)
        return
      }

      const dpr = window.devicePixelRatio || 1
      const cssW = canvas.offsetWidth
      const cssH = canvas.offsetHeight

      if (cssW === 0 || cssH === 0) {
        rafRef.current = requestAnimationFrame(draw)
        return
      }

      if (
        canvas.width !== Math.round(cssW * dpr) ||
        canvas.height !== Math.round(cssH * dpr)
      ) {
        canvas.width = Math.round(cssW * dpr)
        canvas.height = Math.round(cssH * dpr)
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, cssW, cssH)

      const wf = waveformRef.current
      const curDuration = durationRef.current
      const curPosition = isDraggingRef.current
        ? dragPositionRef.current
        : positionRef.current

      const style = getComputedStyle(document.documentElement)
      const accentRgb =
        style.getPropertyValue('--accent-rgb').trim() || '99,102,241'
      const textMuted =
        style.getPropertyValue('--text-muted').trim() || 'rgba(255,255,255,0.4)'

      if (!wf || wf.points.length === 0) {
        ctx.fillStyle = textMuted
        ctx.globalAlpha = 0.3
        ctx.fillRect(0, cssH / 2 - 0.5, cssW, 1)
        ctx.globalAlpha = 1
        rafRef.current = requestAnimationFrame(draw)
        return
      }

      const BAR_WIDTH = 2
      const GAP = 1
      const step = BAR_WIDTH + GAP
      const barCount = Math.floor(cssW / step)
      const mid = cssH / 2
      const maxBarHeight = cssH * 0.85

      const progress = curDuration > 0 ? curPosition / curDuration : 0
      const progressX = progress * cssW

      const isHovering = hoveringRef.current
      const hoverX = hoverRatioRef.current * cssW

      for (let i = 0; i < barCount; i++) {
        const x = i * step
        const pointIdx = Math.floor(
          (i / barCount) * wf.points.length,
        )
        if (pointIdx >= wf.points.length) break

        const point = wf.points[pointIdx]
        const barHeight = Math.max(point.peak * maxBarHeight, 1)
        const halfBar = barHeight / 2

        if (x + BAR_WIDTH <= progressX) {
          // Played region — accent
          ctx.fillStyle = `rgba(${accentRgb}, 0.9)`
        } else if (isHovering && hoverX > progressX && x < hoverX) {
          // Hover preview region — brighter white
          ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
        } else {
          // Unplayed — muted
          ctx.fillStyle = textMuted
          ctx.globalAlpha = 0.35
        }

        ctx.fillRect(x, mid - halfBar, BAR_WIDTH, barHeight)
        ctx.globalAlpha = 1
      }

      // Playhead line
      if (curDuration > 0 && progressX > 0 && progressX < cssW) {
        ctx.fillStyle = `rgba(${accentRgb}, 1)`
        ctx.fillRect(Math.round(progressX) - 0.5, 0, 1.5, cssH)
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [waveform])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (duration === 0) return
      e.preventDefault()

      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const calcPos = (clientX: number) => {
        const ratio = Math.max(
          0,
          Math.min(1, (clientX - rect.left) / rect.width),
        )
        return ratio * duration
      }

      isDraggingRef.current = true
      const pos = calcPos(e.clientX)
      dragPositionRef.current = pos
      onSeeking?.(pos)

      const onMove = (ev: MouseEvent) => {
        const movePos = calcPos(ev.clientX)
        dragPositionRef.current = movePos
        onSeeking?.(movePos)
      }

      const onUp = (ev: MouseEvent) => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        isDraggingRef.current = false
        const finalPos = calcPos(ev.clientX)
        onSeek(Math.floor(finalPos))
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [duration, onSeek, onSeeking],
  )

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    hoverRatioRef.current = ratio
    setHoverState({ hovering: true, ratio })
  }, [])

  const handleMouseEnter = useCallback(() => {
    hoveringRef.current = true
    setHoverState((s) => ({ ...s, hovering: true }))
  }, [])

  const handleMouseLeave = useCallback(() => {
    hoveringRef.current = false
    setHoverState({ hovering: false, ratio: 0 })
  }, [])

  return (
    <div className="waveform-visualizer__wrap">
      <canvas
        ref={canvasRef}
        className="waveform-visualizer"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      />
      {hoverState.hovering && duration > 0 && (
        <div
          className="waveform-visualizer__tooltip"
          style={{ left: `${hoverState.ratio * 100}%` }}
        >
          {formatTime(hoverState.ratio * duration)}
        </div>
      )}
    </div>
  )
}
