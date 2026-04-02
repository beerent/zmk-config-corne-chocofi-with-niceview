// Display labels for ZMK key codes
export const ZMK_KEY_LABELS: Record<string, string> = {
  // Letters
  A: "A", B: "B", C: "C", D: "D", E: "E", F: "F", G: "G", H: "H",
  I: "I", J: "J", K: "K", L: "L", M: "M", N: "N", O: "O", P: "P",
  Q: "Q", R: "R", S: "S", T: "T", U: "U", V: "V", W: "W", X: "X",
  Y: "Y", Z: "Z",
  // Numbers
  N0: "0", N1: "1", N2: "2", N3: "3", N4: "4",
  N5: "5", N6: "6", N7: "7", N8: "8", N9: "9",
  // Modifiers
  LSHFT: "Shift", RSHFT: "Shift", LCTRL: "Ctrl", RCTRL: "Ctrl",
  LALT: "Alt", RALT: "Alt", LGUI: "Cmd", RGUI: "Cmd",
  // Symbols
  EXCL: "!", AT: "@", HASH: "#", DLLR: "$", PRCNT: "%",
  CARET: "^", AMPS: "&", KP_MULTIPLY: "*", LPAR: "(", RPAR: ")",
  MINUS: "-", EQUAL: "=", UNDER: "_", PLUS: "+",
  LBKT: "[", RBKT: "]", LBRC: "{", RBRC: "}",
  BSLH: "\\", PIPE: "|", GRAVE: "`", TILDE: "~",
  SEMI: ";", SQT: "'", COMMA: ",", DOT: ".", FSLH: "/",
  // Special
  SPACE: "Space", RET: "Enter", TAB: "Tab", BSPC: "Bksp",
  ESC: "Esc", DEL: "Del", INS: "Ins",
  HOME: "Home", END: "End", PG_UP: "PgUp", PG_DN: "PgDn",
  // Arrows
  LEFT: "Left", RIGHT: "Right", UP: "Up", DOWN: "Down",
  // F-keys
  F1: "F1", F2: "F2", F3: "F3", F4: "F4", F5: "F5", F6: "F6",
  F7: "F7", F8: "F8", F9: "F9", F10: "F10", F11: "F11", F12: "F12",
  // Media
  C_VOL_UP: "Vol+", C_VOL_DN: "Vol-", C_MUTE: "Mute",
  C_PLAY_PAUSE: "Play", C_NEXT: "Next", C_PREV: "Prev",
  C_BRI_UP: "Bri+", C_BRI_DN: "Bri-",
  // Caps
  CAPS: "Caps", PSCRN: "PrtSc", SLCK: "ScrLk", PAUSE_BREAK: "Pause",
};

// Map behavior + params to a display label
export function getKeyLabel(behavior: string, params: string[]): string {
  if (behavior === "&trans") return "";
  if (behavior === "&none") return "None";
  if (behavior === "&studio_unlock") return "Studio";

  if (behavior === "&kp") {
    return ZMK_KEY_LABELS[params[0]] || params[0];
  }
  if (behavior === "&mo") {
    return `MO(${params[0]})`;
  }
  if (behavior === "&lt") {
    const keyLabel = ZMK_KEY_LABELS[params[1]] || params[1];
    return `LT${params[0]}(${keyLabel})`;
  }
  if (behavior === "&mt") {
    const modLabel = ZMK_KEY_LABELS[params[0]] || params[0];
    const keyLabel = ZMK_KEY_LABELS[params[1]] || params[1];
    return `${modLabel}/${keyLabel}`;
  }
  if (behavior === "&bt") {
    if (params[0] === "BT_CLR") return "BT Clr";
    if (params[0] === "BT_SEL") return `BT ${params[1]}`;
    return params.join(" ");
  }
  if (behavior === "&tog") {
    return `TG(${params[0]})`;
  }
  if (behavior === "&to") {
    return `TO(${params[0]})`;
  }
  if (behavior === "&sk") {
    return `SK(${ZMK_KEY_LABELS[params[0]] || params[0]})`;
  }
  if (behavior === "&sl") {
    return `SL(${params[0]})`;
  }

  // Fallback
  const paramStr = params.map(p => ZMK_KEY_LABELS[p] || p).join(" ");
  return `${behavior.replace("&", "")} ${paramStr}`.trim();
}
