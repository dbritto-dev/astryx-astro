/**
 * The server-side stand-in for Astryx CommandPaletteContext: CommandPalette renders its `input`
 * slot (and its own default input) with `Astro.locals.astryxCommandPalette` set through
 * `renderWithLocals`, so a CommandPaletteInput knows it is the palette's combobox. Everything
 * that changes afterwards (search, highlight, results) belongs to `<ax-command-palette>`.
 */
export interface CommandPaletteContext {
  /** Id of the palette's results list (`aria-controls`). */
  listId: string;
  /** An inline documentation preview: no auto focus, local Escape. */
  isInline: boolean;
  /** Whether the list holds selectable results at render time. */
  hasListbox: boolean;
  /** Whether the palette renders open. */
  isOpen: boolean;
}

export const COMMAND_PALETTE_LOCALS_KEY = 'astryxCommandPalette';
