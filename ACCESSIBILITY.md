# Accessibility & Responsive Acceptance Criteria

This document defines the minimum accessibility and responsive behavior requirements for all primary ChannelLens extension screens.

## Shared UI Layer (All Screens)

- A shared stylesheet (`extension/ui.css`) defines:
  - color/spacing/radius tokens,
  - default `:focus-visible` ring behavior,
  - minimum interactive hit size (`44px+`),
  - breakpoint utilities and reduced-motion support.
- Every interactive control must remain keyboard operable with native Tab/Shift+Tab/Enter/Space behavior.
- No control may remove focus indication; focus rings must remain visible on dark backgrounds.
- `@media (prefers-reduced-motion: reduce)` must disable non-essential animations/transitions.

## Screen Type: Extension Popup (`extension/popup.html`)

### Semantics
- Uses semantic landmarks: `<header>`, `<main>`, `<nav>`, `<footer>`.
- Primary title is an `<h1>` and card header is `<h2>`.
- Form control has an explicit `<label for="prompt-select">`.
- Dynamic status values announce updates with `aria-live="polite"`.

### Keyboard Navigation
- Prompt `<select>` and all action buttons are reachable in a logical tab order.
- Keyboard users can operate all controls without pointer-only gestures.

### Visual Accessibility
- Text colors for small labels/body text meet contrast expectations on the popup background.
- Focus ring is consistently visible via `:focus-visible` (no custom focus suppression).

### Responsive Behavior
- Popup supports narrow viewport widths (up to full-width at small sizes).
- Spacing and padding tighten on small screens without reducing target size below `44px`.

## Screen Type: YouTube Injected Analyzer Controls (`extension/content_youtube.js` + `extension/content_youtube.css`)

### Semantics
- Floating analyzer wrapper is a `<section role="region">` with an `aria-label`.
- Scan depth select is explicitly labeled (`for` + matching `id`).
- Analyze button has an explicit accessible name.

### Keyboard Navigation
- Depth select and Analyze button are keyboard focusable and activatable.
- Focus-visible ring remains visible for controls against video/content backgrounds.

### Visual Accessibility
- Overlay text and controls maintain contrast against dark container surfaces.
- Disabled button state still maintains readable foreground contrast.

### Responsive Behavior
- Desktop: anchored bottom-right with constrained max width.
- Tablet (`<=1024px`): tighter insets and scaled container sizing.
- Mobile (`<=768px`): full-width inset bar near bottom, stacked controls, touch-friendly button/select sizing.

## Screen Type: Global Status HUD (`#yt-ai-status-hud`)

### Semantics
- HUD exposes `role="status"` and `aria-live="polite"` for non-blocking updates.
- Decorative pulse icon is `aria-hidden`.

### Motion
- HUD entrance/pulse animations are disabled under reduced-motion preference.

### Responsive Behavior
- HUD width adapts to viewport on mobile and does not clip status text.

## Verification Checklist

- [ ] Keyboard-only traversal reaches every interactive control on popup and overlay screens.
- [ ] `:focus-visible` ring appears on select + button controls in popup and injected UI.
- [ ] Reduced-motion mode removes animation effects from popup/overlay/HUD.
- [ ] Color contrast for text and controls remains legible on dark backgrounds.
- [ ] Mobile and tablet breakpoints apply expected layout changes for overlay/HUD.
