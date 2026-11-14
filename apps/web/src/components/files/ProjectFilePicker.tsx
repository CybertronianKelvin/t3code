import type { FilesystemBrowseResult } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import {
  filterFilesystemBrowseEntries,
  getFilesystemBrowsePath,
} from "@t3tools/client-runtime/state/filesystem";
import { appendBrowsePathSegment } from "@t3tools/client-runtime/state/projects";
import { useState, type ReactNode } from "react";

import { useActiveProjectTarget, type ActiveProjectTarget } from "~/hooks/useActiveProjectTarget";
import { useTheme } from "~/hooks/useTheme";
import { useRightPanelStore } from "~/rightPanelStore";
import { useEnvironments } from "~/state/environments";
import { filesystemEnvironment, useFilesystemReadAccess } from "~/state/filesystem";
import { useEnvironmentQuery } from "~/state/query";
import { primaryServerKeybindingsAtom } from "~/state/server";

import { PierreEntryIcon } from "../chat/PierreEntryIcon";
import { CommandPaletteContent } from "../CommandPaletteContent";
import {
  getEnvironmentBrowsePlatform,
  type CommandPaletteActionItem,
} from "../CommandPalette.logic";
import { CommandPaletteResults } from "../CommandPaletteResults";
import {
  getProjectFilePickerMatches,
  PROJECT_FILE_PICKER_RESULT_LIMIT,
} from "./ProjectFilePicker.logic";
import { useProjectFilePickerQuery } from "./projectFilesQueryState";

interface ProjectFilePickerProps {
  readonly setOpen: (open: boolean) => void;
}

function HighlightedFuzzyText(props: {
  readonly active: boolean;
  readonly indices: ReadonlyArray<number>;
  readonly value: string;
}) {
  if (!props.active) return props.value;

  const parts: ReactNode[] = [];
  let start = 0;
  for (const index of props.indices) {
    if (start < index) parts.push(props.value.slice(start, index));
    parts.push(
      <strong className="font-semibold text-foreground" key={index}>
        {props.value[index]}
      </strong>,
    );
    start = index + 1;
  }
  if (start < props.value.length) parts.push(props.value.slice(start));

  return <span className="text-muted-foreground">{parts}</span>;
}

const EMPTY_BROWSE_ENTRIES: FilesystemBrowseResult["entries"] = [];

function getEmptyStateMessage(query: string, error: string | null, isPending: boolean): string {
  if (error) return error;
  const isSearching = query.trim().length > 0;
  if (isPending) return isSearching ? "Searching workspace files…" : "Indexing workspace files…";
  return isSearching ? "No matching files." : "No files found.";
}

function getBrowseEmptyStateMessage(error: string | null, isPending: boolean): string {
  if (error) return error;
  return isPending ? "Reading folder…" : "Nothing here.";
}

function EmptyProjectFilePicker() {
  return (
    <CommandPaletteContent
      aria-label="File picker"
      escapeLabel="Back"
      footerActionLabel="Open file"
      inputProps={{ disabled: true, placeholder: "Search files…" }}
      mode="none"
      testId="project-file-picker"
      value=""
    >
      <div className="py-10 text-center text-sm text-muted-foreground">
        Open a project to search its files.
      </div>
    </CommandPaletteContent>
  );
}

