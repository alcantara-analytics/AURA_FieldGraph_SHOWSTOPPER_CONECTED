# AURA FieldGraph — showstopper demo script

## 0:00 — The problem

Field knowledge lives in conversations, photos and disconnected systems. A CRM can store data, but it usually cannot explain why a fact should be trusted.

## 0:30 — Capture a natural observation

Record or type:

> DemoCare Horizon has three MR systems installed around 2017.

AURA processes the observation locally and converts it into structured facts with provenance.

## 1:15 — Add visual evidence

Open **Scan equipment** and photograph a nameplate. VisionPsy Nano runs locally and extracts only details supported by the image: manufacturer, model, serial and modality when visible.

## 2:00 — Evidence fusion

Show the Evidence Graph. Voice/text and visual evidence are attached to the same asset. AURA calculates fact-level support and an overall Trust score.

## 2:45 — Conflict intelligence

Explain that contradictory values for the same field on the same asset are flagged. Different models on different assets are not treated as conflicts.

## 3:30 — Customer 360

Scroll to Customer 360. The installed base is generated from persisted local assets rather than a hardcoded dashboard object.

## 4:15 — Lifecycle action

The 2017 installation year produces a lifecycle insight because the equipment is approaching/reaching a replacement window. The insight is explicitly based on captured evidence.

## 5:00 — Privacy / technical close

QVAC inference and SQLite persistence are local-first. VisionPsy Nano is the central Psy model in the real image flow. No cloud API key is required by the repository.
