import React, { useState } from "react";
import axios from "axios";
import "./App.css";

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

async function generateStoryAI(task, type) {
  let prompt;
  if (type === "Bug") {
    prompt = `You are a Jira expert. Given the following bug report, generate a Jira bug in this format:\n\nTitle: <short title>\nDescription: <detailed bug description>\nSteps to Reproduce:\n1. ...\n2. ...\nExpected Result:\n...\nActual Result:\n...\n\nBug: ${task}`;
  } else {
    prompt = `You are a Jira expert. Given the following task, generate a Jira story in this format:\n\nTitle: <short title>\nDescription: As a <role>, I want <feature>, so that <benefit>.\nAcceptance Criteria (bullets):\n- ...\n- ...\n- ...\nAcceptance Criteria (Gherkin):\nGiven ...\nWhen ...\nThen ...\n\nALWAYS use the 'As a <role>, I want <feature>, so that <benefit>.' format for the description.\nALWAYS provide at least 3 acceptance criteria in both bullet and Gherkin formats.\n\nTask: ${task}`;
  }

  const response = await axios.post(
    OPENAI_API_URL,
    {
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: prompt },
      ],
      max_tokens: 400,
      temperature: 0.4,
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
    }
  );
  return response.data.choices[0].message.content;
}

function parseAIResponse(aiText, type, task) {
  const lines = aiText.split("\n");
  if (type === "Bug") {
    let title = "",
      description = "",
      steps = [],
      expected = "",
      actual = "";
    let mode = "";
    for (let line of lines) {
      if (line.startsWith("Title:")) {
        title = line.replace("Title:", "").trim();
        mode = "";
      } else if (line.startsWith("Description:")) {
        description = line.replace("Description:", "").trim();
        mode = "";
      } else if (line.toLowerCase().includes("steps to reproduce")) {
        mode = "steps";
      } else if (line.toLowerCase().includes("expected result")) {
        mode = "expected";
      } else if (line.toLowerCase().includes("actual result")) {
        mode = "actual";
      } else if (mode === "steps" && line.trim().match(/^\d+\./)) {
        steps.push(line.replace(/^\d+\.\s*/, "").trim());
      } else if (mode === "expected" && line.trim()) {
        expected += line.trim() + " ";
      } else if (mode === "actual" && line.trim()) {
        actual += line.trim() + " ";
      }
    }
    return {
      title,
      description,
      steps,
      expected: expected.trim(),
      actual: actual.trim(),
      type,
    };
  } else {
    let title = "",
      description = "",
      bullets = [],
      gherkin = [];
    let mode = "";
    for (let line of lines) {
      if (line.startsWith("Title:")) {
        title = line.replace("Title:", "").trim();
        mode = "";
      } else if (line.startsWith("Description:")) {
        description = line.replace("Description:", "").trim();
        mode = "";
      } else if (line.toLowerCase().includes("acceptance criteria (bullets)")) {
        mode = "bullets";
      } else if (line.toLowerCase().includes("acceptance criteria (gherkin)")) {
        mode = "gherkin";
      } else if (mode === "bullets" && line.trim().startsWith("- ")) {
        bullets.push(line.replace("- ", "").trim());
      } else if (
        mode === "gherkin" &&
        (line.trim().toLowerCase().startsWith("given") ||
          line.trim().toLowerCase().startsWith("when") ||
          line.trim().toLowerCase().startsWith("then"))
      ) {
        gherkin.push(line.trim());
      }
    }
    // Fallbacks if missing
    if (!description) {
      description = `As a user, I want to ${task}, so that I can achieve my goal.`;
    }
    if (!bullets || bullets.length < 3) {
      bullets = [
        `The feature allows the user to ${task.toLowerCase()}.`,
        "The implementation meets the described requirements.",
        "All edge cases are handled.",
      ];
    }
    if (!gherkin || gherkin.length < 3) {
      gherkin = [
        `Given the user wants to ${task.toLowerCase()},`,
        `When the user performs the necessary actions,`,
        `Then the system should allow the user to ${task.toLowerCase()} successfully.`,
      ];
    }
    return {
      title,
      description,
      acceptanceBullets: bullets,
      acceptanceGherkin: gherkin,
      type,
    };
  }
}

