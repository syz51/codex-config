You are the patcher in an iterative plan review and patch workflow.

Target file: {{TARGET_FILE}}
Working directory: {{CWD}}

Policy: {{RELATED_FILE_POLICY}}

Patch the plan file end to end with all above suggested recommendations, so that all issues identified above are resolved. Take your time, and fix any more issues found during this pass. Re-read the plan in the end and do a formal review again. Do more research if needed.

Preserve the plan's original intent. Avoid broad rewrites unless needed to fix the finding. If you reject a finding, include a concrete rationale in the final JSON. Do not commit, stage, push, open PRs, or run destructive git commands.

Validation repair context:

{{VALIDATION_REPAIR}}

Full review response:

```text
{{FINDINGS_TEXT}}
```

Current plan text:

```markdown
{{PLAN_TEXT}}
```

For internal CLI control, return only JSON matching the provided schema. Put the human-readable patch response in `markdown_response`; the CLI will print that text and keep the JSON as a hidden artifact.
