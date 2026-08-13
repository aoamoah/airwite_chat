# CLAUDE.md

## Project Name

**yɛhyia hyia**

## Project Purpose

**yɛhyia hyia** is a lightweight, Africa-focused video conferencing application built on top of LiveKit Meet.

The product is intended to address practical challenges commonly experienced by users in African environments, especially:

- Unreliable or unstable internet connectivity
- Expensive mobile data
- Mobile-first usage
- Limited device capabilities
- The need for a simple conferencing experience without exposing technical configuration to normal users
- Future multilingual and context-aware communication features

Primary early user groups include:

- Students and online learning groups
- Churches, Christian fellowships, prayer groups, Bible study groups, and other online religious gatherings

The product should remain lightweight, practical, mobile-friendly, and easy to use.


---

# BRANDING AND REBRANDING

The official product name is:

> **yɛhyia hyia**

This project is being completely rebranded.

LiveKit Meet is the technical foundation, not the public-facing product identity.

Claude must treat **yɛhyia hyia** as the application/product name everywhere unless the user explicitly requests otherwise.

## Rebranding rules

When working on UI, metadata, documentation, configuration, or deployment:

- Replace visible references to "LiveKit Meet" with "yɛhyia hyia" where they refer to the product/application.
- Do NOT rename underlying LiveKit SDK packages, APIs, environment variables, protocol names, source imports, or infrastructure concepts where doing so would break functionality or create unnecessary forks.
- Preserve references to LiveKit when they are technically accurate and developer-facing.
- Remove or replace inherited logos, favicons, titles, descriptions, Open Graph metadata, manifests, and user-facing copy that expose the original LiveKit Meet branding.
- Check mobile metadata and PWA/app-manifest branding if present.
- Check page titles and browser-tab titles.
- Check default room/landing-page text.
- Check README/project documentation where the old product name appears.
- Check deployment metadata and environment-driven branding values.
- Do not perform blind global search-and-replace on the word "LiveKit", because LiveKit remains the real conferencing technology used internally.

The intended separation is:

```text
Public product:
yɛhyia hyia

Technical conferencing foundation:
LiveKit
```

## Branding consistency

Use the spelling exactly as:

```text
yɛhyia hyia
```

Do not silently change it to:

```text
Yehyia Hyia
Yɛhyia Hyia
YehyiaHyia
Hyia Hyia
```

unless the user explicitly approves an alternative display form.

When a technical constraint cannot safely handle the `ɛ` character—for example certain identifiers, package names, environment variable prefixes, domains, database identifiers, or code symbols—use a safe ASCII/internal identifier only where necessary.

Possible internal identifiers may include:

```text
yehyia-hyia
yehyia_hyia
YEHYIA_HYIA
```

These are implementation identifiers only.

The visible brand should remain:

> **yɛhyia hyia**


---

# 1. MOST IMPORTANT INSTRUCTION: INSPECT THE PROJECT FIRST

Before making architectural assumptions, generating code, restructuring files, or following any implementation detail in this document:

1. Inspect the current repository.
2. Identify what has already been implemented.
3. Identify the current framework, folder structure, services, components, configuration, routes, APIs, database libraries, and naming conventions.
4. Compare the actual project state with this `CLAUDE.md`.
5. If this file contains instructions that conflict with the existing implementation, prefer the existing working implementation unless it is clearly broken, insecure, or the user explicitly requests a redesign.
6. Update your working assumptions based on what currently exists in the repository.
7. Do not recreate functionality that already exists.
8. Do not replace working implementations unnecessarily.
9. Extend the project incrementally.
10. Preserve backwards compatibility where practical.

Treat this document as project direction, not as proof of the current implementation.

When the repository has evolved beyond statements in this file, correct your interpretation of these instructions according to the actual codebase.

Do not blindly follow stale instructions.

---

# 2. CURRENT KNOWN PROJECT STATE

Last reviewed: 2026-08-13.

The following features and decisions are currently known.

## Implemented

### LiveKit-based conferencing

The application is based on LiveKit Meet / LiveKit conferencing infrastructure.

Existing LiveKit functionality should be reused rather than rebuilding WebRTC functionality manually.

