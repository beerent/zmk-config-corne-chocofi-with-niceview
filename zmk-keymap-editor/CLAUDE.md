# ZMK Keymap Editor

This is a Next.js web app for editing ZMK keyboard firmware keymaps via chat with Claude.

## Key Files
- `config/corne.keymap` — The ZMK keymap file for a Corne/Chocofi split keyboard
- `app/api/chat/route.ts` — Chat API that spawns Claude CLI
- `lib/system-prompt.ts` — System prompt builder for keymap editing
- `lib/keymap-parser.ts` — Parses ZMK devicetree keymap files

## When editing keymaps
- Always return the COMPLETE keymap file in a ```keymap``` fenced code block
- Include all #include directives, comments, layers, and bindings
- Never return partial keymaps or just the changed section
