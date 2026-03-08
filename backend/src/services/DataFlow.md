   Architecture Overview

 ┌─────────────────────────────────────────────────────────────────────────┐
 │                         DATA FLOW FROM VM TO DASHBOARD                  │
 └─────────────────────────────────────────────────────────────────────────┘
 
  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
  │  VM (Vagrant)│     │  Backend     │     │   Frontend   │
  │              │     │  (Node.js)   │     │   (React)    │
  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘
         │                    │                    │
         │ 1. Attack happens  │                    │
         │    (SSH brute      │                    │
         │     force, etc.)   │                    │
         ▼                    │                    │
  ┌──────────────┐            │                    │
  │syslogd-helper│            │                    │
  │  (Rust)      │            │                    │
  └──────┬───────┘            │                    │
         │                    │                    │
         │ 2. Writes to       │                    │
         │    /var/lib/.syscache
         │    (CRDT JSON)     │                    │
         ▼                    │                    │
  ┌──────────────┐            │                    │
  │  CRDT State  │            │                    │
  │    File      │            │                    │
  └──────┬───────┘            │                    │
         │                    │                    │
         │ 3. Poll every 10s  │                    │
         │    (CRDTSyncService)                    │
         │                    │                    │
         ├───────────────────►│                    │
         │                    │                    │
         │ 4. Parse & Save    │                    │
         │    to MongoDB      │                    │
         │    - Attacker      │                    │
         │    - AttackEvent   │                    │
         │    - Credential    │                    │
         │    - LateralMovement                    │
         │                    │                    │
         │ 5. WebSocket       │                    │
         │    Broadcast       │                    │
         ├────────────────────────────────────────►│
         │                    │                    │
         │ 6. API Requests    │                    │
         │    (Dashboard)     │                    │
         ├────────────────────────────────────────►│
         │                    │                    │
         │ 7. Render Dashboard│                    │
         │    - Timeline      │                    │
         │    - MITRE Matrix  │                    │
         │    - Behavior      │                    │
         └─────────────────────────────────────────►│

    ---
