#!/usr/bin/env python3
"""Build a Copilot Studio Workflow Designer file from one data structure (no cloud calls).

Every node you add emits all three copies the designer contract needs: the runtime action, the designer
node (with edges) and the `nodeActionMapping` entry. Node shapes are copied from a TEMPLATE workflow export
(any workflow exported from the designer that contains one node of each kind you use), so no value is
invented here. Ids are deterministic (uuid5 of a namespace and the display name): re-running the script
gives the same file.

Usage (sketch; see SKILL.md, "Procedure" step 3):

    from workflow_builder import WorkflowBuilder, write_json
    b = WorkflowBuilder("Workflows/some-exported-flow.json", namespace="<any fixed uuid>")
    trig = b.trigger("When a Step is created", filterexpression="faf001_stepname eq 'X' and faf001_status eq 324010000")
    top = {}
    main = b.chain(top, after=trig)                       # top-level chain
    main.variable("Initialize result", [("result", "initialize", "string", "{}", "{}")])
    main.conn("List rows", "ListRecords", {"entityName": "...", "$top": 1})
    yes, no = main.if_("Row not found", "Row not found", {"and": [{"equals": ["@length(...)", 0]}]})
    no.end("Stop")
    loop = yes.loop("Each file", "@outputs('List_rows')?['body/value']")    # sequential by default
    loop.conn("Download", "GetEntityFileImageFieldContent", {...})
    loop.agent("My Agent", "<prompt>", "faf001_myagent", schema)           # schema=None: text answer
    loop.close()
    check = yes.if_("Validate", "Valid", {...}, run_after=["Succeeded", "Failed", "Skipped", "TimedOut"])
    write_json("Workflows/new-flow-<GUID>.json", b.finish(top, "new-flow"))

Then run check_workflow.py on the result. Variable assignments are
(name, mode, type, runtime_value, designer_value) with mode initialize | set | increment | appendToArray.
Nodes you use must exist once in the template (connector operations are matched by operationName and table,
`entityName`, because the outcome schema of a connector node lists the columns of its table).

Extract node: pass `extract_template="references/extract/workflow-extract.json"` (or any export that contains an
Extract node) to the constructor, then
    main.extract("Extract order data", "@body('Download_file')?['$content']", [
        {"name": "order_id", "type": "string", "description": "Purchase order number"},
        {"name": "line_items", "type": "list", "description": "Ordered lines", "items": [
            {"name": "sku", "type": "string", "required": True, "description": "Product SKU"}]}],
        model="<model series>", connection="shared_agentnode")
Property types are string | number | list. The input must be a reference expression (a body / outputs /
triggerBody / items / variables reference); the designer shows it as a token.
"""
import copy
import json
import re
import uuid


def crlf(s):
    return s.replace("\r\n", "\n").replace("\n", "\r\n")


def action_name(display):
    """Runtime action name of a node: every non-alphanumeric character becomes an underscore."""
    return re.sub(r"[^A-Za-z0-9]", "_", display)


def write_json(path, obj):
    """Write a workflow file the way the designer exports it: 2-space indent, CRLF, no BOM."""
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(crlf(json.dumps(obj, indent=2, ensure_ascii=False)))


def _ra(prev, statuses=("Succeeded",)):
    return {prev: list(statuses)} if prev else {}


