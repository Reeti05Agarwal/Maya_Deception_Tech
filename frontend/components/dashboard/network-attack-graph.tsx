"use client"

import { useEffect, useMemo, useState } from "react"
import { scalePoint } from "d3-scale"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useSharedWebSocket } from "@/hooks/use-shared-websocket"

type GraphNode = {
  id: string
  label: string
  type: "attacker" | "vm"
}

type GraphEdge = {
  from: string
  to: string
  label: string
  relation: "entry" | "lateral_movement" | "credential_use"
}

type GraphData = {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

const GRAPH_WIDTH = 860
const GRAPH_HEIGHT = 320

function edgeColor(relation: GraphEdge["relation"]) {
  if (relation === "entry") return "#3b82f6"
  if (relation === "credential_use") return "#eab308"
  return "#f97316"
}

export function NetworkAttackGraph() {
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] })
  const [loading, setLoading] = useState(true)
  const { subscribe } = useSharedWebSocket()

  useEffect(() => {
    const fetchGraph = async () => {
      try {
        const res = await fetch("/api/dashboard/lateral-movement", { cache: "no-store" })
        if (!res.ok) return
        const json = await res.json()
        setGraph(json.data || { nodes: [], edges: [] })
      } finally {
        setLoading(false)
      }
    }

    fetchGraph()
    const interval = setInterval(fetchGraph, 6000)
    const unsubscribe = subscribe((msg) => {
      if (msg.type === "NEW_EVENT" || msg.type === "SYNC_COMPLETE" || msg.type === "ATTACKER_UPDATED") {
        fetchGraph()
      }
    })

    return () => {
      clearInterval(interval)
      unsubscribe()
    }
  }, [subscribe])

  const { nodesWithPosition, renderedEdges } = useMemo(() => {
    const attackerNodes = graph.nodes.filter((node) => node.type === "attacker")
    const vmNodes = graph.nodes.filter((node) => node.type !== "attacker")

    const attackerScale = scalePoint<string>()
      .domain(attackerNodes.map((node) => node.id))
      .range([40, GRAPH_HEIGHT - 40])
      .padding(0.5)
    const vmScale = scalePoint<string>()
      .domain(vmNodes.map((node) => node.id))
      .range([40, GRAPH_HEIGHT - 40])
      .padding(0.35)

    const positioned = new Map<string, GraphNode & { x: number; y: number }>()
    attackerNodes.forEach((node) => {
      positioned.set(node.id, { ...node, x: 120, y: attackerScale(node.id) ?? GRAPH_HEIGHT / 2 })
    })
    vmNodes.forEach((node) => {
      positioned.set(node.id, { ...node, x: 560, y: vmScale(node.id) ?? GRAPH_HEIGHT / 2 })
    })

    return {
      nodesWithPosition: Array.from(positioned.values()),
      renderedEdges: graph.edges
        .map((edge) => {
          const from = positioned.get(edge.from)
          const to = positioned.get(edge.to)
          if (!from || !to) return null
          return { edge, from, to }
        })
        .filter(Boolean) as Array<{
        edge: GraphEdge
        from: GraphNode & { x: number; y: number }
        to: GraphNode & { x: number; y: number }
      }>,
    }
  }, [graph])

  return (
    <Card className="border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Network Attack Graph</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Attacker</Badge>
            <Badge variant="outline">VM</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading graph...</p>
        ) : nodesWithPosition.length === 0 ? (
          <p className="text-sm text-muted-foreground">No movement graph data available yet.</p>
        ) : (
          <div className="w-full overflow-x-auto">
            <svg viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`} className="w-full min-w-[620px]">
              <defs>
                <marker id="attack-arrow" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
                  <polygon points="0 0, 9 3.5, 0 7" fill="#94a3b8" />
                </marker>
              </defs>

              {renderedEdges.map(({ edge, from, to }) => (
                <g key={`${edge.from}-${edge.to}-${edge.relation}`}>
                  <line
                    x1={from.x + 90}
                    y1={from.y}
                    x2={to.x - 90}
                    y2={to.y}
                    stroke={edgeColor(edge.relation)}
                    strokeWidth={2}
                    markerEnd="url(#attack-arrow)"
                    opacity={0.85}
                  />
                  <text
                    x={(from.x + to.x) / 2}
                    y={(from.y + to.y) / 2 - 8}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    fontSize="11"
                  >
                    {edge.label}
                  </text>
                </g>
              ))}

              {nodesWithPosition.map((node) => (
                <g key={node.id}>
                  <rect
                    x={node.x - 90}
                    y={node.y - 16}
                    width={180}
                    height={32}
                    rx={8}
                    fill={node.type === "attacker" ? "#0f172a" : "#111827"}
                    stroke={node.type === "attacker" ? "#3b82f6" : "#64748b"}
                    strokeWidth={1.5}
                  />
                  <text x={node.x} y={node.y + 4} textAnchor="middle" fill="#e2e8f0" fontSize="12">
                    {node.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
