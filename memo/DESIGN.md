---
{
  "name": "Memo night desktop",
  "description": "Compact Korean memo tool with editable dark-paper sticky notes",
  "colors": {
    "ground": "#101016",
    "paper": "#1b1923",
    "inset": "#14121b",
    "ink": "#eeeaf7",
    "muted": "#ada6bf",
    "accent": "#c3b7f5",
    "accent-hover": "#d6ccff",
    "accent-ink": "#231b39",
    "line": "#34303f",
    "control-line": "#746b87",
    "hover": "#30283f",
    "disabled": "#383044",
    "success": "#b7d9c7",
    "error": "#ffb8be",
    "add-surface": "#262032",
    "lilac-paper": "#2e283e",
    "lilac-ink": "#e8dff7",
    "lilac-muted": "#bdb1d0",
    "amber-paper": "#3b3225",
    "amber-ink": "#f1e5cc",
    "amber-muted": "#d0bea0",
    "slate-paper": "#243340",
    "slate-ink": "#dcebf7",
    "slate-muted": "#aac1d3",
    "rose-paper": "#3a2732",
    "rose-ink": "#f3dfe9",
    "rose-muted": "#d4afc0"
  },
  "typography": {
    "body": {
      "fontFamily": "Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif",
      "fontSize": "14px",
      "lineHeight": 1.5
    },
    "wordmark": {
      "fontSize": "22px",
      "fontWeight": 620,
      "lineHeight": 1,
      "letterSpacing": "-.035em"
    },
    "heading": {
      "fontSize": "14px",
      "fontWeight": 580,
      "letterSpacing": "-.015em"
    },
    "input": {
      "fontSize": "14px",
      "lineHeight": 1.65
    },
    "note": {
      "fontSize": "13px",
      "lineHeight": 1.55
    },
    "sticky-title": {
      "fontSize": "14px",
      "fontWeight": 580,
      "lineHeight": 1.6
    },
    "sticky-body": {
      "fontSize": "13px",
      "lineHeight": 1.75
    },
    "action": {
      "fontSize": "12px",
      "fontWeight": 550
    },
    "label": {
      "fontSize": "11px"
    },
    "mobile-input": {
      "fontSize": "16px"
    }
  },
  "rounded": {
    "desk": "12px",
    "composer": "7px",
    "button": "6px",
    "compact-action": "5px",
    "sticky-copy": "4px",
    "paper": "3px"
  },
  "spacing": {
    "small": "4px",
    "control-gap": "8px",
    "field-inset": "14px",
    "section": "16px",
    "desk-inset": "20px"
  },
  "components": {
    "save": {
      "backgroundColor": "{colors.accent}",
      "textColor": "{colors.accent-ink}",
      "rounded": "{rounded.compact-action}",
      "padding": "6px 12px"
    },
    "save-hover": {
      "backgroundColor": "{colors.accent-hover}"
    },
    "save-disabled": {
      "backgroundColor": "{colors.disabled}",
      "textColor": "{colors.muted}"
    },
    "add-sticky": {
      "backgroundColor": "{colors.add-surface}",
      "textColor": "{colors.accent}",
      "rounded": "{rounded.button}",
      "padding": "6px 11px"
    },
    "archive-toggle": {
      "backgroundColor": "transparent",
      "textColor": "{colors.muted}",
      "rounded": "{rounded.button}",
      "padding": "6px 11px"
    },
    "copy": {
      "backgroundColor": "transparent",
      "textColor": "{colors.muted}",
      "rounded": "{rounded.compact-action}",
      "width": "30px",
      "height": "30px"
    },
    "google": {
      "backgroundColor": "{colors.inset}",
      "textColor": "{colors.ink}",
      "rounded": "{rounded.button}",
      "padding": "7px 12px"
    },
    "composer": {
      "backgroundColor": "{colors.inset}",
      "rounded": "{rounded.composer}"
    },
    "count": {
      "textColor": "{colors.accent}"
    },
    "desk": {
      "backgroundColor": "{colors.paper}",
      "rounded": "{rounded.desk}",
      "width": "600px"
    },
    "sticky": {
      "backgroundColor": "{colors.lilac-paper}",
      "textColor": "{colors.lilac-ink}",
      "rounded": "{rounded.paper}",
      "width": "212px"
    }
  }
}
---

# Design System: Memo night desktop

