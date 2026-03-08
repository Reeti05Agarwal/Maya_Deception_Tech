"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useSharedWebSocket } from "@/hooks/use-shared-websocket"

type TimelineItem = {
  eventId: string
  time: string
  timestamp: string
  stage: string
  description: string
  severity: string
}

function severityClass(severity: string) {
  switch (severity.toUpperCase()) {
    case "CRITICAL":
      return "text-red-500 border-red-500/40"
    case "HIGH":
      return "text-orange-500 border-orange-500/40"
    case "MEDIUM":
      return "text-yellow-500 border-yellow-500/40"
    case "LOW":
      return "text-yellow-500 border-yellow-500/40"
    default:
      return "text-blue-500 border-blue-500/40"
  }
}

function stageLabel(stage: string): string {
  const labels: Record<string, string> = {
    RECON: "Recon",
    INITIAL_ACCESS: "Initial Access",
    CREDENTIAL_ACCESS: "Credential Access",
    LATERAL_MOVEMENT: "Lateral Movement",
    PRIVILEGE_ESCALATION: "Privilege Escalation",
    EXECUTION: "Execution",
    EXFILTRATION: "Exfiltration",
    OTHER: "Activity",
  }
  return labels[stage] || stage
}

export function AttackTimelinePanel() {
  const [items, setItems] = useState<TimelineItem[]>([])
  const [loading, setLoading] = useState(true)
  const { subscribe } = useSharedWebSocket()

  useEffect(() => {
    const fetchTimeline = async () => {
      try {
        const res = await fetch("/api/dashboard/timeline?hours=24&limit=40", { cache: "no-store" })
        if (!res.ok) return
        const json = await res.json()
        setItems(Array.isArray(json.data) ? json.data : [])
      } finally {
        setLoading(false)
      }
    }

    fetchTimeline()
    const interval = setInterval(fetchTimeline, 6000)
    const unsubscribe = subscribe((msg) => {
      if (msg.type === "NEW_EVENT" || msg.type === "SYNC_COMPLETE") fetchTimeline()
    })

    return () => {
      clearInterval(interval)
      unsubscribe()
    }
  }, [subscribe])

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  }, [items])

  return (
    <Card className="border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Attack Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading timeline...</p>
        ) : sortedItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No attacker activity recorded yet.</p>
        ) : (
          <div className="space-y-2 max-h-[280px] overflow-y-auto">
            {sortedItems.map((event) => (
              <div key={event.eventId || `${event.timestamp}-${event.description}`} className="rounded border border-border p-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-xs text-muted-foreground">[{event.time}]</p>
                  <Badge variant="outline" className={severityClass(event.severity)}>
                    {event.severity.toUpperCase()}
                  </Badge>
                </div>
                <p className="mt-1">
                  <span className="font-semibold">{stageLabel(event.stage)}</span>
                  <span className="text-muted-foreground"> - </span>
                  <span>{event.description}</span>
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
