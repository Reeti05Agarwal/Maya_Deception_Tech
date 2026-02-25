import { Navbar } from "@/components/dashboard/navbar"
import { InfrastructureOverview } from "@/components/dashboard/infrastructure-overview"
import { VMStatusPanel } from "@/components/dashboard/vm-status-panel"
import { DockerContainersPanel } from "@/components/dashboard/docker-containers-panel"
import { AttackersContent } from "@/components/dashboard/attackers-content"
import { RealTimeAlerts } from "@/components/dashboard/real-time-alerts"
import { AttackSimulationControls } from "@/components/dashboard/attack-simulation-controls"
import { CRDTSyncStatusPanel } from "@/components/dashboard/crdt-sync-status"
import { LiveActivityFeed } from "@/components/dashboard/live-activity-feed"

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* ONLY ONE NAVBAR HERE */}
      <Navbar title="MAYA | Dashboard" exportDisabled />

      <main className="px-4 py-4 space-y-4">
        <InfrastructureOverview />

        {/* Simulation Controls - Top priority for demo */}
        <AttackSimulationControls />

        {/* Real-Time Alerts */}
        <RealTimeAlerts />

        {/* CRDT Sync Status */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-4">
            <CRDTSyncStatusPanel />
          </div>

          <div className="lg:col-span-8">
            <LiveActivityFeed />
          </div>
        </div>

        {/* Original Dashboard Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-3 space-y-4">
            <VMStatusPanel />
          </div>

          <div className="lg:col-span-6">
            <AttackersContent />
          </div>

          <div className="lg:col-span-3">
            <DockerContainersPanel />
          </div>
        </div>
      </main>
    </div>
  )
}
