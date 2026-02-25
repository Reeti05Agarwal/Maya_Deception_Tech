"use client"

import { useEffect, useState, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useSharedWebSocket } from "@/hooks/use-shared-websocket"
import { 
  Activity, 
  TrendingUp, 
  Shield, 
  AlertTriangle,
  User,
  Lock,
  Eye,
  MoveRight,
  FileText,
  Pause,
  Play
} from "lucide-react"
import { cn } from "@/lib/utils"

interface ActivityEvent {
  id: string
  type: string
  technique?: string
  description: string
  sourceHost?: string
  targetHost?: string
  severity: string
  timestamp: Date
  attackerId?: string
}

export function LiveActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [isPaused, setIsPaused] = useState(false)
  const { subscribe, connected } = useSharedWebSocket()
  const eventsRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    const unsubscribe = subscribe((msg) => {
      if (isPaused) return

      if (msg.type === 'NEW_EVENT') {
        const event = msg.data
        const newEvent: ActivityEvent = {
          id: event.eventId || `evt-${Date.now()}`,
          type: event.type || 'Unknown',
          technique: event.technique,
          description: event.description || event.command || 'Activity detected',
          sourceHost: event.sourceHost,
          targetHost: event.targetHost,
          severity: event.severity || 'Low',
          timestamp: new Date(event.timestamp || Date.now()),
          attackerId: event.attackerId
        }

        setEvents(prev => {
          const updated = [newEvent, ...prev].slice(0, 100) // Keep last 100 events
          return updated
        })
      }

      if (msg.type === 'SYNC_COMPLETE') {
        // Add a system event for sync completion
        const syncEvent: ActivityEvent = {
          id: `sync-${Date.now()}`,
          type: 'System',
          description: 'CRDT synchronization completed',
          severity: 'info',
          timestamp: new Date()
        }

        setEvents(prev => [syncEvent, ...prev].slice(0, 100))
      }
    })

    return unsubscribe
  }, [subscribe, isPaused])

  // Fetch initial events on mount
  useEffect(() => {
    const fetchInitialEvents = async () => {
      try {
        const res = await fetch('/api/dashboard/timeline?limit=20')
        if (res.ok) {
          const json = await res.json()
          const initialEvents: ActivityEvent[] = (json.data || []).map((e: any) => ({
            id: e.eventId,
            type: e.type,
            technique: e.technique,
            description: e.description,
            sourceHost: e.sourceHost,
            targetHost: e.targetHost,
            severity: e.severity,
            timestamp: new Date(e.timestamp),
            attackerId: e.attackerId
          }))
          setEvents(initialEvents)
        }
      } catch (error) {
        console.error('Failed to fetch initial events:', error)
      }
    }

    fetchInitialEvents()
  }, [])

  const getEventIcon = (type: string, severity: string) => {
    if (type === 'System') return <Activity className="h-4 w-4 text-blue-500" />
    
    switch (type) {
      case 'Credential Theft':
        return <Lock className="h-4 w-4 text-red-500" />
      case 'Lateral Movement':
        return <MoveRight className="h-4 w-4 text-orange-500" />
      case 'Initial Access':
        return <User className="h-4 w-4 text-yellow-500" />
      case 'Discovery':
        return <Eye className="h-4 w-4 text-blue-500" />
      case 'Privilege Escalation':
        return <Shield className="h-4 w-4 text-purple-500" />
      case 'Command Execution':
        return <FileText className="h-4 w-4 text-green-500" />
      default:
        return <Activity className="h-4 w-4 text-gray-500" />
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case 'critical': return 'bg-red-500 text-white'
      case 'high': return 'bg-orange-500 text-white'
      case 'medium': return 'bg-yellow-500 text-black'
      case 'low': return 'bg-blue-500 text-white'
      case 'info': return 'bg-green-500 text-white'
      default: return 'bg-gray-500 text-white'
    }
  }

  const getEventTypeColor = (type: string) => {
    switch (type) {
      case 'Credential Theft': return 'text-red-600'
      case 'Lateral Movement': return 'text-orange-600'
      case 'Initial Access': return 'text-yellow-600'
      case 'Discovery': return 'text-blue-600'
      case 'Privilege Escalation': return 'text-purple-600'
      case 'Command Execution': return 'text-green-600'
      default: return 'text-gray-600'
    }
  }

  const clearEvents = () => {
    setEvents([])
  }

  const exportEvents = () => {
    const dataStr = JSON.stringify(events, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `activity-feed-${new Date().toISOString()}.json`
    link.click()
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5" />
            Live Activity Feed
            <Badge variant="outline" className="ml-2">
              {events.length} events
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsPaused(!isPaused)}
              className="h-8"
            >
              {isPaused ? (
                <Play className="h-4 w-4" />
              ) : (
                <Pause className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearEvents}
              className="h-8"
              disabled={events.length === 0}
            >
              Clear
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportEvents}
              className="h-8"
              disabled={events.length === 0}
            >
              Export
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div 
          ref={eventsRef}
          className="space-y-2 max-h-[500px] overflow-y-auto"
        >
          {events.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No activity detected yet</p>
              <p className="text-sm">Waiting for attack events...</p>
              {!connected && (
                <Badge variant="destructive" className="mt-2">
                  WebSocket Disconnected
                </Badge>
              )}
            </div>
          ) : (
            events.map((event, idx) => (
              <div
                key={event.id}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border transition-all",
                  idx === 0 && !isPaused ? "animate-in fade-in slide-in-from-top-2 duration-300" : "",
                  event.severity === 'Critical' || event.severity === 'critical' 
                    ? "border-red-200 bg-red-50" 
                    : "border-border bg-card"
                )}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {getEventIcon(event.type, event.severity)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn("font-medium text-sm", getEventTypeColor(event.type))}>
                      {event.type}
                    </span>
                    {event.technique && (
                      <Badge variant="outline" className="text-xs">
                        {event.technique}
                      </Badge>
                    )}
                    <Badge className={cn("text-xs", getSeverityColor(event.severity))}>
                      {event.severity}
                    </Badge>
                  </div>
                  
                  <p className="text-sm text-muted-foreground mt-1">
                    {event.description}
                  </p>
                  
                  {(event.sourceHost || event.targetHost) && (
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      {event.sourceHost && (
                        <span>From: <strong>{event.sourceHost}</strong></span>
                      )}
                      {event.sourceHost && event.targetHost && (
                        <MoveRight className="h-3 w-3" />
                      )}
                      {event.targetHost && (
                        <span>To: <strong>{event.targetHost}</strong></span>
                      )}
                    </div>
                  )}
                  
                  {event.attackerId && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span>{event.attackerId}</span>
                    </div>
                  )}
                  
                  <p className="text-xs text-muted-foreground mt-1">
                    {event.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {isPaused && (
          <div className="mt-3 p-2 bg-yellow-500/10 border border-yellow-500/50 rounded-lg text-center text-sm">
            <Pause className="h-4 w-4 inline mr-2" />
            Feed paused - new events are not being displayed
          </div>
        )}
      </CardContent>
    </Card>
  )
}
