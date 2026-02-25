"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { 
  Play, 
  ShieldAlert, 
  Network, 
  KeyRound, 
  Terminal, 
  Loader2,
  RefreshCw,
  Target
} from "lucide-react"

interface SimulationScenario {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  endpoint: string
  payload: any
}

export function AttackSimulationControls() {
  const [isRunning, setIsRunning] = useState<string | null>(null)
  const [lastRun, setLastRun] = useState<Record<string, Date>>({})
  const { toast } = useToast()

  const scenarios: SimulationScenario[] = [
    {
      id: "ssh-bruteforce",
      name: "SSH Brute Force Attack",
      description: "Simulate multiple failed SSH login attempts followed by successful credential use",
      icon: <Terminal className="h-5 w-5" />,
      endpoint: "/api/simulation/ssh-bruteforce",
      payload: { target: "fake-jump-01", attempts: 5 }
    },
    {
      id: "lateral-movement",
      name: "Lateral Movement",
      description: "Simulate attacker pivoting from one host to another using stolen credentials",
      icon: <Network className="h-5 w-5" />,
      endpoint: "/api/simulation/lateral-movement",
      payload: { source: "fake-web-01", targets: ["fake-jump-01", "fake-ftp-01"] }
    },
    {
      id: "credential-theft",
      name: "Credential Dumping",
      description: "Simulate Mimikatz-style credential extraction from memory",
      icon: <KeyRound className="h-5 w-5" />,
      endpoint: "/api/simulation/credential-theft",
      payload: { target: "fake-web-01", tool: "mimikatz" }
    },
    {
      id: "discovery",
      name: "Network Discovery",
      description: "Simulate attacker reconnaissance and network scanning activities",
      icon: <Target className="h-5 w-5" />,
      endpoint: "/api/simulation/discovery",
      payload: { source: "fake-jump-01", scanType: "internal" }
    },
    {
      id: "privilege-escalation",
      name: "Privilege Escalation",
      description: "Simulate attacker gaining elevated privileges on compromised host",
      icon: <ShieldAlert className="h-5 w-5" />,
      endpoint: "/api/simulation/privilege-escalation",
      payload: { target: "fake-ftp-01", method: "sudo-exploit" }
    },
    {
      id: "full-campaign",
      name: "Full Attack Campaign",
      description: "Simulate complete attack chain from initial access to data exfiltration",
      icon: <Play className="h-5 w-5" />,
      endpoint: "/api/simulation/full-campaign",
      payload: { complexity: "advanced" }
    }
  ]

  const runSimulation = async (scenario: SimulationScenario) => {
    setIsRunning(scenario.id)
    
    try {
      const response = await fetch(scenario.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scenario.payload)
      })

      if (!response.ok) {
        throw new Error(`Simulation failed: ${response.status}`)
      }

      const result = await response.json()
      
      setLastRun(prev => ({ ...prev, [scenario.id]: new Date() }))
      
      const attackType = result.real ? "REAL" : "MOCK"
      toast({
        title: `${attackType} Simulation ${result.success ? "Started" : "Failed"}`,
        description: result.real 
          ? `${scenario.name} simulation executed on REAL VM infrastructure`
          : `${scenario.name} simulation (VM not available - using mock data)`,
        variant: result.real ? "default" : "destructive"
      })
      
      // Trigger immediate CRDT sync to propagate the simulation data
      if (result.success) {
        await fetch("/api/simulation/trigger-sync", { method: "POST" })
      }
      
    } catch (error) {
      toast({
        title: "Simulation Error",
        description: error instanceof Error ? error.message : "Failed to run simulation",
        variant: "destructive"
      })
    } finally {
      setIsRunning(null)
    }
  }

  const triggerSync = async () => {
    setIsRunning("sync")
    
    try {
      const response = await fetch("/api/simulation/trigger-sync", {
        method: "POST"
      })

      if (!response.ok) {
        throw new Error("Failed to trigger sync")
      }

      toast({
        title: "CRDT Sync Triggered",
        description: "Synchronizing state across all VMs",
      })
    } catch (error) {
      toast({
        title: "Sync Error",
        description: error instanceof Error ? error.message : "Failed to trigger sync",
        variant: "destructive"
      })
    } finally {
      setIsRunning(null)
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Play className="h-5 w-5" />
              Attack Simulation Controls
            </CardTitle>
            <CardDescription className="mt-1">
              Manually trigger attack scenarios to demonstrate real-time detection and CRDT synchronization
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={triggerSync}
            disabled={isRunning === "sync"}
            className="gap-2"
          >
            {isRunning === "sync" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Force CRDT Sync
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {scenarios.map((scenario) => {
            const isCurrentlyRunning = isRunning === scenario.id
            const wasRun = lastRun[scenario.id]
            
            return (
              <div
                key={scenario.id}
                className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-primary/10 rounded-md">
                      {scenario.icon}
                    </div>
                    <div>
                      <h4 className="font-medium text-sm">{scenario.name}</h4>
                      {wasRun && (
                        <p className="text-xs text-muted-foreground">
                          Last run: {wasRun.toLocaleTimeString()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  {scenario.description}
                </p>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => runSimulation(scenario)}
                  disabled={isCurrentlyRunning}
                >
                  {isCurrentlyRunning ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Run Simulation
                    </>
                  )}
                </Button>
              </div>
            )
          })}
        </div>

        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" className="text-xs">
              ℹ️ Demo Mode
            </Badge>
            <p>
              Simulations create realistic attack events that are detected by the CRDT system and displayed in real-time on the dashboard.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
