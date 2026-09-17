# Store design: three clear jobs

## Where should I make a change?

| Goal | Use | What is saved |
| --- | --- | --- |
| Change the active theme, colours, typography, spacing or custom CSS | **Appearance** | Live store appearance settings |
| Edit the announcement message, link or visibility | **Appearance → Announcement** | An independent store setting |
| Add, edit, reorder, hide or remove homepage blocks | **Appearance → Homepage** | Live homepage blocks |
| Create or duplicate a reusable theme; design its templates | **Theme Studio** | The theme definition on disk |

There is no separate **Sections** tab. Each Homepage block has its own visibility
switch. Old `?tab=sections` bookmarks open Homepage. The old theme-level home
switches remain API-compatible, but no longer appear in the editor or its Save
payload. They do not override block visibility.

## Apply a theme's styling

1. Open **Appearance → Theme** and select a theme. **Active** still identifies
   the saved live theme; **Selected · not saved** identifies a pending choice.
2. Adjust colours, typography and layout settings if desired.
3. Click **Save appearance**. This applies the selected styling and saves the
   appearance fields. **It does not change homepage blocks.**

Choosing a theme preserves the merchant's announcement message, link, visibility
and custom CSS. Announcement colours can follow the theme. **Discard appearance
edits** restores the saved settings. **Reset appearance** is a separately
confirmed reset of appearance defaults, not a reset of the homepage.

Studio and theme preview pages link to this same selection flow. A preview never
silently activates a theme. The style preview uses sample content; it is not a
preview of the merchant's exact live homepage.

## Edit the live homepage

Use **Appearance → Homepage** for live content and visibility.

- Wording/configuration edits are drafts until **Save this block**.
- Adding, deleting, moving and toggling visibility save immediately. Visibility
  and order changes preserve any unsaved wording in the editor.
- The appearance Save/Discard/Reset controls are hidden here: they cannot save
  homepage edits. Appearance drafts remain available when returning to their tab.
- Leaving Homepage for another Appearance tab asks before discarding block
  drafts. Ordinary same-tab links (including the admin sidebar) and browser
  reload/close are also guarded while design edits are pending.
- The Home preview uses the current block drafts, including an intentionally empty
  homepage. That temporary preview is cleared when the editor closes.

Version history is browser-local, not a server backup. Restoring a version with
the same block IDs stages its content for saving and keeps current order and
visibility. Structural changes require re-adding/deleting blocks explicitly.

## Create a reusable theme

1. Open **Theme Studio** and select a theme or create a new one.
2. For a bundled platform theme, use **Duplicate theme** to make an editable copy.
   Duplication includes current page drafts, tokens, section references and flags.
3. Design **Home** as an ordered, full-width section stack. Its preview follows
   the same section rendering path as the live homepage. Home is not a column grid.
4. Other page tabs retain their grid and placement controls.
5. Click **Save theme**. All page drafts and theme metadata are saved together.
6. Use **Apply styling in Appearance** to stage the saved theme as a style choice,
   then save there.

Saving a theme does not rewrite the merchant's live homepage or appearance
overrides. **Exception to a wholly draft-only Studio:** saved non-home layouts of
an already-active theme are used by those pages on their next load. Design an
inactive copy when you need to stage such changes without affecting the store.

The **Theme template preview · sample content** shows the selected template.
The separate **Saved storefront preview** shows persisted store state; it is not
an unsaved Studio preview and never consumes a leftover Home editor draft.

## Deliberately replace the live homepage

**Replace homepage from theme** is the same destructive operation everywhere:

- Appearance → Theme uses the selected, saved theme.
- Homepage uses the saved active theme, not a pending Appearance selection.
- Studio uses its selected, saved theme definition.

Save or discard relevant drafts first. The confirmation explicitly states that
**all current homepage blocks will be deleted**. This is a one-time copy of a
saved home template, not a permanent connection to it. It does not change the
active theme, colours or fonts.

A missing, empty or invalid template is an error; it does **not** silently install
platform defaults. Use Homepage's separate **Reset to defaults** action for that.
Replacement and reset validate before deleting and use a database transaction,
so their delete/insert sequence is atomic.

No schema migration or automatic rewrite of existing merchant content is needed
for this workflow. See [THEME_STUDIO.md](THEME_STUDIO.md) for developer details.
