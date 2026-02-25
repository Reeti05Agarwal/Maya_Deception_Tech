"use client"

import Link from "next/link"
import { 
  Shield, 
  Activity, 
  Server, 
  Lock, 
  Zap, 
  Eye, 
  ArrowRight, 
  CheckCircle2,
  Network,
  Brain,
  AlertTriangle
} from "lucide-react"
import { Button } from "@/components/ui/button"

export default function LandingPage() {
  const features = [
    {
      icon: Brain,
      title: "AI-Powered Deception",
      description: "Autonomous honeypot deployment with intelligent attacker profiling and behavioral analysis."
    },
    {
      icon: Network,
      title: "CRDT Synchronization",
      description: "Distributed state synchronization ensuring real-time consistency across all deception nodes."
    },
    {
      icon: Eye,
      title: "Real-Time Detection",
      description: "Live threat monitoring with instant alerting and comprehensive attack timeline reconstruction."
    },
    {
      icon: Lock,
      title: "Credential Traps",
      description: "Honeytokens and fake credentials to detect and track lateral movement within your network."
    },
    {
      icon: Activity,
      title: "Attack Simulation",
      description: "Built-in red team tools to test your deception fabric and validate detection coverage."
    },
    {
      icon: Server,
      title: "Infrastructure Control",
      description: "Unified management of VMs, Docker containers, and deception services from a single pane."
    }
  ]

  const metrics = [
    { value: "0ms", label: "Detection Latency", description: "Real-time WebSocket streaming" },
    { value: "100%", label: "False Positive Reduction", description: "Only real attackers trigger alerts" },
    { value: "24/7", label: "Autonomous Operation", description: "Self-healing deception infrastructure" },
    { value: "∞", label: "Scalable Architecture", description: "CRDT-based distributed sync" }
  ]

  const capabilities = [
    "Autonomous Honeypot Orchestration",
    "MITRE ATT&CK Mapping & Analysis",
    "Lateral Movement Detection",
    "Credential Honeytoken Deployment",
    "Command & Activity Logging",
    "Behavioral Pattern Recognition",
    "Incident Timeline Reconstruction",
    "Multi-Node CRDT Synchronization"
  ]

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/20">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 blur-lg rounded-full" />
              <Shield className="h-8 w-8 text-primary relative z-10" />
            </div>
            <span className="text-xl font-bold tracking-tight">MAYA</span>
          </div>
          
          <div className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#capabilities" className="hover:text-foreground transition-colors">Capabilities</a>
            <a href="#metrics" className="hover:text-foreground transition-colors">Metrics</a>
          </div>

          <Link href="/dashboard">
            <Button className="gap-2">
              Launch Dashboard
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-24 overflow-hidden">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-pulse delay-1000" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-3xl" />
        </div>

        {/* Grid Pattern Overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(14,165,233,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(14,165,233,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />

        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-5xl mx-auto text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm mb-8">
              <AlertTriangle className="h-4 w-4" />
              <span>Enterprise Deception Platform</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
              Deceive. Detect.
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-primary via-accent to-primary">
                Defend.
              </span>
            </h1>

            <p className="text-xl text-muted-foreground mb-10 max-w-3xl mx-auto leading-relaxed">
              MAYA is an industrial-grade cybersecurity deception platform that deploys autonomous 
              honeypots, tracks attacker behavior in real-time, and provides actionable threat 
              intelligence through advanced CRDT synchronization.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/dashboard">
                <Button size="lg" className="h-12 px-8 text-base gap-2 group">
                  Access Security Dashboard
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <a href="#features">
                <Button size="lg" variant="outline" className="h-12 px-8 text-base">
                  Explore Features
                </Button>
              </a>
            </div>

            {/* Trust Indicators */}
            <div className="mt-16 flex flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>Zero False Positives</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>Real-Time Detection</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>MITRE ATT&CK Aligned</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>Enterprise Ready</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Metrics Section */}
      <section id="metrics" className="py-20 border-y border-border/50 bg-secondary/30">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {metrics.map((metric, index) => (
              <div key={index} className="text-center group">
                <div className="text-4xl md:text-5xl font-bold text-primary mb-2 group-hover:scale-110 transition-transform">
                  {metric.value}
                </div>
                <div className="text-lg font-semibold mb-1">{metric.label}</div>
                <div className="text-sm text-muted-foreground">{metric.description}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">
              Advanced Deception Technology
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Built for security teams who need enterprise-grade threat detection 
              with zero operational overhead.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div 
                key={index}
                className="group p-6 rounded-xl border border-border/50 bg-card/50 hover:bg-card hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
              >
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-primary/20 transition-all">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities Section */}
      <section id="capabilities" className="py-24 bg-secondary/30 border-y border-border/50">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-4xl font-bold mb-6">
                Complete Attack Visibility
              </h2>
              <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                From initial reconnaissance to lateral movement, MAYA captures every 
                attacker interaction and provides comprehensive intelligence for 
                incident response and threat hunting.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {capabilities.map((capability, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    <span className="text-sm">{capability}</span>
                  </div>
                ))}
              </div>

              <div className="mt-10">
                <Link href="/dashboard">
                  <Button className="gap-2">
                    View Live Dashboard
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>

            {/* Visual Element - Dashboard Preview Placeholder */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-accent/20 rounded-2xl blur-2xl" />
              <div className="relative rounded-xl border border-border bg-card p-2">
                <div className="rounded-lg border border-border bg-background p-6">
                  {/* Mock Dashboard UI */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary" />
                      <span className="text-sm font-semibold">MAYA Dashboard</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-xs text-muted-foreground">Live</span>
                    </div>
                  </div>
                  
                  {/* Mock Stats */}
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    {[
                      { label: "Active Honeypots", value: "12", color: "text-primary" },
                      { label: "Attackers Detected", value: "47", color: "text-destructive" },
                      { label: "Credentials Triggered", value: "23", color: "text-accent" }
                    ].map((stat, i) => (
                      <div key={i} className="text-center p-3 rounded-lg bg-secondary/50">
                        <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                        <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Mock Activity Feed */}
                  <div className="space-y-3">
                    {[
                      { action: "SSH Brute Force", source: "192.168.1.105", time: "2m ago" },
                      { action: "Credential Access", source: "10.0.0.42", time: "5m ago" },
                      { action: "Lateral Movement", source: "172.16.0.18", time: "8m ago" }
                    ].map((activity, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 text-sm">
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                          <span>{activity.action}</span>
                        </div>
                        <span className="text-muted-foreground">{activity.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="container mx-auto px-6">
          <div className="relative max-w-4xl mx-auto text-center">
            <div className="absolute inset-0 bg-primary/10 rounded-3xl blur-3xl" />
            <div className="relative rounded-2xl border border-primary/20 bg-gradient-to-b from-primary/10 to-accent/10 p-12">
              <Zap className="h-12 w-12 text-primary mx-auto mb-6" />
              <h2 className="text-4xl font-bold mb-4">
                Ready to Deploy Deception?
              </h2>
              <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
                Access your security operations dashboard and start monitoring 
                attacker activity in real-time.
              </p>
              <Link href="/dashboard">
                <Button size="lg" className="h-12 px-8 text-base gap-2">
                  Launch Dashboard
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border/50">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold">MAYA</span>
              <span className="text-sm text-muted-foreground">
                © {new Date().getFullYear()} Deception Platform
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <span>Built for enterprise security teams</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
