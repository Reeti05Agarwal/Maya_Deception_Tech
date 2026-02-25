"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useSharedWebSocket } from "@/hooks/use-shared-websocket"
import { Bell, AlertTriangle, Shield, Activity, X, CheckCircle } from "lucide-react"
import { cn } from "@/lib/utils"

export interface Alert {
  id: string
  type: "critical" | "high" | "medium" | "low" | "info"
  title: string
  description: string
  timestamp: Date
  source?: string
  target?: string
  acknowledged: boolean
}

export function RealTimeAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null)
  const { subscribe, connected } = useSharedWebSocket()
  const [audioEnabled, setAudioEnabled] = useState(true)

  const playNotificationSound = useCallback((type: Alert["type"]) => {
    if (!audioEnabled) return
    
    // Create a simple beep using Web Audio API
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    
    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)
    
    // Different tones for different severity levels
    const frequencyMap = {
      critical: 880,
      high: 660,
      medium: 440,
      low: 330,
      info: 220
    }
    
    oscillator.frequency.value = frequencyMap[type]
    oscillator.type = 'sine'
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)
    
    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.5)
  }, [audioEnabled])

  const addAlert = useCallback((alert: Omit<Alert, "id" | "timestamp" | "acknowledged">) => {
    const newAlert: Alert = {
      ...alert,
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      acknowledged: false
    }
    
    setAlerts(prev => [newAlert, ...prev].slice(0, 50)) // Keep last 50 alerts
    playNotificationSound(alert.type)
    
    // Auto-dismiss info alerts after 10 seconds
    if (alert.type === "info") {
      setTimeout(() => {
        setAlerts(prev => prev.filter(a => a.id !== newAlert.id))
      }, 10000)
    }
  }, [playNotificationSound])

  useEffect(() => {
    const unsubscribe = subscribe((msg) => {
      console.log('Alert system received:', msg.type)
      
      if (msg.type === 'NEW_EVENT') {
        const event = msg.data
        const severity = event.severity || 'medium'
        
        addAlert({
          type: severity === 'Critical' ? 'critical' : severity === 'High' ? 'high' : severity === 'Medium' ? 'medium' : 'low',
          title: `${event.type} Detected`,
          description: event.description || `Attack event: ${event.technique}`,
          source: event.sourceHost,
          target: event.targetHost
        })
      }
      
      if (msg.type === 'ATTACKER_UPDATED') {
        const attacker = msg.data
        const riskLevel = attacker.riskLevel || 'medium'
        
        addAlert({
          type: riskLevel === 'Critical' ? 'critical' : riskLevel === 'High' ? 'high' : 'medium',
          title: 'Attacker Activity Updated',
          description: `${attacker.ipAddress} - Privilege: ${attacker.currentPrivilege}`,
          source: attacker.entryPoint
        })
      }
      
      if (msg.type === 'SYNC_COMPLETE') {
        const syncData = msg.data.syncData || msg.data
        addAlert({
          type: 'info',
          title: 'CRDT Sync Complete',
          description: `Synchronized ${syncData.attackersCount || 0} attackers across all VMs`
        })
      }
    })

    return unsubscribe
  }, [subscribe, addAlert])

  const acknowledgeAlert = (alertId: string) => {
    setAlerts(prev => prev.map(alert => 
      alert.id === alertId ? { ...alert, acknowledged: true } : alert
    ))
  }

  const dismissAlert = (alertId: string) => {
    setAlerts(prev => prev.filter(alert => alert.id !== alertId))
  }

  const dismissAllAlerts = () => {
    setAlerts([])
  }

  const getAlertIcon = (type: Alert["type"]) => {
    switch (type) {
      case 'critical': return <AlertTriangle className="h-5 w-5 text-red-500" />
      case 'high': return <Shield className="h-5 w-5 text-orange-500" />
      case 'medium': return <Activity className="h-5 w-5 text-yellow-500" />
      case 'low': return <Bell className="h-5 w-5 text-blue-500" />
      case 'info': return <CheckCircle className="h-5 w-5 text-green-500" />
    }
  }

  const getAlertBorderColor = (type: Alert["type"]) => {
    switch (type) {
      case 'critical': return 'border-red-500/50 bg-red-500/10'
      case 'high': return 'border-orange-500/50 bg-orange-500/10'
      case 'medium': return 'border-yellow-500/50 bg-yellow-500/10'
      case 'low': return 'border-blue-500/50 bg-blue-500/10'
      case 'info': return 'border-green-500/50 bg-green-500/10'
    }
  }

  const unacknowledgedCount = alerts.filter(a => !a.acknowledged).length
  const criticalCount = alerts.filter(a => a.type === 'critical' && !a.acknowledged).length

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Real-Time Alerts
            {unacknowledgedCount > 0 && (
              <Badge variant="destructive" className="ml-2">
                {unacknowledgedCount} new
              </Badge>
            )}
            {criticalCount > 0 && (
              <Badge variant="destructive" className="ml-2 bg-red-600 animate-pulse">
                ⚠ {criticalCount} Critical
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAudioEnabled(!audioEnabled)}
              className="h-8"
            >
              {audioEnabled ? '🔔' : '🔕'}
            </Button>
            {alerts.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={dismissAllAlerts}
                className="h-8"
              >
                Clear All
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {alerts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No active alerts</p>
              <p className="text-sm">Monitoring for threats in real-time</p>
            </div>
          ) : (
            alerts.map((alert) => (
              <div
                key={alert.id}
                className={cn(
                  "rounded-lg border p-3 transition-all cursor-pointer",
                  getAlertBorderColor(alert.type),
                  alert.acknowledged && "opacity-60"
                )}
                onClick={() => setExpandedAlert(expandedAlert === alert.id ? null : alert.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 flex-1">
                    {getAlertIcon(alert.type)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{alert.title}</p>
                        <Badge variant="outline" className="text-xs">
                          {alert.type.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {alert.description}
                      </p>
                      {alert.source && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Source: {alert.source} {alert.target && `→ Target: ${alert.target}`}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {alert.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!alert.acknowledged && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation()
                          acknowledgeAlert(alert.id)
                        }}
                      >
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation()
                        dismissAlert(alert.id)
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
