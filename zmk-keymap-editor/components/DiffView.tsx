"use client";

interface Props {
  before: string;
  after: string;
  onClose: () => void;
}

interface DiffLine {
  type: "same" | "added" | "removed";
  content: string;
  lineNum: number | null;
}

function computeDiff(before: string, after: string): DiffLine[] {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const result: DiffLine[] = [];

  // Simple line-by-line diff (LCS-based would be better but this works for keymaps)
  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);

  let bi = 0;
  let ai = 0;

  while (bi < beforeLines.length || ai < afterLines.length) {
    if (bi < beforeLines.length && ai < afterLines.length) {
      if (beforeLines[bi] === afterLines[ai]) {
        result.push({ type: "same", content: afterLines[ai], lineNum: ai + 1 });
        bi++;
        ai++;
      } else if (!afterSet.has(beforeLines[bi])) {
        result.push({
          type: "removed",
          content: beforeLines[bi],
          lineNum: null,
        });
        bi++;
      } else if (!beforeSet.has(afterLines[ai])) {
        result.push({
          type: "added",
          content: afterLines[ai],
          lineNum: ai + 1,
        });
        ai++;
      } else {
        // Both lines exist elsewhere, treat as remove + add
        result.push({
          type: "removed",
          content: beforeLines[bi],
          lineNum: null,
        });
        bi++;
      }
    } else if (bi < beforeLines.length) {
      result.push({
        type: "removed",
        content: beforeLines[bi],
        lineNum: null,
      });
      bi++;
    } else {
      result.push({
        type: "added",
        content: afterLines[ai],
        lineNum: ai + 1,
      });
      ai++;
    }
  }

  return result;
}

export default function DiffView({ before, after, onClose }: Props) {
  const diff = computeDiff(before, after);
  const additions = diff.filter((d) => d.type === "added").length;
  const removals = diff.filter((d) => d.type === "removed").length;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface-1 rounded-xl border border-surface-3 max-w-3xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-3">
          <div>
            <h3 className="text-sm font-semibold text-key-text">
              Keymap Changes
            </h3>
            <p className="text-xs text-key-subtext mt-0.5">
              <span className="text-green-400">+{additions}</span>{" "}
              <span className="text-red-400">-{removals}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-surface-3 rounded-md transition-colors text-key-subtext hover:text-key-text"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Diff content */}
        <div className="flex-1 overflow-auto">
          <pre className="text-xs font-mono p-4">
            {diff.map((line, i) => (
              <div
                key={i}
                className={`px-2 py-0.5 ${
                  line.type === "added"
                    ? "bg-green-500/10 text-green-400"
                    : line.type === "removed"
                      ? "bg-red-500/10 text-red-400"
                      : "text-key-subtext"
                }`}
              >
                <span className="inline-block w-4 opacity-50 select-none">
                  {line.type === "added"
                    ? "+"
                    : line.type === "removed"
                      ? "-"
                      : " "}
                </span>
                {line.content}
              </div>
            ))}
          </pre>
        </div>
      </div>
    </div>
  );
}
