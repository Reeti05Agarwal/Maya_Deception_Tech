"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useSharedWebSocket } from "@/hooks/use-shared-websocket"
import { useVMStatus } from "@/hooks/use-vm-status"
import { 
  Database, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw, 
  Clock,
  Server,
  Activity
} from "lucide-react"
import { cn } from "@/lib/utils"

interface SyncStats {
  totalAttackers: number
  totalCredentials: number
  totalSessions: number
  syncedVMs: number
  lastSyncTime: Date | null
  syncHealth: "healthy" | "degraded" | "offline"
}

export function CRDTSyncStatusPanel() {
  const { vms, loading, lastUpdate, refresh, wsConnected } = useVMStatus()
  const { subscribe } = useSharedWebSocket()
  const [stats, setStats] = useState<SyncStats>({
    totalAttackers: 0,
    totalCredentials: 0,
    totalSessions: 0,
    syncedVMs: 0,
    lastSyncTime: null,
    syncHealth: "healthy"
  })
  const [syncHistory, setSyncHistory] = useState<{ time: Date; count: number }[]>([])

  useEffect(() => {
    const unsubscribe = subscribe((msg) => {
      if (msg.type === 'SYNC_COMPLETE') {
        const syncData = msg.data.syncData || msg.data
        setStats(prev => ({
          ...prev,
          lastSyncTime: new Date(),
          totalAttackers: syncData.attackersCount || prev.totalAttackers
        }))
        
        setSyncHistory(prev => [
          ...prev.slice(-9),
          { time: new Date(), count: syncData.attackersCount || 0 }
        ])
      }
    })

    return unsubscribe
  }, [subscribe])

  useEffect(() => {
    const totalAttackers = vms.reduce((sum, v) => sum + (v.crdtState?.attackers || 0), 0)
    const totalCredentials = vms.reduce((sum, v) => sum + (v.crdtState?.credentials || 0), 0)
    const totalSessions = vms.reduce((sum, v) => sum + (v.crdtState?.sessions || 0), 0)
    const runningVMs = vms.filter(v => v.status === 'running').length

    setStats(prev => ({
      ...prev,
      totalAttackers,
      totalCredentials,
      totalSessions,
      syncedVMs: runningVMs,
      syncHealth: runningVMs >= 3 ? "healthy" : runningVMs >= 1 ? "degraded" : "offline"
    }))
  }, [vms])

  const getHealthColor = (health: string) => {
    switch (health) {
      case "healthy": return "text-green-500 bg-green-500/10 border-green-500/50"
      case "degraded": return "text-yellow-500 bg-yellow-500/10 border-yellow-500/50"
      case "offline": return "text-red-500 bg-red-500/10 border-red-500/50"
    }
  }

  const getHealthIcon = (health: string) => {
    switch (health) {
      case "healthy": return <CheckCircle className="h-5 w-5" />
      case "degraded": return <AlertCircle className="h-5 w-5" />
      case "offline": return <AlertCircle className="h-5 w-5" />
    }
  }

  const getTimeSinceSync = () => {
    if (!stats.lastSyncTime) return "Never"
    const seconds = Math.floor((Date.now() - stats.lastSyncTime.getTime()) / 1000)
    
    if (seconds < 60) return `${seconds}s ago`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    return `${Math.floor(seconds / 3600)}h ago`
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Database className="h-5 w-5" />
              CRDT Synchronization Status
            </CardTitle>
            <CardDescription className="mt-1">
              Distributed state synchronization across honeypot VMs
            </CardDescription>
          </div>
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full border",
            getHealthColor(stats.syncHealth)
          )}>
            {getHealthIcon(stats.syncHealth)}
            <span className="text-sm font-medium capitalize">{stats.syncHealth}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Sync Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">Total Attackers</span>
            </div>
            <p className="text-2xl font-bold">{stats.totalAttackers}</p>
            <p className="text-xs text-muted-foreground">Across all VMs</p>
          </div>

          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Server className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Active VMs</span>
            </div>
            <p className="text-2xl font-bold">{stats.syncedVMs}</p>
            <p className="text-xs text-muted-foreground">Participating in sync</p>
          </div>

          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Database className="h-4 w-4 text-purple-500" />
              <span className="text-sm text-muted-foreground">Credentials</span>
            </div>
            <p className="text-2xl font-bold">{stats.totalCredentials}</p>
            <p className="text-xs text-muted-foreground">Tracked in CRDT</p>
          </div>

          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-orange-500" />
              <span className="text-sm text-muted-foreground">Last Sync</span>
            </div>
            <p className="text-lg font-bold">{getTimeSinceSync()}</p>
            <p className="text-xs text-muted-foreground">{stats.lastSyncTime?.toLocaleTimeString()}</p>
          </div>
        </div>

        {/* VM Status List */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">VM Synchronization Status</h4>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading VM status...</p>
          ) : vms.length === 0 ? (
            <p className="text-sm text-muted-foreground">No VMs detected</p>
          ) : (
            <div className="space-y-1">
              {vms.map((vm) => (
                <div
                  key={vm.name}
                  className="flex items-center justify-between p-2 border rounded-md text-sm"
                >
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "h-2 w-2 rounded-full",
                      vm.status === "running" ? "bg-green-500" :
                      vm.status === "stopped" ? "bg-red-500" : "bg-gray-500"
                    )} />
                    <span>{vm.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {vm.crdtState && (
                      <Badge variant="outline" className="text-xs">
                        {vm.crdtState.attackers} attackers
                      </Badge>
                    )}
                    <span className={cn(
                      "text-xs",
                      vm.status === "running" ? "text-green-600" :
                      vm.status === "stopped" ? "text-red-600" : "text-gray-600"
                    )}>
                      {vm.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sync History Mini Chart */}
        {syncHistory.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <h4 className="text-sm font-medium mb-2">Recent Sync Activity</h4>
            <div className="flex items-end gap-1 h-12">
              {syncHistory.map((entry, idx) => {
                const height = Math.max(10, (entry.count / Math.max(...syncHistory.map(s => s.count))) * 100)
                return (
                  <div
                    key={idx}
                    className="flex-1 bg-blue-500/30 rounded-t"
                    style={{ height: `${height}%` }}
                    title={`${entry.count} attackers at ${entry.time.toLocaleTimeString()}`}
                  />
                )
              })}
            </div>
          </div>
        )}

        {/* Info Footer */}
        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3 mt-0.5" />
            <div>
              <p>
                <strong>How it works:</strong> The backend polls each VM every 10 seconds, 
                reads the CRDT state file (/var/lib/.syscache), and merges attacker data 
                in MongoDB. This centralized approach ensures consistent global state.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