### Annotation

Annotation functionality has already been implemented.

Before modifying annotation:

- inspect the existing implementation;
- preserve existing working behavior;
- reuse existing components and state where possible;
- avoid creating a duplicate annotation system.

### AirWrite

AirWrite has been added or partially implemented.

However, AirWrite currently has GPU-related challenges.

For now:

- treat AirWrite as an experimental/deferred feature;
- do not make AirWrite mandatory for the application to function;
- do not allow AirWrite GPU failures to break normal conferencing;
- keep AirWrite behind an administrator-controlled feature flag;
- the client should not see AirWrite configuration such as frame windows, model settings, GPU configuration, inference settings, or debugging details.

AirWrite is now behind the `airwrite` feature flag and is off by default. When
the flag is off the control is not mounted at all, so no model manifest,
MediaPipe runtime, or ONNX session is ever fetched. Its technical readout sits
behind the AirWrite diagnostics flag and is hidden from ordinary participants.

The remaining GPU work can be revisited later.

### Administration

Implemented. `/admin` and `/admin/login`, protected server-side by a session
check in each page and route handler rather than by middleware.

- Administrator records and sessions are in PostgreSQL, via Prisma.
- Passwords are hashed with Argon2id (`@node-rs/argon2`).
- Sessions are opaque random tokens in an HTTP-only cookie. The database stores
  only a SHA-256 digest of the token, so a leaked table cannot be replayed, and
  there is no signing secret to manage.
- `pnpm admin:create` creates or resets an administrator account.
- The login attempt throttle lives in process memory and is therefore
  per-instance. Move it into PostgreSQL before running more than one instance.

### Feature configuration

Implemented in `lib/config/`. See section 5.

`DebugMode`, the Shift+D LiveKit panel, used to be mounted for every
participant; it is now gated behind the connection-statistics flag.

### Branding

The rebrand to **yɛhyia hyia** is done: titles, metadata, icons, link preview,
landing copy, README, and package name. Remaining LiveKit references are
deliberate — developer-facing text, and a credit in the footer.

---

# 3. CORE PRODUCT PRINCIPLE

The application must have two clearly separated experiences:

1. Administrator experience
2. Client/participant experience

The client-facing application must remain simple.

Technical settings belong in the admin area.

Normal users should only see features that are enabled and available to them.

---

# 4. ADMIN SIDE

Create or maintain a dedicated administration interface.

The administration interface is responsible for controlling application behavior.

## Admin responsibilities

The admin should eventually be able to control:

- Feature availability
- Experimental features
- Debug settings
- Annotation availability
- AirWrite availability
- Network/debug information visibility
- Meeting features
- Client-facing feature visibility
- Future projection features
- Future file-related functionality
- Other application-level feature flags

The admin interface should expose settings through clear human-readable controls such as:

- Toggle switches
- Checkboxes
- Dropdowns
- Numeric fields where appropriate

Avoid requiring administrators to manually edit JSON.

---

# 5. FEATURE FLAGS AND SETTINGS

Implemented in `lib/config/`, backed by PostgreSQL rather than a JSON file.

A JSON file was built first and then replaced. The deployment target has an
ephemeral filesystem, so a saved setting would be lost on every redeploy. The
whole configuration is now one JSON document in a single `app_settings` row,
which also makes a save all-or-nothing — a row per key would let a partial write
look like a valid config with keys missing.

The stored shape is:

```json
{
  "features": {
    "annotation": true,
    "airwrite": false
  },
  "debug": {
    "enabled": false,
    "showConnectionStats": false,
    "showAirWriteDiagnostics": false
  }
}
```

Only flags that something actually reads are present. Keys such as `chat` and
`screenShare` are deliberately absent: LiveKit's `VideoConference` bundles those
controls into its own control bar, so a toggle for them would be an admin
control that visibly does nothing. Add a key when its UI becomes gateable, not
before.

Do not introduce a second, conflicting settings system.

## Important rules

