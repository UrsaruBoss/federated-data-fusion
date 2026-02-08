# Federated Data Fusion (FDF)

![JavaScript](https://img.shields.io/badge/JavaScript-ES2023-yellow?style=flat-square\&logo=javascript)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square\&logo=react)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square\&logo=docker)
![Status](https://img.shields.io/badge/Status-Operational-green?style=flat-square)
![Classification](https://img.shields.io/badge/Classification-Open%20Source-grey?style=flat-square)

**Federated Data Fusion (FDF)** is a full-stack **situational awareness and command dashboard** built to demonstrate real-time data fusion, operational monitoring, and event correlation.

The system combines a **Python/FastAPI backend** with a **React/Redux frontend**, connected through REST APIs and **Server-Sent Events (SSE)** for live updates.

---

## Live Demo / Media

[**LIVE DEMO**](https://dashboard.rusin.ro)

---

## Repository Structure

```
root/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── generators.py
│   │   ├── redis_client.py
│   │   ├── config.py
│   │   └── routes/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── docker-compose.yml
│
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── layouts/
│   │   ├── store/
│   │   ├── views/
│   │   └── tests/
│   └── package.json
│
└── README.md
```

---

## Backend Overview

### Technology Stack

* Python
* FastAPI
* Pydantic / pydantic-settings
* Redis
* Server-Sent Events (SSE)
* Docker

### Core Domain Objects

#### Event

Represents a detected or inferred situation in space and time.

* `severity`: low / medium / high / critical
* `lat`, `lon`
* confidence score
* timestamped

#### Asset

Represents a monitored entity (sensor, vehicle, platform).

* `status`: active / degraded / offline
* position & last update time
* owner/team metadata

#### Alert

Represents a correlated warning for operators.

* `priority`: p1 / p2 / p3
* optional link to an event or asset
* human-readable message

---

### Backend Responsibilities

* Generate synthetic events, assets, and alerts
* Maintain shared state in Redis
* Expose REST APIs for querying state
* Stream live updates via SSE
* Provide admin endpoints for scenario control and reset

---

### Key API Endpoints

```
GET  /api/events
GET  /api/assets
GET  /api/alerts

GET  /api/health
GET  /api/stream        # SSE

GET  /api/admin/state
POST /api/admin/scenario
POST /api/admin/reset
```

---

### Health Endpoint

The `/api/health` endpoint reports:

* API operational status
* uptime
* entity counts
* Redis dependency status
* freshness timestamps

This endpoint feeds the frontend **Health View** directly.

---

### Redis Usage

Redis is used for:

* centralized state storage
* fast lookup and counters
* pub/sub fan-out for SSE clients

The backend uses a single centralized Redis client to allow easy replacement with Redis Sentinel or Cluster if needed.

---

## Frontend Overview

### Technology Stack

* React 18
* Redux Toolkit
* Material UI
* Native EventSource (SSE)

---

### Frontend Responsibilities

* Maintain normalized application state (events, assets, alerts)
* Perform periodic full syncs via REST
* Apply incremental updates via SSE
* Persist cache in `localStorage` for fast reloads
* Render operational dashboards and command views

---

### Main Views

#### Ops View

* Tabular live view of events, assets, and alerts
* KPI cards (status, severity, priority)
* Interactive 2D map
* Row selection syncs with map focus

#### Wall View

* Full-screen command wall layout
* Large KPIs optimized for displays
* Live map and alert ticker
* Minimal operator interaction

#### Health View

* API and dependency status
* Redis health and hit rate
* SSE connection status
* Client-side error tracking

---

## Real-Time Data Flow

1. Backend generators produce synthetic data
2. Data is written to Redis
3. Backend publishes updates via SSE
4. Frontend receives events and updates Redux store
5. UI re-renders in near real time

REST polling is used as a safety net and for cold-start hydration.

---

## Running the Project (Docker)

### Backend

```
cd backend
docker-compose up --build
```

Backend will be available at:

```
http://localhost:8000
```

---

### Frontend

```
cd frontend
npm install
npm run dev
```

Frontend will be available at:

```
http://localhost:5173
```

---

## Environment Configuration

Backend configuration is managed via environment variables and `config.py`:

* `REDIS_URL`
* `ADMIN_COOLDOWN_SEC`
* `EVENT_RATE_SEC`
* `ASSET_RATE_SEC`
* `ALERT_RATE_SEC`
* `API_CORS_ORIGINS`

All values have sensible defaults for local development.

---

## Testing

Frontend includes unit tests for:

* OpsView
* WallView
* HealthView
* Layout and navigation logic

Tests use Jest and React Testing Library with mocked SSE and DataGrid components.

---

## Project Goals

This project is intended to demonstrate:

* clean separation between simulation, API, and UI
* real-time data delivery with SSE
* resilient frontend state management
* operational UI design for monitoring environments

It is **not** a production system, but an extensible and realistic foundation for experimentation and demos.

---

## License

Open Source. Free to use, modify, and extend.
