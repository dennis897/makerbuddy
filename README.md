# MakerBuddy

MakerBuddy is a self-hosted 3D printer management app combining the best of two worlds:

- **BamBuddy** — Bambu Lab printer monitoring, MQTT control, print queue, camera streaming, inventory, spool tracking, and more
- **MakerVault** — File manager and project manager purpose-built for maker files (STL, 3MF, OBJ, STEP, GCODE, SCAD, SVG, CRV) with 3D preview, tag system, and slicer integration

## What's included

| Feature | Source |
|---|---|
| Bambu Lab printer monitoring | BamBuddy |
| MQTT real-time control | BamBuddy |
| Print queue & archives | BamBuddy |
| Camera streaming | BamBuddy |
| Filament inventory | BamBuddy |
| Spool management (SpoolBuddy) | BamBuddy |
| Maker file manager (STL/3MF/etc.) | MakerVault |
| Project organizer | MakerVault |
| 3D model viewer | MakerVault |
| Tag system with colors | MakerVault |
| URL import & bulk folder import | MakerVault |
| OrcaSlicer / Bambu Studio launch | MakerVault |

## Quick start

```bash
docker compose up -d
```

Default port: **8000**

## Reference source

The original MakerVault source is preserved in `makervault-reference/` for reference.

## Stack

- **Backend:** FastAPI + SQLAlchemy (async) — SQLite by default, PostgreSQL optional
- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS
- **Real-time:** MQTT (Bambu Lab printer protocol)
- **3D viewer:** Three.js + @react-three/fiber