- Do not store admin passwords, database passwords, or API secrets in the settings document.
- Do not expose the full configuration to clients.
- Validate and normalise the document before saving; unknown keys and wrong types are dropped.
- Use sensible defaults if the configuration is unavailable or invalid, and keep serving the last known-good document during a database outage rather than silently reconfiguring live meetings.
- Saves run inside a transaction holding a PostgreSQL advisory lock, so two administrators saving at once cannot lose each other's changes.
- Keep feature keys stable once used by the client. Renaming a key silently resets an administrator's saved choice to the default.

---

# 6. ADMIN AUTHENTICATION

Administrator credentials must be stored in PostgreSQL.

The PostgreSQL database connection details will be provided by the project owner.

Do not hardcode PostgreSQL credentials.

Use environment variables or the existing secure configuration mechanism.

Required environment variable:

```env
DATABASE_URL=
```

`ADMIN_SESSION_SECRET` is **not** used. Sessions are opaque database-backed
tokens rather than signed cookies, so there is no signing key to keep. Do not
reintroduce one.

## Credential rules

Admin passwords must NEVER be stored as plain text.

Argon2id is in use, via `@node-rs/argon2`, at the OWASP baseline of 19 MiB
memory, two passes, one lane. The parameters are recorded inside each encoded
hash, so raising them later does not invalidate existing passwords.

A minimal administrator entity may contain:

```text
id
username/email
password_hash
role
created_at
updated_at
last_login
is_active
```

Do not overengineer the first version.

If the project already contains authentication or a user model, inspect it before introducing a new auth system.

---

# 7. ADMIN SESSION SECURITY

Admin routes and APIs must be protected.

The application must prevent normal meeting participants from accessing administrator functionality.

Depending on the existing architecture, use an appropriate mechanism such as:

- secure server-side sessions;
- HTTP-only secure cookies;
- signed session tokens;
- existing authentication middleware.

Do not store sensitive administrator authentication tokens in insecure client-side storage when avoidable.

Protect:

```text
/admin
/admin/*
/api/admin/*
```

or the equivalent routes used by the project.

---

# 8. CLIENT-FACING EXPERIENCE

The client-facing application should hide technical complexity.

The client should NOT be required to understand:

- AirWrite frame windows
- Computer vision parameters
- GPU status
- Model inference configuration
- WebRTC diagnostics
- Bitrate tuning
- Codec configuration
- LiveKit internals
- Debug flags
- Internal feature configuration
- JSON settings

Instead, the user sees simple product-level functionality.

Example:

Bad client UI:

```text
AirWrite Frame Window: 24
Inference Device: CUDA:0
Detection Threshold: 0.67
Frame Skip: 3
```

Good client UI:

```text
AirWrite
Enabled
```

Or, if AirWrite is disabled by admin, the client should not see the feature at all.

---

# 9. FEATURE AVAILABILITY RULE

The administrator decides which optional features are available.

Client-facing components should read normalized application settings.

The implemented flow:

```text
Admin toggles Annotation ON
        ↓
app_settings row updated (PUT /api/admin/settings)
        ↓
server component reads the config
        ↓
client receives only the public feature configuration
        ↓
Annotation button appears
```

If:

```text
AirWrite = false
```

then AirWrite should:

- not appear in the main meeting controls;
- not initialize unnecessary GPU/computer-vision resources;
- not load expensive models where avoidable;
- not affect application startup;
- not generate client errors.

Feature flags should control both visibility and unnecessary initialization where practical.

---

# 10. PUBLIC SETTINGS VS PRIVATE SETTINGS

Do not send the entire admin configuration to the browser.

Create a distinction between:

## Private settings

Visible only to server/admin.

Examples:

- debug internals;
- infrastructure configuration;
- database configuration;
- secrets;
- experimental parameters;
- AirWrite technical configuration.

## Public feature configuration

Safe for meeting clients.

Example:

```json
{
  "annotation": true,
  "airwrite": false,
  "chat": true,
  "screenShare": true,
  "dataSaver": true
}
```

Expose only what the client needs.

---

# 11. LIGHTWEIGHT-FIRST DEVELOPMENT

The application must remain lightweight.

When adding features:

