"use client";

import type { ContextMentionCandidate, ContextMentionSuggestionGroup } from "@/lib/context-mentions";

type ContextMentionDropdownProps = {
  menuLevel: "group" | "item";
  highlightedIndex: number;
  suggestionGroups: ContextMentionSuggestionGroup[];
  activeGroup: ContextMentionSuggestionGroup | null;
  visibleSuggestions: ContextMentionCandidate[];
  handleDropdownMouseDown: () => void;
  enterGroup: (groupId?: ContextMentionSuggestionGroup["groupId"]) => boolean;
  backToGroups: () => void;
  selectSuggestion: (candidate: ContextMentionCandidate) => boolean;
  emptyText?: string;
};

export function ContextMentionDropdown({
  menuLevel,
  highlightedIndex,
  suggestionGroups,
  activeGroup,
  visibleSuggestions,
  handleDropdownMouseDown,
  enterGroup,
  backToGroups,
  selectSuggestion,
  emptyText = "没找到可引用的历史记录",
}: ContextMentionDropdownProps) {
  if (menuLevel === "group") {
    return (
      <div className="context-mention-dropdown">
        {suggestionGroups.length > 0 ? (
          <>
            <div className="context-mention-dropdown__header">
              <div className="context-mention-dropdown__header-copy">
                <span className="context-mention-dropdown__title">选择引用分类</span>
                <span className="context-mention-dropdown__hint">上下选择，回车进入</span>
              </div>
            </div>
            <div className="context-mention-group-menu">
              {suggestionGroups.map((group, index) => (
                <button
                  key={group.groupId}
                  type="button"
                  className={`context-mention-group-card ${index === highlightedIndex ? "is-active" : ""}`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    handleDropdownMouseDown();
                  }}
                  onClick={() => enterGroup(group.groupId)}
                >
                  <span className="context-mention-group-card__topline">
                    <span className="context-mention-group-card__eyebrow">{group.groupLabel}</span>
                    <span className="context-mention-group-card__count">{group.count} 条</span>
                  </span>
                  <span className="context-mention-group-card__preview">
                    {group.items[0]?.label ?? "暂无内容"}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="context-mention-option context-mention-option--empty">
            {emptyText}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="context-mention-dropdown">
      {activeGroup && visibleSuggestions.length > 0 ? (
        <>
          <div className="context-mention-dropdown__header is-submenu">
            <button
              type="button"
              className="context-mention-back"
              onMouseDown={(event) => {
                event.preventDefault();
                handleDropdownMouseDown();
              }}
              onClick={backToGroups}
            >
              返回
            </button>
            <div className="context-mention-dropdown__header-copy">
              <span className="context-mention-dropdown__title">{activeGroup.groupLabel}</span>
              <span className="context-mention-dropdown__hint">{activeGroup.count} 条可引用记录</span>
            </div>
          </div>
          <div className="context-mention-group__list">
            {visibleSuggestions.map((candidate, index) => (
              <button
                key={candidate.key}
                type="button"
                className={`context-mention-option ${index === highlightedIndex ? "is-active" : ""}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleDropdownMouseDown();
                }}
                onClick={() => selectSuggestion(candidate)}
              >
                <span className="context-mention-option__kind">{candidate.groupLabel}</span>
                <span className="context-mention-option__body">
                  <span className="context-mention-option__path">
                    {candidate.groupLabel} &gt; {candidate.label}
                  </span>
                  {candidate.description ? (
                    <span className="context-mention-option__description">{candidate.description}</span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="context-mention-option context-mention-option--empty">
          {emptyText}
        </div>
      )}
    </div>
  );
}
