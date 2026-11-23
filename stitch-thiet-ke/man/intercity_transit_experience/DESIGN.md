---
name: Intercity Transit Experience
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#3e4944'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#6e7a74'
  outline-variant: '#bdc9c2'
  surface-tint: '#006c52'
  primary: '#005f48'
  on-primary: '#ffffff'
  primary-container: '#0b7a5e'
  on-primary-container: '#a7ffdd'
  inverse-primary: '#7cd8b6'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#764900'
  on-tertiary: '#ffffff'
  tertiary-container: '#975f00'
  on-tertiary-container: '#ffead5'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#98f5d2'
  primary-fixed-dim: '#7cd8b6'
  on-primary-fixed: '#002117'
  on-primary-fixed-variant: '#00513d'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display:
    fontFamily: Be Vietnam Pro
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  display-mobile:
    fontFamily: Be Vietnam Pro
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Be Vietnam Pro
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.005em
  headline-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
  body-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Be Vietnam Pro
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  label-md:
    fontFamily: Be Vietnam Pro
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style
The design system delivers an intuitive, secure, and reassuring digital environment for intercity transit across Vietnam. It speaks to domestic commuters, cross-country backpackers, and family holiday planners who prioritize punctuality, clear pricing, and reliable service. 

The aesthetic is Modern Trustworthy Travel—drawing inspiration from contemporary global travel hubs while honoring regional usability requirements like bilingual clarity (Vietnamese tone marks and English) and high-density route comparisons. The visual demeanor balances corporate credibility with hospitality warmth. Generous breathing room, structural hierarchy, and polished micro-interactions replace clutter, giving travelers peace of mind at every step from seat selection to instant QR boarding pass delivery.

## Colors
The palette is rooted in safety, vitality, and verified quality:
- **Primary (`#0b7a5e`)**: A deep, stabilizing jade green representing security, road safety, and long-standing operational pedigree. Used for primary calls-to-action, key route lines, and selected states.
- **Secondary (`#10b981`)**: An active emerald/mint providing energetic feedback, instant payment validations, and positive amenities indicators (e.g., Wi-Fi, sleeper berth, reclining seats).
- **Tertiary (`#f59e0b`)**: A warm amber accent reserved for high-priority micro-moments—seat scarcity notices, early-bird badges, operator ratings, and departure alerts.
- **Neutrals & Surfaces**: Built upon `#f8fafc` (canvas base) and pure `#ffffff` (elevated card containers), paired with slate neutrals (`#64748b` for secondary labels, `#0f172a` for high-contrast reading). Clean divider lines use an ultra-subtle tint (`#e2e8f0`).

## Typography
`Be Vietnam Pro` is specified across all hierarchy tiers. Designed specifically with Vietnamese tone marks and complex diacritics in mind, it prevents awkward vertical clipping and optical shifts while rendering clear, balanced letterforms.

- **Headlines & Display**: Set with tighter letter spacing (`-0.01em` to `-0.02em`) and bold weights (`600` / `700`) to anchor booking hero banners and terminal destination titles (e.g., "Sài Gòn → Đà Lạt").
- **Body & Numerics**: Set at regular (`400`) and medium (`500`) weights with open line-height ratios (`1.5` to `1.6`) to maintain legibility across fare rules, luggage allowances, and transit timeline stops.
- **Labels & Microcopy**: Compact weights with subtle positive letter tracking (`+0.02em`) to guarantee quick recognition on mobile status chips, seat numbers, and license plate badges.

## Layout & Spacing
The layout follows a 12-column responsive fluid grid system designed to support dense transactional data while preserving an uncluttered reading environment:
- **Desktop (≥ 1024px)**: 12 columns with `24px` (`1.5rem`) gutters and an outer container margin capped at `1280px` max-width. Trip search filters lock into a sticky 4-column rail while search results stream across the remaining 8 columns.
- **Tablet (768px – 1023px)**: 8 columns with `16px` (`1rem`) gutters. Search controls collapse into an expandable top tray, letting vehicle cards take full container width.
- **Mobile (≤ 767px)**: 4 columns with `16px` margins. Layout relies on bottom sheets for seat layout selection and sticky bottom summary bars for instant checkout actions.
- **Spacing Rhythm**: Governed strictly by 4px/8px increments. Component interior spacing scales predictably from `space-xs` (tight badge padding) through `space-xl` (section break spacing).

