/**
 * Help content: one entry per card kind, link meaning, plot-hole check and tool.
 * Demos are tiny static diagrams (chips joined by links) — illustrations only,
 * nothing here is ever placed on your sheet.
 */
import type { Kind, Rel } from "./types";

export interface Chip {
  kind: Kind;
  text: string;
  sure?: number;
  status?: "todo" | "doing" | "done";
}

/** A row reads left to right: chip, link, chip, link, chip… */
export type DemoRow = (Chip | Rel)[];

export type HelpGroup = "Cards" | "Links" | "Checks" | "Tools";

export interface HelpEntry {
  id: string;
  group: HelpGroup;
  title: string;
  kind?: Kind;
  summary: string;
  body: string;
  /** For checks: what triggers it and how to clear it. */
  fix?: string;
  demo?: DemoRow[];
  keywords?: string;
}

const c = (kind: Kind, text: string, extra: Partial<Chip> = {}): Chip => ({ kind, text, ...extra });

export const HELP: HelpEntry[] = [
  // ── Cards ──
  {
    id: "thought", group: "Cards", kind: "thought", title: "Thought",
    summary: "Anything on your mind, unsorted.",
    body: "The lowest-friction card. Don't decide what it is yet — dump it, and sort later. Double-click the paper to make one, or press D to dump many at once. You can change any card's kind later in the inspector.",
    demo: [[c("thought", "Everything I think of already exists"), "supports", c("thought", "Maybe the gap is trust, not features")]],
    keywords: "note idea dump loose",
  },
  {
    id: "spark", group: "Cards", kind: "spark", title: "Spark",
    summary: "A raw idea worth keeping an eye on.",
    body: "Like a thought, but with potential. Sparks can float unconnected without being flagged. When one keeps pulling at you, promote it to a goal — that also adds a first 15-minute step.",
    demo: [[c("spark", "A planner that looks like a blueprint"), "supports", c("goal", "Ship one small thing this month")]],
    keywords: "idea inspiration promote",
  },
  {
    id: "question", group: "Cards", kind: "question", title: "Question",
    summary: "Something you don't know yet.",
    body: "Link possible answers (claims) into a question — those links read “answers”. The Big picture tab then ranks the answers by the evidence behind each (how much of the linked weight is for it; “too little to judge” until there are at least two reasons), next to how sure you said you are. A question with no links and no notes gets flagged as open.",
    demo: [
      [c("claim", "The dog took it", { sure: 80 }), "supports", c("question", "Who took the cake?")],
      [c("claim", "My brother took it", { sure: 40 }), "supports", c("question", "Who took the cake?")],
    ],
    keywords: "unknown answer rival hypotheses mystery",
  },
  {
    id: "assumption", group: "Cards", kind: "assumption", title: "Assumption",
    summary: "Something you're treating as true but haven't checked.",
    body: "Naming assumptions is half the work. Feed a step into one to test it — until then, anything resting on it gets flagged. The inspector's “Add a test step” does this in one click.",
    demo: [[c("step", "Ask 3 friends if they'd use it"), "feeds", c("assumption", "People want this", { sure: 60 }), "supports", c("goal", "Launch it")]],
    keywords: "untested premise belief check",
  },
  {
    id: "evidence", group: "Cards", kind: "evidence", title: "Evidence",
    summary: "Something you found or observed.",
    body: "Facts, clues, observations, quotes. Attach the picture or link it came from — evidence you can't trace back is just a claim. Set how reliable you think it is with the “how sure” slider. Drop an image or URL on the paper to create one.",
    demo: [[c("evidence", "Crumbs on the sofa", { sure: 70 }), "supports", c("claim", "The dog took it")]],
    keywords: "clue fact observation source photo image link proof",
  },
  {
    id: "claim", group: "Cards", kind: "claim", title: "Claim",
    summary: "Something you think might be true.",
    body: "A hypothesis, belief, or possible answer. Link evidence to it as supports or contradicts and it shows a for/against bar. Set how sure you are — the checker compares that with what the evidence says.",
    demo: [[c("evidence", "Crumbs on the sofa", { sure: 70 }), "supports", c("claim", "The dog took it", { sure: 80 }), "contradicts", c("evidence", "Dog was outside all day", { sure: 85 })]],
    keywords: "hypothesis belief opinion statement",
  },
  {
    id: "conclusion", group: "Cards", kind: "conclusion", title: "Conclusion",
    summary: "What the pieces mean, taken together.",
    body: "A deduction. It should rest on the cards that support it — a conclusion with nothing under it is a leap. Shift-click several cards and press Combine to create one already linked to them.",
    demo: [[c("evidence", "Frosting on his sleeve", { sure: 60 }), "supports", c("conclusion", "Brother did it", { sure: 55 })], [c("claim", "Dog was framed", { sure: 50 }), "supports", c("conclusion", "Brother did it", { sure: 55 })]],
    keywords: "deduction inference result answer meaning",
  },
  {
    id: "goal", group: "Cards", kind: "goal", title: "Goal",
    summary: "An outcome worth the effort.",
    body: "Goals show progress as a ring: done steps out of all steps feeding them. Decompose a goal to scaffold a starter chain of steps and a milestone.",
    demo: [[c("step", "Sketch the screens", { status: "done" }), "feeds", c("milestone", "First version runs"), "feeds", c("goal", "Ship it")]],
    keywords: "outcome objective target progress",
  },
  {
    id: "milestone", group: "Cards", kind: "milestone", title: "Milestone",
    summary: "A visible checkpoint on the way to a goal.",
    body: "A milestone counts as done automatically when every step feeding it is done. Use them to break long chains into points you can show someone.",
    demo: [[c("step", "Build the grid", { status: "done" }), "feeds", c("milestone", "Something exists"), "feeds", c("step", "Show one person")]],
    keywords: "checkpoint phase",
  },
  {
    id: "step", group: "Cards", kind: "step", title: "Step",
    summary: "Something you can do in under 30 minutes.",
    body: "Click its status to cycle todo → doing → done. Steps whose predecessors are all done appear in Next moves. If a step sounds like a whole project, split it.",
    demo: [[c("step", "Write one sentence: what is done?", { status: "done" }), "feeds", c("step", "20 min ugly prototype", { status: "doing" })]],
    keywords: "task action todo doing done next",
  },
  {
    id: "risk", group: "Cards", kind: "risk", title: "Risk",
    summary: "What could stop this — and the counter-move.",
    body: "Name the danger in the title and write what you'll do about it in the notes. A risk with empty notes gets flagged.",
    demo: [[c("risk", "Losing steam after day 3"), "feeds", c("goal", "Ship it")]],
    keywords: "danger threat problem counter",
  },
  {
    id: "snippet", group: "Cards", kind: "snippet", title: "Snippet",
    summary: "Raw material: code, copy, a link, a quote.",
    body: "Notes on a snippet render in a monospace block, so code and exact wording keep their shape. Link a snippet to whatever it serves.",
    demo: [[c("snippet", "Definition of done"), "feeds", c("step", "Write one sentence: what is done?")]],
    keywords: "code quote text copy reference",
  },
  {
    id: "problem", group: "Cards", kind: "problem", title: "Problem",
    summary: "Something going wrong — the symptom you can see.",
    body: "Start problem solving here. Link causes into it (the link reads “causes”), then keep asking why each cause happens until you reach one worth fixing: the root cause. The checks flag a problem nobody has explained, and a fix aimed straight at the symptom.",
    demo: [[c("cause", "I leave home late"), "feeds", c("problem", "Late for work")]],
    keywords: "problem issue bug symptom effect root cause analysis 5 whys",
  },
  {
    id: "cause", group: "Cards", kind: "cause", title: "Cause",
    summary: "Why something happens. Chain them: why does that happen?",
    body: "Link a cause into the problem — or into another cause — that it causes. That's the “5 whys”: each answer becomes the next question. Say how sure you are it's really a cause; link evidence to back it. The first answer is usually a symptom too, so the checks nudge you to ask again.",
    demo: [[c("cause", "Mornings run slow"), "feeds", c("cause", "I leave home late"), "feeds", c("problem", "Late for work")]],
    keywords: "cause why reason because contributing factor 5 whys chain",
  },
  {
    id: "root", group: "Cards", kind: "root", title: "Root cause",
    summary: "The deepest cause worth fixing: remove it and the problem stops.",
    body: "Turn a cause into a root cause from its type menu (or with “Make it the root cause” in Plot holes). A root cause should have evidence that it's really the cause — fixing the wrong one costs the fix and keeps the problem — and a fix linked to it.",
    demo: [[c("evidence", "70 min on the phone after midnight"), "supports", c("root", "Scrolling in bed until 1am")]],
    keywords: "root cause underlying deepest fundamental rca",
  },
  {
    id: "fix", group: "Cards", kind: "fix", title: "Fix",
    summary: "A countermeasure that removes a cause.",
    body: "Link a fix to the root cause it removes (the link reads “fixes”), and link a step into the fix: the first thing you'll do to put it in place. A fix linked straight to the problem treats the symptom — sometimes the right stopgap, but the problem comes back.",
    demo: [[c("step", "Buy a hallway charger"), "feeds", c("fix", "Phone charges outside the bedroom"), "feeds", c("root", "Scrolling in bed")]],
    keywords: "fix solution countermeasure remedy corrective action mitigation",
  },
  {
    id: "text", group: "Cards", kind: "text", title: "Text",
    summary: "Decoration: a bold heading or label on the paper.",
    body: "Add it from + more cards (phones: + Add), or type /text Your words in the command bar. It has no border and is bold by default. Select it and drag the yellow corner to resize it: the box and the type scale together. The editor also has sizes S, M, L and XL and a Bold switch. Text isn't part of your reasoning: it can't be linked, the checks and the outline ignore it, and Tidy leaves it where you put it.",
    keywords: "text label heading title decoration annotate caption bold font size resize",
  },

  // ── Links ──
  {
    id: "feeds", group: "Links", title: "Feeds",
    summary: "Leads to, unlocks, comes before.",
    body: "The planning link. Drives Next moves and progress. Drawn dashed while the card it comes from isn't done yet, solid once it is.",
    demo: [[c("step", "Sketch", { status: "done" }), "feeds", c("step", "Build")]],
    keywords: "arrow dependency before after plan",
  },
  {
    id: "supports", group: "Links", title: "Supports",
    summary: "Is a reason or evidence for.",
    body: "The reasoning link (marked +). The card it comes from adds its confidence to the “for” side of the card it points at. Dragging a link between reasoning cards picks this automatically.",
    demo: [[c("evidence", "Crumbs on the sofa", { sure: 70 }), "supports", c("claim", "The dog took it")]],
    keywords: "plus reason because evidence",
  },
  {
    id: "contradicts", group: "Links", title: "Contradicts",
    summary: "Both can't be true.",
    body: "Marked ≠. It works both ways: each end weighs against the other. Evidence contradicting a claim is normal — the checker only calls it a hole when you believe both sides, or when you're sure of something the evidence weighs against.",
    demo: [[c("evidence", "Dog was outside all day", { sure: 85 }), "contradicts", c("claim", "The dog took it", { sure: 80 })]],
    keywords: "not against conflict tension",
  },
  {
    id: "strength", group: "Links", title: "Link strength",
    summary: "Weak ×0.5, normal ×1, strong ×1.5 — how much a supporting or contradicting link counts.",
    body: "Click a supports or contradicts link to set its strength. A clue that clinches it is strong; one that only hints is weak. Its weight in the for/against bar is the card's “how sure” × the strength. Thicker lines are stronger links.",
    demo: [[c("evidence", "Fingerprints on the tin", { sure: 80 }), "supports", c("claim", "Brother took it")]],
    keywords: "strength weight strong weak counts thick thin",
  },
  {
    id: "linking", group: "Links", title: "Making and changing links",
    summary: "Drag from a card's right port; a new link asks what it means.",
    body: "Drag from the round port on a card's right edge onto another card. Drop on empty paper instead and the natural next card appears there (evidence → claim, claim → conclusion, step → step). A new link opens its panel so you can say what it means (supports, contradicts, feeds) and how strong it is; click any link later to change it or delete it. Links that would loop back on themselves are refused.",
    keywords: "connect arrow port edge drag",
  },

  // ── Checks ──
  ...([
    ["A leap", "A conclusion with nothing supporting it.", "Link the cards that led you here, or turn it back into a claim."],
    ["More sure than your reasons", "You're 15+ points more sure of something than of its strongest supporting card.", "Lower your confidence, or find a stronger reason."],
    ["Belief vs. evidence", "You're 65%+ sure, yet the linked cards weigh more against than for.", "Re-check the weights — or change your mind."],
    ["Inconvenient evidence", "Solid evidence (50%+) contradicts something you're 70%+ sure of.", "Explain it honestly, or let it move you."],
    ["Built only on beliefs", "No evidence anywhere underneath a conclusion — claims and assumptions all the way down.", "Ask what you'd expect to find if it were true, then go look."],
    ["Hangs on one thread", "A conclusion rests on a single card.", "Find a second, independent reason."],
    ["Holding both sides", "You're 50%+ sure of two cards linked as contradicting.", "Decide which wins, or press “Make it a question”."],
    ["Sure of rival answers", "Two answers to the same question are both 70%+.", "Can they really both be true? Lower one, or link a contradiction."],
    ["Doesn't help you decide", "A card bears the same way on every answer to a question (it fits them all, or cuts against them all).", "Keep it, but look for evidence that fits one answer and not the others. Big picture → Evidence × answers shows which rows differ."],
    ["Less sure than your evidence", "What you've linked is mostly for a claim, yet you're under 50% sure of it.", "Believe it more, or add what's missing on the other side."],
    ["Where did this come from?", "Evidence with no “From”, link, image or notes.", "Say where it came from, or attach the source."],
    ["Same source, counted once", "Several cards weighing on one claim share a “From” source, so only the strongest counts.", "Nothing to fix — it's telling you repetition isn't confirmation. Find an independent source."],
    ["Unexplained problem", "A problem with no cause linked into it.", "Press “Ask why” and say why it happens."],
    ["No root cause yet", "The chain of whys under a problem stops at a plain cause.", "Ask why again, or — if removing it would stop the problem — make it the root cause."],
    ["Root cause, no fix", "Nothing removes a root cause.", "Press “Add a fix”."],
    ["Root cause on a hunch", "No evidence supports a root cause.", "Add what shows it's really the cause before fixing it."],
    ["A fix nobody's doing", "No step feeds into a fix.", "Press “Add a step”: the first thing you'll do."],
    ["Treating the symptom", "A fix is linked straight to a problem whose causes are known.", "Fine as a stopgap; also fix the cause, or it comes back."],
    ["A wish, not a plan", "A goal with no steps leading to it.", "Press Decompose."],
    ["No “why” on record", "Nothing explains why a goal matters.", "Press “Add a reason”."],
    ["Built on untested ground", "A goal depends on an untested assumption.", "Test the assumption."],
    ["Untested assumption", "No step feeds into the assumption.", "Press “Add a test step”."],
    ["Rests on an untested assumption", "A conclusion depends on an untested assumption.", "Test the assumption."],
    ["That's not a 30-minute step", "A step reads like a project (“build the app”).", "Press Split, or rewrite it smaller."],
    ["Step that leads nowhere", "A step that feeds nothing.", "Link it to what it's for, or delete it."],
    ["Risk without a counter-move", "A risk with empty notes.", "Write what you'll do about it."],
    ["Open question, nobody on it", "A question with no links and no notes.", "Link candidate answers, or the step that will find out."],
    ["Floating cards", "Cards (other than thoughts and sparks) connected to nothing.", "Link them in, or let them go."],
    ["Lots of ideas, no direction", "Five or more thoughts and sparks, no goals.", "Promote one. It's reversible."],
  ] as const).map(([title, when, fix]): HelpEntry => ({
    id: `check-${title}`,
    group: "Checks",
    title,
    summary: when,
    body: "Plot-hole checks look only at how cards connect and how sure you said you are — never at what the words mean. Dismiss a flag (✕) once you've thought it through.",
    fix,
    keywords: "plot hole flag warning check consistency",
  })),

  // ── Tools ──
  {
    id: "dump", group: "Tools", title: "Thought dump",
    summary: "Empty your head, one line per card. Shortcut: D.",
    body: "Type or paste a list; bullets and numbers are stripped. Each line becomes a thought card in clear space. Then look at Possible connections in the Big picture tab.",
    keywords: "brain dump list capture",
  },
  {
    id: "combine", group: "Tools", title: "Gather & combine",
    summary: "Shift-click cards, then Combine → conclusion.",
    body: "Gathered cards get a dashed outline and a bar appears at the bottom. Combine creates a conclusion to their right, linked from each as supports — then write what they mean together. Esc clears the gathering.",
    demo: [[c("evidence", "Clue A"), "supports", c("conclusion", "So…")], [c("evidence", "Clue B"), "supports", c("conclusion", "So…")]],
    keywords: "deduce merge multi select shift",
  },
  {
    id: "weighing", group: "Tools", title: "The for / against bar",
    summary: "Each linked card adds its own confidence to one side.",
    body: "Green is the weight supporting a card, red the weight contradicting it; +130/−85 are the totals. It's deliberately plain arithmetic so you can always see why. Your own “how sure” is shown separately — when they disagree, look closer.",
    keywords: "balance weight score meter confidence",
  },
  {
    id: "answers", group: "Tools", title: "Questions & answers",
    summary: "Rival answers ranked by evidence, in the Big picture tab.",
    body: "Link claims into a question as possible answers. Each answer shows its for/against bar and your own confidence, sorted by net weight.",
    keywords: "rank compare hypotheses mystery god",
  },
  {
    id: "next", group: "Tools", title: "Next moves",
    summary: "Steps you can start right now.",
    body: "A step appears when everything feeding it is done. In-progress steps come first, then the ones that unlock the most goals and milestones.",
    keywords: "todo frontier plan priority",
  },
  {
    id: "connections", group: "Tools", title: "Possible connections",
    summary: "Unlinked cards that keep using the same words.",
    body: "In the Big picture tab. Rare shared words count more than common ones. Link them with one click, or mark them “Not related”.",
    keywords: "suggest similar related",
  },
  {
    id: "generate", group: "Tools", title: "Generate",
    summary: "Offline prompts to push your own thinking. Shortcut: G.",
    body: "Two sets of lenses applied to a topic or the selected card: creative (shrink, invert, collide, change format, one person, constrain, remove the hard part) and AI-era (new scarcity, trust layer, glue work, local & private, tools for agents, teaching). Pin what sparks anything.",
    keywords: "ideas lenses prompts brainstorm",
  },
  {
    id: "attach", group: "Tools", title: "Images & links",
    summary: "Attach, paste, or drop them.",
    body: "In the inspector: attach an image, or paste one into Notes. Drop an image or URL on a card to attach it there; on empty paper to create an evidence card. Images are saved in your browser's image store (plenty of room), separate from the sheet itself. Export embeds them, so an exported file is a complete backup.",
    keywords: "picture photo url source upload paste drop",
  },
  {
    id: "share-link", group: "Tools", title: "Share a link",
    summary: "Share → Create link: anyone with it sees your sheet read-only and can save a copy.",
    body: "The whole sheet is compressed into the link itself (the part after #, which browsers never send to a server), so nothing is uploaded and there's no account. Images are left out. Someone opening it sees a read-only view with “Save a copy to edit” and “Close”; their own sheets are untouched. A link is a snapshot — make a new one after changes.",
    keywords: "share link url send friend collaborate read-only view copy",
  },
  {
    id: "share", group: "Tools", title: "Share with AI (Markdown)",
    summary: "Share → export the sheet as Markdown for an AI's second opinion.",
    body: "Blueprint never talks to an AI. This produces a .md file with every card, confidence, source, link (and its strength), frame groups, the weighing and the flags already raised, plus an optional consistency-check request. Copy or download it, then paste into any assistant. Images aren't included.",
    keywords: "export markdown md ai chatgpt claude consistency",
  },

  {
    id: "plan-actions", group: "Tools", title: "Decompose, split, promote",
    summary: "Shortcuts in the inspector.",
    body: "Decompose scaffolds steps and a milestone under a goal. Split turns a step into two halves. Promote turns a spark or thought into a goal with a first 15-minute step. Add a test step checks an assumption.",
    keywords: "inspector actions scaffold",
  },
  {
    id: "start", group: "Tools", title: "Start: examples, tour & templates",
    summary: "The Start button opens worked examples, a guided tour and fill-in templates.",
    body: "Examples (a mystery, a decision, a project plan) are complete little sheets to poke at. “Take the tour” walks through the mystery step by step. Templates give you the structure for a decision, a mystery, testing a belief or planning a project, with [placeholders] to replace in your own words. If your current sheet has cards, it opens as a new sheet, so nothing is overwritten.",
    keywords: "start example tour template onboarding begin new lost",
  },
  {
    id: "sheets", group: "Tools", title: "Sheets",
    summary: "Keep several boards: new, open, rename, duplicate, delete.",
    body: "Open the list from “Sheets” in the toolbar, or “all sheets ›” in the title block. Each sheet keeps its own cards, view and undo history. Examples, templates and imports open as new sheets when the current one has cards. Sheets live in this browser — Export one to back it up or move it to another device.",
    keywords: "sheet board file project multiple new open rename duplicate delete switch",
  },
  {
    id: "command", group: "Tools", title: "Command bar",
    summary: "Type cards at the bottom of the screen: /evidence Rent is cheaper, conf: 70, for: C-01 (desktop).",
    body: "Press / anywhere on the sheet (or just start typing) to jump there.\n\n• Start with a card type: /thought /spark /question /assumption /evidence /claim /conclusion /goal /milestone /step /risk /snippet — or short forms /e /c /q /g /d /m /r.\n• Then the title. No slash at all = a quick thought (or a question, if it ends with “?”).\n• Fields after commas — desc: notes · conf: how sure (0–100) · from: source · link: a URL · status: todo/doing/done\n• Links — for: C-01 (supports) · against: C-01 · answers: Q-01 · to: G-01 (feeds) · after: T-01 · because: E-02. Several refs are fine; “last” = the card you just made. strength: weak|strong.\n• /link E-01 C-02 contradicts — link two existing cards.\n\nThe line above the bar shows what Enter will do. Tab completes a command (on an empty bar, repeats the last one); ↑ recalls earlier lines; each line is one undo step.",
    keywords: "command bar type slash shortcut syntax keyboard quick add",
  },
  {
    id: "find", group: "Tools", title: "Find a card",
    summary: "Ctrl/⌘+K (or / on phones) — search titles, notes, refs and sources.",
    body: "Type any words, a ref like E-02, or a source name. Arrow keys move through results, Enter jumps to the card and opens it. With nothing typed, it lists your most recent cards. The magnifier in the toolbar opens it too.",
    keywords: "search find jump locate ref",
  },
  {
    id: "inline", group: "Tools", title: "Editing a card",
    summary: "Double-click a title to edit it in place; new cards start ready to type.",
    body: "On the sheet, double-click a card's title to rename it right there (Enter saves, Esc cancels). Tap or click a card to open the inspector for everything else. A card you just added opens with its title selected, so you can type straight away; Enter moves on to the notes.",
    keywords: "edit rename title inline type",
  },
  {
    id: "frames", group: "Tools", title: "Frames",
    summary: "Draw a labeled box around related cards: “Suspects”, “Money”, “Phase 1”.",
    body: "Gather cards (shift-click or Gather) or select one, then press Frame — it wraps them with a label. With nothing chosen you get an empty frame to drag cards into. A card belongs to a frame when its middle is inside. Drag the label to move the frame with its cards, drag the corner to resize, double-click the label to rename. Removing a frame keeps its cards. Tidy keeps frames wrapped around their cards.",
    keywords: "frame group box cluster label section area",
  },
  {
    id: "tidy", group: "Tools", title: "Tidy",
    summary: "Lays the sheet out left to right by how cards connect.",
    body: "Cards with nothing feeding them go on the left; each card sits one column right of what supports or feeds it, so evidence → claims → conclusions and steps → milestones → goals read like a sentence. Separate clusters stack vertically; unlinked cards go in a grid underneath. It's one undo step, so try it freely.",
    keywords: "layout arrange auto tidy clean organize messy",
  },
  {
    id: "install", group: "Tools", title: "Install as an app",
    summary: "Add Blueprint to your home screen; it then works offline.",
    body: "On a phone: open the site, then Share → Add to Home Screen (iPhone) or the ⋮ menu → Install app (Android). On a computer, use the install icon in the address bar. It opens full-screen and works without a connection; your sheets stay on that device.",
    keywords: "install app pwa home screen offline phone desktop",
  },
  {
    id: "outline", group: "Tools", title: "Outline",
    summary: "The sheet as an indented list: each question or goal with what leads into it.",
    body: "Opens from List (phones), ⋯ More → Outline, or the O key. Every end point — a question, a goal, a conclusion — is listed with what leads into it underneath: answers, then the reasons for (+) and against (−) each, and steps (→). Cards that aren't linked yet are listed at the end. Type to filter; tap a card to open it on the sheet. Easiest way to read a big sheet on a phone.",
    keywords: "outline list tree view phone mobile read overview hierarchy",
  },
  {
    id: "keyboard", group: "Tools", title: "Keyboard only",
    summary: "Arrows move between cards; Enter edits; L links; N adds the next card.",
    body: "Tab to the sheet (or click empty paper), then arrow keys select the nearest card in that direction (from the middle of the screen if nothing is selected). Shift+arrows nudge the selected card. Enter edits its title. L starts a link: choose the target with arrows and press Enter. N adds the natural next card, already linked (evidence → claim → conclusion). Space gathers, C combines the gathered cards into a conclusion, F frames, T cycles a step's status, O opens the outline, Delete removes, Esc deselects. Screen readers announce the selected card.",
    keywords: "keyboard accessibility arrows shortcuts screen reader a11y navigate",
  },
  {
    id: "undo", group: "Tools", title: "Undo & redo",
    summary: "↶ ↷ in the toolbar, or Ctrl/⌘+Z and Ctrl/⌘+Shift+Z.",
    body: "Everything on the sheet can be undone: adding, editing, moving, linking, deleting, even starting a new sheet. A drag or a burst of typing counts as one step. Deleting shows a toast with an Undo button for a few seconds. History lasts until you reload the page.",
    keywords: "undo redo mistake delete restore back history",
  },
  {
    id: "tap-link", group: "Tools", title: "Link to… (tap to link)",
    summary: "Linking without dragging — handy on a phone.",
    body: "Select a card, press “Link to…” in the inspector, then tap the card it leads to. The link's meaning is picked from the two kinds (evidence → claim supports, step → step feeds); tap the link afterwards to change it. Esc or Cancel stops.",
    keywords: "phone touch mobile connect link tap",
  },
  {
    id: "sources", group: "Tools", title: "Sources (“From”)",
    summary: "Name who or where a card came from; same source counts once.",
    body: "Evidence, claims, conclusions, assumptions and thoughts have a “From” field. When several cards from the same source support (or contradict) the same claim, only the strongest counts — three cards repeating one rumor aren't three reasons. Earlier sources are suggested as you type.",
    demo: [
      [c("evidence", "Mum: crumbs on sofa", { sure: 70 }), "supports", c("claim", "The dog took it")],
      [c("evidence", "Mum: dog looked guilty", { sure: 60 }), "supports", c("claim", "The dog took it")],
    ],
    keywords: "source origin independent duplicate echo rumor weight",
  },
  {
    id: "more-kinds", group: "Tools", title: "Core cards & “+ more”",
    summary: "The toolbar starts with six cards; “+ more” shows all twelve.",
    body: "Thought, Question, Evidence, Claim, Conclusion and Step cover most thinking. “+ more” adds Spark, Assumption, Goal, Milestone, Risk and Snippet. Any card can change kind later in the inspector, and the setting is remembered.",
    keywords: "simple fewer more toolbar kinds",
  },
  {
    id: "keys", group: "Tools", title: "Keys & moving around",
    summary: "⌘/Ctrl+Z undo · ⌘/Ctrl+K find · D dump · G generate · ? help · Del delete · Esc deselect.",
    body: "Drag the paper to pan; pinch or ctrl+scroll to zoom; Fit shows everything. Double-click the paper for a thought. Shift-click to gather. Your sheet saves in this browser automatically — use Export/Import to keep or move a copy.",
    keywords: "shortcut keyboard pan zoom save export import",
  },
];

export function searchHelp(q: string): HelpEntry[] {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return HELP;
  return HELP.map((e) => {
    const hay = `${e.title} ${e.summary} ${e.body} ${e.fix ?? ""} ${e.keywords ?? ""} ${e.group}`.toLowerCase();
    const title = e.title.toLowerCase();
    if (!terms.every((t) => hay.includes(t))) return null;
    return { e, score: terms.reduce((s, t) => s + (title.includes(t) ? 3 : 1), 0) };
  })
    .filter((x): x is { e: HelpEntry; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.e);
}