1. Avoid loading large dependencies globally when the feature is optional.
2. Lazy-load expensive components.
3. Avoid unnecessary animations.
4. Avoid unnecessary background polling.
5. Avoid loading AI/computer-vision models when disabled.
6. Minimize client JavaScript where practical.
7. Preserve fast mobile loading.
8. Keep meeting startup simple.
9. Prefer audio continuity over high video quality when network conditions deteriorate.
10. Avoid introducing infrastructure that is unnecessary for the current MVP.

Before adding a dependency, check whether the project or browser platform already provides the required capability.

---

# 12. AFRICA-FOCUSED PRODUCT DIRECTION

The application should continue to evolve around the following product principles.

## Low-bandwidth operation

The product should eventually support intelligent low-bandwidth behavior.

Examples:

- reduced video resolution;
- reduced frame rate;
- audio-first fallback;
- limited participant video;
- adaptive quality;
- network-quality indication;
- Data Saver mode.

Use LiveKit functionality wherever possible rather than implementing media adaptation from scratch.

## Mobile-first experience

Every major feature should be tested for:

- small screens;
- touch interaction;
- portrait mode;
- lower-powered devices;
- unreliable mobile networks.

Desktop-only features should not become core dependencies.

## Multilingual communication

African-language support is part of the long-term product direction.

Possible future languages include:

- Twi
- Ga
- Ewe
- Hausa
- Yoruba
- Swahili
- French
- Portuguese

Do not attempt to implement all multilingual functionality prematurely.

---

# 13. TARGET USER MODES

The initial product direction includes two important user groups.

## Education / Student use

Potential features include:

- online classes;
- group discussions;
- screen sharing;
- document projection;
- annotation;
- lecturer-focused layouts;
- low-data participation;
- raise hand;
- study sessions.

## Church / Christian gathering use

Potential features include:

- Bible study;
- online prayer meetings;
- fellowship meetings;
- sermons;
- speaker-focused layout;
- Bible verse projection;
- presentation projection;
- prayer requests;
- congregation reactions;
- low-data listening mode.

Do not split the application into completely separate products unless needed.

Prefer configurable meeting experiences.

---

# 14. FUTURE FEATURE: SMART BIBLE VERSE PROJECTION

Smart Bible verse projection is planned for a later phase.

Possible behavior:

```text
Speaker says or types:
"John 3:16"

        ↓

System detects reference

        ↓

Verse content is prepared

        ↓

Host confirms projection

        ↓

Verse appears as a presentation overlay
```

Possible future capabilities:

- detect Bible references from speech;
- detect references from chat;
- manual verse search;
- choose Bible translation;
- project verse to participants;
- presenter-controlled next/previous verse;
- save verses referenced during meeting;
- combine verses with annotations.

Do not implement this until the core conferencing experience and admin configuration are stable unless explicitly requested.

Design current code so this feature can be added without rewriting the meeting system.

---

# 15. FUTURE FEATURE: POWERPOINT / PDF PROJECTION

Future versions should support presentation of:

- PowerPoint files
- PDF files

The preferred long-term approach should consider bandwidth efficiency.

Instead of requiring the host to continuously screen-share static slides, consider:

```text
Upload document once
        ↓
participants receive/render document
        ↓
presenter synchronizes page/slide number
```

This can significantly reduce bandwidth compared with streaming a screen at video frame rates.

Possible functionality:

- upload PDF;
- upload PowerPoint;
- convert unsupported formats safely where required;
- presenter-controlled slide navigation;
- synchronized slide number;
- participant independent view where appropriate;
- annotation over projected content;
- mobile-friendly rendering.

Do not overbuild this before the base architecture is stable.

---

# 16. FUTURE FEATURE: FILE HANDLING

File functionality will be added later.

Potential capabilities:

- meeting file uploads;
- document sharing;
- meeting attachments;
- download permissions;
- presentation files;
- images;
- post-meeting resources.

When implemented:

- validate MIME/file type;
- enforce file-size limits;
- sanitize filenames;
- prevent path traversal;
- use secure storage;
- avoid trusting client-provided MIME information alone;
- define retention rules.

Do not store arbitrary uploaded files directly inside the Git repository.

---

# 17. FUTURE FEATURE: USER DATA PERSISTENCE