## Overview

**Creative North Star: "Night desktop"**

Night indigo and violet frame a quiet, mysterious desktop for quick Korean notes. Pale lavender controls sit beside flat paper in muted lilac, amber, slate and rose; faint stationary pools of color provide atmosphere.

This preserves the user-pinned night desktop and seed 661c54bf from the incumbent direction contract. The former tall mobile-style card is a confirmed anti-reference. This system records the visual vocabulary in `index.html` and `style.css`, with interaction states in `app.js` and `cloud.js`; composition and incumbent provenance remain in `surface-brief.md`.

**Key Characteristics:**

- Compact utility typography and one clear save action.
- Dark paper with small corners, direct editing and restrained tilt.
- Depth supports persistent stacking and visible interaction feedback.

## Colors

### Primary

Pale violet accent marks save, focus, the wordmark symbol and count. Accent-hover brightens actions; accent-ink supplies dark text on the accent. Add-surface supports the add-sticky control.

### Secondary

Lilac, amber, slate and rose each pair paper, ink and muted text. They identify editable paper without implying priority or status.

**The Paper Palette Rule.** Keep each sticky’s paper, ink and muted colors together when cycling its palette.

### Neutral

Ground, paper and inset distinguish desktop, memo and composer. Ink and muted establish text hierarchy; line divides rows, while control-line outlines the composer and Google control. Hover and disabled distinguish interaction states. Success and error color status feedback. Native controls declare a dark color scheme. Exact source values are normative in the frontmatter; no synthetic tonal ramps are shipping tokens.

## Typography

The local Pretendard variable font declares weights 100–900 with swap loading and the body fallbacks recorded above. UI text is predominantly 11–14px: metadata and helper labels use the label role, actions use action, recent note bodies use note, and input uses input. The wordmark is the small identity exception and becomes 20px at the phone breakpoint. At the phone breakpoint, composer title/body and sticky title/body use the mobile-input role to avoid Safari input zoom; labels and buttons retain their compact sizes. There is no separate display face. Counts and note metadata use tabular numerals; note bodies preserve newlines and wrap long text anywhere.

## Layout

The desktop shell fills at least 100svh, with a 70px minimum app bar, a flexible board of minimum height 680px, and a 42px minimum footer. The memo is absolutely positioned at left 50% / top 48%, translated by -50% in each axis, with the desk width token. This surface uses 20px horizontal memo insets and compact divided rows; the recent list scrolls at max-height 215px. The textarea minimum is 68px and maximum 180px, with vertical resizing. Memo height is content-driven; historical prototype measurements are not a fixed CSS height or an empty production-board specification.

At max-width 1199px (below 1200), the memo enters normal flow at min(100%, 600px); paper becomes a two-column grid with a 22px gap within the same maximum width. At max-width 560px (including 560), it becomes one column, max-width 340px, with an 18px gap. Phone board padding is 24px 14px and memo horizontal insets become 15px. The recent list maximum rises to 265px. Domain, caption, shortcut hint and movement hint recede; add, archive, title, save and paper-editing actions remain.

Desktop paper uses its width token and normalized x/y positions clamped to the board with a 10px inset. At narrower sizes, CSS ignores absolute coordinates while preserving them for return to desktop. Pointer dragging and arrow-key placement apply only above 1199px; editing remains available in the board layout. Coarse-pointer CSS increases primary/toolbar targets to 44px, recent icon controls to 40×44px, sticky icon controls to 34×38px and sticky copy to 38px minimum height.

## Elevation & Depth

Stationary radial backgrounds provide low-contrast atmosphere. Ambient shadows lift the central memo (`0 20px 60px rgb(0 0 0 / 32%)`), paper (`0 12px 30px rgb(0 0 0 / 22%)`) and temporary status (`0 8px 24px rgb(0 0 0 / 24%)`). The memo has z-index 1. Each paper card uses its stored z plus 10; pointerdown and focusin raise and persist its order. The sticky container supplies no enclosing z-index that would trap paper under the memo. Focus-within adds an outline only. Status uses z-index 2000.

**The Persistent Stack Rule.** Use persisted note order for elevation; focus outlines must not override the card’s z-index.

## Shapes

