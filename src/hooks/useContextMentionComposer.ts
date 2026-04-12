import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  extractContextMentionQuery,
  filterContextMentionCandidateGroups,
  getContextMentionKey,
  isSameContextMention,
  replaceContextMentionQuery,
  type ContextMentionCandidate,
  type ContextMentionQueryMatch,
  type ContextMentionSuggestionGroup,
} from "@/lib/context-mentions";
import type { ContextMentionRef } from "@/types/context-mentions";

export function useContextMentionComposer({
  value,
  candidates,
  selectedMentions,
  onValueChange,
  onSelectedMentionsChange,
  maxSuggestions = 8,
}: {
  value: string;
  candidates: ContextMentionCandidate[];
  selectedMentions: ContextMentionRef[];
  onValueChange: (value: string) => void;
  onSelectedMentionsChange: (mentions: ContextMentionRef[]) => void;
  maxSuggestions?: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const blurTimerRef = useRef<number | null>(null);
  const [activeQuery, setActiveQuery] = useState<ContextMentionQueryMatch | null>(null);
  const [menuLevel, setMenuLevel] = useState<"group" | "item">("group");
  const [activeGroupId, setActiveGroupId] = useState<ContextMentionSuggestionGroup["groupId"] | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const closeSuggestions = useCallback(() => {
    setActiveQuery(null);
    setMenuLevel("group");
    setActiveGroupId(null);
    setHighlightedIndex(0);
  }, []);

  const syncQuery = useCallback((nextValue: string, caret: number | null | undefined) => {
    const nextMatch = extractContextMentionQuery(nextValue, caret ?? nextValue.length);
    setActiveQuery(nextMatch);
    setMenuLevel("group");
    setActiveGroupId(null);
    setHighlightedIndex(0);
  }, []);

  const handleValueChange = useCallback((nextValue: string, caret?: number | null) => {
    onValueChange(nextValue);
    syncQuery(nextValue, caret);
  }, [onValueChange, syncQuery]);

  const suggestionGroups = useMemo(
    () => (activeQuery ? filterContextMentionCandidateGroups(candidates, activeQuery.query, selectedMentions, maxSuggestions) : []),
    [activeQuery, candidates, maxSuggestions, selectedMentions],
  );
  const activeGroup = useMemo(
    () => suggestionGroups.find(group => group.groupId === activeGroupId) ?? null,
    [activeGroupId, suggestionGroups],
  );
  const visibleSuggestions = useMemo(
    () => (menuLevel === "item" ? (activeGroup?.items ?? []) : []),
    [activeGroup, menuLevel],
  );

  useEffect(() => {
    if (!activeQuery || suggestionGroups.length === 0) {
      setMenuLevel("group");
      setActiveGroupId(null);
      setHighlightedIndex(0);
      return;
    }

    if (menuLevel === "item" && activeGroupId && !suggestionGroups.some(group => group.groupId === activeGroupId)) {
      setMenuLevel("group");
      setActiveGroupId(null);
      setHighlightedIndex(0);
    }
  }, [activeGroupId, activeQuery, menuLevel, suggestionGroups]);

  useEffect(() => {
    const visibleCount = menuLevel === "group" ? suggestionGroups.length : visibleSuggestions.length;
    if (visibleCount === 0 && highlightedIndex !== 0) {
      setHighlightedIndex(0);
      return;
    }
    if (visibleCount > 0 && highlightedIndex > visibleCount - 1) {
      setHighlightedIndex(visibleCount - 1);
    }
  }, [highlightedIndex, menuLevel, suggestionGroups.length, visibleSuggestions.length]);

  const enterGroup = useCallback((groupId?: ContextMentionSuggestionGroup["groupId"]) => {
    const resolvedGroupId = groupId
      ?? suggestionGroups[Math.min(highlightedIndex, Math.max(suggestionGroups.length - 1, 0))]?.groupId
      ?? null;
    if (!resolvedGroupId) return false;
    setMenuLevel("item");
    setActiveGroupId(resolvedGroupId);
    setHighlightedIndex(0);
    return true;
  }, [highlightedIndex, suggestionGroups]);

  const backToGroups = useCallback(() => {
    setMenuLevel("group");
    setActiveGroupId(null);
    setHighlightedIndex(0);
  }, []);

  const commitSuggestion = useCallback((candidate: ContextMentionCandidate) => {
    const fallbackMatch = extractContextMentionQuery(value, textareaRef.current?.selectionStart ?? value.length);
    const match = activeQuery ?? fallbackMatch;
    if (!match) return false;

    const nextMentions = selectedMentions.some(item => isSameContextMention(item, candidate))
      ? selectedMentions
      : [
          ...selectedMentions,
          {
            kind: candidate.kind,
            targetId: candidate.targetId,
            label: candidate.label,
            description: candidate.description,
          } satisfies ContextMentionRef,
        ];

    const replaced = replaceContextMentionQuery(value, match);
    onValueChange(replaced.value);
    onSelectedMentionsChange(nextMentions);
    closeSuggestions();

    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(replaced.caret, replaced.caret);
    });

    return true;
  }, [activeQuery, closeSuggestions, onSelectedMentionsChange, onValueChange, selectedMentions, value]);

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (!activeQuery) return false;

    if (event.key === "Escape") {
      event.preventDefault();
      if (menuLevel === "item") {
        backToGroups();
        return true;
      }
      closeSuggestions();
      return true;
    }

    if (menuLevel === "group") {
      if (suggestionGroups.length === 0) return false;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightedIndex(current => (current + 1) % suggestionGroups.length);
        return true;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightedIndex(current => (current - 1 + suggestionGroups.length) % suggestionGroups.length);
        return true;
      }

      if (event.key === "Enter" || event.key === "Tab" || event.key === "ArrowRight") {
        event.preventDefault();
        return enterGroup();
      }

      return false;
    }

    if (visibleSuggestions.length === 0) return false;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex(current => (current + 1) % visibleSuggestions.length);
      return true;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex(current => (current - 1 + visibleSuggestions.length) % visibleSuggestions.length);
      return true;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      backToGroups();
      return true;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      return commitSuggestion(visibleSuggestions[Math.min(highlightedIndex, visibleSuggestions.length - 1)]!);
    }

    return false;
  }, [
    activeQuery,
    backToGroups,
    closeSuggestions,
    commitSuggestion,
    enterGroup,
    highlightedIndex,
    menuLevel,
    suggestionGroups,
    visibleSuggestions,
  ]);

  const removeMention = useCallback((mention: ContextMentionRef) => {
    onSelectedMentionsChange(selectedMentions.filter(item => !isSameContextMention(item, mention)));
  }, [onSelectedMentionsChange, selectedMentions]);

  const refreshMentions = useCallback((nextMentions: ContextMentionRef[]) => {
    const existingKeys = new Set(candidates.map(candidate => candidate.key));
    onSelectedMentionsChange(
      nextMentions.filter(mention => existingKeys.has(getContextMentionKey(mention))),
    );
  }, [candidates, onSelectedMentionsChange]);

  const handleBlur = useCallback(() => {
    if (blurTimerRef.current) {
      window.clearTimeout(blurTimerRef.current);
    }
    blurTimerRef.current = window.setTimeout(() => {
      closeSuggestions();
    }, 120);
  }, [closeSuggestions]);

  const handleDropdownMouseDown = useCallback(() => {
    if (blurTimerRef.current) {
      window.clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  }, []);

  return {
    textareaRef,
    activeQuery,
    suggestionGroups,
    visibleSuggestions,
    menuLevel,
    activeGroup,
    highlightedIndex,
    hasSuggestionsOpen: Boolean(activeQuery),
    handleValueChange,
    handleSelectionChange: (caret: number | null | undefined) => syncQuery(value, caret),
    handleKeyDown,
    handleBlur,
    handleDropdownMouseDown,
    enterGroup,
    backToGroups,
    selectSuggestion: commitSuggestion,
    removeMention,
    refreshMentions,
    closeSuggestions,
  };
}
