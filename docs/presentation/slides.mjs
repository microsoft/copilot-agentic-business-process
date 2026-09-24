export const sources = {
  core: { title: "Repository overview - reusable Core, architecture, deployment and licensing", url: "../../README.md" },
  order: { title: "Order Processing - process, agents, human gates and sample limitations", url: "../../business-processes/order-processing/README.md" },
  harness: { title: "Microsoft Learn - Harnesses in Copilot Studio", url: "https://learn.microsoft.com/microsoft-copilot-studio/harnesses-overview" },
  skills: { title: "Microsoft Learn - Agent skills: portable instructions, scripts and resources", url: "https://learn.microsoft.com/microsoft-copilot-studio/agents-experience/skills-overview" },
  credits: { title: "Microsoft Learn - Usage-based billing for the GitHub Copilot harness", url: "https://learn.microsoft.com/microsoft-copilot-studio/agents-experience/billing-credit-overview" },
  apps: { title: "Microsoft Learn - Power Apps code apps prerequisites and licensing", url: "https://learn.microsoft.com/power-apps/developer/code-apps/overview" },
  deployCore: { title: "BusinessProcessCore deployment guide", url: "../../core/solution/DEPLOYMENT.md" },
  deployOrder: { title: "OrderProcessing deployment guide", url: "../../business-processes/order-processing/solution/DEPLOYMENT.md" },
  architecture: { title: "Repository detailed solution architecture", url: "../agentic-business-process-architecture.png" }
};

const card = (n, title, text, cls = "") => `<div class="card ${cls}"><span class="number">${n}</span><h2>${title}</h2><p>${text}</p></div>`;
const takeaway = (text) => `<div class="takeaway">${text}</div>`;
const point = (title, text) => `<div class="point"><h2>${title}</h2><p>${text}</p></div>`;
const divider = (section, title, titleLines, notes, sources, extra = "") => ({
  section, title, divider: true, layout: "divider",
  body: `<div class="divider-copy"><h1 id="slide-title">${titleLines}</h1>${extra}</div><div class="divider-art" aria-hidden="true"><i></i><i></i><i></i></div>`,
  notes, sources
});
const screenshot = (file, alt, caption) => `<figure class="product-screenshot"><img src="../${file}" alt="${alt}"><figcaption class="sr-only">${caption}</figcaption></figure>`;
const showcaseSlide = ({ image, points, message, ...slide }) => ({
  ...slide,
  treatment: "showcase",
  layout: `screenshot-slide${slide.wideImage ? " screenshot-wide" : ""}`,
  body: `<div class="showcase"><aside class="showcase-points"><header class="screenshot-heading"><h1 id="slide-title">${slide.title}</h1><p>${slide.subtitle}</p></header><div class="talking-points">${points}</div>${takeaway(message)}</aside>${image}</div>`
});

