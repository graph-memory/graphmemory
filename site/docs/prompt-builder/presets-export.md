---
title: "Presets & Export"
sidebar_label: "Presets & Export"
sidebar_position: 7
description: "Save prompt configurations as presets, export as markdown files, and share prompts with your team through skills or file exports."
keywords: [presets, export, save prompt, share prompt, skill export, clipboard, download]
---

# Presets & Export

Once you've built a prompt you like, you can save it for reuse, export it in several formats, or share it with your team.

:::note
**Presets** and **Download as `.md`** are available only in the **Advanced Builder**. The Simple Builder supports **Copy to clipboard** and **Export as Skill**.
:::

## Saving presets

Presets store your complete builder configuration — scenario, graphs, role, style, and all Advanced Builder settings — in your browser's local storage.

To save a preset:

1. Configure your prompt in the Simple or Advanced Builder
2. Enter a name for the preset
3. Click **Save Preset**

Your preset captures the full `MegaBuilderState`, including tool priorities, workflow steps, behavior settings, memory strategy, search configuration, context budgets, project rules, collaboration settings, and any custom sections.

## Loading presets

To load a saved preset:

1. Open the preset selector in the builder
2. Click the preset you want to load
3. All builder settings update to match the saved configuration

The live preview updates immediately, so you can verify the preset produces the prompt you expect.

## Deleting presets

To remove a preset you no longer need, click the delete button next to the preset name. This removes it from your browser's local storage. This action cannot be undone.

## Export options

### Copy to clipboard

Click the **Copy** button to copy the full generated prompt as plain text. Paste it into your AI assistant's system prompt field, a configuration file, or any text editor.

### Download as `.md`

Click the **Download** button to save the prompt as a markdown file. This is useful for:

- Storing prompts alongside your project in version control
- Reviewing prompt changes over time with `git diff`
- Sharing specific prompts via file attachments

The downloaded file contains the complete assembled prompt, ready to use as-is.

### Export as Skill

Click **Export as Skill** to create a skill entry in your project's skill graph. This stores the prompt as a reusable procedure within graphmemory itself, which means:

- The prompt becomes searchable through `search_skills` and `recall_skills`
- Other AI assistants connected to the same project can find and use the prompt
- The skill tracks usage count, so you can see which prompts your team uses most

When exporting as a skill, the builder creates a skill with:
- The prompt content as the skill description and steps
- Trigger keywords based on the scenario and role
- Tags for easy filtering

## Sharing presets with team members

Since presets are stored in browser local storage, they don't automatically sync across machines or team members. Here are ways to share prompt configurations:

**Export as Skill** (recommended): This stores the prompt in the project's skill graph, which is shared across all users of the project. Team members can find it with `recall_skills` or browse it in the Skills section of the Web UI.

**Download and share the `.md` file**: Save the prompt as markdown and commit it to your repository, share it in a team chat, or add it to your project's documentation.

**Copy and paste**: Copy the prompt text and share it directly — through a wiki, a shared document, or a message.

For teams that want standardized prompts, the recommended workflow is:

1. Build and test the prompt in the Advanced Builder
2. Export it as a Skill with descriptive tags and trigger keywords
3. Team members use `recall_skills` to find the right prompt for their current task
