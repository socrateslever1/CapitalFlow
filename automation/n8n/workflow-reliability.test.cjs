const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const workflowsDir = path.join(__dirname, "workflows");
const readWorkflow = (name) =>
  JSON.parse(fs.readFileSync(path.join(workflowsDir, name), "utf8"))[0];

test("manual collection workflow claims all configured tenants without persisting empty cycles", () => {
  const workflow = readWorkflow("capitalflow-manual-collections.json");
  const serialized = JSON.stringify(workflow);

  assert.doesNotMatch(serialized, /CAPITALFLOW_PROFILE_ID/);
  assert.match(serialized, /claim_all/);
  assert.doesNotMatch(serialized, /62dcbb45-f02c-42ba-84a4-916af9854dea/);
  assert.match(serialized, /lock_token/);
  assert.equal(workflow.nodes.find((node) => node.name === "Every 60 Seconds") !== undefined, true);
  assert.equal(workflow.settings.saveDataSuccessExecution, "none");
  assert.equal(workflow.settings.saveExecutionProgress, false);

  const outputs = workflow.connections["Send Manual Collection"].main;
  assert.equal(outputs.length, 2);
  assert.equal(outputs[0][0].node, "Confirm Manual Collection");
  assert.equal(outputs[1][0].node, "Fail Manual Collection");
});

test("daily collection workflow acknowledges success and failure without a fixed tenant", () => {
  const workflow = readWorkflow("capitalflow-daily-collections.json");
  const serialized = JSON.stringify(workflow);

  assert.match(serialized, /CAPITALFLOW_PROFILE_ID/);
  assert.doesNotMatch(serialized, /62dcbb45-f02c-42ba-84a4-916af9854dea/);

  const sender = workflow.nodes.find((node) => node.name === "Send WhatsApp");
  assert.equal(sender.onError, "continueErrorOutput");

  const outputs = workflow.connections["Send WhatsApp"].main;
  assert.equal(outputs.length, 2);
  assert.equal(outputs[0][0].node, "Confirm Sent");
  assert.equal(outputs[1][0].node, "Fail Dispatch");
});

test("collection workflows block malformed UTF-8 before WhatsApp delivery", () => {
  for (const name of [
    "capitalflow-manual-collections.json",
    "capitalflow-daily-collections.json",
  ]) {
    const workflow = readWorkflow(name);
    const guard = workflow.nodes.find((node) => node.name === "Guard Financial Facts");

    assert.ok(guard);
    assert.match(guard.parameters.jsCode, /codificacao invalida na origem/);
    assert.match(guard.parameters.jsCode, /!corrupted\.test\(raw\)/);
  }
});

test("collection Edge Functions validate message encoding at the source", () => {
  for (const name of [
    "capitalflow-manual-collections",
    "capitalflow-daily-collections",
  ]) {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "..", "supabase", "functions", name, "index.ts"),
      "utf8",
    );

    assert.match(source, /assertCleanEncoding/);
    assert.match(source, /message_encoding_invalid/);
  }
});