## Elevation & Depth
Depth conveys progression and trust through clean, multi-layered ambient diffusion rather than harsh drop shadows:

- **Base Layer (Flat)**: Background set to `#f8fafc`. Secondary containers and inactive search panels use structural hairline borders (`1px solid #e2e8f0`).
- **Elevated Cards (Level 1)**: Primary route result cards and filter blocks rest on `#ffffff` surfaces with a compound soft shadow: `0 1px 3px rgba(15, 23, 42, 0.04), 0 6px 16px -4px rgba(15, 23, 42, 0.06)`.
- **Interactive Hover & Overlay (Level 2)**: Hovered bus cards, date-picker popovers, and sticky checkout summaries cast a deep, smooth elevation: `0 10px 25px -5px rgba(11, 122, 94, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04)`.
- **Modals & Bottom Drawers (Level 3)**: Interactive sleeper seat maps and operator policy modals receive a high-dispersion backdrop drop: `0 20px 35px -8px rgba(15, 23, 42, 0.16)` with a backdrop blur `rgba(15, 23, 42, 0.36)`.

## Shapes
A roundedness factor of `2` provides a balance between modern friendliness and dependable structure:
- **Standard Controls**: Buttons, inputs, search dropdowns, and rating tags use `0.5rem` (8px) for crisp edge containment.
- **Cards & Panels (`rounded-lg`)**: Ticket cards, station transit nodes, and promotional banners adopt `1rem` (16px) or the platform standard `12px` (`rounded-xl` equivalent in mobile app contexts) to create soft, approachable frame boundaries.
- **Badges & Pills (`rounded-full`)**: Punctuality scores, remaining seat counters, and transit vehicle classifications (e.g., "Limousine 24 Phỏng") utilize pill shapes to quickly stand out against orthogonal card layouts.

## Components

### Buttons
- **Primary**: Solid `#0b7a5e` background, `#ffffff` text, font-weight 600, height 48px, radius 8px (`space-sm` roundedness). Subtle transform micro-interaction (`translate-y(-1px)`) on hover with shadow expansion.
- **Secondary**: `#ffffff` background with 1.5px border in `#0b7a5e`, `#0b7a5e` text. Used for "View Policy" and "Change Route".
- **Ghost/Tertiary**: Transparent background with `#64748b` text, transforming to `#f1f5f9` on hover.

### Chips & Badges
- **Operator Rating Badge**: Warm amber background (`#fef3c7`) with `#b45309` text, containing a star icon, rating (e.g., "4.8"), and verified review count.
- **Amenity Chips**: Neutral gray-100 surfaces (`#f1f5f9`) with slate iconography and compact 12px labels for features like "Chăn đắp" (Blanket), "Ổ cắm sạc" (Power outlet), or "WC".

### Form Controls & Input Fields
- **Search Modules**: Connected segment-style origin/destination inputs with quick-swap switch icons. Inputs feature floating labels, 16px body text to prevent iOS mobile zoom, and a primary `#0b7a5e` focus ring (2px with 15% opacity spread).
- **Date Pickers**: Calendar days show departure price heat indicators beneath the numeral to highlight budget-friendly travel days.

### Cards & Route Listings
- **Ticket Result Card**: Modular horizontal container (desktop) or vertical stack (mobile). Clear three-point visual timeline: Departure time & station → Duration & bus type → Arrival time & terminal. 
- **Call-Out Accent**: Right-hand action pane displaying dynamic fare in bold display typography, remaining seats badge, and a high-contrast selection button.

### Interactive Bus Seat Map
- **Layout**: Two-floor switchable isometric layout for sleeper (Giường nằm) and limousine buses. 
- **States**: Available (white with `#cbd5e1` outline), Selected (solid `#0b7a5e` with white seat number), and Sold Out (disabled neutral gray with subtle diagonal strike). Real-time price updates in a floating footer.

### Trust & Credibility Indicators
- **Instant Booking Stamp**: Verified lightning-bolt emblem indicating instant operator seat confirmation without re-checking.
- **Refund Policy Ribbon**: Color-coded pill (`#10b981` tint) clearly stating free cancellation timelines (e.g., "Hoàn 100% trước 24h").