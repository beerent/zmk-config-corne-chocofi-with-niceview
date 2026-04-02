export interface KeyBinding {
  behavior: string; // e.g. "&kp", "&mo", "&trans"
  params: string[]; // e.g. ["TAB"], ["1"], []
  raw: string; // original text e.g. "&kp TAB"
}

export interface Layer {
  name: string;
  displayName: string;
  bindings: KeyBinding[];
}

export interface Keymap {
  layers: Layer[];
  rawContent: string;
  preamble: string; // everything before the keymap block
  postamble: string; // everything after the keymap block
}

const LAYER_NAME_MAP: Record<string, string> = {
  default_layer: "Base",
  lower_layer: "Lower",
  raise_layer: "Raise",
};

function parseBindingToken(token: string): KeyBinding {
  // A binding is like "&kp TAB" or "&mo 1" or "&bt BT_SEL 0" or "&trans"
  const parts = token.trim().split(/\s+/);
  const behavior = parts[0];
  const params = parts.slice(1);
  return { behavior, params, raw: token.trim() };
}

export function parseKeymap(content: string): Keymap {
  const layers: Layer[] = [];

  // Find keymap block
  const keymapStart = content.indexOf("keymap {");
  if (keymapStart === -1) {
    throw new Error("Could not find keymap block in file");
  }

  // Find the matching closing brace for the keymap block
  let depth = 0;
  let keymapEnd = -1;
  let foundOpen = false;
  for (let i = keymapStart; i < content.length; i++) {
    if (content[i] === "{") {
      depth++;
      foundOpen = true;
    } else if (content[i] === "}") {
      depth--;
      if (foundOpen && depth === 0) {
        keymapEnd = i + 1;
        break;
      }
    }
  }

  // Find preamble (everything before "/ {" that contains keymap)
  const rootStart = content.indexOf("/ {");
  const preamble = rootStart !== -1 ? content.substring(0, rootStart) : "";
  const postamble = keymapEnd !== -1 ? content.substring(keymapEnd) : "";

  // Extract the keymap block content
  const keymapContent = content.substring(keymapStart, keymapEnd);

  // Find each layer by looking for "name {" blocks that contain "bindings = <"
  // We search within the keymap block to avoid false matches
  const layerHeaderRegex = /(\w+)\s*\{/g;
  let headerMatch;

  while ((headerMatch = layerHeaderRegex.exec(keymapContent)) !== null) {
    const layerName = headerMatch[1];
    if (layerName === "keymap" || layerName === "compatible") continue;

    // Find the matching closing brace for this layer
    const layerStart = headerMatch.index + headerMatch[0].length;
    let layerDepth = 1;
    let layerEndPos = -1;
    for (let i = layerStart; i < keymapContent.length; i++) {
      if (keymapContent[i] === "{") layerDepth++;
      else if (keymapContent[i] === "}") {
        layerDepth--;
        if (layerDepth === 0) {
          layerEndPos = i;
          break;
        }
      }
    }
    if (layerEndPos === -1) continue;

    const layerBody = keymapContent.substring(layerStart, layerEndPos);

    // Extract bindings from this layer
    const bindingsMatch = layerBody.match(/bindings\s*=\s*<([\s\S]*?)>/);
    if (!bindingsMatch) continue;

    const bindingsRaw = bindingsMatch[1];

    const bindings: KeyBinding[] = [];
    const bindingTokens = bindingsRaw
      .replace(/\n/g, " ")
      .trim()
      .split(/(?=&)/);

    for (const token of bindingTokens) {
      const trimmed = token.trim();
      if (trimmed) {
        bindings.push(parseBindingToken(trimmed));
      }
    }

    const displayName =
      LAYER_NAME_MAP[layerName] ||
      layerName
        .replace(/_/g, " ")
        .replace(/layer\s*\d*/, "")
        .trim() ||
      `Layer ${layers.length}`;

    layers.push({
      name: layerName,
      displayName,
      bindings,
    });
  }

  return { layers, rawContent: content, preamble, postamble };
}

export function serializeKeymap(keymap: Keymap): string {
  // We rebuild the full file from the layers
  let output = keymap.preamble;
  output += "/ {\n";
  output += "    keymap {\n";
  output += '        compatible = "zmk,keymap";\n';

  for (const layer of keymap.layers) {
    output += "\n";
    output += `        ${layer.name} {\n`;

    // Format bindings in the Corne 3x6+3 layout
    const b = layer.bindings;
    if (b.length === 42) {
      // Standard Corne layout: 3 rows of 12 + 1 row of 6
      const rows = [
        b.slice(0, 12),
        b.slice(12, 24),
        b.slice(24, 36),
        b.slice(36, 42),
      ];

      output += "            bindings = <\n";
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (r < 3) {
          // Split into left/right halves
          const left = row.slice(0, 6).map((k) => k.raw);
          const right = row.slice(6, 12).map((k) => k.raw);
          output += `${left.join("  ")}    ${right.join("  ")}\n`;
        } else {
          // Thumb row
          const left = row.slice(0, 3).map((k) => k.raw);
          const right = row.slice(3, 6).map((k) => k.raw);
          output += `                         ${left.join("  ")}    ${right.join("  ")}\n`;
        }
      }
      output += "            >;\n";
    } else {
      // Fallback: just list all bindings
      output += "            bindings = <\n";
      output += b.map((k) => k.raw).join("  ") + "\n";
      output += "            >;\n";
    }

    output += "        };\n";
  }

  output += "    };\n";
  output += "};\n";

  return output;
}
