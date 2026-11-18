#!/usr/bin/env python3
"""Offline contract check for a Copilot Studio Workflow Designer export (no cloud calls, no writes).

Usage: python check_workflow.py <workflow.json> [--forbid TERM ...] [--template <template.json>]

Checks:
  1. Envelope: telemetryMetadata.modifiedSources, templateName null, graph + nodeActionMapping present.
  2. Every runtime action (nested too) either carries metadata.nodeId + description (first action of a
     node) or is listed after its first action in nodeActionMapping (nodes that expand to several
     actions, e.g. variable nodes); every graph node (except the trigger) is mapped; every mapped
     action exists.
  3. Every edge connects existing nodes; every runAfter names an existing sibling action.
  4. Every action named in an expression (outputs/body/actions/items) exists; items('X') names a loop.
  5. Expression length <= 8192 characters; parentheses and quotes balance.
  6. Agent nodes: designer copies match the runtime action (prompt, schema, output mode).
  7. Loops and scopes: designer foreach/concurrency match the runtime action; child nodes carry the
     container as parentId. Variables: every variable used or changed is initialised by a top-level
     InitializeVariable (a hoisted one without metadata is allowed).
  8. --forbid terms (and, with --template, every action name / schema name of the template) do not appear.
Exit code 1 when any check fails.
"""
import argparse
import json
import re
import sys

LIMIT = 8192


def load(path):
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def trigger_of(doc):
    df = doc["properties"]["definition"]
    key = next(iter(df["triggers"]))
    return df, df["triggers"][key]


def walk(actions, out, loops):
    for name, a in actions.items():
        out[name] = (a, actions)
        if a.get("type") == "Foreach":
            loops.add(name)
        subs = [a.get("actions"), (a.get("else") or {}).get("actions"), (a.get("default") or {}).get("actions")]
        subs += [(c or {}).get("actions") for c in (a.get("cases") or {}).values()]
        for sub in subs:
            if sub:
                walk(sub, out, loops)


def strings(o):
    if isinstance(o, dict):
        for v in o.values():
            yield from strings(v)
    elif isinstance(o, list):
        for v in o:
            yield from strings(v)
    elif isinstance(o, str):
        yield o


def interpolations(s):
    """Yield every expression in a string: whole '@expr' or each '@{expr}'."""
    if s.startswith("@") and not s.startswith("@{"):
        yield s[1:]
        return
    i = 0
    while True:
        j = s.find("@{", i)
        if j < 0:
            return
        depth, quote, k = 0, False, j + 2
        while k < len(s):
            c = s[k]
            if c == "'":
                if quote and s[k + 1:k + 2] == "'":
                    k += 2
                    continue
                quote = not quote
            elif not quote:
                if c == "{":
                    depth += 1
                elif c == "}":
                    if depth == 0:
                        break
                    depth -= 1
            k += 1
        yield s[j + 2:k]
        i = k + 1