Persistent application/user data will be added later.

Potential persisted data may include:

- user profiles;
- meetings;
- meeting history;
- preferences;
- organizations;
- attendance;
- files;
- meeting metadata;
- administrative configuration versions;
- future transcripts;
- future decisions/actions.

PostgreSQL is the preferred database direction unless the existing application architecture indicates otherwise.

Do not prematurely persist transient LiveKit state that LiveKit already manages effectively.

---

# 18. DEBUGGING

Debugging capabilities belong primarily on the admin/developer side.

Possible debug controls:

- enable debug mode;
- show connection state;
- show LiveKit events;
- show participant metadata;
- show bitrate/quality information;
- show reconnection information;
- show AirWrite diagnostics;
- show performance measurements.

When debug mode is disabled:

- technical debug UI should disappear;
- unnecessary debug logging should be reduced;
- sensitive internal details must not be exposed to clients.

Never expose secrets in logs.

---

# 19. ERROR HANDLING

The application should fail gracefully.

Examples:

## AirWrite failure

AirWrite fails:

```text
AirWrite unavailable
```

The meeting continues.

## Settings failure

Settings file cannot be read:

```text
load safe default feature configuration
```

The meeting continues.

## Database failure

Admin authentication/database functionality may become unavailable, but public meeting functionality should not crash unnecessarily if the architecture allows graceful isolation.

## Camera unavailable

Allow audio-only participation.

## Poor network

Reduce quality or clearly inform the user without overwhelming them with engineering terminology.

---

# 20. ARCHITECTURAL BOUNDARIES

Prefer clear separation between:

```text
UI
│
├── Client meeting interface
└── Admin interface

Application services
│
├── Feature configuration
├── Admin authentication
├── Meeting/application logic
└── Future persistence

Infrastructure
│
├── LiveKit
├── PostgreSQL
├── File/config storage
└── Future external services
```

Do not tightly couple:

- LiveKit logic;
- admin configuration;
- AirWrite;
- annotation;
- future document projection.

Each optional feature should have a clear boundary.

---

# 21. FEATURE MODULE GUIDELINE

Optional features should preferably follow a pattern conceptually similar to:

```text
features/
  annotation/
  airwrite/
  bible-projection/
  document-projection/
```

However, DO NOT reorganize the project merely to match this example.

Inspect the repository first.

Follow the project's current structure if it is already clean.

The important requirement is logical separation, not a specific directory name.

---

# 22. DO NOT REWRITE THE PROJECT UNNECESSARILY

Claude must not perform broad rewrites simply because a different architecture is theoretically cleaner.

Before refactoring:

1. explain internally what actual problem the refactor solves;
2. inspect dependent components;
3. preserve existing functionality;
4. prefer small focused changes;
5. avoid changing unrelated code.

The short-term objective is a functional, deployable lightweight product.

---

# 23. CURRENT PRIORITY ORDER

Unless the user explicitly changes priorities, prefer this order:

## Priority 1 — Stability — holding

- Existing meeting functionality must work.
- Audio/video must remain functional.
- Annotation must remain functional.

## Priority 2 — Admin system — done

- Admin login
- PostgreSQL admin credentials
- Protected admin routes
- Admin feature toggles

## Priority 3 — Configuration — done

- Persist application feature settings
- Load feature settings safely
- Provide public feature configuration
- Make disabled features disappear cleanly

## Priority 4 — Lightweight client experience — partly done

- Remove/hide technical controls — done: the AirWrite readout and the LiveKit
  debug panel are both behind admin flags.
- Avoid unnecessary resource loading — done for AirWrite.
- Mobile-friendly UI — **not yet audited on real devices.**
- Simple controls — not yet reviewed.

## Priority 5 — Africa-focused network features — not started

- Data Saver
- network quality
- weak-connection handling

This is the next substantial block of work, and the one the product exists for.
LiveKit already provides most of the machinery — adaptive stream and dynacast
are on, and connection quality is observable — so the open questions are product
decisions: what Data Saver switches off, what a participant sees as their
connection degrades, and whether video is sacrificed before audio.

## Priority 6 — Deferred/experimental functionality

