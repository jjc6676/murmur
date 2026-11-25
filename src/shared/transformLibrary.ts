// Built-in Transform library: curated collections the user can add to "My Transforms".
// Each prompt must produce replacement text for the user's selection (the transform runtime pastes the output
// over the selection), so prompts describe the desired output, never meta-commentary.

export interface LibraryTransform {
  /** Stable id: `lib.<collection>.<slug>` — saved into settings when added, never renamed. */
  id: string;
  name: string;
  /** One short line shown on the card. */
  description: string;
  /** Instructions for the LLM. Output is pasted over the selection. */
  prompt: string;
}

export interface TransformCollection {
  id: string;
  name: string;
  description: string;
  transforms: LibraryTransform[];
}

export const TRANSFORM_COLLECTIONS: TransformCollection[] = [
  {
    id: 'writing',
    name: 'Writing & Editing',
    description: 'Refine dictated or drafted text without losing its meaning.',
    transforms: [
      {
        id: 'lib.writing.clarify',
        name: 'Clarify',
        description: 'Make confusing writing clear and precise.',
        prompt:
          "Rewrite the input so every sentence is easy to understand, resolving awkward or ambiguous phrasing only when the intended meaning is evident. Preserve the author's voice, language, facts, names, numbers, and level of detail; do not add claims or commentary, and return only plain text.",
      },
      {
        id: 'lib.writing.tighten-prose',
        name: 'Tighten Prose',
        description: 'Cut repetition and unnecessary words.',
        prompt:
          "Rewrite the input more concisely by removing repetition, filler, and redundant qualifiers while retaining every meaningful point. Preserve the author's voice, language, facts, names, and numbers, do not invent information, and return only plain text.",
      },
      {
        id: 'lib.writing.expand-detail',
        name: 'Expand Detail',
        description: 'Develop brief notes into complete prose.',
        prompt:
          'Expand the input into complete, coherent prose using only details that are present or logically required for grammar. Preserve the language, meaning, facts, names, numbers, and authorial voice; never invent examples or specifics, use clear placeholders such as [example] when essential information is missing, and return only plain text.',
      },
      {
        id: 'lib.writing.smooth-flow',
        name: 'Smooth Flow',
        description: 'Improve transitions and reading rhythm.',
        prompt:
          "Rewrite the input so ideas connect naturally, transitions are smooth, and the reading rhythm feels effortless. Preserve the author's voice, language, meaning, facts, names, and numbers; do not introduce new information, and return only plain text.",
      },
      {
        id: 'lib.writing.active-voice',
        name: 'Active Voice',
        description: 'Favor clear, active sentence construction.',
        prompt:
          'Rewrite passive or indirect constructions in active voice where the actor is known, while keeping passive voice where it is accurate or useful. Preserve the input language, meaning, facts, names, numbers, and tone; do not guess an unknown actor or add information, and return only plain text.',
      },
      {
        id: 'lib.writing.remove-jargon',
        name: 'Remove Jargon',
        description: 'Replace jargon with accessible wording.',
        prompt:
          'Rewrite specialized jargon, buzzwords, and corporate clichés in clear everyday language without oversimplifying necessary technical terms. Preserve the input language, meaning, facts, names, numbers, and authorial voice; do not add explanations or claims, and return only plain text.',
      },
      {
        id: 'lib.writing.vary-sentences',
        name: 'Vary Sentences',
        description: 'Improve cadence with varied sentence shapes.',
        prompt:
          'Rewrite the input with a natural mix of sentence lengths and structures, avoiding repetitive openings and monotonous cadence. Preserve the language, meaning, facts, names, numbers, and authorial voice; do not add or remove substantive content, and return only plain text.',
      },
      {
        id: 'lib.writing.stronger-opening',
        name: 'Stronger Opening',
        description: 'Lead with the most important idea.',
        prompt:
          'Rewrite the opening so it immediately establishes the central point and gives the reader a reason to continue, adjusting later transitions as needed. Preserve the input language, meaning, facts, names, numbers, and authorial voice; do not invent a hook or claim, and return only plain text.',
      },
      {
        id: 'lib.writing.sharper-ending',
        name: 'Sharper Ending',
        description: 'Finish with a clear, memorable conclusion.',
        prompt:
          'Rewrite the ending so it closes decisively on the main takeaway, implication, or next step already supported by the input. Preserve the language, meaning, facts, names, numbers, and authorial voice; do not invent a conclusion or call to action, and return only plain text.',
      },
      {
        id: 'lib.writing.fix-grammar',
        name: 'Fix Grammar',
        description: 'Correct spelling, grammar, and punctuation only.',
        prompt:
          "Proofread the input: correct spelling, grammar, punctuation, capitalization, and obvious dictation mistakes such as wrong homophones. Make the smallest edits possible and do not change word choice, tone, structure, or meaning unless something is actually wrong. Keep the input language, names, and numbers, and return only the corrected text.",
      },
    ],
  },
  {
    id: 'tone',
    name: 'Tone & Voice',
    description: 'Adapt how a message sounds for its audience and purpose.',
    transforms: [
      {
        id: 'lib.tone.friendly',
        name: 'Friendly Tone',
        description: 'Sound approachable and conversational.',
        prompt:
          'Rewrite the input in a friendly, approachable tone with natural warmth, without becoming overly familiar or changing the message. Keep the input language and preserve all facts, names, numbers, and intent; do not invent details, and return only plain text.',
      },
      {
        id: 'lib.tone.professional',
        name: 'Professional Tone',
        description: 'Sound polished, capable, and businesslike.',
        prompt:
          'Rewrite the input in a polished professional tone that is clear, respectful, and confident without sounding stiff. Keep the input language and preserve all facts, names, numbers, and intent; do not add claims or details, and return only plain text.',
      },
      {
        id: 'lib.tone.warm',
        name: 'Warm Tone',
        description: 'Add genuine warmth and consideration.',
        prompt:
          'Rewrite the input with genuine warmth, care, and human connection while avoiding sentimentality or exaggeration. Keep the input language and preserve its meaning, facts, names, numbers, and the author’s personality; do not invent details, and return only plain text.',
      },
      {
        id: 'lib.tone.confident',
        name: 'Confident Tone',
        description: 'Sound assured without becoming arrogant.',
        prompt:
          'Rewrite the input to sound assured, decisive, and credible, replacing unnecessary hedging while retaining legitimate uncertainty. Keep the input language and preserve meaning, facts, names, and numbers; do not overstate certainty or invent support, and return only plain text.',
      },
      {
        id: 'lib.tone.diplomatic',
        name: 'Diplomatic Tone',
        description: 'Handle disagreement with tact and respect.',
        prompt:
          'Rewrite the input diplomatically, acknowledging relevant perspectives and expressing disagreement or constraints with tact. Keep the input language and preserve the actual position, facts, names, and numbers; do not weaken the core message or invent common ground, and return only plain text.',
      },
      {
        id: 'lib.tone.empathetic',
        name: 'Empathetic Tone',
        description: 'Show understanding without making assumptions.',
        prompt:
          "Rewrite the input with empathy by recognizing the recipient's likely experience only where the text supports it and by using considerate language. Keep the input language and preserve meaning, facts, names, and numbers; do not assume feelings, promise outcomes, or invent details, and return only plain text.",
      },
      {
        id: 'lib.tone.direct',
        name: 'Direct Tone',
        description: 'State the point plainly and respectfully.',
        prompt:
          'Rewrite the input so the main point, request, or decision is stated early and plainly, using respectful but unambiguous wording. Keep the input language and preserve meaning, facts, names, and numbers; do not add demands or remove necessary nuance, and return only plain text.',
      },
      {
        id: 'lib.tone.enthusiastic',
        name: 'Enthusiastic Tone',
        description: 'Add credible energy and excitement.',
        prompt:
          'Rewrite the input with lively, positive energy appropriate to the subject, avoiding hype, excessive punctuation, and unsupported superlatives. Keep the input language and preserve meaning, facts, names, and numbers; do not invent benefits or claims, and return only plain text.',
      },
      {
        id: 'lib.tone.casual',
        name: 'Casual Tone',
        description: 'Relaxed and conversational, still respectful.',
        prompt:
          'Rewrite the input in a relaxed, conversational tone, as if talking to a colleague you know well: plain everyday words, contractions, and shorter sentences, without slang that could read as disrespectful. Keep the input language and preserve meaning, facts, names, and numbers; do not add new content, and return only plain text.',
      },
      {
        id: 'lib.tone.persuasive',
        name: 'Persuasive Tone',
        description: 'Make the existing case more compelling.',
        prompt:
          'Rewrite the input persuasively by foregrounding its strongest supported reasons, benefits, and requested action in a credible voice. Keep the input language and preserve facts, names, numbers, caveats, and intent; do not invent evidence or overstate claims, and return only plain text.',
      },
    ],
  },
  {
    id: 'structure',
    name: 'Structure & Formatting',
    description: 'Reorganize selected text into practical, scannable formats.',
    transforms: [
      {
        id: 'lib.structure.bullet-list',
        name: 'Bullet List',
        description: 'Turn ideas into concise bullet points.',
        prompt:
          'Reorganize the input as a concise Markdown bullet list with one complete idea per bullet and a logical order. Preserve the input language, meaning, facts, names, and numbers, do not add items, and output only the list.',
      },
      {
        id: 'lib.structure.numbered-steps',
        name: 'Numbered Steps',
        description: 'Convert a process into ordered instructions.',
        prompt:
          'Convert the input into a Markdown numbered list of actionable steps in the correct sequence, keeping prerequisites or warnings beside the relevant step. Preserve the input language, facts, names, and numbers; do not infer missing procedures, use [missing step] only when a required gap is explicit, and output only the steps.',
      },
      {
        id: 'lib.structure.clear-headings',
        name: 'Clear Headings',
        description: 'Organize content under useful section headings.',
        prompt:
          'Reorganize the input under short, descriptive Markdown headings and retain concise paragraphs or lists beneath them. Preserve the input language, meaning, facts, names, and numbers, do not invent sections or content, and output only the reorganized text.',
      },
      {
        id: 'lib.structure.simple-table',
        name: 'Simple Table',
        description: 'Arrange comparable information in a table.',
        prompt:
          'Convert comparable information in the input into a compact Markdown table with clear column labels and one item per row. Preserve the input language, facts, names, numbers, and units; do not guess missing values, use — for absent cells, and output only the table.',
      },
      {
        id: 'lib.structure.action-checklist',
        name: 'Action Checklist',
        description: 'Turn tasks into a usable checklist.',
        prompt:
          'Convert every actionable item in the input into a Markdown task checklist, grouping related tasks only when the source supports categories. Preserve the input language, owners, dates, facts, names, and numbers; do not create tasks or mark any complete unless explicitly stated, and output only the checklist.',
      },
      {
        id: 'lib.structure.faq-format',
        name: 'FAQ Format',
        description: 'Reshape explanations as questions and answers.',
        prompt:
          'Reorganize the input as a concise Markdown FAQ with natural questions and answers drawn only from the supplied information. Preserve the input language, facts, names, and numbers; do not invent answers, and omit questions the input cannot answer.',
      },
      {
        id: 'lib.structure.meeting-agenda',
        name: 'Meeting Agenda',
        description: 'Turn notes into a focused meeting agenda.',
        prompt:
          'Convert the input into a Markdown meeting agenda with an objective, ordered discussion items, and any decisions or actions explicitly needed. Preserve the input language, facts, names, numbers, and stated timings; do not invent attendees or durations, use [owner] or [time] when required but missing, and output only the agenda.',
      },
      {
        id: 'lib.structure.decision-memo',
        name: 'Decision Memo',
        description: 'Frame information for a clear decision.',
        prompt:
          'Reorganize the input as a concise Markdown decision memo with headings for Decision, Context, Options, Tradeoffs, and Next Step, omitting sections unsupported by the text. Preserve the input language, facts, names, numbers, and uncertainty; do not recommend or invent anything not present, and output only the memo.',
      },
      {
        id: 'lib.structure.process-guide',
        name: 'Process Guide',
        description: 'Format instructions as an easy reference.',
        prompt:
          'Reorganize the input into a Markdown process guide with a clear title, prerequisites when stated, ordered steps, and stated escalation or completion criteria. Preserve the input language, facts, names, numbers, and warnings; do not fill procedural gaps, and output only the guide.',
      },
      {
        id: 'lib.structure.paragraph-breaks',
        name: 'Paragraph Breaks',
        description: 'Split dense text into readable paragraphs.',
        prompt:
          'Reformat the input into well-sized paragraphs, starting a new paragraph when the topic, speaker, time, or purpose changes. Preserve the exact input language and wording except for punctuation needed at paragraph boundaries; do not add, remove, or reorder information, and return only plain text.',
      },
    ],
  },
  {
    id: 'summarize',
    name: 'Summarize & Extract',
    description: 'Condense selected text or pull out the details that matter.',
    transforms: [
      {
        id: 'lib.summarize.quick-summary',
        name: 'Quick Summary',
        description: 'Condense text into a short overview.',
        prompt:
          'Summarize the input in two or three concise sentences covering its central point and most important supporting information. Use the input language, preserve facts, names, numbers, qualifications, and uncertainty, add nothing not stated, and return only plain text.',
      },
      {
        id: 'lib.summarize.key-points',
        name: 'Key Points',
        description: 'Capture the most important takeaways.',
        prompt:
          'Extract the most important ideas from the input as a concise Markdown bullet list, prioritizing information needed to understand or act. Use the input language, preserve facts, names, numbers, and caveats, do not add interpretations, and output only the list.',
      },
      {
        id: 'lib.summarize.action-items',
        name: 'Action Items',
        description: 'Extract tasks, owners, and due dates.',
        prompt:
          'Extract explicit action items as a Markdown checklist, including the stated owner and due date in each item when available. Use the input language, preserve exact facts, names, dates, and numbers, do not infer tasks or assignments, and use [owner] or [date] only when the text clearly requires but omits them.',
      },
      {
        id: 'lib.summarize.decisions-made',
        name: 'Decisions Made',
        description: 'List decisions and their stated rationale.',
        prompt:
          'Extract each decision explicitly made in the input and its stated rationale or consequence as a concise Markdown bullet list. Use the input language, preserve names, numbers, conditions, and uncertainty, do not treat proposals as decisions, and output only the list.',
      },
      {
        id: 'lib.summarize.open-questions',
        name: 'Open Questions',
        description: 'Identify unresolved questions and unknowns.',
        prompt:
          'Extract unresolved questions, missing information, and explicitly undecided issues from the input as a concise Markdown bullet list. Use the input language, preserve facts, names, numbers, and context, do not manufacture uncertainties, and output only the list.',
      },
      {
        id: 'lib.summarize.executive-brief',
        name: 'Executive Brief',
        description: 'Summarize for a time-pressed leader.',
        prompt:
          'Create a concise executive brief with Markdown headings for Bottom Line, Key Evidence, Risks, and Decision or Next Step, omitting unsupported sections. Use the input language, preserve facts, names, metrics, caveats, and uncertainty, do not invent recommendations, and output only the brief.',
      },
      {
        id: 'lib.summarize.meeting-recap',
        name: 'Meeting Recap',
        description: 'Condense notes into outcomes and next steps.',
        prompt:
          'Turn the input into a concise Markdown meeting recap covering purpose, key discussion, decisions, and action items with owners or dates when stated. Use the input language, preserve facts, names, numbers, and unresolved issues, do not invent outcomes, and output only the recap.',
      },
      {
        id: 'lib.summarize.extract-dates',
        name: 'Extract Dates',
        description: 'List dates, deadlines, and time references.',
        prompt:
          'Extract every date, deadline, time, and schedule reference from the input as a Markdown bullet list with a brief description of what each refers to. Keep the original date wording and input language, preserve names and numbers, do not calculate or infer missing dates, and output only the list.',
      },
      {
        id: 'lib.summarize.extract-people',
        name: 'Extract People',
        description: 'List people and their stated roles.',
        prompt:
          'Extract every named person from the input as a Markdown bullet list, adding only roles, organizations, ownership, or relationships explicitly stated. Use the input language and exact names, do not infer identities or titles, merge repeated references when clearly the same person, and output only the list.',
      },
      {
        id: 'lib.summarize.extract-metrics',
        name: 'Extract Metrics',
        description: 'Pull out quantities, measures, and results.',
        prompt:
          'Extract all meaningful numbers, quantities, percentages, monetary values, and measured results as a Markdown bullet list with their stated context and units. Use the input language, preserve exact values and qualifiers, do not calculate or infer values, and output only the list.',
      },
    ],
  },
  {
    id: 'email',
    name: 'Email',
    description: 'Turn selections into clear, send-ready email drafts and replies.',
    transforms: [
      {
        id: 'lib.email.draft-email',
        name: 'Draft Email',
        description: 'Turn rough notes into a complete email.',
        prompt:
          'Treat the input as notes and turn them into a send-ready email with a concise subject line, appropriate greeting, clear body, and natural sign-off. Keep the input language, preserve facts, names, numbers, intent, and the author’s voice, do not invent details, and use bracketed placeholders such as [name] only for required missing information.',
      },
      {
        id: 'lib.email.reply-agreeing',
        name: 'Reply Agreeing',
        description: 'Draft a concise positive reply.',
        prompt:
          'Treat the input as the email being answered and draft a send-ready reply that clearly agrees or accepts, acknowledges the key point, and confirms any next step supported by the message. Use the input language and exact names, facts, dates, and numbers; do not invent commitments, use [detail] if one is essential but missing, and return only the email text.',
      },
      {
        id: 'lib.email.reply-declining',
        name: 'Reply Declining',
        description: 'Decline politely while staying clear.',
        prompt:
          'Treat the input as the email being answered and draft a respectful, concise reply that declines the request without ambiguity and offers an alternative only when the input supports one. Use the input language and preserve names, facts, dates, and numbers; do not fabricate reasons or availability, and return only the email text.',
      },
      {
        id: 'lib.email.follow-up',
        name: 'Follow Up',
        description: 'Draft a tactful follow-up message.',
        prompt:
          'Treat the input as notes or the prior conversation and draft a concise follow-up email that restates the relevant context, makes the next step clear, and includes any stated deadline. Use the input language and preserve facts, names, dates, numbers, and tone; do not invent urgency or prior agreements, and return only the email text.',
      },
      {
        id: 'lib.email.request-action',
        name: 'Request Action',
        description: 'Write an email with a clear ask.',
        prompt:
          'Turn the input into a send-ready email that puts one clear request near the top, supplies only necessary context, and states the deadline or desired response when provided. Use the input language and preserve facts, names, numbers, and the author’s voice; do not invent a deadline, use [date] if one is explicitly needed but missing, and return only the email text.',
      },
      {
        id: 'lib.email.schedule-meeting',
        name: 'Schedule Meeting',
        description: 'Draft a focused meeting request.',
        prompt:
          'Turn the input into a concise meeting-request email stating the purpose, proposed timing or duration, expected participants, and preparation only when supplied. Use the input language and preserve facts, names, dates, times, and numbers; do not invent availability, use clear placeholders such as [time] for required missing details, and return only the email text.',
      },
      {
        id: 'lib.email.thank-you',
        name: 'Thank You Note',
        description: 'Write a specific and sincere thank-you.',
        prompt:
          'Turn the input into a brief, sincere thank-you email that names the specific help, gift, time, or outcome described and closes naturally. Use the input language and preserve facts, names, numbers, relationship, and the author’s voice; do not exaggerate or invent personal details, and return only the email text.',
      },
      {
        id: 'lib.email.apology',
        name: 'Apology Email',
        description: 'Acknowledge harm and state the remedy.',
        prompt:
          'Turn the input into a sincere apology email that clearly acknowledges what happened, takes appropriate responsibility, and states only the remedy or next step actually provided. Use the input language and preserve facts, names, dates, and numbers; do not make excuses, admissions, or promises beyond the source, and return only the email text.',
      },
      {
        id: 'lib.email.introduction',
        name: 'Introduction Email',
        description: 'Introduce people with relevant context.',
        prompt:
          'Turn the input into a concise introduction email that explains who each person is, why the connection may be useful, and who should take the next step. Use the input language and preserve exact names, roles, facts, and numbers; do not invent credentials or shared interests, use [role] only when essential and missing, and return only the email text.',
      },
      {
        id: 'lib.email.status-email',
        name: 'Status Email',
        description: 'Share progress, risks, and next steps.',
        prompt:
          'Turn the input into a scannable status email with a brief overview followed by progress, risks or blockers, and next steps when those details exist. Use the input language and preserve facts, names, dates, metrics, and uncertainty; do not invent progress or commitments, and return only the email text.',
      },
    ],
  },
  {
    id: 'messaging',
    name: 'Messaging & Updates',
    description: 'Package dictated notes for chat, team updates, and announcements.',
    transforms: [
      {
        id: 'lib.messaging.slack-update',
        name: 'Slack Update',
        description: 'Turn notes into a scannable chat update.',
        prompt:
          'Turn the input into a concise workplace chat update with the main point first, short paragraphs or bullets when useful, and a clear ask or next step if stated. Keep the input language, facts, names, numbers, and author’s voice, do not invent details, and output only the message.',
      },
      {
        id: 'lib.messaging.daily-standup',
        name: 'Daily Standup',
        description: 'Format work as yesterday, today, and blockers.',
        prompt:
          'Turn the input into a concise Markdown standup update under Yesterday, Today, and Blockers, omitting any heading unsupported by the notes. Keep the input language and preserve tasks, facts, names, dates, and numbers; do not invent progress or blockers, and output only the update.',
      },
      {
        id: 'lib.messaging.project-update',
        name: 'Project Update',
        description: 'Summarize project health and next steps.',
        prompt:
          'Turn the input into a concise project update covering current status, notable progress, risks, and next steps only where provided. Keep the input language and preserve facts, names, dates, metrics, and uncertainty; do not invent a status judgment or commitment, and output only the update.',
      },
      {
        id: 'lib.messaging.blocker-alert',
        name: 'Blocker Alert',
        description: 'Escalate a blocker with a clear need.',
        prompt:
          'Turn the input into a brief blocker alert that states what is blocked, the impact, what has been tried, and the decision or help needed when known. Keep the input language and preserve facts, names, dates, and numbers; do not assign blame or invent impact, and output only the alert.',
      },
      {
        id: 'lib.messaging.handoff-note',
        name: 'Handoff Note',
        description: 'Capture context for the next owner.',
        prompt:
          'Turn the input into a concise handoff note covering current state, completed work, remaining tasks, risks, and essential references when supplied. Keep the input language and preserve facts, names, dates, numbers, and uncertainty; do not invent work or access details, and output only the note.',
      },
      {
        id: 'lib.messaging.team-announcement',
        name: 'Team Announcement',
        description: 'Share news with clear relevance and timing.',
        prompt:
          'Turn the input into a clear team announcement that leads with the news, explains who is affected and when, and states any required action. Keep the input language and preserve facts, names, dates, numbers, and tone; do not invent rationale or impact, use [date] only if essential and missing, and output only the announcement.',
      },
      {
        id: 'lib.messaging.customer-update',
        name: 'Customer Update',
        description: 'Explain progress in customer-safe language.',
        prompt:
          'Turn the input into a concise customer update that explains the current state, customer impact, and next update or action only when supported. Keep the input language and preserve facts, dates, numbers, and uncertainty; remove internal jargon, do not expose unstated internal details or invent assurances, and output only the update.',
      },
      {
        id: 'lib.messaging.incident-update',
        name: 'Incident Update',
        description: 'Report an incident without speculation.',
        prompt:
          'Turn the input into a factual incident update covering observed impact, current status, actions underway, and the next stated update time. Keep the input language and preserve exact facts, timestamps, systems, and numbers; distinguish unknowns from confirmed information, do not speculate or invent resolution times, and output only the update.',
      },
      {
        id: 'lib.messaging.release-notes',
        name: 'Release Notes',
        description: 'Convert changes into user-focused notes.',
        prompt:
          'Turn the input into concise Markdown release notes grouped under Added, Changed, Fixed, or Removed as supported, describing user-visible impact rather than implementation detail. Keep the input language and preserve product names, versions, facts, and numbers; do not invent benefits or changes, and output only the notes.',
      },
      {
        id: 'lib.messaging.quick-reply',
        name: 'Quick Reply',
        description: 'Draft a brief context-aware response.',
        prompt:
          'Treat the input as the message being answered and draft a brief, natural reply that directly addresses its main point and any explicit question. Use the input language and preserve names, facts, dates, numbers, and the apparent relationship; do not invent an answer or commitment, use [answer] only if essential information is missing, and output only the reply.',
      },
    ],
  },
  {
    id: 'developer',
    name: 'Developer',
    description: 'Transform selected code or technical notes into paste-ready output.',
    transforms: [
      {
        id: 'lib.developer.explain-code',
        name: 'Explain Code',
        description: 'Explain what selected code does.',
        prompt:
          'Explain the selected code in concise technical prose, covering its purpose, control flow, inputs, outputs, and important side effects or edge cases visible in the snippet. Preserve exact identifiers and literal values, distinguish evidence from uncertainty, do not assume unseen context, and return only plain text suitable for an editor.',
      },
      {
        id: 'lib.developer.find-bugs',
        name: 'Find Bugs',
        description: 'Identify likely defects and fixes.',
        prompt:
          'Review the selected code for concrete correctness, security, concurrency, resource, and edge-case defects, then output a concise Markdown list with location, impact, and a specific fix for each finding. Preserve exact identifiers and values, do not report style preferences as bugs or assume unseen behavior, and output "No concrete bugs found." if none are supported.',
      },
      {
        id: 'lib.developer.review-code',
        name: 'Review Code',
        description: 'Give prioritized, actionable review feedback.',
        prompt:
          'Review the selected code and output a prioritized Markdown list of actionable findings covering correctness, maintainability, performance, and readability. Cite exact identifiers or lines from the snippet, explain impact and remediation, avoid speculative issues and praise-only commentary, and output "No actionable findings." when appropriate.',
      },
      {
        id: 'lib.developer.add-comments',
        name: 'Add Comments',
        description: 'Add comments for non-obvious logic.',
        prompt:
          'Return the selected code with concise comments added only where intent, constraints, invariants, or non-obvious reasoning need explanation. Preserve the code’s language, formatting, identifiers, literals, and behavior exactly, do not comment obvious syntax or invent rationale, and output only paste-ready code without fences.',
      },
      {
        id: 'lib.developer.write-docstring',
        name: 'Write Docstring',
        description: 'Add an idiomatic API doc comment.',
        prompt:
          'Return the selected declaration with an idiomatic docstring or documentation comment for its programming language, describing purpose, parameters, return value, thrown errors, and side effects only when evidenced. Preserve all code, identifiers, types, literals, and behavior, do not invent guarantees or examples, and output only paste-ready code without fences.',
      },
      {
        id: 'lib.developer.generate-tests',
        name: 'Generate Tests',
        description: 'Create focused tests for selected code.',
        prompt:
          'Generate paste-ready tests for the selected code using the testing framework and conventions visible in the input, covering normal behavior, boundaries, and supported failure cases. Preserve exact APIs and semantics, do not invent dependencies or hidden behavior, use clear placeholders such as [import path] only when essential context is missing, and output only code without fences.',
      },
      {
        id: 'lib.developer.refactor-code',
        name: 'Refactor Code',
        description: 'Simplify code without changing behavior.',
        prompt:
          'Refactor the selected code for clarity and maintainability while preserving its public API, behavior, error semantics, data ordering, and side effects. Keep the same programming language and project style, avoid new dependencies or speculative abstractions, and output only complete paste-ready code without fences.',
      },
      {
        id: 'lib.developer.optimize-code',
        name: 'Optimize Code',
        description: 'Reduce avoidable work while preserving behavior.',
        prompt:
          'Optimize the selected code by removing demonstrably avoidable computation, allocation, copying, or I/O while preserving its API, behavior, ordering, errors, and side effects. Keep the same language and style, do not trade correctness or readability for hypothetical gains, and output only complete paste-ready code without fences.',
      },
      {
        id: 'lib.developer.convert-pseudocode',
        name: 'Convert Pseudocode',
        description: 'Turn pseudocode into implementation code.',
        prompt:
          'Convert the selected pseudocode or technical notes into complete paste-ready code in the language and style indicated by the input. Preserve all stated logic, names, values, and constraints, do not invent business rules or dependencies, use explicit placeholders such as [type] only for essential missing information, and output only code without fences.',
      },
      {
        id: 'lib.developer.commit-message',
        name: 'Commit Message',
        description: 'Write a conventional commit message.',
        prompt:
          'Treat the input as a diff summary or change notes and write one Conventional Commit message with a concise imperative subject and an optional body explaining motivation or impact. Preserve exact component names, issue references, and facts, do not invent tests or outcomes, and output only the commit message as plain text.',
      },
    ],
  },
  {
    id: 'prompting',
    name: 'AI Prompting',
    description: 'Apply focused improvements to selected AI instructions.',
    transforms: [
      {
        id: 'lib.prompting.prompt-critique',
        name: 'Prompt Critique',
        description: 'Identify weaknesses in an AI prompt.',
        prompt:
          'Treat the input as an AI prompt and replace it with a concise Markdown critique covering ambiguity, missing context, conflicting instructions, unverifiable assumptions, and likely failure modes. Quote only short relevant phrases, preserve the prompt’s intended goal, do not invent requirements, and output only the critique.',
      },
      {
        id: 'lib.prompting.add-context',
        name: 'Add Context',
        description: 'Make required background explicit.',
        prompt:
          'Treat the input as an AI prompt and rewrite it with a clearly labeled Context section containing all background already implied or stated. Preserve the original goal, facts, names, numbers, constraints, and language; do not invent context, use concise bracketed placeholders for essential missing background, and output only the revised prompt.',
      },
      {
        id: 'lib.prompting.define-audience',
        name: 'Define Audience',
        description: 'Specify who the output is for.',
        prompt:
          'Treat the input as an AI prompt and rewrite it so the intended audience, their knowledge level, and their needs are explicit wherever the source supports them. Preserve the original goal, facts, constraints, and language, do not invent an audience, use [audience] or [knowledge level] when required but missing, and output only the revised prompt.',
      },
      {
        id: 'lib.prompting.set-constraints',
        name: 'Set Constraints',
        description: 'Clarify boundaries and non-goals.',
        prompt:
          'Treat the input as an AI prompt and reorganize its requirements into explicit Must, Must Not, and Non-goals constraints where applicable. Preserve every original requirement, fact, name, number, and language, do not add arbitrary restrictions, mark essential omissions with bracketed placeholders, and output only the revised prompt.',
      },
      {
        id: 'lib.prompting.specify-format',
        name: 'Specify Format',
        description: 'Define an exact response shape.',
        prompt:
          'Treat the input as an AI prompt and rewrite it with an explicit Output Format section describing the response structure, fields, order, length, and formatting already required or clearly implied. Preserve the goal, facts, constraints, and language, do not invent content requirements, use [format] when the needed format is absent, and output only the revised prompt.',
      },
      {
        id: 'lib.prompting.add-examples',
        name: 'Add Examples',
        description: 'Create a grounded example scaffold.',
        prompt:
          'Treat the input as an AI prompt and add a compact Examples section that uses only examples already present in the input, arranging them as input-output pairs when possible. Preserve the original goal, facts, constraints, and language, do not fabricate examples, use [example input] and [expected output] placeholders when examples are required but absent, and output only the revised prompt.',
      },
      {
        id: 'lib.prompting.create-rubric',
        name: 'Create Rubric',
        description: 'Define measurable success criteria.',
        prompt:
          'Treat the input as an AI prompt and add a concise Success Criteria section with observable checks derived from its stated requirements. Preserve the original goal, facts, constraints, names, numbers, and language, do not create unsupported standards, represent genuinely missing criteria with [criterion], and output only the revised prompt.',
      },
      {
        id: 'lib.prompting.split-workflow',
        name: 'Split Workflow',
        description: 'Sequence a complex prompt into steps.',
        prompt:
          'Treat the input as an AI prompt and rewrite it as an ordered workflow of clear, dependency-aware steps, ending with the required deliverable. Preserve the original goal, facts, constraints, names, numbers, and language, do not add tasks or expose private chain-of-thought, and output only the revised prompt.',
      },
      {
        id: 'lib.prompting.add-guardrails',
        name: 'Add Guardrails',
        description: 'Make uncertainty and safety handling explicit.',
        prompt:
          'Treat the input as an AI prompt and add concise guardrails for handling missing information, uncertainty, conflicting instructions, and unsupported claims. Preserve the original goal, facts, constraints, and language, do not change the task or add unrelated policy, require clear placeholders rather than invented details, and output only the revised prompt.',
      },
      {
        id: 'lib.prompting.make-template',
        name: 'Make Template',
        description: 'Convert a prompt into a reusable template.',
        prompt:
          'Treat the input as an AI prompt and convert its variable details into clear, consistently named bracketed placeholders while keeping fixed instructions intact. Preserve the original goal, structure, constraints, language, and examples, do not remove essential specifics or add requirements, and output only the reusable prompt template.',
      },
    ],
  },
  {
    id: 'social',
    name: 'Social & Marketing',
    description: 'Adapt selected ideas into channel-ready promotional copy.',
    transforms: [
      {
        id: 'lib.social.linkedin-post',
        name: 'LinkedIn Post',
        description: 'Create a professional, readable LinkedIn post.',
        prompt:
          'Turn the input into a polished LinkedIn post with a strong but credible opening, short readable paragraphs, and a natural closing thought or call to action supported by the source. Keep the input language and author’s voice, preserve facts, names, numbers, and nuance, do not invent achievements or claims, and output only the post.',
      },
      {
        id: 'lib.social.x-post',
        name: 'X Post',
        description: 'Condense an idea into a short social post.',
        prompt:
          'Turn the input into one clear, engaging X post of at most 280 characters, retaining the central message and only essential context. Keep the input language and author’s voice, preserve facts, names, and numbers, do not invent claims or hashtags, and output only the post.',
      },
      {
        id: 'lib.social.instagram-caption',
        name: 'Instagram Caption',
        description: 'Write a vivid, natural social caption.',
        prompt:
          'Turn the input into an engaging Instagram caption with a natural opening, concise body, and a call to action only when supported. Keep the input language and author’s voice, preserve facts, names, and numbers, do not invent scene details or hashtags, and output only the caption.',
      },
      {
        id: 'lib.social.social-thread',
        name: 'Social Thread',
        description: 'Break a longer idea into a coherent thread.',
        prompt:
          'Turn the input into a numbered social thread whose first post states the core idea and whose later posts each develop one supported point. Keep the input language and author’s voice, preserve facts, names, numbers, and logical order, do not invent evidence, and output only the thread as plain text.',
      },
      {
        id: 'lib.social.blog-teaser',
        name: 'Blog Teaser',
        description: 'Write a short preview that earns attention.',
        prompt:
          'Turn the input into a concise blog teaser that identifies the reader’s relevant question, previews the value of the piece, and invites reading without revealing every conclusion. Keep the input language and author’s voice, preserve facts, names, and numbers, do not use clickbait or invent benefits, and output only the teaser.',
      },
      {
        id: 'lib.social.product-launch',
        name: 'Product Launch',
        description: 'Announce a product with credible benefits.',
        prompt:
          'Turn the input into concise product-launch copy that states what is launching, who it helps, the supported benefit, availability, and the intended call to action. Keep the input language and brand voice, preserve product names, dates, facts, and numbers, do not invent features or testimonials, use [date] or [link] only when essential and missing, and output only the copy.',
      },
      {
        id: 'lib.social.event-promo',
        name: 'Event Promo',
        description: 'Promote an event with essential details.',
        prompt:
          'Turn the input into concise event promotional copy with the event’s value, audience, date, time, location, and registration action when provided. Keep the input language and brand voice, preserve names, dates, facts, and numbers, do not invent speakers or urgency, use bracketed placeholders for essential missing logistics, and output only the copy.',
      },
      {
        id: 'lib.social.customer-story',
        name: 'Customer Story',
        description: 'Frame a real outcome as a brief story.',
        prompt:
          'Turn the input into a concise customer story structured around the customer’s challenge, approach, and documented outcome. Keep the input language and brand voice, preserve names, quotes, facts, metrics, and caveats, do not invent causation, praise, or results, and output only the story.',
      },
      {
        id: 'lib.social.call-to-action',
        name: 'Call To Action',
        description: 'Create a specific, motivating next step.',
        prompt:
          'Rewrite the input as a concise call to action that states the specific action, its supported value, and any real deadline or eligibility condition. Keep the input language and brand voice, preserve facts, names, dates, and numbers, do not invent urgency or benefits, and output only the call to action.',
      },
      {
        id: 'lib.social.hashtag-set',
        name: 'Hashtag Set',
        description: 'Generate focused hashtags from the text.',
        prompt:
          'Create a single line of five to eight relevant hashtags based strictly on the input’s topic, audience, brand names, and established terminology. Keep the input language where hashtags naturally support it, preserve exact names, avoid invented campaigns and vague spam tags, and output only the hashtags separated by spaces.',
      },
    ],
  },
  {
    id: 'language',
    name: 'Language & Translation',
    description: 'Translate selected text while preserving meaning and formatting.',
    transforms: [
      {
        id: 'lib.language.to-english',
        name: 'To English',
        description: 'Translate the selection into natural English.',
        prompt:
          'Translate the input into natural, idiomatic English while preserving meaning, tone, formality, paragraph structure, names, numbers, and units. Do not add, omit, explain, or localize factual content; retain untranslatable terms as written when needed, and output only the translation as plain text.',
      },
      {
        id: 'lib.language.to-spanish',
        name: 'To Spanish',
        description: 'Translate the selection into natural Spanish.',
        prompt:
          'Translate the input into neutral, natural Spanish while preserving meaning, tone, formality, paragraph structure, names, numbers, and units. Do not add, omit, explain, or localize factual content; retain untranslatable terms as written when needed, and output only the translation as plain text.',
      },
      {
        id: 'lib.language.to-french',
        name: 'To French',
        description: 'Translate the selection into natural French.',
        prompt:
          'Translate the input into natural standard French while preserving meaning, tone, formality, paragraph structure, names, numbers, and units. Do not add, omit, explain, or localize factual content; retain untranslatable terms as written when needed, and output only the translation as plain text.',
      },
      {
        id: 'lib.language.to-german',
        name: 'To German',
        description: 'Translate the selection into natural German.',
        prompt:
          'Translate the input into natural standard German while preserving meaning, tone, formality, paragraph structure, names, numbers, and units. Do not add, omit, explain, or localize factual content; retain untranslatable terms as written when needed, and output only the translation as plain text.',
      },
      {
        id: 'lib.language.to-portuguese',
        name: 'To Portuguese',
        description: 'Translate the selection into natural Portuguese.',
        prompt:
          'Translate the input into natural Brazilian Portuguese while preserving meaning, tone, formality, paragraph structure, names, numbers, and units. Do not add, omit, explain, or localize factual content; retain untranslatable terms as written when needed, and output only the translation as plain text.',
      },
      {
        id: 'lib.language.to-chinese',
        name: 'To Chinese',
        description: 'Translate the selection into Simplified Chinese.',
        prompt:
          'Translate the input into natural Simplified Chinese while preserving meaning, tone, formality, paragraph structure, names, numbers, and units. Do not add, omit, explain, or localize factual content; transliterate names only when conventional and retain untranslatable terms as needed, then output only the translation as plain text.',
      },
      {
        id: 'lib.language.to-japanese',
        name: 'To Japanese',
        description: 'Translate the selection into natural Japanese.',
        prompt:
          'Translate the input into natural Japanese using a level of politeness appropriate to the source while preserving meaning, tone, paragraph structure, names, numbers, and units. Do not add, omit, explain, or localize factual content; retain untranslatable terms as written when needed, and output only the translation as plain text.',
      },
      {
        id: 'lib.language.to-korean',
        name: 'To Korean',
        description: 'Translate the selection into natural Korean.',
        prompt:
          'Translate the input into natural Korean using a level of politeness appropriate to the source while preserving meaning, tone, paragraph structure, names, numbers, and units. Do not add, omit, explain, or localize factual content; retain untranslatable terms as written when needed, and output only the translation as plain text.',
      },
      {
        id: 'lib.language.to-arabic',
        name: 'To Arabic',
        description: 'Translate the selection into Modern Standard Arabic.',
        prompt:
          'Translate the input into natural Modern Standard Arabic while preserving meaning, tone, formality, paragraph structure, names, numbers, and units. Do not add, omit, explain, or localize factual content; retain untranslatable terms as written when needed, and output only the translation as plain text.',
      },
      {
        id: 'lib.language.plain-language',
        name: 'Plain Language',
        description: 'Make text easier for a broad audience.',
        prompt:
          'Rewrite the input in plain language using familiar words, direct sentences, and clear explanations for necessary technical terms, aiming for broad adult readability. Keep the input language and preserve meaning, facts, names, numbers, tone, and essential nuance; do not add examples or claims, and return only plain text.',
      },
    ],
  },
];

export function findLibraryTransform(id: string): { collection: TransformCollection; transform: LibraryTransform } | null {
  for (const collection of TRANSFORM_COLLECTIONS) {
    const transform = collection.transforms.find((item) => item.id === id);
    if (transform) return { collection, transform };
  }
  return null;
}