def balanced(e):
    depth, quote, i = 0, False, 0
    while i < len(e):
        c = e[i]
        if c == "'":
            if quote and e[i + 1:i + 2] == "'":
                i += 2
                continue
            quote = not quote
        elif not quote:
            depth += (c == "(") - (c == ")")
            if depth < 0:
                return False
        i += 1
    return depth == 0 and not quote


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("workflow")
    ap.add_argument("--forbid", nargs="*", default=[])
    ap.add_argument("--template")
    args = ap.parse_args()

    errs, warns = [], []
    doc = load(args.workflow)
    df, trig = trigger_of(doc)
    md = df.get("metadata", {}).get("telemetryMetadata", {})
    if "WorkflowDesigner" not in str(md.get("modifiedSources", "")).split(","):
        errs.append("definition.metadata.telemetryMetadata.modifiedSources must include 'WorkflowDesigner'")
    if doc["properties"].get("templateName") is not None:
        errs.append("properties.templateName must be null")
    ad = trig.get("metadata", {}).get("associatedData", {})
    graph, mapping = ad.get("graph"), ad.get("nodeActionMapping")
    if not graph or mapping is None:
        print("FAIL: trigger metadata.associatedData needs graph and nodeActionMapping")
        return 1
    for k in ("name", "nodes", "edges", "connectionReferences"):
        if k not in graph:
            errs.append(f"graph.{k} missing")
    nodes = {n["id"]: n for n in graph["nodes"]}
    for n in graph["nodes"]:
        for k in ("id", "name", "type", "version", "position", "data"):
            if k not in n:
                errs.append(f"node {n.get('id')}: missing {k}")

    actions, loops = {}, set()
    walk(df["actions"], actions, loops)
    listed = {}
    for nid, names in mapping.items():
        for i, n in enumerate(names):
            listed[n] = (nid, i)
            if n not in actions and n != nid:
                errs.append(f"nodeActionMapping[{nid}] lists unknown action '{n}'")
    for name, (a, siblings) in actions.items():
        m = a.get("metadata", {})
        nid = m.get("nodeId")
        if nid:
            if not m.get("description"):
                errs.append(f"{name}: metadata.description required")
            if nid not in nodes:
                errs.append(f"{name}: nodeId {nid} has no graph node")
            if mapping.get(nid, [None])[0] not in (name, nid):
                errs.append(f"{name}: nodeActionMapping[{nid}] = {mapping.get(nid)} must start with this action")
        elif a.get("type") == "InitializeVariable" and siblings is df["actions"]:
            pass  # the designer hoists variables initialised inside a scope to a top-level action without metadata
        elif name not in listed or listed[name][1] == 0:
            errs.append(f"{name}: needs metadata.nodeId, or must follow the first action of its node in nodeActionMapping")
        for r in (a.get("runAfter") or {}):
            if r not in siblings:
                errs.append(f"{name}: runAfter '{r}' is not a sibling action")
    for nid in nodes:
        if nid != graph["nodes"][0]["id"] and nid not in mapping:
            errs.append(f"node {nid}: not in nodeActionMapping")
    for e in graph["edges"]:
        if e["source"] not in nodes or e["target"] not in nodes:
            errs.append(f"edge {e.get('id')}: dangling")

    ref = re.compile(r"\b(?:outputs|body|actions)\(\s*'([^']+)'\s*\)")
    items = re.compile(r"\bitems\(\s*'([^']+)'\s*\)")
    blocked = re.compile(r"\bresult\(")  # valid at runtime, but the editor reports it unknown and blocks publishing
    for text in strings(df["actions"]):
        for ex in interpolations(text):
            if blocked.search(ex):
                errs.append(f"expression uses result(), which the Copilot Studio editor rejects (blocks publish): {ex[:70]}")
            if len(ex) > LIMIT:
                errs.append(f"expression of {len(ex)} chars exceeds {LIMIT}: {ex[:60]}...")
            if not balanced(ex):
                errs.append(f"unbalanced expression: {ex[:80]}")
            for target in ref.findall(ex):
                if target not in actions:
                    errs.append(f"expression references missing action '{target}'")
            for target in items.findall(ex):
                if target not in loops:
                    errs.append(f"items('{target}') does not name a loop")
    # references inside designer text (stale template copies show up here); the editor writes
    # references to other nodes as the node id, which resolves through nodeActionMapping
    seen = set()
    for n in graph["nodes"]:
        for text in strings(n.get("data", {}).get("config", {})):
            for target in ref.findall(text):
                if target in actions or target in nodes and mapping.get(target, [None])[0] in actions:
                    continue
                if (n["name"], target) not in seen:
                    seen.add((n["name"], target))
                    errs.append(f"node '{n['name']}' designer config references missing action '{target}'")

    # agent nodes: designer copies agree with the runtime action
    for name, (a, _) in actions.items():
        inputs = a.get("inputs")
        if isinstance(inputs, dict) and str(inputs.get("host", {}).get("apiId", "")).endswith("shared_agentnode"):
            p = a["inputs"]["parameters"]
            node = nodes.get(a["metadata"]["nodeId"])
            cfg = node["data"]["config"] if node else {}
            prompt = p.get("body/prompt", p.get("body/message"))
            structured = "body/outputSchema" in p or "body/botDefinition" in p
            if cfg.get("mode") == "invoke":
                if cfg.get("instructions") != prompt:
                    errs.append(f"{name}: config.instructions differs from the runtime prompt")
                rich = "".join(s.get("value", "") for s in (cfg.get("instructionsRich") or {}).get("segments", []))
                if rich != prompt:
                    errs.append(f"{name}: config.instructionsRich differs from the runtime prompt")
                want = "structured" if structured else "text"
                if cfg.get("outputMode") != want:
                    errs.append(f"{name}: config.outputMode is {cfg.get('outputMode')}, runtime implies {want}")
                if p.get("body/outputSchema") and cfg.get("jsonSchema") != p["body/outputSchema"]:
                    errs.append(f"{name}: config.jsonSchema differs from body/outputSchema")
                if cfg.get("botSchemaName") != p.get("body/agentId"):
                    errs.append(f"{name}: config.botSchemaName differs from body/agentId")

    # loops: designer settings agree with the runtime action
    for name, (a, _) in actions.items():
        if a.get("type") != "Foreach":
            continue
        nid = a.get("metadata", {}).get("nodeId")
        cfg = nodes.get(nid, {}).get("data", {}).get("config", {})
        designer = str(cfg.get("foreach", ""))
        want = designer if designer.startswith("@coalesce(") else "@coalesce(" + designer[1:] + ", json('[]'))"
        if a.get("foreach") != want:
            errs.append(f"{name}: runtime foreach {a.get('foreach')!r} should be {want!r} (designer foreach {cfg.get('foreach')!r})")
        rt = ((a.get("runtimeConfiguration") or {}).get("concurrency") or {}).get("repetitions")
        if cfg.get("concurrency") != rt:
            warns.append(f"{name}: designer concurrency {cfg.get('concurrency')} differs from runtimeConfiguration.concurrency.repetitions {rt}")
        for cname, (ca, _) in actions.items():
            if ca is not a and cname in a.get("actions", {}):
                cn = nodes.get((listed.get(cname) or (None,))[0] if not ca.get("metadata", {}).get("nodeId") else ca["metadata"]["nodeId"])
                if cn is not None and cn.get("parentId") != nid:
                    errs.append(f"{cname}: designer node parentId should be the loop node {nid}")

    # designer run-after (data.settings.runAfter, keyed by NODE id) must match the runtime runAfter
    first_node = {}
    for nid_, names_ in mapping.items():
        for n_ in names_:
            first_node[n_] = nid_
    for name, (a, siblings) in actions.items():
        nid = a.get("metadata", {}).get("nodeId")
        settings = (nodes.get(nid, {}).get("data", {}).get("settings") or {}).get("runAfter")
        if settings is None:
            continue
        want = {first_node.get(r, r): sorted(st) for r, st in (a.get("runAfter") or {}).items()}
        have = {k: sorted(v) for k, v in settings.items()}
        if want != have:
            errs.append(f"{name}: designer settings.runAfter {have} differs from runtime runAfter {want}")
        for k in have:
            if k not in nodes:
                errs.append(f"{name}: designer settings.runAfter names unknown node '{k}'")

    # scopes: children carry the scope as parentId; the designer node type is 'scope'
    for name, (a, _) in actions.items():
        if a.get("type") != "Scope":
            continue
        nid = a.get("metadata", {}).get("nodeId")
        if nodes.get(nid, {}).get("type") != "scope":
            errs.append(f"{name}: designer node {nid} must have type 'scope'")
        for cname, ca in a.get("actions", {}).items():
            cnid = ca.get("metadata", {}).get("nodeId") or (listed.get(cname) or (None,))[0]
            if nodes.get(cnid, {}).get("parentId") != nid:
                errs.append(f"{cname}: designer node parentId should be the scope node {nid}")

    # classify nodes: categories, outcomes, edges, prompt, schema enum and Switch cases describe the same set
    for nid, node in nodes.items():
        if node.get("type") != "classifyOnInlineAgent":
            continue
        cfg = node["data"]["config"]
        cats = cfg.get("categories") or []
        want = {f"category:{c['id']}": c["name"] for c in cats}
        got = [o["id"] for o in node["data"].get("outcomes", [])]
        if sorted(got) != sorted(list(want) + ["default-category"]):
            errs.append(f"classify '{node['name']}': outcomes must be one 'category:<id>' per category plus 'default-category'")
        for e in graph["edges"]:
            if e["source"] == nid and e.get("sourceHandle") not in got:
                errs.append(f"classify '{node['name']}': edge {e.get('id')} has sourceHandle not in outcomes")
        names = mapping.get(nid, [])
        if len(names) != 2 or names[0] not in actions or names[1] not in actions:
            errs.append(f"classify '{node['name']}': nodeActionMapping must list the agent action and its Switch")
            continue
        agent, switch = actions[names[0]][0], actions[names[1]][0]
        p = agent["inputs"]["parameters"]
        message = p.get("body/message", "")
        labels = [c["name"] for c in cats] + ["Other"]
        if sorted((switch.get("cases") or {}).keys()) != sorted(c["name"] for c in cats):
            errs.append(f"{names[1]}: Switch cases must be exactly the category names {[c['name'] for c in cats]}")
        for k, c in (switch.get("cases") or {}).items():
            if c.get("case") != k:
                errs.append(f"{names[1]}: case '{k}' has case value '{c.get('case')}'")
        if "default" not in switch:
            errs.append(f"{names[1]}: Switch needs a default branch for 'Other'")
        for c in cats:
            if c["name"] not in message or c["description"] not in message:
                errs.append(f"{names[0]}: prompt does not state category '{c['name']}' and its definition")
        try:
            schema = json.loads(p["body/definition"]["entity"]["configuration"]["agentSettings"]["output"]["schema"])
            enum = schema["properties"]["predictedCategory"]["enum"]
            if sorted(enum) != sorted(labels):
                errs.append(f"{names[0]}: output schema enum {enum} must equal categories + 'Other'")
        except (KeyError, TypeError, ValueError):
            errs.append(f"{names[0]}: cannot read the output schema enum from body/definition")
        if "predictedCategory" not in str(switch.get("expression")):
            errs.append(f"{names[1]}: Switch expression must read structuredOutput.predictedCategory")

    # extract nodes: input, schema and property list agree between the designer and the runtime action
    for nid, node in nodes.items():
        if node.get("type") != "agentExtract":
            continue
        cfg = node["data"]["config"]
        name = (mapping.get(nid) or [None])[0]
        if name not in actions:
            continue
        p = actions[name][0]["inputs"]["parameters"]
        files = p.get("body/files") or []
        if not files or files[0].get("content") != cfg.get("input"):
            errs.append(f"{name}: body/files content differs from config.input")
        raw = "".join(s.get("value", "") for s in (cfg.get("inputRich") or {}).get("segments", []))
        if raw != "@{" + str(cfg.get("input", ""))[1:] + "}":
            errs.append(f"{name}: config.inputRich differs from config.input")
        try:
            rt = json.loads(p["body/definition"]["entity"]["configuration"]["agentSettings"]["output"]["schema"])
        except (KeyError, TypeError, ValueError):
            errs.append(f"{name}: cannot read the output schema from body/definition")
            continue
        if rt != cfg.get("jsonSchema"):
            errs.append(f"{name}: config.jsonSchema differs from the runtime output schema")
        if [s["name"] for s in cfg.get("simpleProperties", [])] != list(rt.get("properties", {})):
            errs.append(f"{name}: config.simpleProperties differ from the output schema properties")

    # variables: initialised once, at the top level, before use
    declared = {v["name"] for a, _ in actions.values() if a.get("type") == "InitializeVariable"
                for v in a["inputs"]["variables"]}
    for name, (a, siblings) in actions.items():
        if a.get("type") == "InitializeVariable" and siblings is not df["actions"]:
            errs.append(f"{name}: variables can only be initialised at the top level (not in loops, branches or scopes)")
        if a.get("type") in ("SetVariable", "IncrementVariable", "AppendToArrayVariable") \
                and a["inputs"]["name"] not in declared:
            errs.append(f"{name}: changes variable '{a['inputs']['name']}' which is never initialised")
    var = re.compile(r"\bvariables\(\s*'([^']+)'\s*\)")
    for text in strings(df["actions"]):
        for ex in interpolations(text):
            for v in var.findall(ex):
                if v not in declared:
                    errs.append(f"expression uses variables('{v}') which is never initialised")

    forbid = list(args.forbid)
    if args.template:
        tdoc = load(args.template)
        tdf, ttrig = trigger_of(tdoc)
        tact = {}
        walk(tdf["actions"], tact, set())
        tgraph = ttrig["metadata"]["associatedData"]["graph"]
        forbid += [n for n in tact if not n.startswith("end-")]
        forbid += [n["data"]["config"]["botSchemaName"] for n in tgraph["nodes"]
                   if n["data"]["config"].get("botSchemaName")]
        forbid.append(tgraph["name"])
    raw = open(args.workflow, encoding="utf-8-sig").read()
    for term in sorted(set(t for t in forbid if t)):
        if term in raw:
            errs.append(f"forbidden/template term still present: {term}")

    print(f"{len(actions)} actions, {len(nodes)} nodes, {len(graph['edges'])} edges checked")
    for w in warns:
        print("WARN:", w)
    for e in errs:
        print("FAIL:", e)
    if not errs:
        print("OK")
    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main())