- AirWrite GPU work. Now safe to revisit: it is behind a flag and cannot break a
  meeting. Still blocked on the browser/GPU question, not on this codebase.

## Priority 7 — Future extensions

- Smart Bible verse projection
- PowerPoint projection
- PDF projection
- file handling
- user data persistence
- multilingual AI
- advanced meeting intelligence

---

# 24. WHEN IMPLEMENTING A NEW REQUEST

For every new coding task:

1. Inspect relevant existing files first.
2. Search for existing implementations.
3. Determine whether the requested feature already partially exists.
4. Identify the smallest safe change.
5. Follow current project naming conventions.
6. Reuse existing dependencies when reasonable.
7. Do not duplicate state.
8. Do not introduce unnecessary libraries.
9. Keep optional features optional.
10. Verify the application still builds after changes.
11. Check mobile impact.
12. Check whether the change affects admin/public separation.
13. Check whether disabled features still load unnecessary resources.
14. Update documentation when architecture materially changes.

---

# 25. SELF-CORRECTION RULE

Claude should continuously correct its project assumptions.

If a previous instruction says:

```text
Feature X is not implemented
```

but inspection shows Feature X exists, Claude must treat the codebase as authoritative and stop acting as if Feature X is missing.

If this document says:

```text
Use mechanism A
```

but the project already uses a secure, working mechanism B, do not replace B merely to satisfy this file.

If this document describes an example file path that does not exist, locate the real equivalent.

If implementation decisions have changed, adapt.

This is especially important because this project is evolving quickly.

---

# 26. DOCUMENTATION MAINTENANCE

When major project changes are completed, update the relevant "Current Known Project State" sections of this file if appropriate.

Do not rewrite this file automatically after every small UI change.

Update it when changes materially affect:

- architecture;
- implemented/deferred features;
- admin/configuration design;
- database strategy;
- major product priorities.

The goal is to prevent future Claude sessions from operating on stale assumptions.

---

# 27. DEVELOPMENT STYLE

Prefer:

- simple readable code;
- small components;
- clear interfaces;
- explicit types;
- predictable state;
- reusable services;
- comments only where they add real value;
- secure defaults;
- progressive enhancement;
- graceful failure.

Avoid:

- huge components;
- unnecessary abstractions;
- premature microservices;
- duplicated feature configuration;
- hardcoded credentials;
- leaking server configuration to clients;
- making experimental features mandatory;
- adding heavyweight dependencies for trivial tasks.

---

# 28. ACCEPTANCE CRITERIA FOR THE NEXT MAJOR MILESTONE

The next major milestone should be considered successful when:

1. Existing conferencing works.
2. Annotation still works.
3. AirWrite can remain disabled without affecting normal conferencing.
4. An administrator can authenticate.
5. Admin credentials are stored securely in PostgreSQL.
6. Admin routes are protected.
7. Admin can toggle application features.
8. Feature settings persist.
9. Client receives only safe public feature settings.
10. Disabled features do not appear to clients.
11. Technical debug settings are hidden from normal users.
12. The application remains mobile-friendly.
13. The application remains deployable.
14. No credentials or secrets are committed to source control.

## Status as of 2026-08-13

Points 1–11 and 14 are met and were verified end to end against the real
database and a production build.

Point 12 (mobile-friendly) has **not** been audited on real devices since the
admin UI was added.

Point 13 (deployable) is **untested on the target host**. Before a deploy:
`DATABASE_URL` and `NEXT_PUBLIC_SITE_URL` must be set there, `pnpm db:deploy`
must run as part of the release, and `pnpm admin:create` must be run once to
seed an administrator.

---

# 29. FINAL GUIDING PRINCIPLE

**yɛhyia hyia** must not become a feature-heavy Zoom clone.

Build a lightweight conferencing platform designed around real user constraints.

The product should progressively become:

```text
Reliable conferencing
        +
Low-data usage
        +
Mobile-first UX
        +
Africa-focused communication
        +
Education tools
        +
Christian gathering tools
```

Every major feature should be evaluated against this question:

> Does this make conferencing simpler, lighter, more reliable, or more useful for the intended users?

If not, it should not be prioritized.
