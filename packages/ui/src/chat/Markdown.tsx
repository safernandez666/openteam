import type { ReactNode } from "react";

/**
 * Lightweight markdown renderer for chat messages.
 * Supports: **bold**, *italic*, `code`, ```code blocks```,
 * numbered lists, bullet lists, and emojis (passthrough).
 */
export function Markdown({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return <>{blocks}</>;
}

function parseBlocks(text: string): ReactNode[] {
  const lines = text.split("\n");
  const result: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.trimStart().startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      result.push(
        <pre key={key++} className="md-code-block">
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // Empty line → spacer
    if (!line.trim()) {
      result.push(<div key={key++} className="md-spacer" />);
      i++;
      continue;
    }

    // Heading (## or ###)
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const className = `md-h${level}`;
      result.push(
        <div key={key++} className={className}>
          {renderInline(headingMatch[2])}
        </div>,
      );
      i++;
      continue;
    }

    // Table detection
    if (line.includes("|") && i + 1 < lines.length && lines[i + 1].match(/^\|?\s*[-:]+/)) {
      const tableLines: string[] = [line];
      i++;
      while (i < lines.length && lines[i].includes("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      result.push(renderTable(tableLines, key++));
      continue;
    }

    // Bullet list
    if (line.match(/^\s*[-*]\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\s*[-*]\s/)) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      result.push(
        <ul key={key++} className="md-list">
          {items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Numbered list
    if (line.match(/^\s*\d+[.)]\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\s*\d+[.)]\s/)) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
        i++;
      }
      result.push(
        <ol key={key++} className="md-list">
          {items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // Regular paragraph
    result.push(
      <div key={key++} className="md-paragraph">
        {renderInline(line)}
      </div>,
    );
    i++;
  }

  return result;
}

function renderInline(text: string): ReactNode[] {
  const result: ReactNode[] = [];
  // Regex to match: **bold**, *italic*, `code`
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      result.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      // **bold**
      result.push(<strong key={key++} className="md-bold">{match[2]}</strong>);
    } else if (match[3]) {
      // *italic*
      result.push(<em key={key++} className="md-italic">{match[3]}</em>);
    } else if (match[4]) {
      // `code`
      result.push(<code key={key++} className="md-code">{match[4]}</code>);
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex));
  }

  return result;
}

function renderTable(lines: string[], key: number): ReactNode {
  const parseRow = (line: string) =>
    line
      .split("|")
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);

  const headerCells = parseRow(lines[0]);
  // Skip separator (lines[1])
  const bodyRows = lines.slice(2).map(parseRow);

  return (
    <div key={key} className="md-table-wrap">
      <table className="md-table">
        <thead>
          <tr>
            {headerCells.map((cell, i) => (
              <th key={i}>{renderInline(cell)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{renderInline(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
