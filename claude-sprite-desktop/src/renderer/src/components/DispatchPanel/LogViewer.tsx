import { useEffect, useRef } from 'react'
import { stripAnsi } from '../../lib/ansi'

interface LogViewerProps {
  lines: string[]
  className?: string
}

export function LogViewer({ lines, className = '' }: LogViewerProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Auto-scroll to bottom when new lines arrive
    // Only if user is already near the bottom (within 100px)
    const container = containerRef.current
    if (!container) return
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 100
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [lines.length])

  return (
    <div
      ref={containerRef}
      className={`font-mono text-xs leading-relaxed overflow-y-auto bg-muted/50 rounded-lg p-4 ${className}`}
    >
      {lines.length === 0 ? (
        <span className="text-muted-foreground">Waiting for output...</span>
      ) : (
        <pre className="whitespace-pre-wrap break-all text-foreground/90">
          {lines.map((line) => stripAnsi(line)).join('')}
        </pre>
      )}
      <div ref={bottomRef} />
    </div>
  )
}