class WorkflowBuilder:
    ROW_STEP = 380      # horizontal distance between nodes
    BRANCH_STEP = 330   # vertical distance of the else branch

    def __init__(self, template_path, namespace, extract_template=None):
        self.ns = uuid.UUID(namespace)
        with open(template_path, encoding="utf-8-sig") as f:
            self.doc = json.load(f)
        df = self.doc["properties"]["definition"]
        self.t_trigger = list(df["triggers"].values())[0]
        self.t_graph = self.t_trigger["metadata"]["associatedData"]["graph"]
        self.nodes, self.edges, self.mapping = [], [], {}
        self._find_templates()
        self.t_extract_action = None
        if extract_template:
            self._load_extract_template(extract_template)
        self._start = None
        self._trigger = None
        # a template can contain a stray connection name on one node (for example "<api>-1"): use the most common
        counts = {}
        for ops in self.t_conn.values():
            for t in ops:
                c = t["data"]["config"]
                counts.setdefault(c["apiName"], {}).setdefault(c["connectionName"], 0)
                counts[c["apiName"]][c["connectionName"]] += 1
        self.conn_name = {api: max(v, key=v.get) for api, v in counts.items()}

    # ----------------------------------------------------------------- templates
    def _find_templates(self):
        self.t_conn = {}
        self.t_compose = self.t_agent = self.t_var = self.t_if = self.t_loop = self.t_end = self.t_start = None
        self.t_extract = None
        for n in self.t_graph["nodes"]:
            cfg = n["data"]["config"]
            if n["type"] == "agentExtract":
                self.t_extract = self.t_extract or n
            elif n["type"] == "connector":
                self.t_conn.setdefault(cfg["operationName"], []).append(n)
            elif n["type"] == "builtinFunction" and cfg.get("operationId") == "Compose":
                self.t_compose = self.t_compose or n
            elif n["type"] == "agent":
                self.t_agent = self.t_agent or n
            elif n["type"] == "variable":
                self.t_var = self.t_var or n
            elif n["type"] == "ifElse":
                self.t_if = self.t_if or n
            elif n["type"] == "loop":
                self.t_loop = self.t_loop or n
            elif n["type"] == "end":
                self.t_end = self.t_end or n
            elif n["type"] == "start":
                self.t_start = n

    def _load_extract_template(self, path):
        with open(path, encoding="utf-8-sig") as f:
            doc = json.load(f)
        df = doc["properties"]["definition"]
        graph = list(df["triggers"].values())[0]["metadata"]["associatedData"]["graph"]
        self.t_extract = next((n for n in graph["nodes"] if n["type"] == "agentExtract"), None)
        node_id = self.t_extract and self.t_extract["id"]
        self.t_extract_action = next((a for a in df["actions"].values()
                                      if (a.get("metadata") or {}).get("nodeId") == node_id), None)

    def _need(self, node, what):
        if node is None:
            raise SystemExit(f"template has no {what} node; use a template workflow that contains one")
        return copy.deepcopy(node)

    def gid(self, kind, name):
        return f"{kind}-{uuid.uuid5(self.ns, name)}"

    # ----------------------------------------------------------------- trigger
    def trigger(self, display, **subscription):
        """Dataverse row trigger. Keyword arguments set `subscriptionRequest/<name>` in both copies,
        for example filterexpression="...", message=1, scope=4."""
        self._trigger = copy.deepcopy(self.t_trigger)
        self._start = self._need(self.t_start, "start")
        self._start["id"] = self.gid("start", display)
        self._start["name"] = display
        self._trigger_key = action_name(display)
        for k, v in subscription.items():
            self._trigger["inputs"]["parameters"][f"subscriptionRequest/{k}"] = v
            self._start["data"]["config"]["connector"]["inputs"][f"subscriptionRequest/{k}"] = v
        return self._start["id"]

    # ----------------------------------------------------------------- chains
    def chain(self, actions, after=None, x=646, y=356.5, parent=None, first_edge=None):
        c = Chain(self, actions, x, y, parent, first_edge)
        c.prev_node = after
        return c

    def finish(self, top_actions, flow_name, connections=None):
        """`connections`: connector api names the flow uses (for example ["shared_commondataserviceforapps"]);
        the other connection references of the template are dropped from both copies. Default: keep all."""
        new = copy.deepcopy(self.doc)
        df = new["properties"]["definition"]
        df["actions"] = top_actions
        df["triggers"] = {self._trigger_key: self._trigger}
        refs = copy.deepcopy(self.t_graph["connectionReferences"])
        if connections is not None:
            refs = {k: v for k, v in refs.items() if k in connections}
            new["properties"]["connectionReferences"] = {
                k: v for k, v in new["properties"]["connectionReferences"].items() if k in connections}
        self._trigger["metadata"]["associatedData"]["graph"] = {
            "name": flow_name, "nodes": [self._start] + self.nodes, "edges": self.edges,
            "connectionReferences": refs}
        self._trigger["metadata"]["associatedData"]["nodeActionMapping"] = self.mapping
        return new


