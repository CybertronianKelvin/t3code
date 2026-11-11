import {
  commandHighlightLanguage,
  withVisibleControlCharacters,
} from "@t3tools/client-runtime/work-log/command-label";
import { Suspense, use } from "react";

import { useRenderedAppearance } from "../../hooks/useTheme";
import { RenderErrorBoundary } from "../RenderErrorBoundary";
import { HighlightedTokens } from "./HighlightedTokens";

const WORD_CLASS_NAME = "inline-block max-w-full [overflow-wrap:anywhere]";

let embeddedScriptsModule: Promise<typeof import("../../lib/embeddedScripts")> | undefined;
function loadEmbeddedScripts() {
  embeddedScriptsModule ??= import("../../lib/embeddedScripts");
  return embeddedScriptsModule;
}

// Match highlighted layout to prevent reflow when the grammar arrives.
function PlainWords({ code }: { code: string }) {
  return code.split(/(\s+)/u).map((part, index) =>
    index % 2 === 1 || part === "" ? (
      part
    ) : (
      // oxlint-disable-next-line react/no-array-index-key -- positions are stable for one string
      <span key={index} className={WORD_CLASS_NAME}>
        {part}
      </span>
    ),
  );
}

function HighlightedCommand({ code, theme }: { code: string; theme: "light" | "dark" }) {
  const { embeddedScripts } = use(loadEmbeddedScripts());
  const language = commandHighlightLanguage(code);
  const embedded = language === "shellscript" ? embeddedScripts(code) : [];
  return (
    <HighlightedTokens
      code={code}
      language={language}
      embedded={embedded}
      theme={theme}
      wordClassName={WORD_CLASS_NAME}
    />
  );
}

export function ShellCommandBlock({ command }: { command: string }) {
  const resolvedTheme = useRenderedAppearance();
  const code = withVisibleControlCharacters(command.trim());
  if (!code) return null;
  const plain = <PlainWords code={code} />;
  // A terminal card: a bordered, tinted panel with a prompt header so a command
  // reads as its own thing at a glance, distinct from reasoning and plain text.
  // It grows to full height — no inner scroll box to fight — and carries its own
  // mono/whitespace styling so it no longer depends on a parent wrapper.
  return (
    <div className="overflow-hidden rounded-md border border-border/70 bg-muted/40">
      <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/60 px-2.5 py-1 font-mono text-[11px] text-muted-foreground select-none">
        <span aria-hidden className="text-foreground/70">
          {">_"}
        </span>
        <span>terminal</span>
      </div>
      <div className="px-3 py-2 font-mono text-(length:--font-size-code,var(--text-2xs)) leading-relaxed whitespace-pre-wrap break-words text-foreground/85 select-text">
        <RenderErrorBoundary fallback={plain} resetKeys={[code]}>
          <Suspense fallback={plain}>
            <HighlightedCommand code={code} theme={resolvedTheme} />
          </Suspense>
        </RenderErrorBoundary>
      </div>
    </div>
  );
}
