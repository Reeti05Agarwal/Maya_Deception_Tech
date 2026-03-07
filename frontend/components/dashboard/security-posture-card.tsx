"use client"

import { useEffect, useState } from "react"
import { Shield, ShieldAlert, ShieldCheck } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { useSharedWebSocket } from "@/hooks/use-shared-websocket"

type SecurityPosture = {
  score: number
  maxScore: number
  threatLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  factors: {
    attackers: number
    credentials: number
    lateralMoves: number
  }
}

function threatColor(threatLevel: SecurityPosture["threatLevel"]) {
  switch (threatLevel) {
    case "CRITICAL":
      return "text-red-500"
    case "HIGH":
      return "text-orange-500"
    case "MEDIUM":
      return "text-yellow-500"
    default:
      return "text-blue-500"
  }
}

function threatIcon(threatLevel: SecurityPosture["threatLevel"]) {
  if (threatLevel === "CRITICAL" || threatLevel === "HIGH") return ShieldAlert
  if (threatLevel === "MEDIUM") return Shield
  return ShieldCheck
}

export function SecurityPostureCard() {
  const [posture, setPosture] = useState<SecurityPosture | null>(null)
  const [loading, setLoading] = useState(true)
  const { subscribe } = useSharedWebSocket()

  useEffect(() => {
    const fetchPosture = async () => {
      try {
        const res = await fetch("/api/dashboard/security-posture", { cache: "no-store" })
        if (!res.ok) return
        const json = await res.json()
        setPosture(json.data || null)
      } finally {
        setLoading(false)
      }
    }

    fetchPosture()
    const interval = setInterval(fetchPosture, 5000)
    const unsubscribe = subscribe((msg) => {
      if (msg.type === "SYNC_COMPLETE" || msg.type === "NEW_EVENT" || msg.type === "ATTACKER_UPDATED") {
        fetchPosture()
      }
    })

    return () => {
      clearInterval(interval)
      unsubscribe()
    }
  }, [subscribe])

  const Icon = posture ? threatIcon(posture.threatLevel) : Shield
  const score = posture?.score ?? 0
  const maxScore = posture?.maxScore ?? 100
  const progressValue = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0

  return (
    <Card className="border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Icon className={`h-4 w-4 ${posture ? threatColor(posture.threatLevel) : "text-muted-foreground"}`} />
          Security Posture
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading posture score...</p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-2xl font-bold">
                {score} <span className="text-sm text-muted-foreground">/ {maxScore}</span>
              </p>
              <Badge variant="outline" className={threatColor(posture?.threatLevel || "LOW")}>
                {posture?.threatLevel || "LOW"}
              </Badge>
            </div>

            <Progress value={progressValue} className="h-2" />

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded bg-secondary/40 p-2">
                <div className="text-muted-foreground">Attackers</div>
                <div className="font-semibold">{posture?.factors.attackers ?? 0}</div>
              </div>
              <div className="rounded bg-secondary/40 p-2">
                <div className="text-muted-foreground">Credentials</div>
                <div className="font-semibold">{posture?.factors.credentials ?? 0}</div>
              </div>
              <div className="rounded bg-secondary/40 p-2">
                <div className="text-muted-foreground">Lateral Moves</div>
                <div className="font-semibold">{posture?.factors.lateralMoves ?? 0}</div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