class Chain:
    """A linear chain of nodes inside one runtime container (top level, branch or loop body)."""

    def __init__(self, b, actions, x, y, parent=None, first_edge=None):
        self.b, self.actions, self.x, self.y, self.parent = b, actions, x, y, parent
        self.prev_action = self.prev_node = None
        self.pending_edge = first_edge

    # ---- plumbing
    def _link(self, node_id):
        edges = self.b.edges
        if self.pending_edge:
            s, sh = self.pending_edge
            e = {"id": f"edge-{s}-{sh + '-' if sh else ''}{node_id}", "source": s, "target": node_id}
            if sh:
                e["sourceHandle"] = sh
            self.pending_edge = None
        elif self.prev_node:
            e = {"id": f"edge-{self.prev_node}-{node_id}", "source": self.prev_node, "target": node_id}
            if self.prev_node.startswith("loop-"):
                e["id"] = f"edge-{self.prev_node}-external-output-{node_id}"
                e["sourceHandle"] = "external-output"
        else:
            return
        if node_id.startswith("loop-"):
            e["targetHandle"] = "external-input"
            e["id"] += "-external-input"
        edges.append(e)

    def _pos(self, step=None):
        p = {"x": self.x, "y": self.y}
        self.x += self.b.ROW_STEP if step is None else step
        return p

    def _add(self, node, action_names, last_action=None):
        node.pop("parentId", None)
        if self.parent:
            node["parentId"] = self.parent
        self.b.nodes.append(node)
        self.b.mapping[node["id"]] = action_names
        self.prev_action = last_action or action_names[-1]
        self.prev_node = node["id"]

    def _meta(self, display, nid):
        return {"description": display, "nodeId": nid}

    # ---- nodes
    def conn(self, display, op, params):
        """A connector action (Dataverse, ...). `op` is the operationName found in the template, on the same
        table (`entityName`): the designer node's outcome schema (dynamic content) is table specific."""
        b = self.b
        nid = b.gid("connector", display)
        aname = action_name(display)
        candidates = b.t_conn.get(op) or []
        table = params.get("entityName")
        same = [t for t in candidates if t["data"]["config"]["parameters"].get("entityName") == table]
        if candidates and not same:
            tables = ", ".join(sorted({str(t["data"]["config"]["parameters"].get("entityName")) for t in candidates}))
            raise SystemExit(f"template has {op} on {tables}, not on {table}: use a template workflow that "
                             f"contains {op} on {table}")
        n = b._need((same or [None])[0], f"connector operation {op}")
        cfg = n["data"]["config"]
        cfg["connectionName"] = b.conn_name[cfg["apiName"]]
        self.actions[aname] = {
            "type": "OpenApiConnection",
            "inputs": {"parameters": params,
                       "host": {"apiId": f"/providers/Microsoft.PowerApps/apis/{cfg['apiName']}",
                                "connectionName": cfg["connectionName"], "operationId": op}},
            "metadata": self._meta(display, nid), "runAfter": _ra(self.prev_action)}
        self._link(nid)
        n.update(id=nid, name=display, position=self._pos())
        cfg["parameters"] = params
        self._add(n, [aname])
        return aname

    def _builtin(self, display, kind, runtime_type, params, desc):
        b = self.b
        nid = b.gid("builtinFunction", display)
        aname = action_name(display)
        self.actions[aname] = {"type": runtime_type, "inputs": params, "runAfter": _ra(self.prev_action),
                               "metadata": self._meta(display, nid)}
        n = b._need(b.t_compose, "Compose")
        n.update(id=nid, name=display, position=self._pos())
        cfg = n["data"]["config"]
        if kind != "Compose":
            cfg["operationId"] = cfg["operationName"] = kind
        cfg["parameters"] = {"inputs": params} if kind == "Compose" else params
        cfg["displayName"], cfg["description"] = display, desc
        self._link(nid)
        self._add(n, [aname])
        return aname

    def compose(self, display, inputs, desc):
        return self._builtin(display, "Compose", "Compose", inputs, desc)

    def data_op(self, display, kind, params, desc):
        """kind: query (Filter array) | select | parsejson."""
        return self._builtin(display, kind, {"query": "Query", "select": "Select", "parsejson": "ParseJson"}[kind],
                             params, desc)

    def variable(self, display, assigns):
        b = self.b
        nid = b.gid("variable", display)
        base = action_name(display)
        n = b._need(b.t_var, "variable")
        n.update(id=nid, name=display, position=self._pos())
        n["data"]["config"]["assignments"] = [
            {"id": f"var-{nid[-6:]}-{i}", "variableName": v, "mode": m, "type": t, "value": dv}
            for i, (v, m, t, rv, dv) in enumerate(assigns)]
        names, prev = [], self.prev_action
        for i, (v, m, t, rv, dv) in enumerate(assigns):
            suffix = {"initialize": "Init", "appendToArray": "AppendArr"}.get(m, "Set")
            aname = base if i == 0 else f"{base}_{suffix}_{v}"
            if m == "initialize":
                a = {"type": "InitializeVariable", "inputs": {"variables": [{"name": v, "type": t.capitalize(), "value": rv}]}}
            elif m == "set":
                a = {"type": "SetVariable", "inputs": {"name": v, "value": rv}}
            elif m == "increment":
                a = {"type": "IncrementVariable", "inputs": {"name": v, "value": rv}}
            else:
                a = {"type": "AppendToArrayVariable", "inputs": {"name": v, "value": rv}}
            a["runAfter"] = _ra(prev)
            if i == 0:
                a["metadata"] = self._meta(display, nid)
            self.actions[aname] = a
            names.append(aname)
            prev = aname
        self._link(nid)
        self._add(n, names)
        return prev

    def end(self, display, status="Succeeded"):
        b = self.b
        nid = b.gid("end", display)
        self.actions[nid] = {"type": "Terminate", "inputs": {"runStatus": status}, "runAfter": _ra(self.prev_action),
                             "metadata": self._meta(display, nid)}
        n = b._need(b.t_end, "end")
        n.update(id=nid, name=display, position=self._pos())
        n["data"]["config"]["runStatus"] = status
        self._link(nid)
        self._add(n, [nid])

    def agent(self, display, prompt, agent_id, schema=None):
        """Published agent. With `schema` the answer is structured (`structuredOutput`), without it text (`result`).
        `prompt` is stored in the runtime action and in both designer copies."""
        b = self.b
        nid = b.gid("agent", display)
        aname = action_name(display)
        n = b._need(b.t_agent, "agent")
        cfg = n["data"]["config"]
        params = {"body/prompt": prompt, "body/agentId": agent_id}
        if schema:
            params["body/outputSchema"] = copy.deepcopy(schema)
        self.actions[aname] = {
            "type": "OpenApiConnection",
            "inputs": {"parameters": params,
                       "host": {"apiId": f"/providers/Microsoft.PowerApps/apis/{cfg['connectionName']}",
                                "connectionName": cfg["connectionName"], "operationId": "InvokeAgent"}},
            "metadata": self._meta(display, nid), "runAfter": _ra(self.prev_action)}
        self._link(nid)
        n.update(id=nid, name=display, position=self._pos())
        cfg["instructions"] = prompt
        cfg["instructionsRich"] = {"segments": [{"type": "static", "value": prompt}]}
        cfg["botSchemaName"] = agent_id
        props = n["data"]["outcomes"][0]["outcomeSchema"]["properties"]
        if schema:
            cfg["jsonSchema"] = copy.deepcopy(schema)
            cfg["jsonSchemaText"] = crlf(json.dumps(schema, indent=2, ensure_ascii=False))
            cfg["outputMode"] = "structured"
            so = copy.deepcopy(schema)
            so["title"] = ""
            props["structuredOutput"] = so
        else:
            cfg.pop("jsonSchema", None)
            cfg.pop("jsonSchemaText", None)
            cfg["outputMode"] = "text"
            props.pop("structuredOutput", None)
        self._add(n, [aname])
        return aname

    def extract(self, display, input_expr, properties, model, connection="shared_agentnode"):
        """Extract node (document extraction with a structured output schema). `properties` is a list of
        {name, type: string|number|list, description, required?, items?: [...]}; the schema, the designer property
        list and the runtime `output.schema` are all generated from it. `input_expr` is the base64 text of the
        document (or the text itself)."""
        b = self.b
        if not b.t_extract or not b.t_extract_action:
            raise SystemExit("no Extract node template; pass extract_template=<workflow with an Extract node>")
        nid = b.gid("agentExtract", display)
        aname = action_name(display)

        def schema_of(p):
            if p["type"] == "list":
                items = {"type": "object", "properties": {q["name"]: schema_of(q) for q in p["items"]}}
                req = [q["name"] for q in p["items"] if q.get("required")]
                if req:
                    items["required"] = req
                return {"type": "array", "description": p["description"], "items": items}
            return {"type": p["type"], "description": p["description"]}

        def simple_of(p, path):
            d = {"id": str(uuid.uuid5(b.ns, f"{display}/{path}")), "name": p["name"], "type": p["type"],
                 "required": bool(p.get("required")), "description": p["description"]}
            if p["type"] == "list":
                d["listItems"] = [simple_of(q, f"{path}/{q['name']}") for q in p["items"]]
            return d

        schema = {"type": "object", "properties": {p["name"]: schema_of(p) for p in properties}}
        req = [p["name"] for p in properties if p.get("required")]
        if req:
            schema["required"] = req

        action = copy.deepcopy(b.t_extract_action)
        definition = action["inputs"]["parameters"]["body/definition"]
        agent_settings = definition["entity"]["configuration"]["agentSettings"]
        agent_settings["model"]["series"] = model
        agent_settings["output"]["schema"] = json.dumps(schema, separators=(",", ":"), ensure_ascii=False)
        params = {"body/definition": definition, "body/message": "{document}",
                  "body/files": [{"name": "document", "content": input_expr}]}
        self.actions[aname] = {
            "type": "OpenApiConnection",
            "inputs": {"parameters": params,
                       "host": {"apiId": "/providers/Microsoft.PowerApps/apis/shared_agentnode",
                                "connectionName": connection, "operationId": "InvokeDefinition"}},
            "metadata": self._meta(display, nid), "runAfter": _ra(self.prev_action)}

        n = b._need(b.t_extract, "agentExtract")
        cfg = n["data"]["config"]
        # the designer stores the input as a token; only reference functions (body, outputs, triggerBody, ...)
        # have a known token shape
        designer_input = input_expr
        m = re.match(r"@(\w+)\(", designer_input)
        if not m or m.group(1) not in ("body", "outputs", "triggerBody", "triggerOutputs", "items", "variables"):
            raise SystemExit("Extract input must be a reference expression such as @body('<action>')?['$content'] or "
                             "@triggerBody()?['file']?['contentBytes']; use a Compose step for anything else")
        raw = designer_input[1:]
        cfg["input"] = designer_input
        cfg["inputRich"] = {"segments": [{"type": "token", "value": "@{" + raw + "}", "tokenRef": {
            "type": "function", "stepId": "function", "stepName": "Reference", "outputName": m.group(1),
            "outputType": "object", "functionName": m.group(1), "functionCategory": "reference",
            "rawExpression": raw}}]}
        cfg["outputMode"] = "structured-simple"
        cfg["inlineModel"] = model
        cfg["connectionName"] = connection
        cfg["simpleProperties"] = [simple_of(p, p["name"]) for p in properties]
        cfg["jsonSchema"] = copy.deepcopy(schema)
        outcome = n["data"]["outcomes"][0]["outcomeSchema"]["properties"]
        so = copy.deepcopy(schema)
        so["title"] = ""
        outcome["structuredOutput"] = so
        self._link(nid)
        n.update(id=nid, name=display, position=self._pos())
        self._add(n, [aname])
        return aname

    # ---- containers
    def if_(self, display, cond_name, expression, run_after=None):
        """If node. Returns (yes_chain, else_chain). `run_after`: statuses of the previous action that let the
        condition run (for example ["Succeeded", "Failed", "Skipped", "TimedOut"])."""
        b = self.b
        nid = b.gid("ifElse", display)
        aname = action_name(display)
        cid = str(uuid.uuid5(b.ns, "cond-" + display))
        n = b._need(b.t_if, "ifElse")
        n.update(id=nid, name=display, position=self._pos())
        cfg = n["data"]["config"]
        cfg["conditions"] = [{"id": cid, "name": cond_name, "expression": crlf(json.dumps(expression, indent=2, ensure_ascii=False))}]
        n["data"]["outcomes"] = [{"id": f"condition:{cid}", "label": cond_name}, {"id": "else", "label": "Else"}]
        n["data"].pop("settings", None)
        run_after_map = _ra(self.prev_action, run_after or ("Succeeded",))
        if run_after:
            n["data"]["settings"] = {"runAfter": {self.prev_node: list(run_after)}}
        act = {"type": "If", "expression": expression, "actions": {}, "else": {"actions": {}}, "runAfter": run_after_map,
               "metadata": self._meta(display, nid)}
        self.actions[aname] = act
        self._link(nid)
        self._add(n, [aname])
        yes = Chain(b, act["actions"], self.x, self.y, self.parent, first_edge=(nid, f"condition:{cid}"))
        no = Chain(b, act["else"]["actions"], self.x, self.y + b.BRANCH_STEP, self.parent, first_edge=(nid, "else"))
        return yes, no

    def loop(self, display, foreach, concurrency=1, width=1960, height=300):
        """Apply-to-each. Returns the chain for the loop body; call `.close()` on it when the body is complete.
        Use concurrency 1 when each iteration needs the previous one (a fold)."""
        b = self.b
        nid = b.gid("loop", display)
        aname = action_name(display)
        body = {}
        self.actions[aname] = {"type": "Foreach", "foreach": foreach, "actions": body, "runAfter": _ra(self.prev_action),
                               "metadata": self._meta(display, nid),
                               "runtimeConfiguration": {"concurrency": {"repetitions": concurrency}}}
        self._link(nid)
        n = b._need(b.t_loop, "loop")
        n.update(id=nid, name=display, position=self._pos(0))
        n["data"]["config"]["foreach"] = foreach
        n["data"]["config"]["concurrency"] = concurrency
        n["width"], n["height"] = width, height
        n["measured"] = {"width": width, "height": height}
        n["style"] = {"width": width, "height": height}
        self._add(n, [aname])
        self.x += width + 80
        inner = Chain(b, body, 27, 80, parent=nid, first_edge=(nid, "internal-source"))
        inner.loop_id = nid
        return inner

    def close(self):
        """Close a loop body: edge from its last node back to the loop container."""
        self.b.edges.append({"id": f"edge-{self.prev_node}-{self.loop_id}-internal-target", "source": self.prev_node,
                             "target": self.loop_id, "targetHandle": "internal-target"})