The memo and composer use gently rounded enclosing shapes; sticky paper has the much smaller paper radius. Utility actions, icon actions and sticky copy use their distinct compact radii. The palette indicator is a small circle, not a filter chip. Line SVG icons use rounded caps and joins with a typical 1.6 stroke. Paper begins with slight signed tilt; dragging temporarily straightens it. Do not generalize paper tilt to the memo or controls.

## Components

- **Memo/composer:** compact, inset entry surface with a body textarea and initially hidden optional title (maximum 160 characters). “제목 추가” reveals it and “제목 접기” folds it without clearing the draft title. Save requires nonempty trimmed body; a title alone is insufficient. Cmd/Ctrl+Enter respects IME composition. Save is disabled before connection readiness and during submission. A successful response clears title/body and folds the title row only when they still match the submitted draft; text typed while saving remains. Failure retains the draft. Draft body, title and open state persist locally.
- **Save and toolbar:** save carries accent fill; disabled save uses disabled/muted. Toolbar actions use quiet text and compact corners, with the add-sticky action lightly filled. Hover uses the source hover colors. Buttons transition background/color over 140ms using the recorded easing. Reduced-motion preference removes transitions.
- **Recent rows and count:** newest-first rows contain optional title, wrapped body, relative time, expiry remainder, pin and copy icon actions. Count is plain accent text, not the former filled badge. Whole-note HTTP(S) URLs become underlined links. Empty state invites the first note.
- **Copy and feedback:** copying includes a nonempty title followed by a newline and body. Icons become checks for 1500ms; sticky copy also reads “복사됨”. A fixed polite status message is visible for 4000ms, with error feedback on failure. Unlike the prior card, current success uses the visible status component.
- **Archive navigation:** changes label and heading and swaps the central view. The text-only Google button invokes the SDK OAuth flow when configured and is disabled while configuration is absent. Signed-in accounts see an email and logout row; a non-owner sees a denial message and no archive rows. Owner archive rows reuse the note pattern with copy actions and a 300px list maximum. The account row uses existing muted text and label sizing (11px), with a 12px gap and 8px bottom margin. Sticky notes remain on the workspace. No Google logo placeholder is present in this source.
- **Editable paper:** optional title, resizable body, handle, palette cycle, delete and copy. New paper can be added repeatedly after connection readiness; production starts empty and has no fabricated server notes. Populated screenshots use isolated test fixtures. Desktop handle dragging uses pointer capture; arrows move 12px and Shift+arrows move 40px. Content, palette, normalized positions, tilt and layer order use the shared server record through `MemoCloud`; unfinished edits are held locally for retry. Sticky body spans 100–260px on desktop, with a 90px minimum on phones. UI focus uses a 2px accent outline offset 3px; sticky controls use sticky ink and the surrounding card gains a 1px muted outline.

- **Connection and retry:** the footer reuses muted label text and an 8px gap. Errors use the existing error token; “다시 시도” is an underlined, transparent 11px control with the inherited focus outline. A failed refresh retains the error and retry affordance. A successful retry refreshes server versions before resending pending sticky changes. Failed composer saves retain their text for resubmission with Save. Storage failure produces visible explanatory feedback.

The shared Supabase SDK and SQL integration is implemented, including server-enforced 24-hour visibility and designated Google owner archive access. Pinning changes the same record and preserves its original created timestamp. The UI refreshes every 15000ms while visible, on focus/visibility/online events and after Realtime invalidation. Local storage under `5e-memo-drafts-v1:<project URL or unconfigured>` holds drafts and pending edits, not a full public-board or owner-archive cache. Actual Google/Supabase credentials are not connected; this documentation does not claim live production success. `PRODUCT.md` and `README.md` own product intent and setup status.

Not canonized or repaired: the incumbent direction estimated a roughly 400px memo height and its documentation reported a 445px populated prototype; neither establishes a fixed production height. Existing sidecar specimens remain component excerpts, not complete responsive screen replicas. This bounded comparison issues no new visual-review verdict or final score.

## Do's and Don'ts

- Do retain compact text, optional titles and directly editable paper.
- Do preserve line breaks, long-text wrapping and visible focus feedback.
- Do adapt free placement into an editable board at the implemented breakpoints.
- Don't restore the rejected tall mobile-style card as the desktop composition.
- Don't replace the four paper palettes with arbitrary unreadable color combinations.
- Don't describe local fixtures or implemented SDK/SQL flows as connected production services before Google/Supabase setup is complete.