export const slides = [
  {
    section: "01 / Introduction",
    title: "From AI agents to accountable agentic business processes.",
    hero: true,
    layout: "hero",
    body: `<div class="hero-copy"><span class="pill">REUSABLE FOUNDATION + REFERENCE IMPLEMENTATION</span><h1 id="slide-title">From AI agents to<br><em>accountable agentic</em><br>business processes.</h1><p>Agents reason. People decide.<br>The process remembers.</p></div><div class="hero-strip"><span>Microsoft Copilot Studio - GitHub Harness</span></div>`,
    notes: "Open with the gap between building an agent and operating a business process. This repository supplies a reusable process foundation plus an email-to-SAP-payload reference implementation. It is a reference accelerator, not a separate commercially supported product. The two READMEs are the main narrative sources.",
    sources: ["core", "order"]
  },
  {
    section: "01 / Introduction",
    title: "Where standalone agents are not enough",
    subtitle: "The opportunity: document-heavy work that crosses systems, teams, decisions and time.",
    body: `<div class="columns opportunity-cards">${card("01", "Interpret the input", "Turn documents, emails and conversations into structured facts.<br><br>Resolve missing or ambiguous information.")}${card("02", "Apply business judgment", "Check facts against policies, eligibility, risk and commercial terms.<br><br>Explain exceptions and trade-offs.")}${card("03", "Keep work accountable", "Pause for people. Track ownership.<br><br>Preserve the evidence when a decision takes days.")}${card("04", "Integrate systems of record", "Read trusted data from CRM, ERP and business systems.<br><br>Write approved outcomes back with validation and error handling.")}</div><div class="scenario-strip"><strong>Reference Implementation</strong><span class="tag active">Order intake</span><strong>Use Case Opportunities:</strong><span class="tag">Claims</span><span class="tag">Loans</span><span class="tag">Deals</span><span class="tag">RFQ</span><span class="tag">Contracts</span></div>${takeaway("Best fit: <strong>event-triggered, long-running multi-stage work with reasoning, human control and traceability.</strong>")}`,
    notes: "Position this as agentic business process automation rather than a generic chatbot or pure document OCR. The four patterns apply across scenarios: interpret mixed evidence, apply business rules, preserve accountable decisions, and integrate systems of record. Examples include claim evidence and coverage, loan documents and eligibility, deal context and commercial terms, RFQ requirements, contract obligations and order details. These are opportunities, not delivered scenarios. The best fit is event-triggered, long-running work spanning systems, teams and human decisions, with persisted state maintaining traceability. Order Processing is the reference implementation; the README describes car insurance claims as work in progress. Systems-of-record integration is a solution requirement, not a claim that this sample performs ERP write-back: Order Processing generates a SAP-ready JSON payload, and production posting requires additional integration.",
    sources: ["core", "order"]
  },
  {
    section: "01 / Introduction",
    title: "One reusable core. Your business logic on top.",
    subtitle: "Stop rebuilding the task queue, process history and human-review experience.",
    layout: "foundation",
    body: `<div class="stack"><section class="layer domain"><div class="layer-label">REFERENCE PROCESS</div><div><h2>Order Processing - or your next scenario</h2><p>Domain workflows &nbsp; / &nbsp; agent skills &nbsp; / &nbsp; review widgets &nbsp; / &nbsp; roles</p></div></section><div class="stack-connector">uses shared process and task contracts</div><section class="layer"><div class="layer-label">BUSINESS PROCESS CORE</div><div><h2>State, tasks, review UI, notifications and monitoring</h2><p>Long-running &nbsp; / &nbsp; resumable &nbsp; / &nbsp; auditable &nbsp; / &nbsp; human-controlled</p></div></section></div><div class="columns two platform-enablers"><section class="platform-band"><div class="platform-mark" aria-hidden="true">AI</div><div><h2>GitHub Copilot harness</h2><p>Reasoning-heavy, multi-step execution<br>inside Copilot Studio.</p></div></section><section class="platform-band"><div class="platform-mark" aria-hidden="true">MD</div><div><h2>Agent skills = business logic</h2><p>Portable, reviewable, versionable rules.<br>Loaded into context when needed.</p></div></section></div>${takeaway("Deploy the <strong>reusable building block</strong>. Tailor the process. <strong>Version the business rules.</strong>")}`,
    notes: `<strong>1 / Point to BUSINESS PROCESS CORE: an agent is not yet a business process.</strong><br>Copilot Studio makes it easy to build an agent. It does not, on its own, give you a <strong>business process</strong>: a long-running, resumable, auditable unit of work that spans multiple agents and flows, pauses for days waiting on a human decision, and can still answer &quot;where is this case, who is sitting on it, and what did the agent actually decide?&quot; three weeks later. The case may be an order, a claim, a loan application, a deal, an onboarding request - the mechanics are the same every time.<br><br><strong>Stay on the Core layer and point across its shared capabilities.</strong><br>Every maker who tries to build one ends up reinventing the same plumbing - a state table, a task queue, a review UI, a notification fan-out, and a way to resume the process after a human clicks Approve. This repository provides that plumbing as a <strong>reusable agentic business process building block</strong> that you can deploy as a solution in your environment. The Core is installed once; process stages advance through persisted state rather than a single flow waiting for days.<br><br><strong>2 / Move up to REFERENCE PROCESS and its connection to the Core.</strong><br>The repository also comes with a business-specific scenario, Order Processing, that serves as a reference implementation for using the Core building blocks in real-world processes. Each process adds its domain workflows, skills, review widgets and roles while reusing the shared process and task contracts. Claims, loans, deals and onboarding illustrate where the same mechanics could be applied; they are not all delivered implementations.<br><br><strong>3 / Point to the GitHub Copilot harness card.</strong><br>It is built on the most capable engine Copilot Studio offers, the <a href="https://learn.microsoft.com/microsoft-copilot-studio/harnesses-overview#github-copilot-harness" target="_blank" rel="noopener"><strong>GitHub Copilot harness</strong></a> - the reasoning-heavy runtime designed for this class of multi-step work. The harness runs <strong>inside Copilot Studio</strong>; it is not the GitHub Copilot service. Developer-side GitHub Copilot in VS Code can separately assist with deployment.<br><br><strong>4 / Point to the Agent skills = business logic card, then close on the bottom takeaway.</strong><br>The harness also unlocks what this solution treats as its unit of business logic: <a href="https://learn.microsoft.com/microsoft-copilot-studio/agents-experience/skills-overview" target="_blank" rel="noopener"><strong>agent skills</strong></a> - portable Markdown packages of instructions, references and scripts that each hand an agent one body of business rules, loaded into context only when a task actually calls for them. Business logic becomes <strong>reviewable, versionable content a domain expert can correct</strong>. Loading focused rules helps avoid an ever-longer prompt as the rule base grows; accuracy still needs to be evaluated rather than assumed. Close with the visual summary: deploy the reusable building block, tailor the process, and version the business rules.`,
    sources: ["core", "order", "harness", "skills"]
  },
  divider("02 / Order Processing", "Agentified Order Processing Intake", "Agentified Order<br>Processing Intake",
    "Transition from the reusable foundation to the customer story. Introduce Order Processing as the reference implementation, then walk through the benefits, process stages and human-review experience.", ["order"]),
  {
    section: "02 / Order Processing",
    title: "Less re-keying. Better-informed decisions.",
    subtitle: "A customer proposition built around the cost of exceptions - not just typing.",
    body: `<div class="value-grid"><div class="value-head">TODAY'S FRICTION</div><div class="value-head">DESIRED CUSTOMER OUTCOME</div><div class="value-cell"><h2>Manual transcription</h2><p>People interpret and re-enter each order.</p></div><div class="value-cell outcome"><h2>Review instead of re-key</h2><p>Start from extracted, structured order data.</p></div><div class="value-cell"><h2>Inconsistent checks</h2><p>Invalid products, stock gaps and disputed discounts.</p></div><div class="value-cell outcome"><h2>Consistent, explainable evaluation</h2><p>Use focused skills to surface field-level findings.</p></div><div class="value-cell"><h2>Invisible handoffs</h2><p>Who has the order? What was approved?</p></div><div class="value-cell outcome"><h2>Visible ownership and evidence</h2><p>Track tasks, decisions and artifacts end to end.</p></div></div>${takeaway("Measure in a pilot: <strong>handling time, correction rate and approval turnaround.</strong>")}`,
    footer: "Expected benefits to validate in a pilot - no measured ROI is claimed.",
    notes: "Sell the opportunity, not an invented percentage. The reference implementation demonstrates capabilities; the repository does not provide measured ROI. Both human gates are part of the normal path, so do not describe this as unattended or exception-only processing. Suggested pilot measures need a customer-specific baseline and observed results.",
    sources: ["order", "core"]
  },
  {
    section: "02 / Order Processing",
    title: "From incoming order to SAP-ready payload",
    subtitle: "Four workflows. Two explicit human gates. One traceable process instance.",
    body: `<ol class="journey"><li><span class="stage-type">WORKFLOW 1</span><h2>Receive</h2><p>Email arrives in the shared mailbox.</p><span class="step-chip">Document stored</span></li><li><span class="stage-type">WORKFLOW 2</span><h2>Extract</h2><p>Agent reads the document into a fixed JSON contract.</p><span class="step-chip">Structured order</span></li><li class="human"><span class="stage-type">HUMAN GATE 1</span><h2>Review</h2><p>Verify and correct the extracted order.</p><span class="step-chip">Reviewer decision</span></li><li><span class="stage-type">WORKFLOW 3</span><h2>Validate</h2><p>Check products, inventory and promotions.</p><span class="step-chip">Explained findings</span></li><li class="human"><span class="stage-type">HUMAN GATE 2</span><h2>Approve</h2><p>Accept or reject the agent's evaluation.</p><span class="step-chip">Approver decision</span></li><li><span class="stage-type">WORKFLOW 4</span><h2>Finalize</h2><p>Generate and store a schema-bound SAP payload.</p><span class="step-chip">Downloadable JSON</span></li></ol><div class="journey-legend"><span class="legend-dot"></span>Agent / workflow execution<span class="legend-dot human-dot"></span>Human control<span>Rejection at either gate stops that order.</span></div>${takeaway("The sample <strong>generates the SAP payload</strong>. It does not post an order to SAP.")}`,
    notes: "Walk through the approval path from left to right. Extraction review precedes business validation; evaluation approval precedes SAP payload generation. Both rejection paths close the process. Each stage persists state in Dataverse. The final artifact is a JSON file; ERP posting and its operational safeguards are additional integration work.",
    sources: ["order"]
  },
  showcaseSlide({
    section: "02 / Order Processing",
    title: "Review what the agent actually read",
    subtitle: "Human gate 1 / extracted order data review",
    image: screenshot("extracted-data-review.png", "Workflow Console extracted order data review: source purchase order preview above editable order summary, supplier and buyer fields.", "Extracted Order Data Review in the Workflow Console."),
    points: `${point("Review source and extracted data", "Compare the original document with the agent's interpretation.")}${point("Correct before proceeding", "Fix identifiers, quantities and other extracted values.")}${point("Keep the human decision", "Save the reviewed data and outcome with the process.")}`,
    message: "Customer value: <strong>reduce transcription effort without surrendering control.</strong>",
    notes: "The supplied extracted-data-review.png shows the Workflow Console's Extracted Order Data Review task, with the source purchase order preview above editable order summary, supplier and buyer fields. Use these as visual cues for comparing evidence and correcting extracted values. Line items and approval/rejection controls are outside this capture; describe those capabilities without implying they are visible here. Extraction confidence is agent-provided, not a calibrated accuracy guarantee. Confirm that the displayed business information is approved for the intended audience before external distribution.",
    sources: ["order"]
  }),
  showcaseSlide({
    section: "02 / Order Processing",
    title: "Validate business rules - not just fields",
    subtitle: "Human gate 2 / inspect skill results, pricing adjustments and decision controls",
    image: screenshot("validating-order.png", "Order evaluation review showing three skill results, pricing and line adjustments, reviewer notes, and Approve, Reject and Needs more info controls.", "Order evaluation results and human decision controls."),
    points: `${point("01 / Product identity", "Resolve SKUs, barcodes and descriptions against the catalog.")}${point("02 / Availability", "Check requested quantities against inventory.")}${point("03 / Promotions", "Explain eligibility and proposed pricing adjustments.")}`,
    message: "Identity + availability drive the verdict. <strong>Promotion findings do not block the order.</strong>",
    notes: "The supplied validating-order.png shows results from the three ordered skills, pricing and line adjustments, reviewer notes, and decision controls. Point from each skill result to the corresponding business-rule explanation. In this capture all three skills pass and no discount is applied. The validation agent uses catalog.json, inventory.json and promotions.json: fictional demo knowledge, not live ERP data. Availability assumes one warehouse and immediate fulfillment, with no backorders or partial fulfillment. Promotion findings remain visible but do not change the verdict; the human still approves or rejects the evaluation.",
    sources: ["order"]
  }),
  showcaseSlide({
    section: "02 / Order Processing",
    title: "Put work in the right hands",
    subtitle: "A shared operating experience, with a clear task owner",
    wideImage: true,
    image: screenshot("task-queue.png", "Workflow Console My tasks queue with All open, Assigned to me, My teams and By role filters; an assigned extraction-review task and a waiting evaluation-review task.", "Workflow Console task queue, ownership and role-based routing."),
    points: `${point("Route by capability", "Order Reviewer and Order Approver roles determine task routing.")}${point("Notify in Teams", "Eligible users receive a deep link to the exact task.")}${point("Claim. Start. Complete.", "Concurrency checks and transactional completion protect the decision.")}`,
    message: "People can change. <strong>The process does not need a named person hard-coded into it.</strong>",
    notes: "The supplied task-queue.png shows My tasks filters, an extraction-review task assigned to the current user, and an evaluation-review task waiting for the Order Approver role. Point to the Status, Assigned, Required role and Actions columns. Teams notifications are a related capability, not shown in this screenshot. Role-based routing does not grant row access: Dataverse privileges and app sharing are separate requirements. Claims use row-version checks and completion writes the outcome, outputs and step closure transactionally.",
    sources: ["core", "order"]
  }),
  showcaseSlide({
    section: "02 / Order Processing",
    title: "Ask where work is stuck",
    subtitle: "Conversational process monitoring in Microsoft 365 Copilot",
    image: screenshot("business-process-monitoring-agent.png", "Business Process Monitoring Agent in Microsoft 365 Copilot explaining that the Namshi order is waiting on an Extracted Order Data Review task, with status, assignee and required role.", "Business Process Monitoring Agent identifying a blocking human-review task."),
    points: `<div class="prompt-example"><span>QUESTION SHOWN</span><p>What is holding the Namshi order?</p></div>${point("One process history", "Inspect running instances, stuck steps and open work.")}${point("The same API surface", "Monitoring and the Console share caller-scoped process APIs.")}`,
    message: "Customer value: <strong>operational visibility without investigating individual flow runs.</strong>",
    notes: "The supplied business-process-monitoring-agent.png shows the agent in Microsoft 365 Copilot, rather than Teams. The user asks what is holding the Namshi order; the response identifies the blocking Extracted Order Data Review task and shows process status, assignee and required role. Point from the question to the blocking-task explanation and task table. Treat the timing and statuses as details of this captured example, not general performance claims. The agent is for process and task enquiry; do not imply autonomous remediation or automatic SLA escalation. Caller-scoped Dataverse security remains authoritative. This capture contains an email address and business identifiers; confirm audience authorization or use a redacted copy before external distribution.",
    sources: ["core"]
  }),
  divider("03 / High-level solution", "High-Level Solution & Reusable Core", "High-Level Solution<br>&amp; Reusable Core",
    "Transition from the customer experience to the architecture. Explain what the Core provides once, what belongs to the business process, and which reference patterns can be reused for the next scenario.", ["core", "order"]),
  {
    section: "03 / High-level solution",
    title: "Agentic Order Intake Processing - High-Level Solution",
    treatment: "diagram",
    layout: "diagram-slide",
    body: `<h1 id="slide-title">Agentic Order Intake Processing - High-Level Solution</h1>${screenshot("agentic-business-process-architecture.png", "Order Processing architecture showing email intake, Copilot Studio agents and workflows, human review in the Workflow Console, Teams notifications, Dataverse process state and API, and SAP payload generation without posting.", "Business Process Core runtime and Order Processing reference implementation architecture.")}`,
    notes: "Use the repository architecture diagram to trace the order from a supplier email through intake, extraction, validation and SAP payload generation. Point out the two human review gates in the Workflow Console, Teams notifications and the monitoring agent. Dataverse holds durable process state; step-row events start the next workflow. The Core provides the shared state, API and human-task capabilities while Order Processing supplies the domain workflows and reasoning. The SAP payload is generated, not posted to an ERP. The image is shown in full without cropping; open the detailed diagram source below when a closer view of its labels is needed.",
    sources: ["core", "order", "architecture"]
  },
  {
    section: "03 / High-level solution",
    title: "How the solution fits together",
    subtitle: "A shared process foundation; separate, business-specific execution.",
    layout: "architecture",
    body: `<div class="architecture-grid"><section class="core-boundary"><div class="boundary-label">REUSABLE BUSINESS PROCESS SOLUTION</div><div class="people-row"><span>Reviewers &amp; approvers</span><span>Operations / Teams</span></div><div class="experience-row"><div class="arch-box"><h2>Workflow Console</h2><p>Queue + tailored review widgets</p></div><div class="arch-box"><h2>Monitoring Agent</h2><p>Conversational process enquiry</p></div></div><div class="connector-label">&#8595; Task operations and process queries</div><div class="arch-box api-box"><h2>Business Process API</h2><p>Caller-scoped reads / claim / start / transactional complete</p></div><div class="connector-label">&#8595; Persist and read</div><div class="arch-box data-box"><h2>Dataverse process state</h2><p>Instances / steps / tasks / attachments / artifacts / data values</p></div></section><section class="process-boundary"><div class="boundary-label">ORDER PROCESSING SOLUTION</div><div class="arch-box"><h2>Domain workflows</h2><p>Intake / extract / validate / finalize</p></div><div class="connector-label">&#8595; Invoke domain reasoning</div><div class="arch-box"><h2>Agents + skills</h2><p>Copilot Studio<br>GitHub Copilot harness</p></div><div class="state-contract"><strong>Process &#8594; Dataverse</strong><span>Write state, tasks and outputs.</span><strong>Dataverse &#8594; process</strong><span>Step events start the next stage.</span></div><p class="widget-contract">Domain widgets extend the Console.</p></section></div>${takeaway("Core owns the <strong>shared runtime</strong>. Each process owns <strong>its business logic</strong>.")}`,
    notes: "This is a simplified logical view of the README architecture, not a deployment/network boundary diagram. Core provides the API, state model, console, monitoring, security and configuration. Workflows write state and raise tasks in Dataverse; step-row events trigger the next stage. Console and monitoring consume the shared APIs. Teams carries notifications and conversations. Refer to the detailed repository diagram for the full interaction map.",
    sources: ["core", "order", "architecture"]
  },
  {
    section: "03 / High-level solution",
    title: "What you do not have to build again",
    subtitle: "Business Process Solution: Business-agnostic capabilities inherited by every process.",
    body: `<div class="capabilities">${card("01", "Persistent process state", "Instances, steps, tasks and typed outputs keep the work resumable.")}${card("02", "Human task lifecycle", "Role-based routing, claiming and transactional completion.")}${card("03", "Review experience", "A task queue, deep links and a host for tailored review widgets.")}${card("04", "Evidence & history", "Decisions, documents and generated artifacts attached to the process.")}${card("05", "Operational monitoring", "Process and task enquiry through the Console and monitoring agent.")}<div class="card capability-summary"><h2>Build the business process.<br><em>Reuse the plumbing.</em></h2><p>Dataverse security remains authoritative.</p></div></div>`,
    notes: "Group the reusable features around what a delivery team avoids rebuilding. Do not claim this provides regulatory certification, immutable records or all production controls out of the box. The repository's core includes Dataverse tables, a C# plug-in API, a React code app, a monitoring agent and security/configuration. Role-based routing does not replace row privileges.",
    sources: ["core"]
  },
  {
    section: "03 / High-level solution",
    title: "Reference patterns worth repeating",
    subtitle: "Separate reasoning, durable process state and accountable human decisions.",
    body: `<div class="columns two pattern-grid">${card("01", "Persist between stages", "A Dataverse step event starts the next workflow.<br>No long-lived parent flow waits for a human.")}${card("02", "Keep skills focused", "Version business rules as focused skill packages.<br>Load the relevant instructions and knowledge.")}${card("03", "Use explicit contracts", "Fixed extraction JSON; field-level evaluation;<br>schema-bound SAP output with no invented fields.")}${card("04", "Make decisions safe", "Human gates, row-versioned claims and atomic completion preserve who decided what.")}</div>${takeaway("Reason with agents. <strong>Coordinate through persisted state. Keep people accountable.</strong>")}`,
    notes: "These are patterns demonstrated by the reference, not a claim that the sample solves every reliability problem. Persisted state supports long waits and explicit recovery; it is not an exactly-once delivery or automatic retry guarantee. Skills are reviewable, versionable Markdown packages. Schema instructions guide generation but do not make model output infallible. Test business rules, output validation and recovery behavior before production.",
    sources: ["core", "order", "harness"]
  },
  {
    section: "03 / High-level solution",
    title: "Build your next process - not another runtime",
    subtitle: "Use Order Processing as the reference for extending the core.",
    layout: "extension-slide",
    body: `<div class="columns two extension"><section class="card"><span class="pill">YOU CONTRIBUTE</span><h2>The domain-specific pieces</h2><ul class="clean-list"><li><b>Workflows</b><span>Stages, transitions and integrations</span></li><li><b>Agents &amp; skills</b><span>Business rules and trusted knowledge</span></li><li><b>Review widgets</b><span>The evidence and inputs people need</span></li><li><b>Roles &amp; configuration</b><span>Who can act and where data comes from</span></li></ul></section><section class="card inherited"><span class="pill">YOU INHERIT</span><h2>The shared process foundation</h2><ul class="clean-list"><li><b>State and history</b><span>Instances, steps and typed process data</span></li><li><b>Tasks and decisions</b><span>Claiming, completion and concurrency</span></li><li><b>A human work surface</b><span>Console, deep links and notifications</span></li><li><b>Operational visibility</b><span>Monitoring, attachments and artifacts</span></li></ul></section></div>${takeaway("Start with one bounded process. <strong>Extend through the same contracts.</strong>")}`,
    notes: "The reference contributes four workflows, two standalone agents (plus an extraction agent node), five agent skills, two review widgets, two roles and a mailbox environment variable. A new process follows this approach; it is not a one-click conversion of any process. Claims, loans and onboarding are possibilities and need their own domain controls and evaluation.",
    sources: ["core", "order"]
  },
  divider("04 / Demo", "Demo", "Demo",
    "Switch to the live demonstration of Agentic Order Intake Processing. Return to Getting Started afterward to cover deployment and prerequisites.", ["order"]),
  {
    section: "04 / Demo",
    title: "Contoso Order Intake team",
    subtitle: "Meet the people behind the demo.",
    layout: "team-slide",
    body: `<div class="columns team-grid"><figure class="team-card"><img src="../../business-processes/order-processing/docs/aadi-order-reviewer.jpg" alt="Aadi, Global Order Reviewer"><figcaption><h2>Aadi</h2><p>Global Order Reviewer</p></figcaption></figure><figure class="team-card"><img src="../../business-processes/order-processing/docs/alan-order-approver.jpg" alt="Alan, Global Order Approver"><figcaption><h2>Alan</h2><p>Global Order Approver</p></figcaption></figure><figure class="team-card"><img src="../../business-processes/order-processing/docs/carlos-backoffice-customer-support.jpg" alt="Carlos, Backoffice Customer Support"><figcaption><h2>Carlos</h2><p>Backoffice Customer Support</p></figcaption></figure><figure class="team-card"><img src="../../business-processes/order-processing/docs/davide-contoso-retail-store-manager.jpg" alt="Davide, Contoso Retail Store Manager"><figcaption><h2>Davide</h2><p>Contoso Retail Store Manager</p></figcaption></figure></div>`,
    notes: "Introduce the demo team: Aadi is the Global Order Reviewer, Alan is the Global Order Approver, Carlos is Backoffice Customer Support, and Davide is the Contoso Retail Store Manager. The reviewer verifies extracted order data; the approver reviews the business-rule evaluation and makes the decision. Global describes their demo responsibilities; the solution-owned Dataverse security roles remain Order Reviewer and Order Approver. Backoffice Customer Support and Contoso Retail Store Manager are demo persona labels, not additional solution-owned Dataverse security roles.",
    sources: ["order"]
  },
  divider("05 / Getting started", "Getting Started", "Getting Started",
    "Transition from solution design to adoption. Cover deployment skills, readiness checks, licensing and the changes needed to turn the reference into a customer-specific pilot. The official repository link uses a dummy URL; replace it with the official URL before sharing.", ["deployCore", "deployOrder"],
    `<a class="repository-link" href="https://example.com/repository" target="_blank" rel="noopener noreferrer">Official repository</a><p class="repository-placeholder">Placeholder link - official URL to be added</p>`),
  {
    section: "05 / Getting started",
    treatment: "business",
    title: "Deploy Core once. Add the process. Verify.",
    subtitle: "Repository deployment skills guide the setup through explicit confirmation.",
    body: `<div class="columns three deployment">${card("01", "Check readiness", "Select the environment.<br>Check access, licenses, credits and required features.<br><br><strong>Confirm before changes.</strong>")}${card("02", "Install Core", "Configure the runtime identity, import the solution and wire connections.<br><br>Verify Core components.")}${card("03", "Add Order Processing", "Configure the automation account and mailbox; activate workflows and assign roles.<br><br>Verify the installation.")}</div><div class="command-row"><div><span>ASK GITHUB COPILOT IN VS CODE</span><code>Deploy Business Process Core</code><small>deploy-business-process-core</small></div><div><span>THEN ASK</span><code>Deploy Order Processing</code><small>deploy-order-processing</small></div></div>${takeaway("Automated assistance, <strong>not a bypass of permissions or administrator approval.</strong>")}`,
    notes: "The skills install or verify tooling and perform readiness checks before making changes. Core requires Dataverse administrator access and Entra app-registration rights; provisioning an environment adds Power Platform administrator access. Order Processing adds user/license and Exchange administration requirements, a dedicated automation user and a shared mailbox with delegated access. The manual guides are available for the same operations. Developer-side GitHub Copilot access is distinct from runtime Copilot Studio licensing.",
    sources: ["core", "order", "deployCore", "deployOrder"]
  },
  {
    section: "05 / Getting started",
    treatment: "business",
    title: "What you need to run - and move beyond - the demo",
    subtitle: "Plan user access, consumption and the path to a customer-specific pilot.",
    layout: "closing",
    body: `<div class="closing-grid"><section class="license-card"><h2>Runtime licensing checklist</h2><table><thead><tr><th>Requirement</th><th>Applies to</th></tr></thead><tbody><tr><td>Power Apps Premium</td><td>Console users, reviewers and approvers</td></tr><tr><td>Copilot Studio user license</td><td>Makers + automation account</td></tr><tr><td>Microsoft Teams</td><td>Users + automation account</td></tr><tr><td>Exchange Online</td><td>Automation account for mailbox access</td></tr><tr class="credits"><td>Copilot Credits</td><td>GitHub Copilot harness: build, test, run</td></tr></tbody></table><p class="license-note">Prepaid capacity or pay-as-you-go. M365 Copilot does not cover this harness consumption. Verify tenant entitlements.</p></section><section class="pilot-card"><span class="pill">FROM SAMPLE TO PILOT</span><h2>Make it yours</h2><ol><li>Replace fictional catalog, inventory and promotion data.</li><li>Add and validate the ERP integration - payload generation is not posting.</li><li>Review access, evaluate agent behavior and measure customer outcomes.</li></ol></section></div>${takeaway("<strong>Deploy. Exercise the reference. Choose the next business process.</strong>")}`,
    notes: "This is a planning checklist, not a binding licensing assessment. User-license entries are sourced from the two READMEs. Microsoft Learn confirms Power Apps Premium for code app end users and Copilot Credit consumption from authoring through runtime for the GitHub Copilot harness. Reconfirm current user entitlements, tenant capacity, environment features, admin rights and commercial terms before deployment. The MIT repository license does not grant Microsoft service licenses. Production work also includes testing, access controls, reliable integration and monitoring. Shared-mailbox licensing depends on configuration; the listed Exchange requirement is for the automation account.",
    sources: ["core", "order", "credits", "apps", "deployCore", "deployOrder"]
  },
  {
    section: "05 / Getting started",
    title: "Add a new business process",
    subtitle: "Reuse the Business Process Solution. Specify and build only what makes your process different.",
    layout: "new-process-slide",
    body: `<div class="process-build-grid"><section class="process-build-panel"><h2>Build on the reference pattern</h2><ol class="process-build-steps"><li><strong>Define the process contract</strong><p>Trigger, stages, data, business rules, human gates and acceptance criteria.</p></li><li><strong>Implement the domain pieces</strong><p>Create a new folder under business-processes, alongside order-processing. Add stage workflows, agents + skills, review widgets, roles and configuration.</p></li><li><strong>Connect to the shared runtime</strong><p>Persist typed outputs; advance through Dataverse step events; use the Core task APIs.</p></li><li><strong>Validate and deploy</strong><p>Test rules, permissions, human decisions, recovery and integrations. Package as a separate process solution.</p></li></ol></section><section class="forge-panel"><div class="forge-heading"><h2>Accelerate with Agent Forge</h2><span class="forge-status">WORK IN PROGRESS</span></div><p class="forge-intro">Proposed spec-driven, agentic development path</p><ol class="forge-flow"><li><strong>Analyst Agent</strong><span>Clarify requirements, process rules and exceptions.</span></li><li><strong>Product Owner Agent</strong><span>Turn the agreed specification into a prioritized backlog and acceptance criteria.</span></li><li><strong>GitHub Copilot</strong><span>Implement and test scoped work against the specification and reference patterns.</span></li></ol></section></div>`,
    notes: "Start with a bounded business process and agree its inputs, stages, human decisions, exception paths, system-of-record integrations and measurable acceptance criteria. Follow Order Processing as the reference rather than rebuilding the shared runtime. The process contributes stage workflows, Copilot Studio agents and focused skills, review widgets, security roles and environment variables. Use the Core contracts for durable state, typed outputs and human tasks; stage continuation is driven by persisted Dataverse step events. Test domain rules, output schemas, access, concurrency, recovery and integrations before deploying the process as its own solution on the installed Core. The right-hand section presents the proposed Agent Forge approach requested for this presentation: Analyst Agent clarifies requirements; Product Owner Agent shapes the approved specification into implementable backlog items and acceptance criteria; GitHub Copilot assists with implementation and tests. These responsibilities describe an intended workflow, not a verified integration in this repository. Explicitly call it work in progress. Faster delivery is an aim, not a measured claim. Human approval, code review, evaluation and deployment controls remain necessary. Developer-side GitHub Copilot is distinct from the Copilot Studio GitHub Copilot harness used at runtime.",
    sources: ["core", "order"]
  },
  {
    ...divider("06 / Discussion", "Thank you", "Thank you.",
      "Close with discussion and questions. Return to Getting Started for the official repository link; replace its placeholder URL before sharing externally.", ["core", "order"]),
    closingTemplate: true
  }
];
