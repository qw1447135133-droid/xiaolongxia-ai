"use client";

import type { ChangeEvent, MutableRefObject, ReactNode } from "react";

type ConversationComposerShellProps = {
  accept: string;
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenFilePicker: () => void;
  uploadTitle: string;
  disabled?: boolean;
  uploadActive?: boolean;
  rowClassName?: string;
  attachments?: ReactNode;
  hint?: ReactNode;
  field: ReactNode;
  action: ReactNode;
};

export function ConversationComposerShell({
  accept,
  fileInputRef,
  onFileChange,
  onOpenFilePicker,
  uploadTitle,
  disabled = false,
  uploadActive = false,
  rowClassName = "",
  attachments,
  hint,
  field,
  action,
}: ConversationComposerShellProps) {
  return (
    <>
      {attachments}
      <div className={`command-input__row ${rowClassName}`.trim()}>
        <input
          ref={(node) => {
            fileInputRef.current = node;
          }}
          type="file"
          accept={accept}
          multiple
          onChange={onFileChange}
          style={{ display: "none" }}
        />
        <button
          type="button"
          className={`command-input__upload command-input__send2 ${uploadActive ? "is-active" : ""}`.trim()}
          onClick={onOpenFilePicker}
          disabled={disabled}
          title={uploadTitle}
        >
          +
        </button>
        {field}
        {action}
      </div>
      {hint}
    </>
  );
}