function OpenProjectFilePicker(props: ProjectFilePickerProps & { target: ActiveProjectTarget }) {
  const { target } = props;
  const [query, setQuery] = useState("");
  const [highlightedItemValue, setHighlightedItemValue] = useState<string | null>(null);
  const { presentationById } = useEnvironments();
  const platform = getEnvironmentBrowsePlatform(
    presentationById.get(target.environmentId)?.serverConfig?.environment.platform.os,
  );
  // A typed path leaves the project index behind and walks the host filesystem instead, so a file
  // outside the workspace can be opened without first adding its folder as a project.
  const browsePath = getFilesystemBrowsePath(query, platform);
  const browseAccess = useFilesystemReadAccess(browsePath.isBrowsing ? target.environmentId : null);
  const browseQuery = useEnvironmentQuery(
    browsePath.isBrowsing && browseAccess.canReadFiles
      ? filesystemEnvironment.browse({
          environmentId: target.environmentId,
          input: {
            partialPath: browsePath.directoryPath,
            // Anchors ./ and ../ so a sibling of the project is two keystrokes away.
            cwd: target.cwd,
            include: "all",
          },
        })
      : null,
  );
  const result = useProjectFilePickerQuery(
    target.environmentId,
    target.cwd,
    browsePath.isBrowsing ? "" : query,
    PROJECT_FILE_PICKER_RESULT_LIMIT,
  );
  const { resolvedTheme } = useTheme();
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const matches = getProjectFilePickerMatches(result.entries, result.matchedQuery);
  const hasMatchedQuery = /\S/.test(result.matchedQuery);
  const items: CommandPaletteActionItem[] = matches.map((match) => ({
    kind: "action",
    value: `file:${match.path}`,
    searchTerms: [match.name, match.path],
    title: (
      <HighlightedFuzzyText
        active={hasMatchedQuery}
        value={match.name}
        indices={match.nameMatchIndices}
      />
    ),
    description: (
      <HighlightedFuzzyText
        active={hasMatchedQuery}
        value={match.path}
        indices={match.pathMatchIndices}
      />
    ),
    icon: <PierreEntryIcon pathValue={match.path} kind="file" theme={resolvedTheme} />,
    run: async () => {
      useRightPanelStore.getState().openFile(target.threadRef, match.path);
    },
  }));

  const { visibleEntries } = filterFilesystemBrowseEntries(
    browseQuery.data?.entries ?? EMPTY_BROWSE_ENTRIES,
    browsePath.filterQuery,
  );
  const browseItems: CommandPaletteActionItem[] = visibleEntries.map((entry) => ({
    kind: "action",
    value: `host:${entry.fullPath}`,
    searchTerms: [entry.name, entry.fullPath],
    title: entry.name,
    description: entry.fullPath,
    icon: (
      <PierreEntryIcon
        pathValue={entry.fullPath}
        kind={entry.kind === "directory" ? "directory" : "file"}
        theme={resolvedTheme}
      />
    ),
    // A folder continues the path in the box; only a file closes the picker.
    keepOpen: entry.kind === "directory",
    run: async () => {
      if (entry.kind === "directory") {
        setHighlightedItemValue(null);
        setQuery(appendBrowsePathSegment(query, entry.name));
        return;
      }
      useRightPanelStore.getState().openFile(target.threadRef, entry.fullPath);
    },
  }));

  const browseError =
    browseAccess.error ?? (browseQuery.error === null ? null : "That folder could not be read.");
  const emptyStateMessage = browsePath.isBrowsing
    ? getBrowseEmptyStateMessage(browseError, browseAccess.isPending || browseQuery.isPending)
    : getEmptyStateMessage(query, result.error, result.isPending);

  return (
    <CommandPaletteContent
      aria-label="File picker"
      autoHighlight="always"
      escapeLabel="Back"
      footerActionLabel="Open file"
      inputProps={{ placeholder: "Search files, or type a path…" }}
      mode="none"
      onItemHighlighted={(value) => {
        setHighlightedItemValue(typeof value === "string" ? value : null);
      }}
      onValueChange={(value) => {
        setHighlightedItemValue(null);
        setQuery(value);
      }}
      panelSize="tall-list"
      testId="project-file-picker"
      value={query}
    >
      <CommandPaletteResults
        groups={
          browsePath.isBrowsing
            ? browseItems.length > 0
              ? [
                  {
                    value: "host-files",
                    label: browseQuery.data?.parentPath ?? "",
                    items: browseItems,
                  },
                ]
              : []
            : items.length > 0
              ? [{ value: "project-files", label: target.projectName, items }]
              : []
        }
        highlightedItemValue={highlightedItemValue}
        isActionsOnly={false}
        keybindings={keybindings}
        onExecuteItem={(item) => {
          if (item.kind !== "action") return;
          if (!item.keepOpen) props.setOpen(false);
          void item.run();
        }}
        emptyStateMessage={emptyStateMessage}
      />
    </CommandPaletteContent>
  );
}

export function ProjectFilePicker(props: ProjectFilePickerProps) {
  const target = useActiveProjectTarget();

  if (!target) {
    return <EmptyProjectFilePicker />;
  }

  return <OpenProjectFilePicker setOpen={props.setOpen} target={target} />;
}