function generateStoryFallback(task, type) {
  if (type === "Bug") {
    return {
      title: `Bug: ${task}`,
      description: `There is a bug related to: ${task}`,
      steps: ["Step 1 to reproduce the bug.", "Step 2 to reproduce the bug."],
      expected: "The feature works as intended.",
      actual: "The bug occurs as described.",
      type: "Bug",
    };
  } else {
    const role = "user";
    const feature = task;
    const benefit = "achieve my goal";
    return {
      title: `Implement: ${task}`,
      description: `As a ${role}, I want to ${feature}, so that I can ${benefit}.`,
      acceptanceBullets: [
        `The feature allows the user to ${feature.toLowerCase()}.`,
        "The implementation meets the described requirements.",
        "All edge cases are handled.",
        "The feature is tested and documented.",
      ],
      acceptanceGherkin: [
        `Given the user wants to ${feature.toLowerCase()},`,
        `When the user performs the necessary actions,`,
        `Then the system should allow the user to ${feature.toLowerCase()} successfully.`,
      ],
      type: "Story",
    };
  }
}

export default function App() {
  const [task, setTask] = useState("");
  const [story, setStory] = useState(null);
  const [showGherkin, setShowGherkin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [type, setType] = useState("Story");
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setError("");
    setStory(null);
    if (!task.trim()) return;
    setLoading(true);
    try {
      if (OPENAI_API_KEY) {
        const aiText = await generateStoryAI(task.trim(), type);
        setStory(parseAIResponse(aiText, type, task.trim()));
      } else {
        setStory(generateStoryFallback(task.trim(), type));
      }
    } catch (e) {
      setError(
        "Failed to generate story. Please check your OpenAI API key and network."
      );
      setStory(generateStoryFallback(task.trim(), type));
    } finally {
      setLoading(false);
    }
  };

  // Helper to format the response for copy/export
  function formatResponse(story, showGherkin) {
    if (!story) return "";
    if (story.type === "Bug") {
      return (
        `Title: ${story.title}\n` +
        `Description: ${story.description}\n` +
        `Steps to Reproduce:\n` +
        story.steps.map((s, i) => `${i + 1}. ${s}`).join("\n") +
        `\nExpected Result:\n${story.expected}\n` +
        `Actual Result:\n${story.actual}`
      );
    } else {
      return (
        `Title: ${story.title}\n` +
        `Description: ${story.description}\n` +
        (showGherkin
          ? `Acceptance Criteria (Gherkin):\n` +
            story.acceptanceGherkin.join("\n")
          : `Acceptance Criteria (bullets):\n` +
            story.acceptanceBullets.map((b) => `- ${b}`).join("\n"))
      );
    }
  }

  // Copy to clipboard
  const handleCopy = () => {
    const text = formatResponse(story, showGherkin);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  // Export as .txt file
  const handleExport = () => {
    const text = formatResponse(story, showGherkin);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${story.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container">
      <h1>Jira Story Generator</h1>
      <div style={{ marginBottom: 12 }}>
        <label>
          <span style={{ marginRight: 8 }}>Type:</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="Story">Story</option>
            <option value="Bug">Bug</option>
          </select>
        </label>
      </div>
      <textarea
        value={task}
        onChange={(e) => setTask(e.target.value)}
        placeholder={
          type === "Bug" ? "Describe the bug..." : "Describe your task..."
        }
        rows={4}
      />
      <button onClick={handleGenerate} disabled={loading}>
        {loading ? "Generating..." : `Generate Jira ${type}`}
      </button>
      {error && <div style={{ color: "#c00", marginBottom: 10 }}>{error}</div>}
      {story && (
        <div className="story-output">
          <h2>{story.title}</h2>
          <p>
            <strong>Description:</strong> {story.description}
          </p>
          {story.type === "Bug" ? (
            <>
              <div style={{ margin: "1em 0" }}>
                <strong>Steps to Reproduce:</strong>
                <ol>
                  {story.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
              <div>
                <strong>Expected Result:</strong> {story.expected}
              </div>
              <div>
                <strong>Actual Result:</strong> {story.actual}
              </div>
            </>
          ) : (
            <>
              <div className="toggle">
                <label>
                  <input
                    type="checkbox"
                    checked={showGherkin}
                    onChange={() => setShowGherkin((v) => !v)}
                  />
                  Show Gherkin Format
                </label>
              </div>
              <div>
                <strong>Acceptance Criteria:</strong>
                {showGherkin ? (
                  <pre>
                    {story.acceptanceGherkin.map((line, i) => (
                      <div key={i}>{line}</div>
                    ))}
                  </pre>
                ) : (
                  <ul>
                    {story.acceptanceBullets.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
          <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
            <button type="button" onClick={handleCopy}>
              Copy
            </button>
            <button type="button" onClick={handleExport}>
              Export
            </button>
            {copied && (
              <span style={{ color: "#2d6cdf", marginLeft: 8 }}>Copied!</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
