import { useState, useEffect, useRef } from "react";
import type { ModuleInfo } from "./useWorkers";

interface SkillData {
  name: string;
  content: string;
  source: "built-in" | "user";
}

export function SkillEditor({
  skillName,
  modules,
  assignedSkills,
  onSkillsChange,
  onClose,
}: {
  skillName: string;
  modules: ModuleInfo[];
  assignedSkills: string[];
  onSkillsChange: (role: string, skills: string[]) => void;
  onClose: () => void;
}) {
  const [skill, setSkill] = useState<SkillData | null>(null);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [localAssigned, setLocalAssigned] = useState<string[]>(assignedSkills);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch(`/api/skills/${encodeURIComponent(skillName)}`)
      .then((r) => r.json())
      .then((data: SkillData) => {
        setSkill(data);
        setContent(data.content);
      })
      .catch(() => {
        setSkill({ name: skillName, content: "", source: "user" });
        setContent("");
      });
  }, [skillName]);

  useEffect(() => {
    setLocalAssigned(assignedSkills);
  }, [assignedSkills]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [skill]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      // Save base prompt
      const isModified = content !== skill?.content;
      if (isModified) {
        const res = await fetch(`/api/skills/${encodeURIComponent(skillName)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Failed to save");
        }
      }

      // Save skill assignments
      const res2 = await fetch(`/api/roles/${encodeURIComponent(skillName)}/skills`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skills: localAssigned }),
      });
      if (!res2.ok) {
        const data = await res2.json();
        throw new Error(data.error ?? "Failed to save skills");
      }

      onSkillsChange(skillName, localAssigned);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggleModule = (modName: string) => {
    setLocalAssigned((prev) =>
      prev.includes(modName)
        ? prev.filter((n) => n !== modName)
        : [...prev, modName],
    );
  };

  if (!skill) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-loading">Loading...</div>
        </div>
      </div>
    );
  }

  const isModified =
    content !== skill.content ||
    JSON.stringify(localAssigned.slice().sort()) !==
      JSON.stringify(assignedSkills.slice().sort());

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--skill-editor" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-row">
            <span className="modal-title">{skill.name}</span>
            <span className={`modal-badge modal-badge--${skill.source}`}>
              {skill.source}
            </span>
          </div>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          {/* Skills modules section */}
          <div className="skill-modules-section">
            <div className="skill-modules-label">Skills</div>
            <div className="skill-modules-hint">
              Select skills to add to this agent's knowledge.
            </div>
            <div className="skill-modules-grid">
              {modules.map((mod) => {
                const isActive = localAssigned.includes(mod.name);
                return (
                  <button
                    key={mod.name}
                    className={`skill-module-chip ${isActive ? "skill-module-chip--active" : ""}`}
                    onClick={() => toggleModule(mod.name)}
                  >
                    {isActive && <span className="skill-module-check">+</span>}
                    {mod.name}
                  </button>
                );
              })}
              {modules.length === 0 && (
                <span className="skill-modules-empty">No modules available</span>
              )}
            </div>
          </div>

          {/* Base prompt editor */}
          <div className="skill-editor-hint">
            Base system prompt for this role.
          </div>
          <textarea
            ref={textareaRef}
            className="skill-editor-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
          />
        </div>

        <div className="modal-footer">
          {error && <span className="modal-error">{error}</span>}
          {saved && <span className="modal-saved">Saved</span>}
          <div className="modal-actions">
            <button className="btn btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn--primary"
              onClick={handleSave}
              disabled={saving || !isModified}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
